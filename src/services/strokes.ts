import { signal } from '@preact/signals';
import { coordToPoint, formatDistanceAsNumber, formatDistanceOptions, getDistance } from 'common/projections';
import { clamp, indexSort, touch } from 'common/utils';
import { CourseFeatureCollection, TERRAIN_TYPES, getTerrainAt } from './courses';
import { typeid } from 'typeid-js';
import { getHoleFromRound, roundCourseParams } from './rounds';
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
        const lastStroke = strokeGetLastStroke(stroke, round);
        if (lastStroke.terrain == TERRAIN_TYPES.PENALTY) lastStroke.aim = stroke.start;
    }
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
function strokeDelete(stroke: Stroke, round: Round) {
    const hole = strokeGetHole(stroke, round)
    const strokes = indexSort(hole.strokes);
    strokes.splice(stroke.index, 1);
    strokes.forEach((stroke, index) => stroke.index = index);
    touch(hole, round);
}



/**
 * Reorders a stroke within a Hole
 * @param stroke the stroke index to reorder
 * @param index the new index it should be at
 * @param round the Round 
 */
function strokeReorder(stroke: Stroke, index: number, round: Round) {
    const hole = strokeGetHole(stroke, round);
    const strokes = indexSort(hole.strokes);
    const oldIndex = stroke.index;
    index = clamp(index, 0, strokes.length - 1);
    strokes.splice(oldIndex, 1);
    strokes.splice(index, 0, stroke);
    strokes.forEach((stroke, index) => stroke.index = index);
    touch(hole, round);
}

/**
 * Get the distance from this stroke to the next
 * @param {Stroke} stroke the stroke
 * @param round the Round 
 * @returns {number} the distance in meters
 */
function strokeGetDistance(stroke: Stroke, round: Round): number {
    const nextStart = strokeGetNextStart(stroke, round)
    return getDistance(stroke.start, nextStart);
}

function strokeUpdateTerrain(stroke: Stroke, round: Round, courseData: CourseFeatureCollection) {
    stroke.terrain = getTerrainAt(courseData, coordToPoint(stroke.start))
    touch(stroke);
}

/**
 * Reset a stroke to aim at the pin
 * @param stroke the stroke to reset aim for
 * @param round the Round 
 * @returns the updated stroke
 */
function strokeAimReset(stroke: Stroke, round: Round): Stroke {
    const hole = strokeGetHole(stroke, round);
    stroke.aim = hole.pin;
    touch(stroke, hole, round);
    return stroke;
}

/**
 * Get the hole for a stroke
 * @param stroke the stroke to get the hole for
 * @param round the Round 
 * @returns the hole for the stroe
 */
function strokeGetHole(stroke: Stroke, round: Round): Hole {
    return round.holes[stroke.holeIndex];
}

function strokeGetNextStroke(stroke: Stroke, round: Round): Stroke {
    let hole = strokeGetHole(stroke, round);
    if (!hole || stroke.index == hole.strokes.length) {
        return undefined;
    }
    return hole.strokes[stroke.index + 1];
}

function strokeGetLastStroke(stroke: Stroke, round: Round): Stroke {
    let hole = strokeGetHole(stroke, round);
    if (!hole || stroke.index == 0) {
        return undefined;
    }
    return hole.strokes[stroke.index - 1];
}

function strokeGetNextStart(stroke: Stroke, round: Round): Coordinate {
    let nextStroke = strokeGetNextStroke(stroke, round);
    if (nextStroke) {
        return nextStroke.start;
    }
    return strokeGetHole(stroke, round).pin;
}

function strokeGetLastStart(stroke: Stroke, round: Round): Coordinate {
    let lastStroke = strokeGetLastStroke(stroke, round);
    if (lastStroke) {
        return lastStroke.start;
    }
    return undefined;
}

function strokeGetClosestStroke(stroke: Stroke, round: Round): Stroke {
    let lastStroke = strokeGetLastStroke(stroke, round);
    let nextStroke = strokeGetNextStroke(stroke, round);
    if (!lastStroke && !nextStroke) {
        return undefined
    } else if (!lastStroke) {
        return nextStroke;
    } else if (!nextStroke) {
        return lastStroke;
    }

    let lastDist = getDistance(stroke.start, lastStroke.start);
    let nextDist = getDistance(stroke.start, nextStroke.start);
    if (lastDist < nextDist) {
        return lastStroke;
    } else {
        return nextStroke;
    }
}
