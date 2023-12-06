import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

interface AppSettings { displayUnits: 'yards' | 'meters', setSetting: (key, value) => void }
let settings: AppSettings = { displayUnits: 'yards', setSetting: (_k, v) => { } };

export const Settings = createContext(settings)
export const useDisplayUnits = () => {
    const settings = useContext(Settings);
    return settings.displayUnits;
}