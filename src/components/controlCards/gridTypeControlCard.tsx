import { ControlCard, ControlCardHeader, ControlCardValue, ControlCardFooter } from "./controlCard";

export function GridTypeControl() {
    const activeGrid = layerRead('active_grid'); // TODO: replace with a prop/context pass
    const activeType = activeGrid?.options.grid.properties.type;
    const onClick = () => {
        gridDelete();
        const types = Object.values(grids.gridTypes)
        const newType = types[types.indexOf(activeType) + 1];
        gridCreate(newType);
        strokeMarkerAimUpdate();
        rerender('controls');
    }
    return <ControlCard className="gridTypeControlCard clickable" onClick={onClick}>
        <ControlCardHeader>Grid</ControlCardHeader>
        <ControlCardValue>{activeType}</ControlCardValue>
        <ControlCardFooter></ControlCardFooter>
    </ControlCard>
}