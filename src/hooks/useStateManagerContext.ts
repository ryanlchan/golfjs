import { AppContext } from "contexts/appContext";
import { useContext } from "preact/hooks";

export const useStateManagerContext = () => useContext(AppContext).stateManager;
