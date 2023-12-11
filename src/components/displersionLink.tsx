import type { JSX } from 'preact'
import { formatDistance, formatDistanceAsNumber, formatDistanceOptions } from "common/projections";
import { StrokesStore } from 'hooks/strokesStore';

export function strokeDispersionPrompt(stroke: Stroke,
    strokesStore: StrokesStore,
    distOptions?: formatDistanceOptions) {
    let disp = prompt("Enter a dispersion:");
    if (disp === null || disp === "") return;
    const num = parseFloat(disp);
    if (!Number.isFinite(num)) throw new Error("Invalid dispersion");
    const dispersion = distOptions ? formatDistanceAsNumber(num, distOptions) : num;
    strokesStore.update(stroke, (draft) => {
        draft.dispersion = dispersion;
    });
}

export function DispersionLink({ stroke, strokesStore, distOptions, id }:
    {
        stroke: Stroke,
        strokesStore: StrokesStore,
        distOptions: formatDistanceOptions,
        id?: string
    }): JSX.Element {
    const formattedDistance = formatDistance(stroke.dispersion, distOptions);
    const clickHandler = (e) => {
        strokeDispersionPrompt(stroke, strokesStore, distOptions);
        e.stopPropagation();
    }
    return (<a href="#" onClick={clickHandler} id={id}>{formattedDistance}</a>);
}