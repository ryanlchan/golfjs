import { getDistance } from "src/common/projections";
import { roundCourseParams } from "src/services/rounds";
import { ControlCard, ControlCardHeader, ControlCardValue, ControlCardFooter } from "./controlCard";


export function AimStatsControls(props: { stroke: Stroke, round: Round }) {
    const activeGridLayer = layerRead('active_grid'); // TODO: replace with a prop/context pass
    const activeGrid = activeGridLayer.options.grid;
    const activeType = activeGrid?.properties.type;
    const active = activeType == grids.gridTypes.STROKES_GAINED;
    if (!activeGrid) return; // No grid to load
    const stroke = props.stroke;
    const round = props.round;
    const hole = round.holes[stroke.holeIndex];
    const wsg = activeGrid.properties.weightedStrokesGained;
    const sr = activeGrid.properties.strokesRemainingStart;
    const sa = hole.strokes.length - stroke.index - 1;
    let srn = 0;
    if (sa > 0) {
        const nextStroke = hole.strokes[stroke.index + 1];
        const nextStart = nextStroke.start;
        const nextDistance = getDistance(nextStroke.start, hole.pin);
        const nextTerrain = nextStroke.terrain || courses.getTerrainAt(roundCourseParams(round), [nextStart.y, nextStart.x]);
        srn = grids.strokesRemaining(nextDistance, nextTerrain);
    }
    const sga = sr - srn - 1;
    const onClick = () => {
        if (active) return
        gridDelete();
        gridCreate(grids.gridTypes.STROKES_GAINED)
        strokeMarkerAimUpdate();
        rerender('controls');
    }

    const header = "SG: Aim"
    const value = wsg.toFixed(2);
    const footer = `${sga.toFixed(2)} SG`
    return <ControlCard className="aimStatsControlCard clickable" onClick={onClick}>
        <ControlCardHeader>{header}</ControlCardHeader>
        <ControlCardValue>{value}</ControlCardValue>
        <ControlCardFooter>{footer}</ControlCardFooter>
    </ControlCard>
}