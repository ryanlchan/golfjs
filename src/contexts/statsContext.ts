import { createContext } from 'preact';
import { type StateManager } from 'hooks/core';
import { type RoundStatsCache } from 'services/stats';

const defaultValue = {} as StateManager<RoundStatsCache>
export const StatsContext = createContext(defaultValue);
