/**
 * Adds a stroke marker to the map.
 * @param {Stroke} stroke - the stroke to add a marker for
 * @param {Object} options - Marker options.
 */
function strokeMarkerCreate(stroke: Stroke, options?: object) {
    console.debug(`Creating stroke markers for stroke ${stroke.index}`);
    const coordinate = stroke.start;
    const icon = L.icon({
        iconUrl: circleMarkerImg, // replace with the path to your flag icon
        iconSize: [30, 30], // size of the icon
    });
    let opt = { draggable: true, opacity: .8, icon, holeIndex: stroke.holeIndex, strokeIndex: stroke.index }
    if (options !== undefined) {
        opt = {
            ...opt,
            ...options
        }
    }
    let id = strokeMarkerID(stroke)
    let marker = markerCreate(id, coordinate, opt);
    let direction: L.Direction = "right";
    let offset: L.PointExpression = [10, 0];
    let closestStroke = strokeClosestStroke(stroke);
    if (closestStroke && closestStroke.start.x > stroke.start.x) {
        direction = "left";
        offset = [-10, 0];
    }
    marker.bindTooltip(
        (function () { return strokeTooltipText(stroke) }),
        { permanent: true, direction: direction, offset: offset });
    marker.on('click', strokeMarkerActivateCallback(marker));
    marker.on('dragend', () => strokeUpdateTerrain(stroke));
}

/**
 * Updates all stroke marker tooltips
 */
function strokeMarkerUpdate() {
    for (const hole of round.holes) {
        for (const stroke of hole.strokes) {
            let marker = layerRead(strokeMarkerID(stroke))
            if (!marker) {
                continue
            }
            let tooltip = marker.getTooltip();
            if (tooltip) {
                tooltip.update()
            }
        }
    }
}

/**
 * Return a function that can be used to activate a stroke marker
 * @param {L.Marker} marker the leaflet map marker
 * @returns {function}
 */
function strokeMarkerActivateCallback(marker: L.Marker): () => void {
    // callback doesn't need to handle the click event
    return (() => strokeMarkerActivate(marker));
}

/**
 * Activate a stroke marker
 * @param {L.Marker} marker the leaflet map marker
 */
function strokeMarkerActivate(marker: L.Marker) {
    const opt = marker.options as any;

    // Set current hole to this one if missing
    const stroke = round.holes[opt["holeIndex"]].strokes[opt["strokeIndex"]];
    if (!currentHole) {
        holeSelect(opt["holeIndex"]);
        marker = layerRead(strokeMarkerID(stroke));
    }

    // Deactivate the currently active marker if there is one
    const alreadySelected = activeStroke == stroke;
    if (activeStroke) {
        strokeMarkerDeactivate();
    }
    if (alreadySelected) {
        return
    }

    // Activate the clicked marker
    const activeIcon = L.icon({
        iconUrl: selectedMarkerImg,
        iconSize: [30, 30],
    });
    marker.setIcon(activeIcon);
    marker.getElement().classList.add('active-marker');
    activeStroke = currentHole.strokes[opt.strokeIndex];

    // Register deactivation clicks
    mapView.addEventListener("click", strokeMarkerDeactivate)

    // Rerender stroke list
    rerender('active');
}

/**
 * Deactivate an aim marker when the user clicks on the map
 */
function strokeMarkerDeactivate(e?) {

    // Ignore clicks that originate from tooltips
    if (e?.originalEvent.target.classList.contains("leaflet-pane")) {
        return
    }

    if (activeStroke) {
        let activeStrokeMarker = layerRead(strokeMarkerID(activeStroke));
        activeStrokeMarker.getElement().classList.remove('active-marker');
        const inactiveIcon = L.icon({
            iconUrl: circleMarkerImg,
            iconSize: [30, 30],
        });
        activeStrokeMarker.setIcon(inactiveIcon);
        activeStroke = null;

        // Hide the "Set aim" button and remove the aim marker
        strokeMarkerAimDelete();

        // Delete deactivation clicks
        mapView.removeEventListener("click", strokeMarkerDeactivate);

        rerender("map");
    }
}

/**
 * Return the tooltip text for a stroke marker
 * @param {Stroke} stroke
 */
function strokeTooltipText(stroke: Stroke) {
    const club = stroke.club;
    const distanceOptions = { to_unit: displayUnits, include_unit: true }
    const distance = formatDistance(strokeDistance(stroke), distanceOptions);
    return `${club} (${distance})`
}

/**
 * Create a unique ID for a Stroke
 * @param {Stroke} stroke
 * @returns {String}
 */
function strokeMarkerID(stroke: Stroke): string {
    return `stroke_marker_${stroke.index}_hole_${stroke.holeIndex}`
}
