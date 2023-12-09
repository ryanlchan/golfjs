import osmtogeojson from "osmtogeojson";
import * as turf from "@turf/turf";
import { OSM_GOLF_TO_TERRAIN, SG_SPLINES } from "services/coeffs20231205";
import * as cache from "common/cache";
import { Feature, FeatureCollection, Point } from "geojson";
import { featureIntersect } from "services/grids";
import { showError } from "common/utils";

export interface CourseFeatureCollection extends FeatureCollection { course: Course }

/**
 * *********
 * * Cache *
 * *********
 */
const COURSE_NAMESPACE = 'courses';

/**
 * Generate a cache key given a course interface
 * @param course - The course parameters for which to generate a key
 * @returns The cache key
 */
function courseKey(course: Course): string {
    return `${course?.name}-${course?.id}`;
}

async function courseCacheGet(course: Course): Promise<CourseFeatureCollection> {
    const key = courseKey(course);
    return cache.get(key, COURSE_NAMESPACE);
}

export async function courseCacheDelete(course: Course): Promise<void> {
    const key = courseKey(course);
    return cache.remove(key);
}

async function courseCacheSave(course: Course, features: FeatureCollection): Promise<void> {
    const key = courseKey(course);
    return cache.set(key, features, COURSE_NAMESPACE);
}

export async function courseCacheAll(): Promise<CourseFeatureCollection[]> {
    const all = (_, __) => true;
    const courseIds = Object.values(await cache.filter(all, COURSE_NAMESPACE)) as CourseFeatureCollection[];
    return courseIds;
}

/**
 * =========
 * Polygons
 * =========
 */
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search?q=";

/**
 * Return a unique courseID corresponding to an OSM object
 * @param {String} type the OSM type (way, relation, etc)
 * @param {Number} id the OSM ID
 * @returns {String}
*/
export function osmCourseID(type: string, id: number): string {
    return `osm-${type}-${id}`;
}

/**
 * Parse an osmCourseID to return the component parts
 * @param id the ID from osmCourseID
 * @returns {string[]} an array containing [type, id] for the course
*/
function osmParseID(id: string): string[] {
    if (!id.includes("osm-")) {
        return;
    }
    return id.split("-").slice(1);
}

function osmQuery(course: Course): string {
    if (course?.id) {
        let [type, id] = osmParseID(course.id);
        return `[out:json];
        (${type}(${id});)-> .bound;
        (.bound;map_to_area;)->.golf_area;
        (way(area.golf_area)[golf];
        relation(area.golf_area)[golf];
        way(area.golf_area)[leisure=golf_course];
        relation(area.golf_area)[leisure=golf_course];
        .bound;
        );
        out geom;`;
    } else if (course?.name) {
        return `[out:json];
        area[name="${course.name}"][leisure=golf_course]->.golf_area;
        (way(area.golf_area)[golf];
        relation(area.golf_area)[golf];
        way[name="${course.name}"][leisure=golf_course];
        relation[name="${course.name}"][leisure=golf_course];
        );
        out geom;`;
    }
}

/**
 * Scrub incoming geojson to conform to internal expectations
 * @param {FeatureCollection} geojson
 * @returns {FeatureCollection}
 */
function scrubOSMData(geojson: FeatureCollection): FeatureCollection {
    for (let feature of geojson.features) {
        let props = feature.properties;
        if (props.golf && props.golf in OSM_GOLF_TO_TERRAIN) {
            props["terrainType"] = OSM_GOLF_TO_TERRAIN[props.golf];
        } else if (props.golf) {
            props["terrainType"] = props.golf in SG_SPLINES ? props.golf : "rough";
        }
        if (typeof (props.par) === 'string') {
            props.par = Number(props.par);
        }
        if (typeof (props.ref) === 'string') {
            props.ref = Number(props.ref);
        }
        if (typeof (props.handicap) === 'string') {
            props.handicap = Number(props.handicap);
        }
    }
    presortTerrain(geojson);
    return geojson;
}

/**
 * Presort the polygons from backend by priority
 * @param {FeatureCollection} collection
 * @returns {FeatureCollection}
 */
function presortTerrain(collection: FeatureCollection): FeatureCollection {
    // Define the priority of terrains
    const terrainPriority = ["green", "tee", "bunker", "fairway", "hazard", "penalty"];

    // Sort the features based on the priority of the terrains
    collection.features.sort((a, b) => {
        let aPriority = terrainPriority.indexOf(a.properties.terrainType);
        let bPriority = terrainPriority.indexOf(b.properties.terrainType);
        // If terrainType is not in the terrainPriority array, set it to highest index+1
        if (aPriority === -1) {
            aPriority = terrainPriority.length;
        }
        if (bPriority === -1) {
            bPriority = terrainPriority.length;
        }
        return aPriority - bPriority;
    });
    return collection;
}


/**
 * Fetch some data from OSM, process it, then cache it
 * @param {Course} course the courseto pull and cache data for
 * @returns {Promise}
 */
async function fetchCourseFromOSM(course: Course): Promise<FeatureCollection> {
    const query = osmQuery(course);
    const opt: object = {
        method: "POST",
        mode: "cors",
        redirect: "follow",
        headers: { Accept: "*" },
        body: `data=${encodeURIComponent(query)}`
    };
    try {
        console.debug("Querying for data from OSM under key " + course.id);
        const response = await fetch(OVERPASS_URL, opt)
        if (!response.ok) throw new Error('Request failed: HTTP ' + response.status);

        const data = await response.json();
        if (!data) throw new Error('Course was corrupted, please try again');

        console.debug("Succesfully downloaded OSM polys, starting processing");
        const geojson = osmtogeojson(data);
        const scrubbedData = scrubOSMData(geojson) as CourseFeatureCollection;
        if (scrubbedData.features.length < 18) throw new Error('No polygons returned from OSM');

        console.debug("Succesfully processed OSM polys");
        scrubbedData.course = course;
        await courseCacheSave(course, scrubbedData);
        return scrubbedData;
    } catch (error) {
        console.error(error);
        showError(error);
    }
}

/**
 * Pull course polys from cache or backend
 * @param {Course} course the courseto pull
 * @param {boolean} [force] set to true to ignore cache
 * @returns {FeatureCollection} the polys for this course
 */
export async function courseLoad(course: Course, force?: boolean): Promise<CourseFeatureCollection> {
    if (!course) {
        console.error("Cannot fetch from OSM with no course");
        throw new Error("Must provide a course");
    } else if (!(course['name'] || course["id"])) {
        console.error("Cannot fetch from OSM with no course identifiers");
        throw new Error("Must provide either name or id");
    }
    const cached = await courseCacheGet(course);
    if (!force && cached) return cached;
    return fetchCourseFromOSM(course);
}

/**
 * *************
 * * Utilities *
 * *************
 */

/**
 * Get the reference playing line for a hole at a course
 * @param {Course} course the course
 * @param {number} holeIndex the 0-base index of the hole in question
 * @returns {Feature} a single line feature
 */
export async function fetchHoleLine(course: Course, holeIndex: number): Promise<Feature> {
    const data = await courseLoad(course);
    return getHoleLine(data, holeIndex);
}

export function getHoleLine(data: CourseFeatureCollection, holeIndex: number): Feature {
    return data.features.find(el => (el.properties.golf == "hole") && (el.properties.ref == holeIndex + 1));
}

/**
 * Get all polys that intersect with the reference playing line
 * @param {Course} course the course
 * @param {number} holeIndex the 0-base index of the hole in question
 * @returns {FeatureCollection} all polys that intersect with the reference playing line
 */
async function fetchHolePolys(course: Course, holeIndex: number): Promise<FeatureCollection> {
    const data = await courseLoad(course);
    return getHolePolys(data, holeIndex);
}

function getHolePolys(data: CourseFeatureCollection, holeIndex: number): FeatureCollection {
    const line = getHoleLine(data, holeIndex);
    if (!line) {
        let courseName = data.course?.name;
        let msg = `No hole line found for course ${courseName} hole ${holeIndex}`;
        console.warn(msg);
        return;
    }
    const intersects = featureIntersect(data, line);
    return intersects;
}

/**
 * Get greens that intersect a single hole's reference playing line
 * @param {Course} course the course
 * @param {number} holeIndex the 0-base index of the hole in question
 * @returns {FeatureCollection} greens that intersect a single hole's reference playing line
 */
async function fetchHoleGreen(course: Course, holeIndex: number): Promise<FeatureCollection> {
    let data = await fetchHolePolys(course, holeIndex);
    return getHoleGreen(data, holeIndex);
}

function getHoleGreen(data: CourseFeatureCollection, holeIndex: number): FeatureCollection {
    const holePolys = getHolePolys(data, holeIndex);
    return turf.getCluster(holePolys, { 'terrainType': "green" });
}

/**
 * Get a coordinate object that represents the center of a green
 * @param {Course} course the course
 * @param {number} holeIndex the hole number
 * @returns {number[]} the center of the green as coordinates
 */
export async function fetchHoleGreenCenter(course: Course, holeIndex: number): Promise<number[]> {
    const data = await fetchHolePolys(course, holeIndex);
    return getHoleGreenCenter(data, holeIndex);
}

export function getHoleGreenCenter(data: CourseFeatureCollection, holeIndex: number): number[] {
    const green = getHoleGreen(data, holeIndex);
    return turf.center(green).geometry.coordinates;
}

/**
 * Return a FeatureCollection of boundary polygons given an input set
 * @param {FeatureCollection} collection a collection of golf polygons
 * @returns {FeatureCollection}
 */
function findBoundaries(collection: FeatureCollection): FeatureCollection {
    try {
        return turf.getCluster(collection, { 'leisure': 'golf_course' });
    } catch (e) {
        debugger;
    }
}

/**
 * Dumb function to translate from 4 coord bbox to 2x2 latlong bbox
 * @param {number[]} turfbb the bounding box from Turf.js
 * @returns {number[number[]]} a 2x2 latlong bounding box
 */
function turfbbToleafbb(turfbb: number[]): number[][] {
    let bb = [...turfbb];
    bb.reverse();
    return [bb.slice(0, 2), bb.slice(2)];
}

/**
 * Get a 2x2 bounding box for a golf course
 * @param {Course} course
 * @returns {number[number[]]} a 2x2 bbox
 */
export async function fetchGolfCourseBbox(course: Course): Promise<number[][]> {
    const polys = await courseLoad(course);
    return getGolfCourseBbox(polys);
}

function getGolfCourseBbox(data: CourseFeatureCollection): number[][] {
    return turfbbToleafbb(turf.bbox(data));
}

/**
 * Get a 2x2 bounding box for a single golf hold
 * @param {Course} course
 * @param {number} holeIndex
 * @returns {number[number[]]} a 2x2 bbox
 */
export async function fetchGolfHoleBbox(course: Course, holeIndex: number): Promise<number[][]> {
    let data = await fetchHolePolys(course, holeIndex);
    return getGolfHoleBbox(data, holeIndex);
}

function getGolfHoleBbox(data: CourseFeatureCollection, holeIndex: number): number[][] {
    const line = getHoleLine(data, holeIndex);
    const buffered = turf.buffer(line, 20, { units: "meters" })
    return turfbbToleafbb(turf.bbox(buffered))
}

/**
 * Returns the terrain at a given point within a feature collection
 * @param {FeatureCollection} collection A prescrubbed collection of Features (sorted, single poly'd, etc)
 * @param {Point} point the point to load terrain for
 * @param {FeatureCollection} [bounds] A prescrubbed collection representing the out_of_bounds boundary, optional
 * @returns {String} the terrain type
 */
export function getTerrainAt(collection: FeatureCollection, point: Point, bounds?: FeatureCollection): string {
    if (!bounds) {
        bounds = findBoundaries(collection);
    }
    if (bounds.features.every((bound) => !turf.booleanPointInPolygon(point, bound))) {
        return "out_of_bounds";
    }
    // Find the feature in which the point resides
    for (let feature of collection.features) {
        let featureType = turf.getType(feature);
        if (featureType === 'Polygon' && turf.booleanPointInPolygon(point, feature)) {
            if (feature.properties.terrainType) {
                return feature.properties.terrainType;
            }
        }
    }
    // If the point does not overlap with any of these terrain features, it is considered to be in the rough
    return "rough";
}

/**
 * Get golf terrain at a given coordinate, given a course
 * @param {Course} course the courseto get terrain for
 * @param {number[] | Point} location the location, as a WGS84 latlong coordinate
 * @returns {string} the terrain type
 */
export async function fetchTerrainAt(course: Course, location: (number[] | turf.Point)): Promise<string> {
    let golfCourseData = await courseLoad(course);
    let point = location instanceof Array ? turf.flip(turf.point(location)) : location;
    return getTerrainAt(golfCourseData, point);
}
