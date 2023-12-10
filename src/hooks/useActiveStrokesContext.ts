import { AppContext } from "contexts/appContext";
import { useContext } from "preact/hooks";
import { type IdStateManager } from "hooks/core";

export const useActiveStrokesContext = (): IdStateManager => {
    const appState = useContext(AppContext);
    return appState.activeStrokes;
}