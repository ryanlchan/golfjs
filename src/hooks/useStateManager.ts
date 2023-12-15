import { type IdStore, idStore } from "hooks/core";
import { useMemo } from "preact/hooks";
import { gridTypes } from "services/grids";

/**
 * A datastore that stores state (not data) for the app.
 * ===
 * Structured in column-ordered stores. Instead of a strokeDisplayState
 * containing all the information it needs to render, just store columns like
 * "SGGridActive" and lookup IDs from there. This allows us to do things like
 * .map all stroke markers or clear all SGGrids at once.
 */

interface ActionsMap {
    activate?: string[]
    activateOnly?: string[],
    deactivate?: string[],
    deactivateAll?: string[],
    toggle?: string[],
    includes?: string[]
}

export interface StateManager { data: Map<string, IdStore>, get: (col: string) => IdStore, batch: (id: string, actions: ActionsMap) => void }
export const stateManager = (): StateManager => {
    const store = new Map();
    const get = (state: string) => {
        let cached = store.get(state);
        if (cached === undefined) {
            cached = idStore();
            store.set(state, cached);
        }
        return cached;
    }
    const batch = (id: string, actions: ActionsMap) => {
        Object.entries(actions).forEach(([action, colIDs]) => {
            colIDs.forEach(colID => {
                const colStore = get(colID);
                colStore[action](id);
            });
        });
    }
    return { data: store, get, batch }
}

export const useStateManager = (): StateManager => {
    return useMemo(() => stateManager(), [])
}


export const strokeColumns = {
    GRID_STROKES_GAINED: "stroke_grid_strokes_gained",
    GRID_BEST_AIM: "stroke_grid_best_aim",
    AIM_MARKERS: "stroke_aim_markers",
    ACTIVE_CONTROLS: "stroke_active_controls"
}
const strokeGridToGridCol = {
    [gridTypes.STROKES_GAINED]: strokeColumns.GRID_STROKES_GAINED,
    [gridTypes.BEST_AIM]: strokeColumns.GRID_BEST_AIM
}
export interface StrokeStateManager {
    activate: (id: string) => void,
    activateOnly: (id: string) => void,
    deactivate: (id: string) => void,
    deactivateAll: (id?: string) => void,
    activateGrid: (id: string, type: string) => void,
    activateOnlyGrid: (id: string, type: string) => void,
    toggle: (id: string) => void,
    isActive: (id: string, type?: string) => boolean,
    getAllActive: (type?: string) => string[],
}
export const strokeStateManager = (stateManager): StrokeStateManager => {
    const activate = (id: string) => {
        const actions = {
            activate: [strokeColumns.ACTIVE_CONTROLS, strokeColumns.GRID_STROKES_GAINED, strokeColumns.AIM_MARKERS],
            deactivate: [strokeColumns.GRID_BEST_AIM]
        }
        stateManager.batch(id, actions);
    }
    const activateOnly = (id: string) => {
        const actions = {
            activateOnly: [strokeColumns.ACTIVE_CONTROLS, strokeColumns.GRID_STROKES_GAINED, strokeColumns.AIM_MARKERS],
            deactivateAll: [strokeColumns.GRID_BEST_AIM]
        }
        stateManager.batch(id, actions);
    }
    const deactivate = (id: string) => {
        const actions = {
            deactivate: Object.values(strokeColumns),
        }
        stateManager.batch(id, actions);
    }
    const deactivateAll = (id?: string) => {
        const actions = {
            deactivateAll: Object.values(strokeColumns),
        }
        stateManager.batch(id, actions);
    }
    const activateGrid = (id: string, type: string) => {
        const activeCol = strokeGridToGridCol[type];
        const actions = {
            activate: [activeCol],
        }
        stateManager.batch(id, actions);
    }
    const activateOnlyGrid = (id: string, type: string) => {
        const activeCol = strokeGridToGridCol[type];
        const deactiveCol = Object.values(strokeGridToGridCol).filter(t => t == activeCol)
        const actions = {
            activate: [activeCol],
            deactivate: [deactiveCol]
        }
        stateManager.batch(id, actions);
    }
    const toggle = (id: string) => isActive(id) ? deactivate(id) : activate(id);
    const isActive = (id: string, type: string = strokeColumns.ACTIVE_CONTROLS) => {
        return stateManager.get(type).includes(id)
    }
    const getAllActive = (type: string = strokeColumns.ACTIVE_CONTROLS) => {
        return stateManager.get(type).data.value
    }
    return {
        activate,
        activateOnly,
        deactivate,
        deactivateAll,
        activateGrid,
        activateOnlyGrid,
        toggle,
        isActive,
        getAllActive
    }
}

export const holeColumns = {
    STROKE_LINE: "hole_stroke_lines",
    STROKE_MARKERS: "stroke_markers",
    HOLE_LINE: "hole_line",
    PIN: "hole_pin",
    ACTIVE_CONTROLS: "hole_active_controls"
}
export interface HoleStateManager {
    activate: (id: string) => void,
    activateOnly: (id: string) => void,
    activateUncontrolled: (id: string) => void,
    deactivate: (id: string) => void,
    deactivateAll: (id?: string) => void,
    toggle: (id: string) => void,
    isActive: (id: string, type?: string) => boolean,
    getAllActive: (type?: string) => string[]
}
export const holeStateManager = (stateManager): HoleStateManager => {
    const activate = (id: string) => {
        const actions = {
            activate: Object.values(holeColumns),
        }
        stateManager.batch(id, actions);
    }
    const activateOnly = (id: string) => {
        const actions = {
            activateOnly: Object.values(holeColumns),
        }
        stateManager.batch(id, actions);
    }
    const activateUncontrolled = (id: string) => {
        const actions = {
            activate: [holeColumns.STROKE_LINE, holeColumns.HOLE_LINE, holeColumns.PIN],
        }
        stateManager.batch(id, actions);
    }
    const deactivate = (id: string) => {
        const actions = {
            deactivate: Object.values(holeColumns),
        }
        stateManager.batch(id, actions);
    }
    const deactivateAll = (id?: string) => {
        const actions = {
            deactivateAll: Object.values(holeColumns),
        }
        stateManager.batch(id, actions);
    }
    const toggle = (id: string) => isActive(id) ? deactivate(id) : activate(id);
    const isActive = (id: string, type = holeColumns.ACTIVE_CONTROLS) => stateManager.get(type).includes(id)
    const getAllActive = (type = holeColumns.ACTIVE_CONTROLS) => stateManager.get(type).data.value
    return {
        activate,
        activateOnly,
        activateUncontrolled,
        deactivate,
        deactivateAll,
        toggle,
        isActive,
        getAllActive
    }
}
