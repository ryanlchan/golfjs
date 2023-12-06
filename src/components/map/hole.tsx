/**
 * Render the set of markers/layers for a given hole
 * @param {Hole} hole the hole object from round
 */
function holeViewCreate(hole: Hole) {
    console.debug(`Rendering layers for hole i${hole.index}`)
    hole.strokes.forEach(function (stroke) {
        strokeMarkerCreate(stroke);
    });
    if (hole.pin) {
        pinMarkerCreate(hole);
    }
    strokelineCreate(hole);
    holeLineCreate(hole);
}

/**
 * Delete all hole specific view layers
 */
function holeViewDelete() {
    strokeMarkerDeactivate();
    const allLayers = layerReadAll();
    for (let id in allLayers) {
        if (id.includes("hole_") || id.includes("active_")) {
            layerDelete(id);
        }
    }
}

/**
 * Returns a unique layer ID for a given Hole
 * @param {Hole} hole the hole interface object from round
 * @returns {String}
 */
function holePinID(hole: Hole): string {
    return `pin_hole_i${hole.index}`
}