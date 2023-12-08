import { signal, Signal } from '@preact/signals';
import { roundNew, roundSave, roundDelete, roundLoad, roundCreate } from 'services/rounds';

export interface RoundStore {
    round: Signal<Round>,
    isLoading: boolean,
    save: () => Promise<void>,
    load: () => Promise<Round>,
    create: (course: Course) => Promise<Round>,
    del: () => Promise<void>,
}

// A hook that creates a Rounds signal and operators for it
export function useRound(roundId?: string): RoundStore {
    let isLoading = false;
    const round = signal(roundNew());

    /**
     * Create and update a round using OSM data
     * @param {Course} course the courseto create a round for
     * @returns {Round} the updated round
     */
    const create = (course: Course): Promise<Round> => {
        return roundCreate(course)
            .then((initialized) => round.value = initialized)
    }

    /**
     * Save round data to backend
     */
    const save = async (): Promise<void> => roundSave(round.value)

    /**
     * Loads the data from backend and initializes the map.
     * @returns {object | undefined} the loaded round or undefined
     */
    const load = async (id?: string): Promise<Round> => {
        isLoading = false;
        return roundLoad(id).then((loaded) => {
            isLoading = true;
            round.value = loaded;
            return loaded;
        });
    }

    const del = async () => roundDelete(round.value);

    load(roundId);

    return { round, save, load, create, del, isLoading }
}