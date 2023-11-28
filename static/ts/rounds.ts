import * as cache from "./cache";
import { fetchGolfCourseData, getGolfHoleGreenCenter } from "./grids";
import { FeatureCollection } from "geojson";
import { typeid } from "typeid-js";

/**
 * Save round data to localstorage
 */
export function roundSave(round: Round) {
    cache.setJSON("golfData", { ...round });
}

/**
 * Loads the data from localStorage and initializes the map.
 * @returns {object | undefined} the loaded round or undefined
 */
export function roundLoad(): Round {
    const loaded = cache.getJSON("golfData") as Round;
    if (loaded) {
        console.log(`Rehydrating round ${loaded.course} ${loaded.date} from localStorage`)
        return loaded;
    }
    return undefined;
}

/**
 * Archive current round and load new one
 */
export function roundSwap(newRound: Round): void {
    const r = roundLoad();
    if (roundIsPlayed(r)) roundArchive(r);
    roundSave(newRound);
}

/**
 * Create a new round and clear away all old data
 * @param {Course} courseParams the course
 * @returns {Round} a new Round object
 */
export function roundCreate(courseParams?: Course): Round {
    if (courseParams) {
        return { ...defaultRound(), course: courseParams.name, courseId: courseParams.id };
    } else {
        return defaultRound();
    }
}

/**
 * Initialize a round by downloading the data from OSM
 * @param round the round to initialize
 * @returns {Promise} a promise that resolves when the round is updated
 * 
 */
export function roundInitialize(round: Round): Promise<Round> {
    return fetchGolfCourseData(roundCourseParams(round), true)
        .then((data) => roundUpdateWithData(round, data));
}

/**
 * After downloading polygons, update the Round with relevant data like pins and holes
 * @param {turf.FeatureCollection} courseData the polygons for this course
 */
export function roundUpdateWithData(round: Round, courseData: FeatureCollection): Round {
    let lines = courseData.features.filter((feature) => feature.properties.golf && feature.properties.golf == "hole")
    for (let line of lines) {
        const index = parseInt(line.properties.ref) - 1;
        const cog = getGolfHoleGreenCenter(roundCourseParams(round), index);
        const pin = {
            x: cog[0],
            y: cog[1],
            crs: "EPSG:4326",
        };
        let hole = { ...defaultCurrentHole(), index: index, pin: pin };
        if (line.properties.par) {
            hole["par"] = parseInt(line.properties.par)
        }
        if (line.properties.handicap) {
            hole["handicap"] = parseInt(line.properties.handicap)
        }
        round.holes[hole.index] = { ...hole, ...round.holes[hole.index] }
    }
    return round;
}

/**
 * Rotate the current round into the archive/local storage
 */
export function roundArchive(round: Round): void {
    let priorRounds = cache.getJSON('priorRounds');
    if (!priorRounds) {
        priorRounds = {};
    }
    const roundKey = roundID(round);
    priorRounds[roundKey] = { ...round };
    cache.setJSON('priorRounds', priorRounds);
}

/**
 * Load all archived rounds as an array
 * @returns {Round[]} An array of all rounds
 */
export function roundLoadArchive(): Round[] {
    let priorRounds = cache.getJSON('priorRounds');
    if (!priorRounds) return []
    return Object.values(priorRounds);
}

/**
 * Drop a round from the archive
 * @param round the round to delete from the archive
 */
export function roundDeleteArchive(round: Round) {
    let priorRounds = cache.getJSON('priorRounds');
    if (!priorRounds) {
        return;
    }
    const roundKey = roundID(round);
    delete priorRounds[roundKey];
    cache.setJSON('priorRounds', priorRounds);
}

/**
 * Delete current round and start over
 */
export function roundClear(): void {
    let round = roundCreate();
    roundSave(round);
}

export function roundIsPlayed(round: Round): boolean {
    return round.holes.reduce((acc, hole) => (hole.strokes.length > 0) || acc, false);
}

export function roundID(round: Round): string {
    return `${round.course}-${round.courseId}-${round.date}`
}

/**
 * Return a course interface given a round interface
 * @param {Round} round the round object
 * @returns {Course} the course parameters
 */
export function roundCourseParams(round: Round): Course {
    return { 'name': round.course, 'id': round.courseId }
}

/**
 * Returns a default Round object conforming to the interface
 * @returns {Round} a default Round interface
 */
function defaultRound(): Round {
    return {
        id: typeid("round").toString(),
        date: new Date().toISOString(),
        course: "Rancho Park Golf Course",
        holes: [defaultCurrentHole()],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 2.1
    };
}

/**
 * Return a default Hole object conforming to the interface
 * @returns {Hole} a default Hole interface
 */
function defaultCurrentHole(): Hole {
    return {
        id: typeid("hole").toString(),
        index: 0,
        strokes: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}