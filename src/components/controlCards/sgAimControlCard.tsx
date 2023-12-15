import { ControlCard, ControlCardHeader, ControlCardValue, ControlCardFooter } from "./controlCard";
import { RoundStatsCache, getCachedStrokeStats } from "services/stats";
import { Store } from "hooks/core";
import { gridTypes } from "services/grids";


export function SGAimControlCard({ stroke, statsStore, onGrid }:
    { stroke: Stroke, statsStore: Store<RoundStatsCache>, onGrid: (id: string, type: string) => void }
) {
    const strokeStats = getCachedStrokeStats(stroke, statsStore.data.value);
    const sgp = strokeStats?.strokesGainedPredicted;
    const sga = strokeStats?.strokesGained;
    const header = "SG: Aim"
    const value = sgp?.toFixed(2) || "-";
    const footer = `${sga?.toFixed(2) || "-"} SG`
    const onClick = onGrid(stroke.id, gridTypes.STROKES_GAINED);
    const classes = "aimStatsControlCard clickable";
    return <ControlCard className={classes} onClick={onClick}>
        <ControlCardHeader>{header}</ControlCardHeader>
        <ControlCardValue>{value}</ControlCardValue>
        <ControlCardFooter>{footer}</ControlCardFooter>
    </ControlCard>
}