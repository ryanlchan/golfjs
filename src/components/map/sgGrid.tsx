import chroma from "chroma-js";

/**
 * Create a Strokes Gained probability grid around the current aim point
 */
function sgGridCreate() {
    if (!activeStroke) {
        console.error("No active stroke, cannot create sg grid");
        return
    } else if (!currentHole.pin) {
        console.error("Pin not set, cannot create sg grid");
        return
    } else if (layerRead("active_grid")) {
        console.warn("Grid already exists, recreating");
        layerDelete("active_grid");
    }

    const grid = grids.sgGrid(
        [activeStroke.start.y, activeStroke.start.x],
        [activeStroke.aim.y, activeStroke.aim.x],
        [currentHole.pin.y, currentHole.pin.x],
        activeStroke.dispersion,
        roundCourseParams(round),
        activeStroke.terrain);

    // Check if any grid returned, for example if the data didn't load or something
    if (grid instanceof Error) {
        return
    }
    // Create alpha/colorscale
    const colorscale: chroma.Scale = chroma.scale('RdYlGn').domain([-.25, .15]);
    const alphamid = 1 / grid.features.length;
    const clip = (num, min, max) => Math.min(Math.max(num, min), max)
    const options: GridOptions = {
        style: function (feature) {
            return {
                stroke: false,
                fillColor: colorscale(feature.properties.strokesGained).hex(),
                fillOpacity: clip(feature.properties.probability / alphamid * 0.2, 0.1, 0.7)
            }
        },
        grid: grid
    }
    const gridLayer = L.geoJSON(grid, options).bindPopup(function (layer: any) {
        const props = layer.feature.properties;
        const sg = props.strokesGained;
        const prob = (props.probability * 100);
        const er = grids.erf(props.distanceToAim, 0, activeStroke.dispersion)
        const ptile = (1 - er) * 100;
        return `SG: ${sg.toFixed(2)}
                    | ${props.terrainType}
                    | Prob: ${prob.toFixed(2)}%
                    | ${ptile.toFixed(1)}%ile`;
    });
    layerCreate("active_grid", gridLayer);
}

/**
 * Create a unique ID for a Stroke SG grid
 * @param {Stroke} stroke
 * @returns {String}
 */
function strokeSgGridID(stroke: Stroke): string {
    return `stroke_${stroke.index}_hole_${stroke.holeIndex}_sg_grid`
}
