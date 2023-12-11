import { createContext } from 'preact';

import { store } from 'hooks/core';
import { signal, type Signal } from '@preact/signals';
import type { IdStore, Store } from 'hooks/core';
import type { GeolocatedResult } from 'hooks/useLocation';
import { ModalProps } from "common/modals";

export interface AppState {
    activeStrokes?: IdStore,
    activeHoles?: IdStore,
    settingsStore?: Store,
    geolocationResult?: GeolocatedResult,
    modal?: Signal<ModalProps>
}
const defaultValue = {
    activeStrokes: {} as IdStore,
    activeHoles: {} as IdStore,
    settingsStore: store(),
    geolocationResult: {} as GeolocatedResult,
    modal: signal({} as ModalProps)
} as AppState
export const AppContext = createContext(defaultValue);