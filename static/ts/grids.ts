import osmtogeojson from "osmtogeojson";
import * as turf from "@turf/turf";
import { HOLE_OUT_COEFFS, OSM_GOLF_TO_TERRAIN, STROKES_REMAINING_COEFFS } from "./coeffs20230705";
import * as cache from "./cache";
export const gridTypes = { STROKES_GAINED: "Strokes Gained", TARGET: "Best Aim" };

/**
 * =========
 * Polygons
 * =========
 */
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search?q=";

/**
 * Generate a cache key given a course interface
 * @param courseParams - The course parameters for which to generate a key
 * @returns The cache key
 */
function cacheKey(courseParams: Course): string {
    return `courseData-${courseParams.name}-${courseParams.id}`;
}

/**
 * Search nominatim for a given query
 * @param query - The query string
 * @returns A promise that will resolve with a list of Nominatim results
 */
export function courseSearch(query: string): Promise<any> {
    return fetch(`${NOMINATIM_URL}${encodeURIComponent(query)}&format=json&namedetails=1`)
        .then(function (response) {
            if (!response.ok) {
                throw new Error("Network response was not ok");
            }
            return response.json();
        })
        .then((response) => {
            return response.filter((el: any) => el.type == "golf_course")
        })
        .catch(function (error) {
            console.error("Error:", error);
        });
}

/**
 * Return a unique courseID corresponding to an OSM object
 * @param {String} type the OSM type (way, relation, etc)
 * @param {Number} id the OSM ID
 * @returns {String}
 */
export function osmCourseID(type: string, id: number): string {
    return `osm-${type}-${id}`
}

/**
 * Parse an osmCourseID to return the component parts
 * @param id the ID from osmCourseID
 */
export function osmParseID(id: "string"): string[] {
    if (!id.includes("osm-")) {
        return
    }
    return id.split("-").slice(1);
}

/**
 * Fetch some data from OSM, process it, then cache it in localStorage
 * @param {String} url
 * @param {String} storageKey
 * @param {Function} callback
 * @returns {Promise}
 */
function fetchOSMData(query, storageKey) {
    let opt: object = {
        method: "POST",
        mode: "cors",
        redirect: "follow",
        headers: {
            Accept: "*",
        },
        body: `data=${encodeURIComponent(query)}`
    };
    console.debug("Querying for data from OSM under key " + storageKey)
    return fetch(OVERPASS_URL, opt)
        .then(response => {
            if (!response.ok) {
                return Promise.reject(new Error('Request failed: HTTP ' + response.status));
            }
            return response.json();
        }).then((data) => {
            console.debug("Succesfully downloaded OSM polys, starting processing")
            data = osmtogeojson(data);
            data = scrubOSMData(data);
            if (data.features.length > 18) {
                console.debug("Succesfully processed OSM polys, caching as " + storageKey);
                cache.setJSON(storageKey, data);
                return data;
            } else {
                return Promise.reject(new Error('No polygons returned'));
            }
        }).catch((error) => console.error(error));
}

export function clearOSMData(courseParams: Course) {
    cache.remove(cacheKey(courseParams));
}

/**
 * Async pull course polys using a promise
 * @param {Course} courseParams
 * @param {boolean} [force] set to true to force a rewrite of cached polys
 * @param {Function} callback
 * @returns {Promise}
 */
export function fetchGolfCourseData(courseParams, force?) {
    if (!courseParams) {
        console.error("Cannot fetch from OSM with no course")
        throw new Error("Must provide a courseParams");
    } else if (!(courseParams['name'] || courseParams["id"])) {
        console.error("Cannot fetch from OSM with no course identifiers")
        throw new Error("Must provide either name or id");
    }
    let courseName = courseParams['name']
    let courseId = courseParams['id']
    let storageKey = cacheKey(courseParams);
    let cached = cache.getJSON(storageKey);
    if (!force && cached) {
        return Promise.resolve(cached);
    }
    let query = ""
    if (courseId) {
        let [type, id] = osmParseID(courseId);
        query = `[out:json];
        (${type}(${id});)-> .bound;
        (.bound;map_to_area;)->.golf_area;
        (way(area.golf_area)[golf];
        relation(area.golf_area)[golf];
        way(area.golf_area)[leisure=golf_course];
        relation(area.golf_area)[leisure=golf_course];
        .bound;
        );
        out geom;`
        return fetchOSMData(query, storageKey);
    } else if (courseName) {
        query = `[out:json];
        area[name="${courseName}"][leisure=golf_course]->.golf_area;
        (way(area.golf_area)[golf];
        relation(area.golf_area)[golf];
        way[name="${courseName}"][leisure=golf_course];
        relation[name="${courseName}"][leisure=golf_course];
        );
        out geom;`
    }
    return fetchOSMData(query, storageKey);
}

/**
 * Synchronously pull course data
 * @param {Course} courseParams
 * @returns
 */
export function getGolfCourseData(courseParams) {
    // Check if the cache has it first
    let storageKey = cacheKey(courseParams);
    let polys = cache.getJSON(storageKey);
    if (polys) {
        // Cache hit, just return the callback asap
        return polys;
    } else {
        console.warn("Course has no polys or not found");
        return Error("No data available");
    }
}

/**
 * Get the reference playing line for a hole at a course
 * @param {Course} courseParams
 * @param {Number} holeIndex
 * @returns {Feature} a single line feature
 */
export function getGolfHoleLine(courseParams, holeIndex) {
    let data = getGolfCourseData(courseParams);
    if (data instanceof Error) {
        // Data not ready, just reraise the error
        return data;
    }
    return turf.getCluster(data, { 'golf': "hole", 'ref': holeIndex + 1 }).features[0];
}

/**
 * Get all polys that intersect with the reference playing line
 * @param {Course} courseParams
 * @param {Number} holeIndex
 * @returns {FeatureCollection}
 */
function getGolfHolePolys(courseParams, holeIndex) {
    let data = getGolfCourseData(courseParams);
    if (data instanceof Error) {
        // Data not ready, just reraise the error
        return data
    }

    // Get the reference line
    let line = getGolfHoleLine(courseParams, holeIndex);
    if (line instanceof Error) {
        let msg = "Bad data set from OSM";
        console.error(msg);
        cache.remove(cacheKey(courseParams));
        throw new Error(msg);
    }
    if (!line) {
        let courseName = courseParams["name"]
        let msg = `No hole line found for course ${courseName} hole ${holeIndex}`
        console.warn(msg)
        throw new Error(msg);
    }

    // Filter for poly's that intersect this line
    return featureIntersect(data, line);
}

/**
 * Get greens that intersect a single hole's reference playing line
 * @param {Course} courseParams
 * @param {Number} holeIndex
 * @returns {FeatureCollection}
 */
function getGolfHoleGreen(courseParams, holeIndex) {
    let data = getGolfHolePolys(courseParams, holeIndex);
    if (data instanceof Error) {
        // Data not ready, just reraise the error
        return data
    }
    return turf.getCluster(data, { 'terrainType': "green" });
}

/**
 * Get a coordinate object that represents the center of a green
 * @param {Course} courseParams the course
 * @param {number} holeIndex the hole number
 * @returns {turf.coordinates} the center of the green as coordinates
 */
export function getGolfHoleGreenCenter(courseParams, holeIndex) {
    const green = getGolfHoleGreen(courseParams, holeIndex);
    return turf.center(green).geometry.coordinates;
}

/**
 * Scrub incoming geojson to conform to internal expectations
 * @param {FeatureCollection} geojson
 * @returns {FeatureCollection}
 */
function scrubOSMData(geojson) {
    for (let feature of geojson.features) {
        let props = feature.properties;
        if (props.golf && props.golf in OSM_GOLF_TO_TERRAIN) {
            props["terrainType"] = OSM_GOLF_TO_TERRAIN[props.golf];
        } else if (props.golf) {
            props["terrainType"] = props.golf in STROKES_REMAINING_COEFFS ? props.golf : "rough"
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
    return geojson
}

/**
 * Presort the polygons from backend by priority
 * @param {FeatureCollection} collection
 * @returns {FeatureCollection}
 */
function presortTerrain(collection) {
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
    return collection
}

/**
 * Return a FeatureCollection of boundary polygons given an input set
 * @param {FeatureCollection} collection a collection of golf polygons
 * @returns {FeatureCollection}
 */
function findBoundaries(collection) {
    return turf.getCluster(collection, { 'leisure': 'golf_course' });
}

/**
 * Dumb function to translate from 4 coord bbox to 2x2 latlong bbox
 * @param {number[]} turfbb the bounding box from Turf.js
 * @returns {number[number[]]} a 2x2 latlong bounding box
 */
function turfbbToleafbb(turfbb) {
    let bb = [...turfbb] // copy it so we're not destructive...
    bb.reverse();
    return [bb.slice(0, 2), bb.slice(2)];
}

/**
 * Get a 2x2 bounding box for a golf course
 * @param {Course} courseParams
 * @returns {number[number[]]} a 2x2 bbox
 */
export function getGolfCourseBbox(courseParams) {
    let course = getGolfCourseData(courseParams);
    if (course instanceof Error) {
        return
    } else {
        return turfbbToleafbb(turf.bbox(course))
    }
}

/**
 * Get a 2x2 bounding box for a single golf hold
 * @param {Course} courseParams
 * @param {number} holeIndex
 * @returns {number[number[]]} a 2x2 bbox
 */
export function getGolfHoleBbox(courseParams, holeIndex) {
    let line = getGolfHoleLine(courseParams, holeIndex);
    if (line instanceof Error) {
        return
    } else if (line) {
        return turfbbToleafbb(turf.bbox(line))
    }
}

/**
 * Returns a terrain type given a point, a feature collection of terrains, and an optional bounds collection
 * @param {Point} point
 * @param {FeatureCollection} collection A prescrubbed collection of Features (sorted, single poly'd, etc)
 * @param {FeatureCollection} [bounds] A prescrubbed collection of boundaries, optional
 * @returns {String} the terrain type
 */
function findTerrainType(point, collection, bounds?) {
    if (!bounds) {
        bounds = findBoundaries(collection);
    }
    if (bounds.features.every((bound) => !turf.booleanPointInPolygon(point, bound))) {
        return "out_of_bounds"
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
 * =====
 * Grids
 * =====
 */

/**
 * Create a hex grid around a given feature
 * @param {FeatureCollection} feature the feature or feature collection to bound
 * @param {Object} [options] options to provide
 * @param {Number} options.maximum_cells the maximum number of cells to create
 * @returns {FeatureCollection} a grid of hex cells over the feature
 */
function hexGridCreate(feature, options?) {
    // Calculate the hexagon sidelength according to a max cell count
    let maximum_cells = 2000;
    if (options?.maximum_cells) {
        maximum_cells = options.maximum_cells;
    }
    const bbox = turf.bbox(feature);

    // Get sidelength. turf.area calculates in sq meters, we need to convert back to kilometers
    const _x = Math.sqrt((turf.area(feature)) / (maximum_cells * (3 * Math.sqrt(3) / 2))) / 1000;

    // Clamp to at least 0.16m cells and at most 10m cells
    const minX = 0.16 / 1000;
    const maxX = 10 / 1000;
    const x = Math.min(Math.max(minX, _x), maxX);


    let grid_options = { units: 'kilometers', mask: feature };
    return turf.hexGrid(bbox, x, grid_options);
}

/**
 * Return the probability of a given number being drawn from a normal distribution
 * of a given mean and stddev. Estimates a continuous PDF.
 * @param {Number} stddev the normal's standard deviation
 * @param {Number} x the number to get probabilities for
 * @param {Number} [mean=0] the mean of the normal distribution, optional (default = 0)
 * @returns {Number}
 */
function probability(stddev, x, mean = 0) {
    const coefficient = 1 / (stddev * Math.sqrt(2 * Math.PI));
    const exponent = -((x - mean) ** 2) / (2 * stddev ** 2);
    return coefficient * Math.exp(exponent);
};

/**
 * Add probability to a HexGrid, assuming a normal distribution around `aimPoint`
 * with standard deviation of `dispersionNumber`
 * @param {FeatureCollection} grid the hexGrid
 * @param {Point} aimPoint the point to count as the center of aim/normal
 * @param {Number} dispersionNumber the standard deviation of the normal
 */
function probabilityGrid(grid, aimPoint, dispersionNumber) {
    let total = 0.0;
    grid.features.forEach((feature) => {
        const distance = turf.distance(turf.center(feature), aimPoint, { units: "kilometers" }) * 1000;
        let p = probability(dispersionNumber, distance);
        feature.properties.probability = p;
        feature.properties.distanceToAim = distance
        total += p;
    });
    grid.features.forEach((feature) => {
        feature.properties.probability = feature.properties.probability / total;
    });
}

/**
 * Calculates an estimated % chance to hole out from this distance and terrain
 * @param {Number} distanceToHole the distance to the hole, in meters
 * @param {String} terrainType the terrain type
 * @returns {Number} a decimal between 0 and 1 representing the chance of holing out
 */
function holeOutRate(distanceToHole, terrainType) {
    if (!(terrainType in HOLE_OUT_COEFFS)) {
        console.debug("Skip: No holeout polynomial for terrainType " + terrainType);
        return 0;
    }
    const polys = HOLE_OUT_COEFFS[terrainType];

    // Find which domain the distanceToHole falls within
    let domainIndex;
    for (let i = 0; i < polys.domains.length; i++) {
        if (distanceToHole >= polys.domains[i][0] && distanceToHole <= polys.domains[i][1]) {
            domainIndex = i;
            break;
        }
    }

    if (domainIndex === undefined) {
        console.error("Distance to hole is outside the supported range.");
        return 0;
    }

    // Get the coefficients for the polynomial within the valid domain
    let coeffs = polys.coeffs[domainIndex];

    // Calculate the estimated chance to hole out
    let rate = coeffs.reduce(((acc, coeff, index) => acc + coeff * Math.pow(distanceToHole, index)), 0);

    // Clamp the result between 0 and 1
    rate = Math.max(0, Math.min(1, rate));

    return rate;
}

/**
 * Add a circular feature representing the golf hole with stats that represent holing out
 * @param {FeatureCollection} hexGrid the grid feature
 * @param {Number} distanceToHole the distance to the hole in meters
 * @param {String} terrainType the terrain type
 * @param {Point} holePoint a turf.js point representing the hole
 * @returns FeatureCollection
 */
function addHoleOut(hexGrid, distanceToHole, terrainType, holePoint) {
    console.debug(`Accomodating hole outs from ${distanceToHole}m on ${terrainType}`)

    // Get holeout rate
    const hor = holeOutRate(distanceToHole, terrainType);
    if (hor == 0) {
        console.debug("0% chance, skip")
        return hexGrid;
    }
    console.debug(`${(100 * hor).toFixed(1)}% from ${distanceToHole}m on ${terrainType}`)

    // Adjust the probability of all other featuers for hole probability
    hexGrid.features.forEach(feature => feature.properties.probability *= (1 - hor))
    const holeFeature = turf.circle(holePoint, 0.0002, { units: 'kilometers' });
    holeFeature.properties = {
        "distanceToHole": 0,
        "terrainType": "hole",
        "probability": hor,
        "strokesRemaining": 0,
    };

    hexGrid.features.push(holeFeature);
    return hexGrid;
}

/**
 * Calculates an estimated number of strokes remaining from this distance and terrain
 * @param {Number} distanceToHole the distance to the hole, in meters
 * @param {String} terrainType the terrain type
 * @returns {Number} the number of strokes remaining
 */
function strokesRemaining(distanceToHole, terrainType) {
    if (!(terrainType in STROKES_REMAINING_COEFFS)) {
        console.error("No strokes remaining polynomial for terrainType" + terrainType + ", defaulting to rough");
        terrainType = "rough"
    }

    // Assume that we have an polynomial function defined by STROKES_REMAINING_COEFFS
    let totalStrokes = STROKES_REMAINING_COEFFS[terrainType].reduce((acc, coeff, index) => acc + coeff * Math.pow(distanceToHole, index), 0);

    // Clip results from -7 to 7 strokes remaining to catch really extreme outlier predictions
    let clippedStrokes = Math.min(Math.max(totalStrokes, -7), 7)
    return clippedStrokes;
}

/**
 * Given a geographic feature, calculate strokes remaining from its center
 * @param {Feature} feature the geographic feature to calculate from
 * @param {Array} holeCoordinate an array containing [lat, long] coordinates in WGS84
 * @param {Course} courseParams the course name to get polygons for
 * @returns {Number} estimated strokes remaining
 */
export function strokesRemainingFrom(feature, holeCoordinate, courseParams) {
    let golfCourseData = getGolfCourseData(courseParams);
    if (golfCourseData instanceof Error) {
        // If no data currently available, reraise error to caller
        return;
    }
    const center = turf.center(feature);
    const distanceToHole = turf.distance(center, holeCoordinate, { units: "kilometers" }) * 1000;
    const terrainType = findTerrainType(center, golfCourseData);
    return strokesRemaining(distanceToHole, terrainType);
}

/**
 * Calculate strokes gained for each cell in a given grid
 * @param {FeatureCollection} grid
 * @param {Array} holeCoordinate
 * @param {Number} strokesRemainingStart
 * @param {FeatureCollection} golfCourseData
 */
function strokesGained(grid, holeCoordinate, strokesRemainingStart, golfCourseData) {
    let bounds = findBoundaries(golfCourseData);

    grid.features.forEach((feature) => {
        let props = feature.properties;
        // Check if strokesRemaining is undefined, and if it is, then calculate it
        // Hole out rate will add a cell with strokesRemaining defined already, this skips it
        if (props.strokesRemaining === undefined) {
            const center = turf.center(feature);
            props.distanceToHole = turf.distance(center, holeCoordinate, { units: "kilometers" }) * 1000;
            props.terrainType = findTerrainType(center, golfCourseData, bounds);
            props.strokesRemaining = strokesRemaining(props.distanceToHole, props.terrainType);
        }

        // Calculate strokes gained
        props.strokesGained = strokesRemainingStart - props.strokesRemaining - 1;
    });
}

/**
 * Calculate the weighted strokes gained for a gri
 * @param {FeatureCollection} grid a grid with strokes gained and probabilities added
 * Does not return values, modifies in place
 */
function weightStrokesGained(grid) {
    turf.featureEach(grid, (feature) => {
        let props = feature.properties;
        props.weightedStrokesGained = props.strokesGained * props.probability;
    });
}

/**
 * Calculate a Strokes Gained probability-weighted grid
 * @param {Array} startCoordinate Coordiante in WGS84 LatLong
 * @param {Array} aimCoordinate Coordiante in WGS84 LatLong
 * @param {Array} holeCoordinate Coordiante in WGS84 LatLong
 * @param {Number} dispersionNumber
 * @param {Course} courseParams
 * @param {String} [startTerrain] optional
 * @returns {FeatureCollection}
 */
export function sgGrid(startCoordinate, aimCoordinate, holeCoordinate, dispersionNumber, courseParams, startTerrain?) {
    // Try to get golf course data/polygons
    const golfCourseData = getGolfCourseData(courseParams);
    if (golfCourseData instanceof Error) {
        // If no data currently available, reraise error to caller
        return golfCourseData;
    }

    // Set up turf geometries
    const startPoint = turf.flip(turf.point(startCoordinate));
    const aimPoint = turf.flip(turf.point(aimCoordinate));
    const holePoint = turf.flip(turf.point(holeCoordinate));

    // Handle specialcase of dispersions which are <0, representing distance fractions
    if (dispersionNumber < 0) {
        const distanceToAim = turf.distance(startPoint, aimPoint, { units: "kilometers" }) * 1000
        dispersionNumber = -dispersionNumber * distanceToAim;
        dispersionNumber = Math.max(0.5, dispersionNumber);
    }
    const aimWindow = turf.circle(aimPoint, 3 * dispersionNumber / 1000, { units: "kilometers" })

    // Determine strokes gained at the start
    const terrainTypeStart = startTerrain ? startTerrain : findTerrainType(startPoint, golfCourseData);
    const distanceToHole = turf.distance(startPoint, holePoint, { units: "kilometers" }) * 1000
    const strokesRemainingStart = strokesRemaining(distanceToHole, terrainTypeStart);


    // Create a grid
    let hexGrid = hexGridCreate(aimWindow);

    // Get probabilities
    probabilityGrid(hexGrid, aimPoint, dispersionNumber);
    addHoleOut(hexGrid, distanceToHole, terrainTypeStart, holePoint);
    strokesGained(hexGrid, holePoint, strokesRemainingStart, golfCourseData);
    weightStrokesGained(hexGrid);

    const weightedStrokesGained = hexGrid.features.reduce((sum, feature) => sum + feature.properties.weightedStrokesGained, 0);

    console.log('Total Weighted Strokes Gained:', weightedStrokesGained);
    const properties = {
        type: gridTypes.STROKES_GAINED,
        strokesRemainingStart: strokesRemainingStart,
        distanceToHole: distanceToHole,
        weightedStrokesGained: weightedStrokesGained,
        terrain: terrainTypeStart
    }
    hexGrid.properties = properties

    return hexGrid;
}

/**
 * Calculate the relative strokes gained by aiming at each cell in a grid
 * @param {Array} startCoordinate Coordiante in WGS84 LatLong
 * @param {Array} aimCoordinate Coordiante in WGS84 LatLong
 * @param {Array} holeCoordinate Coordiante in WGS84 LatLong
 * @param {Number} dispersionNumber
 * @param {Course} courseParams
 * @param {String} [startTerrain] optional
 * @returns {FeatureCollection}
 */
export function targetGrid(startCoordinate, aimCoordinate, holeCoordinate, dispersionNumber, courseParams, startTerrain?) {
    // Try to get golf course data/polygons
    const golfCourseData = getGolfCourseData(courseParams);
    if (golfCourseData instanceof Error) {
        // If no data currently available, reraise error to caller
        return golfCourseData;
    }

    // Set up turf geometries
    const startPoint = turf.flip(turf.point(startCoordinate));
    const aimPoint = turf.flip(turf.point(aimCoordinate));
    const holePoint = turf.flip(turf.point(holeCoordinate));

    // Handle specialcase of dispersions which are <0, representing distance fractions
    if (dispersionNumber < 0) {
        const distanceToAim = turf.distance(startPoint, aimPoint, { units: "kilometers" }) * 1000;
        dispersionNumber = -dispersionNumber * distanceToAim;
        dispersionNumber = Math.max(0.5, dispersionNumber);
    }

    // Determine strokes gained at the start
    const terrainTypeStart = startTerrain ? startTerrain : findTerrainType(startPoint, golfCourseData);
    const distanceToHole = turf.distance(startPoint, holePoint, { units: "kilometers" }) * 1000;
    const strokesRemainingStart = strokesRemaining(distanceToHole, terrainTypeStart);


    // Create a supergrid 3x the subgrid window size
    const outcomeWindow = turf.circle(aimPoint, 2 * 3 * dispersionNumber / 1000, { units: "kilometers" });
    let outcomeGrid = hexGridCreate(outcomeWindow, { 'maximum_cells': 8000 });

    // Add SG info to supergrid
    strokesGained(outcomeGrid, holePoint, strokesRemainingStart, golfCourseData);

    // Get each grid cell within the aim window, and use it as the aim point
    const aimWindow = turf.circle(aimPoint, dispersionNumber / 1000, { units: "kilometers" });
    const aimGrid = turf.clone(featureWithin(outcomeGrid, aimWindow));
    aimGrid.features.forEach((feature) => feature.properties = {});
    console.log(`Iterating through aim grid of ${aimGrid.features.length} cells`);
    let ix = 0;
    for (let cell of aimGrid.features) {
        const subAimPoint = turf.center(cell);
        const subWindow = turf.circle(subAimPoint, 3 * dispersionNumber / 1000, { units: "kilometers" })
        const subGrid = featureWithin(outcomeGrid, subWindow);
        probabilityGrid(subGrid, subAimPoint, dispersionNumber);
        addHoleOut(subGrid, distanceToHole, terrainTypeStart, holePoint);
        weightStrokesGained(subGrid);
        const weightedStrokesGained = subGrid.features.reduce((sum, feature) => sum + feature.properties.weightedStrokesGained, 0);
        cell.properties.weightedStrokesGained = weightedStrokesGained;
        console.log(`Processed cell ${ix}, wsg = ${weightedStrokesGained}`);
        ix++;
    }

    // baseline against middle aim point
    const aimCells = aimGrid.features.filter((feature) => turf.booleanContains(feature, aimPoint));
    const baseSg = aimCells.reduce(((acc, cell) => acc + cell.properties.weightedStrokesGained), 0) / aimCells.length;
    turf.featureEach(aimGrid, (feature) => {
        let props = feature.properties;
        props.relativeStrokesGained = props.weightedStrokesGained - baseSg;
    });

    // Prep output stats and return
    const properties = {
        type: gridTypes.TARGET,
        strokesRemainingStart: strokesRemainingStart,
        distanceToHole: distanceToHole,
        weightedStrokesGained: baseSg,
    }
    aimGrid.properties = properties

    return aimGrid;
}

/**
 * Filter a feature collection, like Array.prototype.filter
 * @param {FeatureCollection} collection the collection to filter
 * @param {Function} filter a function that accepts the feature as argument
 * @returns {FeatureCollection} a collection of all features where `filter` is true
 */
function featureFilter(collection, filter) {
    const _featureFilterReduce = (acc, feature) => {
        if (filter(feature)) acc.push(feature);
        return acc;
    }
    return turf.featureCollection(
        turf.featureReduce(collection, _featureFilterReduce, [])
    );
}

/**
 * Filter a feature collection for intersects with another feature
 * @param {FeatureCollection} collection the collection to filter
 * @param {Feature} intersects another feature that collection must intersect with
 * @returns {FeatureCollection} a collection of all features that intersect `intersects`
 */
function featureIntersect(collection, intersects) {
    return featureFilter(collection, (feature) => turf.booleanIntersects(intersects, feature))
}

/**
 * Filter a feature collection for such that it is contained by another feature
 * For whatever reason, this is _much_ faster than intersects
 * @param {FeatureCollection} collection the collection to filter
 * @param {Feature} container another feature that collection must be within
 * @returns {FeatureCollection} a collection of all features that intersect `intersects`
 */
function featureWithin(collection, container) {
    return featureFilter(collection, (feature) => turf.booleanWithin(feature, container))
}

/**
 * Calculate the error remainder function for a normal
 * @param {Number} x
 * @param {Number} mean
 * @param {Number} standardDeviation
 * @returns {Number}
 */
export function erf(x, mean, standardDeviation) {
    const z = (x - mean) / (standardDeviation * Math.sqrt(2));
    const t = 1 / (1 + 0.3275911 * Math.abs(z));
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    return 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
}

/**
 * Calculates the cumulative distribution function for a normal
 * @param {Number} x
 * @param {Number} mean
 * @param {Number} standardDeviation
 * @returns {Number}
 */
export function cdf(x, mean, standardDeviation) {
    const e = erf(x, mean, standardDeviation);
    const z = (x - mean) / (standardDeviation * Math.sqrt(2));
    const cdf = 0.5 * (1 + Math.sign(z) * e);
    return cdf;
}