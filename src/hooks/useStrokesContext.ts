import { useStrokes } from "hooks/strokesStore";
import { useRoundContext } from "hooks/useRoundContext";

export const useStrokesContext = () => useStrokes(useRoundContext())