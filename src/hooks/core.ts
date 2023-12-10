import { signal, Signal } from "@preact/signals";

export interface Store<T = any> { data: Signal<T>, isLoading: Signal<boolean>, error: Signal<Error> }
export interface Mutator<T = any> { [methods: symbol]: (...args: any[]) => any }
export interface StoreMutator<T = any> extends Store<T>, Mutator<T> { }
type AsyncFunction<T = any> = (...args: any[]) => Promise<T>;

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

export function asyncMutate(store: Store<any>, func: AsyncFunction<any>): Promise<any> {
    store.isLoading.value = true;
    return func()
        .then((val) => {
            store.isLoading.value = false
            store.data.value = val;
            return val;
        })
        .catch(e => store.error.value = e)
}

// Generic ID-based store
export interface IdStateManager extends Store<string[]> {
    activate: (id: string) => void,
    activateOnly: (id: string) => void,
    deactivate: (id: string) => void,
    deactivateAll: () => void,
}
export function idStateManager(initialState: any = []): IdStateManager {
    const s = store(initialState) as Store<string[]>;
    const ids = s.data;
    const activate = (id: string) => {
        if (ids.value.some((holeId) => holeId == id)) return
        ids.value = [...ids.value, id]
    }
    const deactivate = (id: string) => {
        ids.value = ids.value.filter((holeId) => holeId == id);
    }
    const deactivateAll = () => {
        ids.value = [];
    }
    const activateOnly = (id: string) => {
        ids.value = [id];
    }
    return { ...s, activate, activateOnly, deactivate, deactivateAll }
}

export const useIdStore = () => {
    return useMemo(() => idStateManager(), [])
}