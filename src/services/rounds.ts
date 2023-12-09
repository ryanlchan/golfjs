import { typeid } from "typeid-js";
import { FeatureCollection } from "geojson";

import * as cache from "common/cache";
import { courseLoad, fetchHoleGreenCenter } from "services/courses";
import { defaultCurrentHole } from "services/holes";

/**
 * *************
 * * Constants *
 * *************
 */

const ROUNDS_NAMESPACE = 'rounds'

/**
 * Create a new Round, but do not save or initialize it
 * @param {Course} course the course to create a round for
 * @returns {Round} a new Round object
 */
export function roundNew(course?: Course): Round {
    if (course) {
        return { ...defaultRound(), course: course.name, courseId: course.id };
    } else {
        return defaultRound();
    }
}

/**
 * Create and initialize a round with data in one call
 * @param course the course to create a round for
 * @returns {Promise<Round>}
 */
export function roundCreate(course?: Course): Promise<Round> {
    return courseLoad(course)
        .then((data) => roundInitialize(roundNew(course), data))
}

/**
 * After downloading polygons, update the Round with relevant data like pins and holes
 * @param {Round} round the round to update
 * @param {FeatureCollection} courseData the polygons for this course
 * @returns {Round}
 */
export async function roundInitialize(round: Round, courseData: FeatureCollection): Promise<Round> {
    let lines = courseData.features.filter((feature) => feature.properties.golf && feature.properties.golf == "hole")
    for (let line of lines) {
        const index = parseInt(line.properties.ref) - 1;
        const cog = await fetchHoleGreenCenter(roundCourseParams(round), index);
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
 * Load a new round from the cache
 * @param id the id of the round to load
 * @returns {Promise<Round>}
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
 * Saves a round to the backend
 * @param round the round to save
 */
export async function roundSave(round: Round): Promise<void> {
    await roundSelect(round);
    return cache.set(round.id, round, ROUNDS_NAMESPACE);
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
 * Get the most recently selected round ID from DB
 * @returns {Promise<string>}
 */
export async function roundLatestID(): Promise<string> {
    return cache.get('latest', ROUNDS_NAMESPACE);
}

/**
 * Mark a round as the current round
 * @param round the round to select
 */
export async function roundSelect(round: Round): Promise<void> {
    return cache.set('latest', round.id, ROUNDS_NAMESPACE);
}

/**
 * Drop a round from the archive
 * @param round the round to delete from the archive
 */
export async function roundDelete(round: Round): Promise<void> {
    return cache.remove(round.id, ROUNDS_NAMESPACE);
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
        course: "Pebble Beach Golf Course",
        holes: [defaultCurrentHole()],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 2.1
    };
}

/**
 * *************
 * * Utilities *
 * *************
 */

export function roundIsPlayed(round: Round): boolean {
    return round.holes.reduce((acc, hole) => (hole.strokes.length > 0) || acc, false);
}

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
    return round.holes.flatMap(hole => hole.strokes)
        .sort((a, b) => a.holeIndex * 100 + a.index - b.holeIndex * 100 - b.index);
}

export function getHoleFromStrokeRound(stroke: Stroke, round: Round): Hole {
    const filter = hole => hole.strokes.some(s => s.id == stroke.id)
    const holes = round.holes.filter(filter);
    if (holes.length == 0) throw new Error(`No hole found for stroke ${stroke.id} in round ${round.id}`);
    return holes[0];
}

export async function lookupRoundFromHole(hole: Hole): Promise<Round> {
    throw new Error("Deprecated: Load round and use a prop instead")
    const filter = (id, round) => round.holes.some(hole => hole.id == id)
    const rounds = Object.values(await cache.filter(filter, ROUNDS_NAMESPACE));
    if (rounds.length == 0) throw new Error(`No round found for hole ${hole.id}`);
    return rounds[0];
}

export async function lookupRoundFromStroke(stroke: Stroke): Promise<Round> {
    throw new Error("Deprecated: Load round and use a prop instead")
    const filter = (id, round) => round.holes.some(hole => hole.strokes.some(stroke => stroke.id == id));
    const rounds = Object.values(await cache.filter(filter, ROUNDS_NAMESPACE));
    if (rounds.length == 0) throw new Error(`No round found for stroke ${stroke.id}`);
    return rounds[0];
}

