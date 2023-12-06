

/**
 * Draw a hole line showing the intended playing line
 * @param {Hole} hole the Hole interface object
 */
function holeLineCreate(hole: Hole) {
    let line = courses.getHoleLine(roundCourseParams(round), hole.index);
    if (line instanceof Error) {
        return
    }
    let layer = L.geoJSON(line, {
        style: () => {
            return {
                stroke: true,
                color: '#fff',
                weight: 2,
                opacity: 0.5
            }
        },
        interactive: false
    });
    layerCreate(holeLineId(hole), layer);
}

/**
 * Return a unique ID for a hole line layer
 * @param {Hole} hole the Hole interface object
 * @returns {String} a unique ID
 */
function holeLineId(hole: Hole): string {
    return `hole_i${hole.index}_line`
}