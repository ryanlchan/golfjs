import { formatDistanceOptions, formatDistance } from "src/common/projections";
import { ControlCard, ControlCardHeader, ControlCardValue, ControlCardFooter } from "components/controlCards/controlCard";
import { strokeDispersionPrompt } from "components/displersionLink";
import { StrokesStore } from "hooks/strokesStore";
import { useDistanceOptions } from "hooks/useDisplayUnits";

export function DispersionControl({ stroke, strokesStore, distOptions }:
    { stroke: Stroke, strokesStore: StrokesStore, distOptions?: formatDistanceOptions }) {
    const onClick = () => strokeDispersionPrompt(stroke, strokesStore);
    distOptions = distOptions || useDistanceOptions();
    const header = "Dispersion"
    const value = formatDistance(stroke?.dispersion, distOptions);
    const footer = distOptions.to_unit;
    const classes = "dispersionControlCard clickable";
    return <ControlCard className={classes} onClick={onClick}>
        <ControlCardHeader>{header}</ControlCardHeader>
        <ControlCardValue>{value}</ControlCardValue>
        <ControlCardFooter>{footer}</ControlCardFooter>
    </ControlCard>
}