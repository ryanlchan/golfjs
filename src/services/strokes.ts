import { coordToPoint, getDistance } from 'common/projections';
import { clamp, indexSort, touch, trackUpdates } from 'common/utils';
import { CourseFeatureCollection, TERRAIN_TYPES, getTerrainAt } from './courses';
import { typeid } from 'typeid-js';
import { getHoleFromRound, getHoleFromStrokeRound, getStrokeFromRound } from './rounds';
import { GolfClub } from './clubs';

/**
 * ===========
 * Strokes
 * ===========
 */

/**
 * Shows the current position on the map and logs it as a stroke.
 * @param position - The current geolocation position.
 * @param holeIndex - The hole to create the stroke in
 * @param courseData - The CourseFeatureCollection representing the course
 * @param round - The round to create within
 * @param options - any additional options to set on Stroke
 */
function strokeCreate(
    position: GeolocationPositionIsh,
    holeIndex: number,
    courseData: CourseFeatureCollection,
    round: Round,
    options: object = {}) {
    // TODO: Move to map logic
    // if (currentHole == undefined) {
    //     currentHole = round.holes.reduce((latest, hole) => {
    //         return hole.index > latest.index && hole.strokes.length > 0 ? hole : latest
    //     })
    //     holeSelect(currentHole.index);
    // }
    round = trackUpdates(round);
    const hole = getHoleFromRound(round, holeIndex);
    const stroke: Stroke = {
        id: typeid("stroke").toString(),
        index: hole.strokes.length,
        holeIndex: hole.index,
        start: {
            x: position.coords.longitude,
            y: position.coords.latitude,
            crs: "EPSG:4326",
        },
        terrain: getTerrainAt(courseData, [position.coords.latitude, position.coords.longitude]),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...options
    };
    if (hole.pin) stroke.aim = hole.pin;
    if (stroke.index > 0) {
        const lastStroke = getStrokeFromRound(round, stroke.holeIndex, stroke.index - 1);
        if (lastStroke.terrain == TERRAIN_TYPES.PENALTY) lastStroke.aim = stroke.start;
    }
    hole.strokes.push(stroke);
}

export function strokeAdd(stroke: Stroke, round: Round) {
    round = trackUpdates(round);
    const hole = getHoleFromRound(round, stroke.holeIndex)
    hole.strokes.push(stroke);
}

/**
 * Create a new stroke for a given club at current position
 * @param position - The current geolocation position.
 * @param holeIndex - The hole to create the stroke in
 * @param club the club to create a stroke with
 * @param courseData - The CourseFeatureCollection representing the course
 * @param round - The round to create within
 * @param options - any additional options to set on Stroke
 */
function strokeCreateWithClub(position: GeolocationPositionIsh,
    holeIndex: number,
    club: GolfClub,
    courseData: CourseFeatureCollection,
    round: Round,) {
    let options = {
        club: club.name,
        dispersion: club.dispersion,
    }
    if (club.name == "Penalty") options['terrain'] = TERRAIN_TYPES.PENALTY;
    strokeCreate(position, holeIndex, courseData, round, options)
}

/**
 * Delete a stroke out of the round
 * @param stroke the stroke to delete
 * @param round the round to delete from
 */
export function strokeDelete(stroke: Stroke, round: Round) {
    round = trackUpdates(round);
    const hole = getHoleFromRound(round, stroke.holeIndex);
    const strokes = indexSort(hole.strokes);
    strokes.splice(stroke.index, 1);
    strokes.forEach((stroke, index) => stroke.index = index);
}

/**
 * Reorders a stroke within a Hole
 * @param stroke the stroke index to reorder
 * @param index the new index it should be at
 * @param round the Round 
 */
export function strokeReorder(stroke: Stroke, index: number, round: Round) {
    round = trackUpdates(round);
    const hole = getHoleFromRound(round, stroke.holeIndex);
    const strokes = indexSort(hole.strokes);
    const oldIndex = stroke.index;
    index = clamp(index, 0, strokes.length - 1);
    strokes.splice(oldIndex, 1);
    strokes.splice(index, 0, stroke);
    strokes.forEach((stroke, index) => stroke.index = index);
}

/**
 * Get the distance from this stroke to the next
 * @param {Stroke} stroke the stroke
 * @param round the Round 
 * @returns {number} the distance in meters
 */
export function strokeGetDistance(stroke: Stroke, round: Round): number {
    const nextStart = strokeGetNextStart(stroke, round)
    return getDistance(stroke.start, nextStart);
}

function strokeUpdateTerrain(stroke: Stroke, round: Round, courseData: CourseFeatureCollection) {
    stroke.terrain = getTerrainAt(courseData, coordToPoint(stroke.start))
    const hole = getHoleFromStrokeRound(stroke, round);
    touch(stroke, hole, round);
}

/**
 * Reset a stroke to aim at the pin
 * @param stroke the stroke to reset aim for
 * @param round the Round 
 * @returns the updated stroke
 */
function strokeAimReset(stroke: Stroke, round: Round): Stroke {
    round = trackUpdates(round);
    const hole = getHoleFromRound(round, stroke.holeIndex);
    stroke.aim = hole.pin;
    return stroke;
}

export function strokeGetNextStart(stroke: Stroke, round: Round): Coordinate {
    let nextStroke = getStrokeFromRound(round, stroke.holeIndex, stroke.index + 1);
    if (nextStroke) {
        return nextStroke.start;
    }
    return getHoleFromRound(round, stroke.holeIndex)?.pin;
}

export function strokeGetLastStart(stroke: Stroke, round: Round): Coordinate {
    return getStrokeFromRound(round, stroke.holeIndex, stroke.index - 1)?.start;
}

export function strokeGetClosestStroke(stroke: Stroke, round: Round): Stroke {
    let lastStroke = getStrokeFromRound(round, stroke.holeIndex, stroke.index - 1);
    let nextStroke = getStrokeFromRound(round, stroke.holeIndex, stroke.index + 1);
    if (!lastStroke || !nextStroke) {
        return lastStroke || nextStroke;
    }

    let lastDist = getDistance(stroke.start, lastStroke.start);
    let nextDist = getDistance(stroke.start, nextStroke.start);
    return (lastDist < nextDist) ? lastStroke : nextStroke;
}
