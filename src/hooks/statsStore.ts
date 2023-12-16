import { RoundStatsCache, fetchStatsCache } from "services/stats";
import { RoundStore } from './roundStore';
import { CourseStore } from "hooks/courseStore";
import { roundIsPlayed } from "services/rounds";
import { type Store, asyncMutate, store } from "hooks/core";
import { useMemo } from "preact/hooks";
import { effect } from "@preact/signals";
import { debounce } from "common/utils";


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
    const limitedLoad = debounce(() => {
        console.log("Fetching from stats store");
        load();
    }, 500);
    effect(() => {
        const hook = roundStore.data.value;
        if (s.isLoading.peek()) return;
        limitedLoad();
    });
    return s;
}

export const useStats = (roundStore: RoundStore, courseStore: CourseStore): Store<RoundStatsCache> => {
    return useMemo(() => statsStore(roundStore, courseStore), [])
}
