import { effect } from "@preact/signals";
import { getSettings, saveSettings } from "common/cache";
import { type Store, store } from "./core";
import { useMemo } from "preact/hooks";

export interface AppSettings { displayUnits?: 'yards' | 'meters', [others: string]: any }
const defaultSettings: AppSettings = { displayUnits: 'yards' };

export interface SettingsStore extends Store<AppSettings> {
    set: (key: string, value: any) => void,
    get: (key: string) => any,
}
function settingsMutator(itemStore) {
    const set = (key: string, value: any) => itemStore.data.value = { ...itemStore.data.value, [key]: value };
    const get = (key: string) => itemStore.data.value[key];
    effect(() => saveSettings(itemStore.data.value))
    return { set, get }
}
export function settingsStore(initialState?): SettingsStore {
    const s = store(store(initialState || getSettings() || { ...defaultSettings }));
    const mutator = settingsMutator(s);
    return { ...s, ...mutator }
}

export function useSettings(initialState): SettingsStore {
    return useMemo(() => settingsStore(initialState), []);
}