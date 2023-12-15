import { RoundStatsCache, fetchStatsCache } from "services/stats";
import { RoundStore } from './roundStore';
import { CourseStore } from "hooks/courseStore";
import { roundIsPlayed } from "services/rounds";
import { type Store, asyncMutate, store } from "hooks/core";
import { useMemo } from "preact/hooks";
import { effect } from "@preact/signals";


export const statsStore = (roundStore: RoundStore, courseStore: CourseStore): Store<RoundStatsCache> => {
    const s = store({} as RoundStatsCache)
    const _load = async (round: Round): Promise<RoundStatsCache> => {
        if (!round || !roundIsPlayed(round) || Object.keys(courseStore.data.value).length == 0) {
            return Promise.resolve({} as RoundStatsCache);
        } else {
            return fetchStatsCache(roundStore.data.value, courseStore.data.value);
        }
    }
    const load = async (round = roundStore.data.value) => asyncMutate(s, () => _load(round));
    let loadTimeout;
    effect(() => {
        const hook = roundStore.data.value;
        clearTimeout(loadTimeout);
        loadTimeout = setTimeout(() => {
            load();
            console.log("loading new data from backend")
        }, 100)
    });
    return s;
}

export const useStats = (roundStore: RoundStore, courseStore: CourseStore): Store<RoundStatsCache> => {
    return useMemo(() => statsStore(roundStore, courseStore), [])
}
