import { effect, signal } from "@preact/signals";
import { getSettings, saveSettings } from "common/cache";
import { Store, StoreMutator, store } from "./core";
import { useMemo } from "preact/hooks";

export interface AppSettings { displayUnits?: 'yards' | 'meters', [others: string]: any }
const defaultSettings: AppSettings = { displayUnits: 'yards' };

export interface SettingsStore extends StoreMutator<AppSettings> {
    set: (key: string, value: any) => void,
    get: (key: string) => any,
}
const settingsStore = (initialState?): Store<AppSettings> => store(initialState || getSettings() || { ...defaultSettings });
function settingsMutator(itemStore) {
    const set = (key: string, value: any) => itemStore.data.value = { ...itemStore.data.value, [key]: value };
    const get = (key: string) => itemStore.data.value[key];
    effect(() => saveSettings(itemStore.data.value))
    return { set, get }
}
export function settingsStoreMutator(initialState?): SettingsStore {
    const s = settingsStore(initialState);
    const mutator = settingsMutator(s);
    return { ...s, ...mutator }
}

export function useSettings(initialState): SettingsStore {
    return useMemo(() => settingsStoreMutator(initialState), []);
}