
/**
 * ============
 * Stroke Lines
 * ============
 */

/**
 * Create a stroke line for a given hole
 * @param {Hole} hole
 */
function strokelineCreate(hole: Hole) {
    console.debug("Creating stroke line for hole i" + hole.index)
    let points = strokelinePoints(hole);

    // Only create polyline if there's more than one point
    if (points.length == 0) {
        return
    }

    // Add Line to map
    let strokeline = L.polyline(points, {
        color: 'white',
        weight: 2,
        interactive: false
    });
    let id = strokelineID(hole);
    layerCreate(id, strokeline);
    return strokeline
}

/**
 * Rerender Stroke Lines
 */
function strokelineUpdate() {
    let layers = layerReadAll();
    let selected = {}
    for (let id in layers) {
        if (id.includes("strokeline")) {
            selected[id] = layers[id];
        }
    }
    for (let hole of round.holes) {
        let id = strokelineID(hole);
        if (Object.keys(selected).includes(id)) {
            selected[id].setLatLngs(strokelinePoints(hole));
        }
    }
}

/**
 * Helper function just to generate point arrays for a hole
 * @param {Hole} hole
 * @returns {L.LatLng[]}
 */
function strokelinePoints(hole: Hole): L.LatLng[] {
    let points = []
    // Sort strokes by index and convert to LatLng objects
    hole.strokes.sort((a, b) => a.index - b.index);
    hole.strokes.forEach(stroke => {
        points.push(L.latLng(stroke.start.y, stroke.start.x));
    });

    // If a pin is set, add it to the end of the polyline
    if (hole.pin) {
        points.push(L.latLng(hole.pin.y, hole.pin.x));
    }
    return points
}

/**
 * Generate a unique layer primary key for this hole
 * @param {Hole} hole
 * @returns String
 */
function strokelineID(hole: Hole) {
    return `strokeline_hole_${hole.index}`
}