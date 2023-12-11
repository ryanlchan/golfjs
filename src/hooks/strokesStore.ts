import { computed } from '@preact/signals';
import { Store, StateManager } from 'hooks/core';
import { getHoleFromRound, getStrokeFromRound, getStrokesFromRound } from 'services/rounds';
import { RoundStateManager } from './roundStore';
import { strokeAdd, strokeDelete, strokeReorder } from 'services/strokes';
import { useMemo } from 'preact/hooks';

export interface StrokesStateManager extends StateManager<Stroke[]> {
    add: (item: Stroke) => void,
    remove: (item: Stroke) => void,
    update: (item: Stroke, recipe: (draft: Stroke) => void) => void
    reorder: (item: Stroke, targetIndex: number) => void,
    source: RoundStateManager
};

const strokesStore = (roundStore): Store<Stroke[]> => {
    const clubs = computed(() => getStrokesFromRound(roundStore.data.value));
    return {
        data: clubs,
        isLoading: roundStore.isLoading,
        error: roundStore.error
    }
}

export const strokesStateManager = (roundStateManager: RoundStateManager): StrokesStateManager => {
    const store = strokesStore(roundStateManager);
    const mutateHole = (item: Stroke, recipe: (hole: Hole) => void) => {
        roundStateManager.mutate(draft => {
            const hole = getHoleFromRound(draft, item.holeIndex);
            recipe(hole);
        })
    }
    const update = (item: Stroke, recipe: (stroke: Stroke) => void) => {
        roundStateManager.mutate(draft => {
            recipe(getStrokeFromRound(draft, item.holeIndex, item.index));
        });
    };
    const add = (item: Stroke) => roundStateManager.mutate((round) => strokeAdd(item, round));
    const remove = (item: Stroke) => roundStateManager.mutate((round) => strokeDelete(item, round));
    const reorder = (item: Stroke, targetIndex: number) => roundStateManager.mutate((round) => strokeReorder(item, targetIndex, round));
    return {
        ...store,
        add,
        remove,
        update,
        reorder,
        source: roundStateManager
    };
}

export const useStrokes = (roundStateManager: RoundStateManager) => {
    return useMemo(() => strokesStateManager(roundStateManager), []);
}