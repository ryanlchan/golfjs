import { AppContext } from 'contexts/appContext';
import { useContext } from 'preact/hooks';

export const useDisplayUnits = () => {
    const appState = useContext(AppContext);
    return appState?.settingsStore?.data.value?.displayUnits || "yards";
};
export const DISPLAY_UNIT_KEY = 'dislayUnits';
