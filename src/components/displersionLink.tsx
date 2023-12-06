import type { VNode } from 'preact'
import { formatDistance, formatDistanceOptions } from "common/projections";
import { useDisplayUnits } from "contexts/settings";
import { showError } from 'common/utils';
import { strokeSetDispersion } from 'services/strokes';

function strokeDistancePrompt(stroke: Stroke) {
    let disp = prompt("Enter a dispersion:");
    if (disp === null || disp === "") return;
    if (!Number.isFinite(parseFloat(disp))) return showError("Invalid dispersion");
    strokeSetDispersion(stroke, disp);
}

export function DispersionLink(props: { stroke: Stroke, distOptions?: formatDistanceOptions, id?: string }): VNode {
    const displayUnits = useDisplayUnits();
    const distOptions = props.distOptions || { to_unit: displayUnits, precision: 1, include_unit: true };
    const formattedDistance = formatDistance(props.stroke.dispersion, distOptions);
    const clickHandler = (e) => {
        strokeDistancePrompt(props.stroke);
        e.stopPropagation();
    }
    return (<a href="#" onClick={clickHandler} id={props.id}>{formattedDistance}</a>);
}