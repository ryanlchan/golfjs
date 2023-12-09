import { signal, Signal, effect } from '@preact/signals';
import { roundNew, roundSave, roundDelete, roundLoad, roundCreate, roundIsPlayed } from 'services/rounds';


export interface RoundStore {
    round: Signal<Round>;
    isLoading: boolean;
    load: () => Promise<Round>;
    create: (course: Course) => Promise<Round>;
    del: () => Promise<void>;
}
// A hook that creates a Rounds signal and operators for it

export function initRoundStore(roundId?: string): RoundStore {
    let isLoading = false;
    const round = signal(roundNew());

    /**
     * Create and update a round using OSM data
     * @param {Course} course the courseto create a round for
     * @returns {Round} the updated round
     */
    const create = (course: Course): Promise<Round> => {
        return roundCreate(course)
            .then((initialized) => round.value = initialized);
    };

    /**
     * Loads a new round from the backend
     * @returns {Round} the loaded round or undefined
     */
    const load = async (id?: string): Promise<Round> => {
        isLoading = false;
        return roundLoad(id).then((loaded) => {
            isLoading = true;
            round.value = loaded;
            return loaded;
        });
    };

    /**
     * Deletes the current round stored
     */
    const del = async () => {
        roundDelete(round.value);
        round.value = roundNew();
    };

    /**
     * Persists the current round to the backend
     */
    const save = async () => roundSave(round.value);

    // On initialization, try to load the latest round automatically
    load(roundId);

    // On any changes, automatically persist to backend
    effect(() => roundIsPlayed(round.value) && save());

    return { round, load, create, del, isLoading };
}
