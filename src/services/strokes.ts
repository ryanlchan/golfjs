import { signal } from '@preact/signals';

/**
 * ===========
 * Strokes
 * ===========
 */

/**
 * Shows the current position on the map and logs it as a stroke.
 * @param {GeolocationPositionIsh} position - The current geolocation position.
 * @param {object} options - any additional options to set on Stroke
 */
function strokeCreate(position: GeolocationPositionIsh, options: object = {}) {
    // handle no current hole
    if (currentHole == undefined) {
        currentHole = round.holes.reduce((latest, hole) => {
            return hole.index > latest.index && hole.strokes.length > 0 ? hole : latest
        })
        holeSelect(currentHole.index);
    }

    // Create the stroke object
    const course = roundCourseParams(round);
    const stroke: Stroke = {
        id: typeid("stroke").toString(),
        index: currentHole.strokes.length,
        holeIndex: currentHole.index,
        start: {
            x: position.coords.longitude,
            y: position.coords.latitude,
            crs: "EPSG:4326",
        },
        terrain: courses.getTerrainAt(course, [position.coords.latitude, position.coords.longitude]),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...options
    };
    if (currentHole.pin) {
        stroke.aim = currentHole.pin;
    }

    // Add the stroke to the data layer
    currentHole.strokes.push(stroke);
    touch(currentHole, round);

    // Add the stroke to the view
    strokeMarkerCreate(stroke);
    rerender();
}

/**
 * Create a new stroke for a given club at current position
 * @param {GeolocationPositionIsh} position the locaation to create a stroke at
 * @param {Club} club the club to create a stroke with
 */
function clubStrokeCreate(position: GeolocationPositionIsh, club: Club) {
    let options = {
        club: club.name,
        dispersion: club.dispersion,
    }
    if (club.name == "Penalty") options['terrain'] = "penalty";
    strokeCreate(position, options)
}

/**
 * Delete a stroke out of the round
 * @param {Number} holeIndex
 * @param {Number} strokeIndex
 */
function strokeDelete(holeIndex, strokeIndex: number) {
    console.debug(`Deleting stroke i${strokeIndex} from hole i${holeIndex}`)
    let hole = round.holes.find(h => h.index === holeIndex);
    if (hole) {
        // Delete from data layer
        hole.strokes.splice(strokeIndex, 1);

        // Reindex remaining strokes
        hole.strokes.forEach((stroke, index) => stroke.index = index);

        // Update hole
        touch(hole, round);

        // Rerender views
        holeViewDelete()
        holeViewCreate(hole)
        rerender();
    }
}

/**
 * Reorders a stroke within a Hole
 * @param {Number} holeIndex the hole to reorder (1-indexed)
 * @param {Number} strokeIndex the stroke index to reorder (0-indexed)
 * @param {Number} offset movment relative to the current strokeIndex
 */
function strokeReorder(holeIndex: number, strokeIndex: number, offset: number) {
    console.debug(`Moving stroke i${strokeIndex} from hole i${holeIndex} by ${offset}`)
    const hole = round.holes[holeIndex]
    const mover = hole.strokes[strokeIndex]
    if (offset < 0) {
        offset = Math.max(offset, -strokeIndex)
    } else {
        offset = Math.min(offset, hole.strokes.length - strokeIndex - 1)
    }
    hole.strokes.splice(strokeIndex, 1)
    hole.strokes.splice(strokeIndex + offset, 0, mover)
    hole.strokes.forEach((stroke, index) => stroke.index = index);

    // Update hole
    touch(hole, round);

    // Update the map and polylines
    rerender()
}

/**
 * Get the distance from this stroke to the next
 * @param {Stroke} stroke
 */
function strokeDistance(stroke: Stroke): number {
    const nextStart = strokeNextStart(stroke)
    return getDistance(stroke.start, nextStart);
}

/**
 * Set the dispersion for a stroke
 * @param {Stroke} stroke the stroke
 * @param {number | string} [val] the value to set the dispersion to
 * @returns {number} the dispersion of this stroke
 */
function convertAndSetStrokeDispersion(stroke: Stroke, val: number | string): number {
    const distOpts = { from_unit: displayUnits, to_unit: "meters", output: "number", precision: 3 } as formatDistanceOptions;
    touch(stroke, strokeHole(stroke), round);
    stroke.dispersion = formatDistanceAsNumber(val, distOpts);
    return stroke.dispersion;
}

function strokeUpdateTerrain(stroke: Stroke, strokeRound?: Round) {
    if (!strokeRound) strokeRound = round;
    const course = roundCourseParams(strokeRound);
    stroke.terrain = courses.getTerrainAt(course, [stroke.start.y, stroke.start.x])
    touch(stroke);
}

/**
 * Reset a stroke to aim at the pin
 * @param stroke the stroke to reset aim for
 * @returns the updated stroke
 */
function strokeAimReset(stroke: Stroke): Stroke {
    const hole = strokeHole(stroke);
    stroke.aim = hole.pin;
    touch(stroke, hole, round);
    return stroke;
}

/**
 * Get the hole for a stroke
 * @param stroke the stroke to get the hole for
 * @returns the hole for the stroe
 */
function strokeHole(stroke: Stroke): Hole {
    return round.holes[stroke.holeIndex];
}

function strokeNextStroke(stroke: Stroke): Stroke {
    let hole = strokeHole(stroke);
    if (!hole || stroke.index == hole.strokes.length) {
        return undefined;
    }
    return hole.strokes[stroke.index + 1];
}

function strokeLastStroke(stroke: Stroke): Stroke {
    let hole = strokeHole(stroke);
    if (!hole || stroke.index == 0) {
        return undefined;
    }
    return hole.strokes[stroke.index - 1];
}

function strokeNextStart(stroke: Stroke): Coordinate {
    let nextStroke = strokeNextStroke(stroke);
    if (nextStroke) {
        return nextStroke.start;
    }
    return strokeHole(stroke).pin;
}

function strokeLastStart(stroke: Stroke): Coordinate {
    let lastStroke = strokeLastStroke(stroke);
    if (lastStroke) {
        return lastStroke.start;
    }
    return undefined;
}

function strokeClosestStroke(stroke: Stroke): Stroke {
    let lastStroke = strokeLastStroke(stroke);
    let nextStroke = strokeNextStroke(stroke);
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
