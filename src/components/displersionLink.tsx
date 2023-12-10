import type { JSX } from 'preact'
import { formatDistance, formatDistanceAsNumber, formatDistanceOptions } from "common/projections";
import { StrokesStateManager } from 'hooks/strokesStore';

function strokeDispersionPrompt(stroke: Stroke,
    strokesStateManager: StrokesStateManager,
    distOptions?: formatDistanceOptions) {
    let disp = prompt("Enter a dispersion:");
    if (disp === null || disp === "") return;
    const num = parseFloat(disp);
    if (!Number.isFinite(num)) throw new Error("Invalid dispersion");
    const dispersion = distOptions ? formatDistanceAsNumber(num, distOptions) : num;
    strokesStateManager.update(stroke, (draft) => {
        draft.dispersion = dispersion;
    });
}

// const displayUnits = useDisplayUnits();
// const distOptions = props.distOptions || { to_unit: displayUnits, precision: 1, include_unit: true };
export function DispersionLink({ stroke, strokesStateManager, distOptions, id }:
    {
        stroke: Stroke,
        strokesStateManager: StrokesStateManager,
        distOptions: formatDistanceOptions,
        id?: string
    }): JSX.Element {
    const formattedDistance = formatDistance(stroke.dispersion, distOptions);
    const clickHandler = (e) => {
        strokeDispersionPrompt(stroke, strokesStateManager, distOptions);
        e.stopPropagation();
    }
    return (<a href="#" onClick={clickHandler} id={id}>{formattedDistance}</a>);
}