import { signal } from '@preact/signals';
import { AppSettings, SettingsStore } from 'hooks/useSettings';
import { createContext } from 'preact';

const stub = (_) => { throw new Error("Not loaded yet") };
const defaultStore = { settings: signal({} as AppSettings), set: stub, get: stub } as SettingsStore
export const SettingsContext = createContext(defaultStore);