import { AppContext } from "contexts/appContext"
import { useContext } from "preact/hooks";

export const useSettingsFromContext = () => {
    const appContext = useContext(AppContext);
    return appContext.settingsStore;
}