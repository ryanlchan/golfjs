import { Signal, signal } from '@preact/signals';
import { IdStateManager, StateManager, store } from 'hooks/core';
import { createContext } from 'preact';

export interface AppState {
    activeStrokes?: IdStateManager,
    activeHoles?: IdStateManager,
    settingsStore?: StateManager,
    coords?: Signal<GeolocationCoordinates>
}
const defaultValue = {
    activeStrokes: {} as IdStateManager,
    activeHoles: {} as IdStateManager,
    settingsStore: store() as StateManager,
    coords: signal({} as GeolocationCoordinates)
} as AppState
export const AppContext = createContext(defaultValue);