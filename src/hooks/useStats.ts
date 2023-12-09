import { RoundStatsCache, fetchStatsCache } from "services/stats";
import { RoundStore } from './roundStore';
import { CourseStore } from "hooks/useCourse";
import { roundIsPlayed } from "services/rounds";
import useSWR from 'swr';


interface StatsStore { stats: RoundStatsCache, error: boolean, isLoading: boolean }
export const useStats = (roundStore: RoundStore, courseStore: CourseStore): StatsStore => {
    const _load = (round: Round) => {
        if (!round || !roundIsPlayed(round)) return;
        return fetchStatsCache(roundStore.round.value, courseStore.course)
            .catch((err) => { throw new Error("Failed to generate stats cache: " + err) });
    }
    const { data, error, isLoading } = useSWR(roundStore.round.value, _load);
    return { stats: data, error, isLoading }
}
