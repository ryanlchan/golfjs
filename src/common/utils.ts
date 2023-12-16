import { signal } from "@preact/signals";

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
        get: (target: any, property: string | symbol, receiver: Object) => {
            if (property == "__trackingUpdates") return true; // special key to check if it's proxied already
            if (property == "__toRaw") return target;
            const value = Reflect.get(target, property, receiver);
            return ((value && typeof value === 'object' && isTrackable(target, property)
                && !value["__trackingUpdates"])
                ? trackUpdates(value)
                : value);
        }
    };
    return new Proxy(obj, handler) as WithUpdatedAt<T>;
}

function isTrackable(obj, propName) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, propName);

    if (!descriptor) {
        console.log("Property does not exist.");
        return false;
    }

    const isReadOnly = descriptor.writable === false;
    const isNonConfigurable = descriptor.configurable === false;

    return !(isReadOnly && isNonConfigurable);
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

export const ratelimit = (func: AnyFunction, interval: number) => {
    const isLoading = signal(false);
    const isQueued = signal(null);
    return (...args) => {
        if (isLoading.value) {
            clearTimeout(isQueued.value);
            isQueued.value = setTimeout(func, interval, ...args);
            return
        }
        setTimeout(() => isLoading.value = false, interval);
        isLoading.value = true;
        return func(...args);
    }
}

export const debounce = (func: AnyFunction, interval: number) => {
    const isQueued = signal(null);
    return (...args) => {
        clearTimeout(isQueued.peek());
        isQueued.value = setTimeout(func, interval, ...args);
    }
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
