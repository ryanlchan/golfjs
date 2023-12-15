import { strokeStateManager } from "hooks/useStateManager";
import { getStrokeFromRoundByID } from "services/rounds";
import { useStateManagerContext } from "hooks/useStateManagerContext";

export const useStrokesStateManagerContext = () => {
    return strokeStateManager(useStateManagerContext());
}

export const useActiveStrokesContext = (round: Round) => {
    const strokeManager = useStrokesStateManagerContext();
    if (!strokeManager) return [];
    const active = strokeManager.getAllActive();
    return active.map(id => getStrokeFromRoundByID(round, id))
}