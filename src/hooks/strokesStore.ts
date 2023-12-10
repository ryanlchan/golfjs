import { computed } from '@preact/signals';
import { Store, StateManager } from 'hooks/core';
import { getHoleFromRound, getStrokesFromRound } from 'services/rounds';
import { RoundStateManager } from './roundStore';

export interface StrokesStateManager extends StateManager<Stroke[]> {
    add: (item: Stroke) => void,
    remove: (item: Stroke) => void,
    update: (item: Stroke) => void
};

const strokeStore = (roundStore): Store<Stroke[]> => {
    const clubs = computed(() => getStrokesFromRound(roundStore.data.value));
    return {
        data: clubs,
        isLoading: roundStore.isLoading,
        error: roundStore.error
    }
}

export const strokeStateManager = (roundStateManager: RoundStateManager): StrokesStateManager => {
    const store = strokeStore(roundStateManager);
    const mutateHole = (item: Stroke, recipe: (hole: Hole) => void) => {
        roundStateManager.mutate(draft => {
            const hole = getHoleFromRound(draft, item.holeIndex);
            recipe(hole);
        })
    }
    const add = (item: Stroke) => mutateHole(item, (hole) => hole.strokes.push(item));
    const remove = (item: Stroke) => mutateHole(item, (hole) => {
        const ix = hole.strokes.findIndex(i => i.id == item.id);
        if (ix !== -1) hole.strokes.splice(ix, 1);
    });
    const update = (item: Stroke) => mutateHole(item, (hole) => {
        const ix = hole.strokes.findIndex(i => i.id == item.id);
        if (ix !== -1) hole.strokes.splice(ix, 1);
    });
    return {
        ...store,
        add,
        remove,
        update
    };
}