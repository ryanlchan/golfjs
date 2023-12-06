import chroma from "chroma-js";

/**
 * Create a relative strokes gained grid for aiming at each cell in a grid
 */
function targetGridCreate() {
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

    const grid = grids.targetGrid(
        [activeStroke.start.y, activeStroke.start.x],
        [activeStroke.aim.y, activeStroke.aim.x],
        [currentHole.pin.y, currentHole.pin.x],
        activeStroke.dispersion,
        roundCourseParams(round),
        activeStroke.terrain);
    const bestCell = grid.properties.idealStrokesGained;

    // Check if any grid returned, for example if the data didn't load or something
    if (grid instanceof Error) {
        return
    }
    // Create alpha/colorscale
    const colorscale = chroma.scale('RdYlGn').domain([-.25, .25]);
    const options: GridOptions = {
        style: function (feature) {
            const ideal = feature.properties.weightedStrokesGained == bestCell;
            if (ideal) {
                return {
                    stroke: true,
                    fillColor: "#FFD700",
                    fillOpacity: 0.8
                }
            }
            return {
                stroke: false,
                fillColor: colorscale(feature.properties.relativeStrokesGained).hex(),
                fillOpacity: 0.5
            }
        },
        grid: grid
    }
    const gridLayer = L.geoJSON(grid, options).bindPopup(function (layer: any) {
        const props = layer.feature.properties;
        const wsg = props.weightedStrokesGained;
        const rwsg = props.relativeStrokesGained;
        return `SG: ${wsg.toFixed(2)}
                    | vs Aim: ${rwsg.toFixed(2)}`
    });
    layerCreate("active_grid", gridLayer);
}
