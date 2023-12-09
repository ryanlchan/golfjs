import { ControlCard, ControlCardHeader, ControlCardValue, ControlCardFooter } from "components/controlCards/controlCard";

export function BestAimControl(props: { stroke: Stroke }) {
    const activeGridLayer = layerRead('active_grid'); // TODO: replace with a prop/context pass
    const activeGrid = activeGridLayer.options.grid;
    const activeType = activeGrid?.properties.type;
    const active = activeType == grids.gridTypes.TARGET;
    const onClick = () => {
        if (active) return
        gridDelete();
        gridCreate(grids.gridTypes.TARGET)
        strokeMarkerAimUpdate();
        rerender('controls');
    }
    let value = "-";
    let footer = "recalculate";
    if (active) {
        const sgi = activeGrid?.properties.idealStrokesGained;
        const wsg = activeGrid?.properties.weightedStrokesGained;
        const sgs = wsg - sgi;
        value = sgs.toFixed(2);
        footer = "vs best aim";
    }
    return <ControlCard className="gridTypeControlCard clickable" onClick={onClick}>
        <ControlCardHeader>SG: Ideal</ControlCardHeader>
        <ControlCardValue>{value}</ControlCardValue>
        <ControlCardFooter>{footer}</ControlCardFooter>
    </ControlCard>
}