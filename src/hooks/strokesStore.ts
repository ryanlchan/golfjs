import { useMemo } from 'preact/hooks';
import { type Store, computedStore } from 'hooks/core';
import { type RoundStore } from 'hooks/roundStore';
import { getHoleFromRound, getStrokeFromRound, getStrokesFromRound } from 'services/rounds';
import { strokeAdd, strokeDelete, strokeReorder } from 'services/strokes';

export interface StrokesStore extends Store<Stroke[]> {
    add: (item: Stroke) => void,
    remove: (item: Stroke) => void,
    update: (item: Stroke, recipe: (draft: Stroke) => void) => void
    reorder: (item: Stroke, targetIndex: number) => void,
    source: RoundStore
};

export const strokesStore = (roundStore: RoundStore): StrokesStore => {
    const store = computedStore(roundStore, () => getStrokesFromRound(roundStore.data.value));
    const mutateHole = (item: Stroke, recipe: (hole: Hole) => void) => {
        roundStore.mutate(draft => {
            const hole = getHoleFromRound(draft, item.holeIndex);
            recipe(hole);
        })
    }
    const update = (item: Stroke, recipe: (stroke: Stroke) => void) => {
        roundStore.mutate(draft => {
            recipe(getStrokeFromRound(draft, item.holeIndex, item.index));
        });
    };
    const add = (item: Stroke) => roundStore.mutate((round) => strokeAdd(item, round));
    const remove = (item: Stroke) => roundStore.mutate((round) => strokeDelete(item, round));
    const reorder = (item: Stroke, targetIndex: number) => roundStore.mutate((round) => strokeReorder(item, targetIndex, round));
    return {
        ...store,
        add,
        remove,
        update,
        reorder,
        source: roundStore
    };
}

export const useStrokes = (roundStore: RoundStore) => {
    return useMemo(() => strokesStore(roundStore), []);
}