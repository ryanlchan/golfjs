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
