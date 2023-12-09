import { effect, signal } from "@preact/signals";
import type { Signal } from "@preact/signals";
import { getSettings, saveSettings } from "common/cache";

export interface AppSettings { displayUnits?: 'yards' | 'meters', [others: string]: any }
const defaultSettings: AppSettings = { displayUnits: 'yards' };

export interface SettingsStore {
    settings: Signal<AppSettings>,
    set: (key: string, value: any) => void,
    get: (key: string) => any,
}
export const initSettingsStore = (): SettingsStore => {
    const settings = signal((getSettings() || { ...defaultSettings }) as AppSettings);
    const set = (key: string, value: any) => settings.value = { ...settings.value, [key]: value };
    const get = (key: string) => settings.value[key].value;
    effect(() => saveSettings(settings.value))
    return { settings, set, get }
}