import { AppContext } from "contexts/appContext";
import { useContext } from "preact/hooks";
import { type IdStore } from "hooks/core";

export const useActiveStrokesContext = (): IdStore => {
    const appState = useContext(AppContext);
    return appState.activeStrokes;
}