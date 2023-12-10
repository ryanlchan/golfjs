import { roundDelete, roundLoadAll } from 'services/rounds';
import { Store, store, asyncMutate, StateManager } from 'hooks/core';
import { useMemo } from 'preact/hooks';


export interface RoundsStateManager extends StateManager<Round[]> {
    load: () => Promise<Round[]>,
    del: (item: Round) => Promise<Round[]>,
}

function roundsStore(initialState?): Store<Round[]> {
    return store(initialState);
}

function roundsMutator(roundsStore) {
    const load = async () => {
        return asyncMutate(roundsStore, async () => {
            const loaded = await roundLoadAll()
            loaded.sort((a, b) => a.date.localeCompare(b.date))
            return loaded;
        });
    }

    const del = async (item) => {
        return asyncMutate(roundsStore, async () => {
            await roundDelete(item);
            return roundsStore.data.value.filter(r => item.id == r.id)
        })

    }
    return { load, del }
}

export function roundsStateManager(initialState?) {
    const s = roundsStore(initialState);
    const mutator = roundsMutator(s);
    return { ...s, ...mutator };
}

export function useRounds(initialState?) {
    return useMemo(() => {
        const sm = roundsStateManager(initialState);
        sm.load();
        return sm
    }, [])
}
