import { getHoleFromRound } from "services/rounds";
import { computedStore } from "hooks/core";
import { useRoundContext } from "hooks/useRoundContext";

export const holeStore = (roundStore) => {
    const store = computedStore(roundStore, () => (roundStore.data.value.holes));
    const mutate = (index: number, recipe: (hole: Hole) => void) => {
        roundStore.mutate(draft => {
            const hole = getHoleFromRound(draft, index);
            recipe(hole);
        })
    }
    return { ...store, mutate }
}

export const useHoleStoreContext = () => holeStore(useRoundContext());