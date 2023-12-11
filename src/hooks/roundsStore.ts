import { roundDelete, roundLoadAll } from 'services/rounds';
import { type Store, store, asyncMutate } from 'hooks/core';
import { useMemo } from 'preact/hooks';


export interface RoundsStore extends Store<Round[]> {
    load: () => Promise<Round[]>,
    del: (item: Round) => Promise<Round[]>,
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

export function roundsStore(initialState?) {
    const s = store(initialState);
    const mutator = roundsMutator(s);
    return { ...s, ...mutator };
}

export function useRounds(initialState?) {
    return useMemo(() => {
        const sm = roundsStore(initialState);
        sm.load();
        return sm
    }, [])
}
