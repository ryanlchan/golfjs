import { StatsContext } from "contexts/statsContext";
import { useContext } from "preact/hooks";
import { getCachedStrokeStats } from "services/stats";

export const useStatsContext = () => useContext(StatsContext)

export const useStrokeStatsContext = (stroke: Stroke) => (
    getCachedStrokeStats(stroke, useStatsContext().data.value
    )
);