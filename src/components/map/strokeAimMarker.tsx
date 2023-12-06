
/**
 * Create an aim marker where the user has currently clicked
 */
function strokeMarkerAimCreate() {
    if (!activeStroke) {
        console.error("Cannot add aim, no active stroke")
        return
    }

    let aim = { ...activeStroke.aim };
    const aimIcon = L.icon({
        iconUrl: targetImg, // replace with the path to your flag icon
        iconSize: [30, 30], // size of the icon
        tooltipAnchor: [15, -15]
    });
    const options = {
        draggable: true,
        icon: aimIcon,
        title: "Aim point",
        zIndexOffset: 1000
    };
    let marker = markerCreate("active_aim", aim, options);
    marker.bindTooltip(strokeMarkerAimTooltip, { permanent: true, direction: "top", offset: [-15, 0] })
    marker.once('drag', () => activeStroke.aim = aim);
    let ring = L.circle(marker.getLatLng(), { radius: activeStroke.dispersion, color: "#fff", opacity: 0.5, weight: 2 })
    layerCreate("active_aim_ring", ring);
    gridCreate();
    strokeMarkerAimUpdate();
}

/**
 * Output the content for a Stroke's Aim marker's tooltip
 * @returns {String}
 */
function strokeMarkerAimTooltip(): string {
    const distanceOptions = { to_unit: displayUnits, include_unit: true }
    const aimDistance = formatDistance(getDistance(activeStroke.start, activeStroke.aim), distanceOptions);
    const pinDistance = formatDistance(getDistance(activeStroke.aim, currentHole.pin), distanceOptions);
    let text = `${aimDistance} to aim<br> ${pinDistance} to pin`;

    const sggrid = layerRead("active_grid");
    if (sggrid?.options.grid) {
        const wsg = sggrid.options.grid.properties.weightedStrokesGained.toFixed(2);
        text += `<br> SG Aim ${wsg}`
    }
    return text
}

/**
 * Update the tooltip and aim ring for a Stroke's Aim marker
 */
function strokeMarkerAimUpdate() {
    try {
        const marker = layerRead("active_aim")
        marker.getTooltip().update();
        layerRead("active_aim_ring").setLatLng(marker.getLatLng());
    } catch (e) {
        return;
    }
}

/**
 * Delete the current active stroke's aim marker, ring, and grid
 */
function strokeMarkerAimDelete() {
    // Hide aim layers
    layerDelete("active_aim");
    layerDelete("active_aim_ring");

    // Hide any grid
    gridDelete();
}

/**
 * Create a unique ID for a Stroke AIm marker
 * @param {Stroke} stroke
 * @returns {String}
 */
function strokeMarkerAimID(stroke: Stroke): string {
    return `stroke_marker_aim_${stroke.index}_hole_${stroke.holeIndex}`
}
