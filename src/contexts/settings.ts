import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { useSettings } from 'hooks/useSettings';

// TODO: Fix this, it could create a second settings signal that doesn't track the rest of the app
export const SettingsContext = createContext(useSettings());
export const useDisplayUnits = () => {
    const settingsStore = useContext(SettingsContext);
    return settingsStore.settings?.value?.displayUnits;
}