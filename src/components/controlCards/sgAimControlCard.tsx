import { ControlCard, ControlCardHeader, ControlCardValue, ControlCardFooter } from "./controlCard";
import { RoundStatsCache, getCachedStrokeStats } from "services/stats";
import { Store } from "hooks/core";
import { gridTypes } from "services/grids";
import { computed } from "@preact/signals";


export function SGAimControlCard({ stroke, statsStore, onGrid }:
    { stroke: Stroke, statsStore: Store<RoundStatsCache>, onGrid: (id: string, type: string) => void }
) {

    const sgp = computed(() => {
        const strokeStats = getCachedStrokeStats(stroke, statsStore.data.value);
        return strokeStats?.strokesGainedPredicted?.toFixed(2) || "...";
    })
    const sga = computed(() => {
        const strokeStats = getCachedStrokeStats(stroke, statsStore.data.value);
        return `${strokeStats?.strokesGained?.toFixed(2) || " ... "} SG`;
    })
    const header = "SG: Aim"
    const value = sgp;
    const footer = sga;
    const onClick = () => onGrid(stroke.id, gridTypes.STROKES_GAINED);
    const classes = "aimStatsControlCard clickable";
    return <ControlCard className={classes} onClick={onClick}>
        <ControlCardHeader>{header}</ControlCardHeader>
        <ControlCardValue >{value}</ControlCardValue>
        <ControlCardFooter>{footer}</ControlCardFooter>
    </ControlCard>
}

// className="cardValueMed"