import * as utils from "./utils";
import * as cache from "./cache";
import { fetchGolfCourseData, getGolfHoleGreenCenter } from "./grids";
import { FeatureCollection } from "geojson";

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
    const loadedData = cache.getJSON("golfData") as Round;
    if (loadedData) {
        console.log("Rehydrating round from localStorage")
        return loadedData;
    }
    return undefined;
}

/**
 * Create a new round and clear away all old data
 * @param {Course} courseParams the course
 * @returns {Round} a new Round object
 */
export function roundCreate(courseParams?: Course): Round {
    return { ...defaultRound(), ...courseParams };
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
function roundUpdateWithData(round: Round, courseData: FeatureCollection): Round {
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
 * Clear the cache of any rounds and reset
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
        date: new Date().toISOString(),
        course: "Rancho Park Golf Course",
        holes: [defaultCurrentHole()],
    };
}

/**
 * Return a default Hole object conforming to the interface
 * @returns {Hole} a default Hole interface
 */
function defaultCurrentHole(): Hole {
    return {
        index: 0,
        strokes: [],
    };
}