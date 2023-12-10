/**
 * Utility to have a wait promise
 * @param ms - The number of milliseconds to wait
 * @returns Promise that resolves after a delay
 */
export function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clamp(input: number, min: number, max: number) {
    return Math.max(Math.min(input, max), min)
}

type WithUpdatedAt<T> = T & HasUpdateDates;
export function trackUpdates<T extends HasUpdateDates>(obj: T): WithUpdatedAt<T> {
    const handler = {
        set: (target: any, property: string | symbol, value: any) => {
            if (property !== 'updatedAt' && target[property] != value) touch(target);
            target[property] = value;
            return true;
        },
        get: (target: any, property: string | symbol) => {
            if (property == "__trackingUpdates") return true; // special key to check if it's proxied already
            const value = target[property];
            return ((value && typeof value === 'object' && !value["__trackingUpdates"])
                ? trackUpdates(value)
                : value);
        }
    };
    return new Proxy(obj, handler) as WithUpdatedAt<T>;
}

export function touch(...objs: HasUpdateDates[]): HasUpdateDates[] {
    const now = new Date().toISOString()
    for (let obj of objs) {
        obj.updatedAt = now;
    }
    return objs;
}

/**
 * Sort an array by index. Mutates in place.
 * @param items an array of items with .index to sort
 */
interface WithIndex { index?: number }
export function indexSort(items: WithIndex[]): WithIndex[] {
    items.sort((a, b) => a.index - b.index)
    return items
}

/**
 * Return the score class (birdie, bogey, etc)
 * @param relativeScore the score relative to par
 * @returns {string} the score class
 */
export function scoreClass(relativeScore: number): string {
    const s = Math.round(relativeScore);
    if (s >= 2) {
        return "double_bogey";
    } else if (s == 1) {
        return "bogey";
    } else if (s == 0) {
        return "par";
    } else if (s == -1) {
        return "birdie";
    } else if (s == -2) {
        return "eagle";
    } else {
        return "albatross";
    }
}
