import { typeid } from "typeid-js";
import { signal, Signal } from '@preact/signals';
import type { RoundStore } from "services/rounds";
/**
 * ====
 * Holes
 * ====
 */

interface ActiveHoleStore {
    ids: string[],
    activate: (id: string) => void,
    deactivate: (id: string) => void,
    deactivateAll: () => void,
    select: (id: string) => void
}
export const useActiveHoles = (roundStore: Signal<RoundStore>) => {
    const ids: Signal<string[]> = signal([]);
    const activate = (holeId: string) => {
        if (ids.value.some((hole) => hole == holeId)) return
        ids.value = [...ids.value, holeId]
    }
    const deactivate = (holeId: string) => {
        ids.value = ids.value.filter((id) => id == holeId);
    }
    const deactivateAll = () => {
        ids.value = [];
    }
    const select = (holeId: string) => {
        ids.value = [holeId];
    }
    return { ids, activate, deactivate, deactivateAll, select }
}

/**
 * Return a default Hole object conforming to the interface
 * @returns {Hole} a default Hole interface
 */
export function defaultCurrentHole(): Hole {
    return {
        id: typeid("hole").toString(),
        index: 0,
        strokes: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}