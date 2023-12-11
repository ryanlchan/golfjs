import { RoundStatsCache, fetchStatsCache } from "services/stats";
import { RoundStateManager } from './roundStore';
import { CourseStateManager } from "hooks/useCourse";
import { roundIsPlayed } from "services/rounds";
import { Store, asyncMutate, store } from "hooks/core";
import { useMemo } from "preact/hooks";
import { effect } from "@preact/signals";


const statsStore = (roundStore: RoundStateManager, courseStore: CourseStateManager): Store<RoundStatsCache> => {
    const s = store({} as RoundStatsCache)
    const _load = async (round: Round): Promise<RoundStatsCache> => {
        if (!round || !roundIsPlayed(round) || Object.keys(courseStore.data.value).length == 0) {
            return Promise.resolve({} as RoundStatsCache);
        } else {
            return fetchStatsCache(roundStore.data.value, courseStore.data.value);
        }
    }
    const load = async () => asyncMutate(s, () => _load(roundStore.data.value));
    effect(() => { load() });
    return s;
}

export const useStats = (roundStore: RoundStateManager, courseStore: CourseStateManager): Store<RoundStatsCache> => {
    return useMemo(() => statsStore(roundStore, courseStore), [])
}
