/**
 * Store an item in the localStorage cache under a given key
 * @param key - The key under which to store the value
 * @param value - The value to be stored
 */
export function set(key: string, value: any): void {
    localStorage.setItem(key, value);
}

/**
 * Read an item from cache under a given key
 * @param key - The key for which to retrieve the value
 * @returns The value retrieved from the cache
 */
export function get(key: string): string | null {
    return localStorage.getItem(key);
}

/**
 * Store an item in the localStorage cache under a given key
 * @param key - The key under which to store the value
 * @param json - The value to be stored
 */
export function setJSON(key: string, json: object): void {
    set(key, JSON.stringify({ ...json }));
}

/**
 * Read an item from cache under a given key
 * @param key - The key for which to retrieve the value
 * @returns The value retrieved from the cache
 */
export function getJSON(key: string): object | null {
    try {
        const item = get(key);
        return item ? JSON.parse(item) : null;
    } catch (e) {
        return
    }
}

/**
 * Remove an item from cache
 * @param key - The key for the item to remove
 */
export function remove(key: string): void {
    localStorage.removeItem(key);
}
