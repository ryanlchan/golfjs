import * as cache from "../common/cache";
import { courseLoad, getHoleGreenCenter } from "./courses";
import { FeatureCollection } from "geojson";
import { typeid } from "typeid-js";

/**
 * *************
 * * Constants *
 * *************
 */

const ROUNDS_NAMESPACE = 'rounds'

/**
 * Save round data to localstorage
 */
export async function roundSave(round: Round) {
    await roundSelect(round);
    return cache.set(round.id, { ...round }, ROUNDS_NAMESPACE);
}

/**
 * Loads the data from localStorage and initializes the map.
 * @returns {object | undefined} the loaded round or undefined
 */
export async function roundLoad(id?: string): Promise<Round> {
    if (!id) id = await cache.get('latest', ROUNDS_NAMESPACE);
    const loaded = await cache.get(id, ROUNDS_NAMESPACE) as Round;
    if (loaded) {
        console.log(`Rehydrating round ${loaded.course} ${loaded.date}`)
        return loaded;
    }
    return undefined;
}

/**
 * Loads saved round data and initializes relevant variables
 * TODO: needs to be better
 * @returns {Promise} returns the round once all data is loaded
 */
function loadRoundData(): Promise<Round> {
    const loaded = loadData();
    if (!loaded) {
        return;
    }
    console.log("Rehydrating round from cache");

    const params = roundCourseParams(round);
    if (courses.courseLoad(params) instanceof Error) {
        return courses.courseLoad(params, true)
            .then(() => loadRoundData());
    } else {
        currentHole = round.holes.at(0);
        return Promise.resolve(loaded);
    }
}

/**
 * Archive current round and load new one
 * @param round the round to swap into
 */
export async function roundSwap(round: Round): Promise<void> {
    const current = await roundLoad();
    if (!roundIsPlayed(current)) roundDelete(current)
    return cache.set('latest', round.id, ROUNDS_NAMESPACE);
}

/**
 * Create a new round and clear away all old data
 * @param {Course} course the course
 * @returns {Round} a new Round object
 */
export function roundCreate(course?: Course): Round {
    if (course) {
        return { ...defaultRound(), course: course.name, courseId: course.id };
    } else {
        return defaultRound();
    }
}

/**
 * Mark a round as the current round
 * @param round the round to select
 */
export async function roundSelect(round: Round): Promise<void> {
    return cache.set('latest', round.id, ROUNDS_NAMESPACE);
}

/**
 * Create and update a round using OSM data
 * @param {Course} course the courseto create a round for
 * @returns {Round} the updated round
 */
export async function roundInitialize(course: Course): Promise<Round> {
    const round = roundCreate(course);
    return courseLoad(roundCourseParams(round), true)
        .then((data) => roundUpdateWithData(round, data));
}

/**
 * After downloading polygons, update the Round with relevant data like pins and holes
 * @param {Round} round the round to update
 * @param {FeatureCollection} courseData the polygons for this course
 * @returns {Round}
 */
export async function roundUpdateWithData(round: Round, courseData: FeatureCollection): Promise<Round> {
    let lines = courseData.features.filter((feature) => feature.properties.golf && feature.properties.golf == "hole")
    for (let line of lines) {
        const index = parseInt(line.properties.ref) - 1;
        const cog = await getHoleGreenCenter(roundCourseParams(round), index);
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
 * Load all archived rounds as an array
 * @returns {Round[]} An array of all rounds
 */
export async function roundLoadAll(): Promise<Round[]> {
    const all = (_, val) => val instanceof Object
    const priorRounds = await cache.filter(all, ROUNDS_NAMESPACE)
    return Object.values(priorRounds);
}

/**
 * Drop a round from the archive
 * @param round the round to delete from the archive
 */
export async function roundDelete(round: Round): Promise<void> {
    return cache.remove(round.id, ROUNDS_NAMESPACE);
}

/**
 * Delete current round and start over
 */
export async function roundClear(): Promise<void> {
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

/**
 * *************
 * * Utilities *
 * *************
 */

export function getHoleFromRound(round: Round, holeIndex: number): Hole {
    return round.holes[holeIndex];
}

export function getHolePinFromRound(round: Round, holeIndex: number): Coordinate {
    const hole = getHoleFromRound(round, holeIndex);
    if (!hole) return
    return hole.pin
}

export function getStrokeFromRound(round: Round, holeIndex: number, strokeIndex: number): Stroke {
    const hole = getHoleFromRound(round, holeIndex);
    return hole.strokes[strokeIndex]
}

export function getStrokeFollowingFromRound(round: Round, stroke: Stroke): Stroke {
    return getStrokeFromRound(round, stroke.holeIndex, stroke.index + 1);
}

export function getStrokeEndFromRound(round: Round, stroke: Stroke): Coordinate {
    const following = getStrokeFollowingFromRound(round, stroke);
    if (following) return following.start;
    return getHolePinFromRound(round, stroke.holeIndex);
}

export function getStrokesFromRound(round: Round): Stroke[] {
    return round.holes.flatMap(hole => hole.strokes);
}

export async function lookupRoundFromHole(hole: Hole): Promise<Round> {
    const filter = (id, round) => round.holes.some(hole => hole.id == id)
    const rounds = Object.values(await cache.filter(filter, ROUNDS_NAMESPACE));
    if (rounds.length == 0) throw new Error(`No round found for hole ${hole.id}`);
    return rounds[0];
}

export async function lookupRoundFromStroke(stroke: Stroke): Promise<Round> {
    const filter = (id, round) => round.holes.some(hole => hole.strokes.some(stroke => stroke.id == id));
    const rounds = Object.values(await cache.filter(filter, ROUNDS_NAMESPACE));
    if (rounds.length == 0) throw new Error(`No round found for stroke ${stroke.id}`);
    return rounds[0];
}

export function getHoleFromStrokeRound(stroke: Stroke, round: Round): Hole {
    const filter = hole => hole.strokes.some(s => s.id == stroke.id)
    const holes = round.holes.filter(filter);
    if (holes.length == 0) throw new Error(`No hole found for stroke ${stroke.id} in round ${round.id}`);
    return holes[0];
}