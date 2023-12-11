import { StatsContext } from "contexts/statsContext";
import { useContext } from "preact/hooks";

export const useStatsContext = () => useContext(StatsContext)