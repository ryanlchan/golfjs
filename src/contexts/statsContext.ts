import { createContext } from 'preact';
import { type Store } from 'hooks/core';
import { type RoundStatsCache } from 'services/stats';

const defaultValue = {} as Store<RoundStatsCache>
export const StatsContext = createContext(defaultValue);
