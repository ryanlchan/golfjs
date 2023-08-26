/**
 * Utility to have a wait promise
 * @param ms - The number of milliseconds to wait
 * @returns Promise that resolves after a delay
 */
export function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Store an item in the localStorage cache under a given key
 * @param key - The key under which to store the value
 * @param json - The value to be stored
 */
export function setCache(key: string, json: object): void {
    localStorage.setItem(
        key,
        JSON.stringify({ ...json })
    );
}

/**
 * Read an item from cache under a given key
 * @param key - The key for which to retrieve the value
 * @returns The value retrieved from the cache
 */
export function readCache(key: string): object | null {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
    } catch (e) {
        return
    }
}

/**
 * Remove an item from cache
 * @param key - The key for the item to remove
 */
export function deleteCache(key: string): void {
    localStorage.removeItem(key);
}
