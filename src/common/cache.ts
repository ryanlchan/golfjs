import localForage from 'localforage';
import { migrateLocalStorageToForage } from '../services/migrations';

const instanceCache = new Map<string, LocalForage>();

function _getInstance(namespace?: string): LocalForage {
    const name = namespace ? `golfjs-${namespace}` : "golfjs";
    const cached = instanceCache.get(name);
    if (cached) return cached;
    const lf = localForage.createInstance({
        name: name,
        version: 2.1,
    });
    instanceCache.set(name, lf);
    return lf;
}

export async function init() {
    const lf = _getInstance();
    const storedKeys = await lf.length();
    if (storedKeys == 0) {
        console.log("Detected empty indexedDB, try to bootstrap from localStorage...");
        const lsKeys = Object.keys(localStorage);
        let updates = lsKeys.map((key) => migrateLocalStorageToForage(key, localStorage.getItem(key)));
        updates = updates.filter((val) => val);
        const up2prom = (up) => up.map((args: [string, string, string]) => set(...args))
        const promises = updates.flatMap(up2prom);
        return Promise.all(promises);
    }
}

/**
 * Store an item in the localForage cache under a given key
 * @param key The key under which to store the value
 * @param value The value to be stored
 * @param namespace The namespace/table to use
 */
export async function set(key: string, value: any, namespace?: string): Promise<void> {
    const lf = _getInstance(namespace);
    try {
        return await lf.setItem(key, value);
    } catch (e) {
        console.error(e);
        throw e;
    }
}

/**
 * Read an item from cache under a given key
 * @param key - The key for which to retrieve the value
 * @param namespace The namespace/table to use
 * @returns The value retrieved from the cache
 */
export async function get(key: string, namespace?: string): Promise<any> {
    const lf = _getInstance(namespace);
    return lf.getItem(key);
}

/**
 * Store an item in the localStorage cache under a given key
 * DEPRECATED: Unlike localStorage, indexedDB can store objects without serialization
 * @param key - The key under which to store the value
 * @param namespace The namespace/table to use
 * @param json - The value to be stored
 */
export function setJSON(key: string, json: object, namespace?: string): void {
    set(key, JSON.stringify({ ...json }), namespace);
}

/**
 * Read an item from cache under a given key
 * DEPRECATED: Unlike localStorage, indexedDB can store objects without serialization
 * @param key - The key for which to retrieve the value
 * @param namespace The namespace/table to use
 * @returns The value retrieved from the cache
 */
export function getJSON(key: string, namespace?: string): object | null {
    return get(key, namespace).then(item => JSON.parse(item)).catch(() => undefined);
}

/**
 * Remove an item from cache
 * @param key - The key for the item to remove
 * @param namespace The namespace/table to use
 */
export async function remove(key: string, namespace?: string): Promise<void> {
    const lf = _getInstance(namespace);
    return lf.removeItem(key);
}

/**
 * Filters the namespace for all items that match a given function and returns
 * the results as an object with keys and values matching the cache
 * @param func the function to run for each key and value pair
 * @param namespace the namespace/table to use
 * @returns {Object}
 */
export async function filter(func: (key, val) => boolean, namespace?: string): Promise<Object> {
    const lf = _getInstance(namespace);
    let results = {};
    await lf.iterate((val, key) => { if (func(key, val)) results[key] = val });
    return results;
}

/**
 * **************** 
 * * LocalStorage *
 * **************** 
 */

export function getLocalJSON(key: string) {
    try {
        return JSON.parse(localStorage.getItem(key));
    } catch (e) {
        return;
    }
}

export function setLocalJSON(key: string, value: any) {
    return localStorage.setItem(key, JSON.stringify(value));
}

export function getSettings(): any {
    return getLocalJSON('settings');
}

export function saveSettings(settings: Record<string, any>): void {
    setLocalJSON('settings', settings);
}

export function getSetting(key: string): any {
    return getLocalJSON('settings')[key];
}

export function setSetting(key: string, value: any): void {
    const settings = getSettings();
    return saveSettings({ ...settings, [key]: value });
}