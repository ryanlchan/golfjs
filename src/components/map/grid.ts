/**
 * =====
 * Grids
 * =====
 */

import { useHolesStateManagerContext } from "hooks/useActiveHolesContext";
import { useStrokesStateManagerContext } from "hooks/useActiveStrokesContext";

/**
 * Duck type a GridOptions object that allows us to reference the grid from GeoJSON layers
 */
interface GridOptions extends L.GeoJSONOptions {
    grid: L.GeoJSON
}

/**
 * Create the currently active grid type
 * @param {string} type the type of grid to render, from grids.GRID_TYPES
 */
function gridCreate(type?: string) {
    if (type == grids.gridTypes.STROKES_GAINED) {
        sgGridCreate();
    } else if (type == grids.gridTypes.TARGET) {
        targetGridCreate();
    } else {
        sgGridCreate();
    }
}

/**
 * Delete the currently active grid type
 */
function gridDelete() {
    layerDelete("active_grid");
}

/**
 * Update the currently active grid type
 * @param {string} [type] the type of grid to update to
 * @returns {Promise} a promise for when the grid is done refreshing
 */
function gridUpdate(type?: string): Promise<any> {
    // Get current layer type
    if (!type) {
        let layer = layerRead("active_grid");
        if (layer) {
            type = layer.options.grid.properties.type;
        }
    }
    gridDelete();

    // Create new grid given type (default to SG)
    if (activeStroke && currentHole.pin) {
        gridCreate(type);
        strokeMarkerAimUpdate();
        return Promise.resolve(true);
    } else {
        return Promise.reject(new Error("No grid to update"));
    }
}