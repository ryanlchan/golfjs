import { SettingsContext } from 'contexts/settingsContext';
import { useContext } from 'preact/hooks';

export const useDisplayUnits = () => {
    const settingsStore = useContext(SettingsContext);
    return settingsStore.settings?.value?.displayUnits || "yards";
};
export const DISPLAY_UNIT_KEY = 'dislayUnits';
