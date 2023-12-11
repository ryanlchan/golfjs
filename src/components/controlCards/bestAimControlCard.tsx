import { ControlCard, ControlCardHeader, ControlCardValue, ControlCardFooter } from "components/controlCards/controlCard";
import { type Store } from "hooks/core";
import { gridTypes } from "services/grids";
import { getCachedStrokeStats, type RoundStatsCache } from "services/stats";
export function BestAimControl({ stroke, statsStore, onGrid }:
    {
        stroke: Stroke,
        statsStore: Store<RoundStatsCache>,
        onGrid: (id: string, type: string) => void
    }
) {
    const strokeStats = getCachedStrokeStats(stroke, statsStore.data.value);
    const onClick = () => onGrid(stroke.id, gridTypes.TARGET);
    const header = "SG: Strategy"
    const value = strokeStats.strokesGainedIdeal.toFixed(2);
    const footer = "vs ideal";
    return <ControlCard className="gridTypeControlCard clickable" onClick={onClick}>
        <ControlCardHeader>{header}</ControlCardHeader>
        <ControlCardValue>{value}</ControlCardValue>
        <ControlCardFooter>{footer}</ControlCardFooter>
    </ControlCard>
}