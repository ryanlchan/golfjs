import { createContext } from 'preact';

import { store } from 'hooks/core';
import { signal, type Signal } from '@preact/signals';
import type { IdStateManager, StateManager } from 'hooks/core';
import type { GeolocatedResult } from 'hooks/useLocation';
import { ModalProps } from "common/modals";

export interface AppState {
    activeStrokes?: IdStateManager,
    activeHoles?: IdStateManager,
    settingsStore?: StateManager,
    geolocationResult?: GeolocatedResult,
    modal: Signal<ModalProps>
}
const defaultValue = {
    activeStrokes: {} as IdStateManager,
    activeHoles: {} as IdStateManager,
    settingsStore: store() as StateManager,
    geolocationResult: {} as GeolocatedResult,
    modal: signal({} as ModalProps)
} as AppState
export const AppContext = createContext(defaultValue);