import { createContext } from 'preact';
import { signal, type Signal } from '@preact/signals';

import { ModalProps } from "common/modals";
import { useContext } from 'preact/hooks';
import type { Store } from 'hooks/core';
import type { GeolocatedResult } from 'hooks/useLocation';
import type { StateManager } from 'hooks/useStateManager';
import type { MapMutator } from 'components/map/golfMap';

export interface AppState {
    stateManager?: StateManager,
    settingsStore?: Store,
    geolocationResult?: GeolocatedResult,
    modal?: Signal<ModalProps>
    mapMutator?: Signal<MapMutator>
}
const defaultValue = {
    stateManager: null as StateManager,
    settingsStore: null as Store,
    geolocationResult: null as GeolocatedResult,
    modal: signal(null as ModalProps),
    mapMutator: signal(null as MapMutator)
} as AppState
export const AppContext = createContext(defaultValue);

export const useAppContext = () => useContext(AppContext);