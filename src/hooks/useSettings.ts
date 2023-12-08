import { signal } from "@preact/signals";
import type { Signal } from "@preact/signals";
import { getSettings, setSettings } from "src/common/cache";

interface AppSettings { displayUnits: 'yards' | 'meters' }
const defaultSettings: AppSettings = { displayUnits: 'yards' };

export interface SettingsStore {
    settings: Signal<Record<string, any>>,
    add: (key: string, value: Signal<any>) => void,
    get: (key: string) => any,
    save: () => void
}
export const useSettings = (): SettingsStore => {
    const settings = signal((getSettings() || { ...defaultSettings }) as AppSettings);
    const add = (key: string, value: Signal<any>) => settings.value = { ...settings.value, [key]: value };
    const get = (key: string) => settings.value[key].value;
    const save = () => setSettings(settings.value)
    return { settings, add, get, save }
}