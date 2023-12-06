/**
 * Set up a marker on the map which tracks current user position and caches location
 */
function currentPositionUpdate() {
    currentPositionEnabled = true;
    navigator.geolocation.watchPosition((position) => {
        const markerID = "currentPosition";
        currentPosition = position;
        let latlong: L.LatLngExpression = [position.coords.latitude, position.coords.longitude];
        let currentPositionMarker = layerRead(markerID)
        if (currentPositionMarker) {
            // If the marker already exists, just update its position
            currentPositionMarker.setLatLng(latlong);
            currentPositionMarker.getPopup().update();
        } else {
            // Create a new marker and add it to the map
            currentPositionMarker = L.circleMarker(
                latlong,
                { radius: 10, fillColor: "#4A89F3", color: "#FFF", weight: 1, opacity: 0.8, fillOpacity: 0.8 }
            );
            currentPositionMarker.bindPopup(positionMarkerPopupText)
            layerCreate(markerID, currentPositionMarker);
        }

        // Update live distance box
        upperMapControlsUpdate();
    }, showPositionError, {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 1000
    });
}

function positionMarkerPopupText(layer: L.Marker) {
    if (!currentHole) return "";
    const latlng = layer.getLatLng();
    const coord = { x: latlng["lng"], y: latlng["lat"], crs: "EPSG:4236" }
    const dOpt = { to_unit: displayUnits, include_unit: true }
    const dist = formatDistance(getDistance(coord, currentHole.pin), dOpt);
    return `${dist} to pin`;
}
