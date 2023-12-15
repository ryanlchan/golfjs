import { holeStateManager } from "./useStateManager";
import { getHoleFromRoundByID } from "services/rounds";
import { useStateManagerContext } from "./useStateManagerContext";

export const useHolesStateManagerContext = () => {
    return holeStateManager(useStateManagerContext());
}

export const useActiveHolesContext = (round: Round) => {
    const holeManager = useHolesStateManagerContext()
    if (!holeManager) return [];
    const active = holeManager.getAllActive();
    return active.map(id => getHoleFromRoundByID(round, id))
}