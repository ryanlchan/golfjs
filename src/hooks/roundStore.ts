import { effect } from '@preact/signals';
import { roundNew, roundSave, roundDelete, roundLoad, roundCreate, roundIsPlayed } from 'services/rounds';
import { Store, StoreMutator, asyncMutate, store } from './core';
import { useMemo } from 'preact/hooks';


export interface RoundStore extends StoreMutator<Round> {
    load: (id?: string) => Promise<Round>;
    create: (course: Course) => Promise<Round>;
    del: () => Promise<void>;
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
    return { load, create, del };
}

export function roundStoreMutator(initialState?): RoundStore {
    const s = roundStore(initialState);
    const mutator = roundMutator(s);
    return { ...s, ...mutator };
}

export function useRound(initialState?): RoundStore {
    return useMemo(() => {
        const sm = roundStoreMutator(initialState);
        sm.load();
        return sm
    }, [])
}