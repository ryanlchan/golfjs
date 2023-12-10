import { RoundStatsCache, fetchStatsCache } from "services/stats";
import { RoundStateManager } from './roundStore';
import { CourseStore } from "hooks/useCourse";
import { roundIsPlayed } from "services/rounds";
import { Store, asyncMutate, store } from "hooks/core";
import { useMemo } from "preact/hooks";
import { effect } from "@preact/signals";


const statsStore = (roundStore: RoundStateManager, courseStore: CourseStore): Store<RoundStatsCache> => {
    const s = store({} as RoundStatsCache)
    const _load = (round: Round): Promise<RoundStatsCache> => {
        return ((!round || !roundIsPlayed(round)) ?
            Promise.resolve({} as RoundStatsCache) :
            fetchStatsCache(roundStore.data.value, courseStore.course));
    }
    asyncMutate(s, _load);
    effect(() => _load(roundStore.data.value))
    return s;
}

export const useStats = (roundStore: RoundStateManager, courseStore: CourseStore): Store<RoundStatsCache> => {
    return useMemo(() => statsStore(roundStore, courseStore), [])
}
