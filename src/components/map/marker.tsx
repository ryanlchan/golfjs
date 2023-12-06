
/**
 * ===========
 * Base Marker
 * ===========
 */

/**
 * Adds a marker to the map.
 * @param {string} name - the name of the marker
 * @param {Coordinate} coordinate - The coordinate object {x, y, crs}.
 * @param {Object} options - Marker options.
 * @returns {L.Marker} a leaflet marker
 */
function markerCreate(name: string, coordinate: Coordinate, options?: object): L.Marker {
    options = { draggable: true, ...options }
    const marker = L.marker([coordinate.y, coordinate.x], options);
    marker.on("drag", handleMarkerDrag(marker, coordinate));
    marker.on("dragend", (() => rerender("dragend")));
    layerCreate(name, marker)
    strokelineUpdate();
    return marker
}

/**
 * Shortcut factory for marker drag callbacks
 * @param {L.Marker} marker
 */
function handleMarkerDrag(marker: L.Marker, coordinate) {
    return (function mdrag(event) {
        const position = marker.getLatLng();
        coordinate.x = position.lng;
        coordinate.y = position.lat;
        rerender();
    });
}