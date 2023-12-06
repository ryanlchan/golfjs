

/**
 * Adds a pin marker to the map.
 * @param {Hole} hole - The hole to add a pin for
 */
function pinMarkerCreate(hole: Hole) {
    console.debug("Creating pin marker for hole i" + hole.index)
    const coordinate = hole.pin;
    const holeIndex = hole.index;
    const flagIcon = L.icon({
        iconUrl: flagImg, // replace with the path to your flag icon
        iconSize: [60, 60], // size of the icon
        iconAnchor: [30, 60]
    });
    const options = {
        draggable: true,
        icon: flagIcon,
        title: String(holeIndex),
        zIndexOffset: -1000
    };
    const id = holePinID(hole);
    markerCreate(id, coordinate, options);
}

function pinMarkerUpdate(hole: Hole) {
    const id = holePinID(hole);
    const layer = layerRead(id);
    if (!layer) {
        return
    }

    layer.setLatLng(L.latLng(hole.pin.y, hole.pin.x))
}