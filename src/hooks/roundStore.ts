import { effect } from '@preact/signals';
import { roundNew, roundSave, roundDelete, roundLoad, roundCreate, roundIsPlayed } from 'services/rounds';
import { type Store, asyncMutate, store } from './core';
import { useMemo } from 'preact/hooks';
import { produce } from 'immer';


export interface RoundStore extends Store<Round> {
    load: (id?: string) => Promise<Round>,
    create: (course: Course) => Promise<Round>,
    del: () => Promise<void>,
    mutate: ((recipe: (draft: Round) => void) => void)
}

function roundMutator(itemStore) {
    const create = (course) => asyncMutate(itemStore, () => roundCreate(course));
    const load = async (id?) => {
        const val = itemStore.data.value;
        if (typeof val == 'string') id = val;
        return asyncMutate(itemStore, (async () => roundLoad(id))
        )
    };
    const del = async () => asyncMutate(itemStore, async () => {
        await roundDelete(itemStore.data.value);
        return roundNew();
    })
    const save = async () => roundSave(itemStore.data.value)
    effect(() => roundIsPlayed(itemStore.data.value) && save());
    const mutate = (recipe) => {
        const updated = produce(itemStore.data.value, (draft) => {
            recipe(draft);
        });
        itemStore.data.value = updated
    }
    return { load, create, del, mutate };
}

export function roundStore(initialState?): RoundStore {
    const s = store(initialState || roundNew());
    const mutator = roundMutator(s);
    return { ...s, ...mutator };
}

export function useRound(initialState?): RoundStore {
    return useMemo(() => {
        const sm = roundStore(initialState);
        sm.load();
        return sm
    }, [])
}