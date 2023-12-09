import { formatDistanceOptions, formatDistance } from "src/common/projections";
import { ControlCard, ControlCardHeader, ControlCardValue, ControlCardFooter } from "components/controlCards/controlCard";

export function DispersionControl(props: { stroke: Stroke, distOptions?: formatDistanceOptions }) {
    if (!props.stroke) return;
    const onClick = () => strokeDispersionPrompt(props.stroke);
    const distOptions = props.distOptions || { to_unit: displayUnits, precision: 1, include_unit: false };
    const formattedDistance = formatDistance(props.stroke?.dispersion, distOptions);
    return <ControlCard className="dispersionControlCard clickable" onClick={onClick}>
        <ControlCardHeader>Dispersion</ControlCardHeader>
        <ControlCardValue>{formattedDistance}</ControlCardValue>
        <ControlCardFooter>{distOptions.to_unit}</ControlCardFooter>
    </ControlCard>
}