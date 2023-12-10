import { effect } from '@preact/signals';
import { roundNew, roundSave, roundDelete, roundLoad, roundCreate, roundIsPlayed } from 'services/rounds';
import { Store, StateManager, asyncMutate, store } from './core';
import { useMemo } from 'preact/hooks';
import { produce } from 'immer';


export interface RoundStateManager extends StateManager<Round> {
    load: (id?: string) => Promise<Round>,
    create: (course: Course) => Promise<Round>,
    del: () => Promise<void>,
    mutate: ((recipe: (draft: Round) => void) => void)
}

function roundStore(initialState?): Store<Round> {
    return store(initialState || roundNew());
}

function roundMutator(itemStore) {
    const create = (course) => asyncMutate(itemStore, () => roundCreate(course));
    const load = async (id?) => {
        const val = itemStore.data.value;
        id = id || (typeof val == 'string' && val);
        return asyncMutate(itemStore, () => roundLoad(id))
    };
    const del = async () => asyncMutate(itemStore, async () => {
        await roundDelete(itemStore.data.value);
        return roundNew();
    })
    const save = async () => roundSave(itemStore.data.value)
    effect(() => roundIsPlayed(itemStore.data.value) && save());
    const mutate = (recipe) => {
        itemStore.data.value = produce(itemStore.data.value, recipe)
    }
    return { load, create, del, mutate };
}

export function roundStateManager(initialState?): RoundStateManager {
    const s = roundStore(initialState);
    const mutator = roundMutator(s);
    return { ...s, ...mutator };
}

export function useRound(initialState?): RoundStateManager {
    return useMemo(() => {
        const sm = roundStateManager(initialState);
        sm.load();
        return sm
    }, [])
}