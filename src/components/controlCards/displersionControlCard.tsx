import { formatDistanceOptions, formatDistance } from "src/common/projections";
import { ControlCard, ControlCardHeader, ControlCardValue, ControlCardFooter } from "components/controlCards/controlCard";
import { strokeDispersionPrompt } from "components/displersionLink";
import { StrokesStateManager } from "hooks/strokesStore";
import { useDistanceOptions } from "hooks/useDisplayUnits";

export function DispersionControl({ stroke, strokesStateManager, distOptions }:
    { stroke: Stroke, strokesStateManager: StrokesStateManager, distOptions?: formatDistanceOptions }) {
    const onClick = () => strokeDispersionPrompt(stroke, strokesStateManager);
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