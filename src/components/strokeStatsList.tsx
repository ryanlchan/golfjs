import { formatDistance } from "src/common/projections";
import type { JSX } from 'preact';
import { useDistanceOptions } from "hooks/useDisplayUnits";
import { DispersionLink } from "components/displersionLink";
import { StrokesStateManager } from "hooks/strokesStore";
import { useActiveStrokesContext } from "hooks/useActiveStrokesContext";
import { strokeGetDistance } from "services/strokes";

/**
 * Create a link that deletes this stroke
 * @param {Stroke} stroke
 * @returns {HTMLElement}
 */
function StrokeDeleteButton({ stroke, strokesStateManager }:
    { stroke: Stroke, strokesStateManager: StrokesStateManager }): JSX.Element {
    const icon = <span>&#215;</span>;
    const clickHandler = (e) => {
        strokesStateManager.remove(stroke);
        e.stopPropagation();
    }
    return <button className="danger" onClick={clickHandler}>{icon}</button>
}

/**
 * Create a link that moves this stroke
 * @param {Stroke} stroke the stroke to move
 * @param {Number} offset the offset for the stroke index
 * @returns {HTMLElement}
 */
function StrokeMoveButton({ stroke, strokesStateManager, offset }:
    { stroke: Stroke, strokesStateManager: StrokesStateManager, offset: number }): JSX.Element {
    const icon = (offset > 0 ? <span>&#8595;</span> : <span>&#8593;</span>)
    const clickHandler = (e) => {
        strokesStateManager.reorder(stroke, stroke.index + offset);
        e.stopPropagation();
    }
    return <button onClick={clickHandler}>{icon}</button>
}


/**
 * Create a list item for the Stroke Stats list
 * @param {Stroke} props.stroke
 * @returns {HTMLElement} the li element for the list
 */
function StrokeStatsListItem({ stroke, strokesStateManager }: { stroke: Stroke, strokesStateManager: StrokesStateManager }) {
    const distOptions = useDistanceOptions();
    const activeStrokes = useActiveStrokesContext();
    const round = strokesStateManager.source.data.value;
    const distance = formatDistance(strokeGetDistance(stroke, round), distOptions);
    const selectedClass = 'strokeStatsListItemSelected';
    let classArray = ["strokeStatsListItem", "listCell"];
    if (activeStrokes.includes(stroke.id)) classArray.push(selectedClass);
    const classes = classArray.join(' ');
    const clickHandler = () => { activeStrokes.toggle(stroke.id) };
    return <li key={stroke.id}>
        <div className={classes} id={stroke.id} onClick={clickHandler}>
            <div className="strokeDetails">
                {`${stroke.index + 1}.  ${stroke.club} (${distance})`} | &#xb1;
                <DispersionLink stroke={stroke} strokesStateManager={strokesStateManager}
                    distOptions={distOptions} />
            </div>
            <div className="strokeControls">
                <StrokeMoveButton stroke={stroke} strokesStateManager={strokesStateManager} offset={-1} />
                <StrokeMoveButton stroke={stroke} strokesStateManager={strokesStateManager} offset={1} />
                <StrokeDeleteButton stroke={stroke} strokesStateManager={strokesStateManager} />
            </div>
        </div></li>;
}

/**
 * Generate a list of strokes with controls to adjust them
 * @param {Stroke[]} props.strokes
 */
export function StrokeStatsList({ strokes, strokesStateManager }:
    { strokes: Stroke[], strokesStateManager: StrokesStateManager }) {
    return (<div id="strokeList"><ol>
        {strokes.map((stroke) => (
            <StrokeStatsListItem key={stroke.id} stroke={stroke} strokesStateManager={strokesStateManager} />
        ))}
    </ol></div>);
}