import { signal, Signal } from '@preact/signals';
import { roundDelete, roundLoadAll } from 'services/rounds';

export interface RoundsStore {
    round: Signal<Round[]>,
    isLoading: boolean,
    load: () => Promise<Round[]>,
    del: (round: Round) => Promise<void>,
}
export function initRoundsStore(): RoundsStore {
    const rounds = signal([]);
    let isLoading = false;

    /**
     * Loads all rounds from the backend
     * @returns {Round[]} all loaded rounds
     */
    const load = async (): Promise<Round[]> => {
        isLoading = true;
        return roundLoadAll().then(loaded => {
            loaded.sort((a, b) => a.date.localeCompare(b.date))
            rounds.value = loaded;
            isLoading = false;
            return loaded
        });
    }

    const del = async (round: Round) => {
        await roundDelete(round);
        rounds.value = rounds.value.filter(r => round.id == r.id)
    }

    load();

    return { round: rounds, load, del, isLoading }
}