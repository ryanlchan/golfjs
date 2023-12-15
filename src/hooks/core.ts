import { batch, computed, effect, signal, type Signal } from "@preact/signals";
import { useMemo } from "preact/hooks";

export interface Store<T = any> { data: Signal<T>, isLoading: Signal<boolean>, error: Signal<Error>, [methods: string]: any }
type AsyncFunction<T = any> = (...args: any[]) => Promise<T>;
type AnyFunction = (...args: any[]) => any;

export function store(initialState: any = []): Store {
    const data = signal(initialState);
    const isLoading = signal(false);
    const error = signal(null);
    return { data, isLoading, error }
}

export function asyncStore(func: AsyncFunction<any>) {
    const s = store();
    asyncMutate(s, func);
    return s;
}

export function computedStore(originStore, init: () => any): Store {
    return {
        data: computed(init),
        isLoading: originStore.isLoading,
        error: originStore.error
    }
}

export function asyncMutate(store: Store<any>, func: AsyncFunction<any>): Promise<any> {
    store.isLoading.value = true;
    store.error.value = null;
    return func()
        .then((val) => {
            batch(() => {
                store.data.value = val;
                store.isLoading.value = false
            })
            return val;
        })
        .catch(e => store.error.value = e)
}

// Generic ID-based store
export interface IdStore extends Store<string[]> {
    activate: (id: string) => void,
    activateOnly: (id: string) => void,
    deactivate: (id: string) => void,
    deactivateAll: () => void,
    toggle: (id: string) => void,
    includes: (id: string) => boolean
}
export function idStore(initialState: any = []): IdStore {
    const s = store(initialState) as Store<string[]>;
    const ids = s.data;
    const activate = (id: string) => {
        if (ids.value.some((itemId) => itemId == id)) return
        ids.value = [...ids.value, id]
    }
    const deactivate = (id: string) => {
        ids.value = ids.value.filter((itemId) => itemId != id);
    }
    const deactivateAll = (_?: any) => {
        ids.value = [];
    }
    const activateOnly = (id: string) => {
        ids.value = [id];
    }
    const includes = (id: string) => {
        return ids.value.includes(id);
    }
    const toggle = (id: string) => {
        includes(id) ? deactivate(id) : activate(id);
    }
    return { ...s, activate, activateOnly, deactivate, deactivateAll, toggle, includes }
}

export const useIdStore = () => {
    return useMemo(() => idStore(), [])
}

type DisposeFunction = () => void
export const disposableEffect = (cb: (dispose: DisposeFunction) => void): DisposeFunction => {
    let dispose = null;
    dispose = effect(() => cb(dispose))
    return dispose;
}
