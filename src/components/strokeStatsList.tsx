import { formatDistance } from "src/common/projections";
import type { JSX.Element } from 'preact';
import { useDisplayUnits } from "contexts/settings";
import {
    strokeDelete, strokeReorder, strokeDistance, strokeToggleActive,
    strokeIsActive
} from 'services/strokes';
import { DispersionLink } from "components/displersionLink";

/**
 * Create a link that deletes this stroke
 * @param {Stroke} stroke
 * @returns {HTMLElement}
 */
function StrokeDeleteButton(props: { stroke: Stroke }): JSX.Element {
    const icon = <span>&#215;</span>;
    const clickHandler = (e) => {
        strokeDelete(props.stroke?.holeIndex, props.stroke?.index);
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
function StrokeMoveButton(props: { stroke: Stroke, offset: number }): JSX.Element {
    const stroke = props.stroke;
    const icon = (props.offset > 0 ? <span>&#8595;</span> : <span>&#8593;</span>)
    const clickHandler = (e) => {
        strokeReorder(stroke.holeIndex, stroke.index, props.offset);
        e.stopPropagation();
    }
    return <button onClick={clickHandler}>{icon}</button>
}


/**
 * Create a list item for the Stroke Stats list
 * @param {Stroke} props.stroke
 * @returns {HTMLElement} the li element for the list
 */
function StrokeStatsListItem(props: { stroke: Stroke }) {
    const stroke = props.stroke;
    const displayUnits = useDisplayUnits();
    const distOptions = { to_unit: displayUnits, precision: 1, include_unit: true }
    const distance = formatDistance(strokeDistance(stroke), distOptions);
    const selectedClass = 'strokeStatsListItemSelected';
    let classes = ["strokeStatsListItem", "listCell"];
    if (strokeIsActive(stroke)) classes.push(selectedClass);
    classes = classes.join(' ')l
    const clickHandler = () => { strokeToggleActive(stroke) };
    return <li key={stroke.id}>
        <div className={classes} id={stroke.id} onClick={clickHandler}>
            <div className="strokeDetails">
                {`${stroke.index + 1}.  ${stroke.club} (${distance})`} | &#xb1;
                <DispersionLink stroke={stroke} distOptions={distOptions} />
            </div>
            <div className="strokeControls">
                <StrokeMoveButton stroke={stroke} offset={-1} />
                <StrokeMoveButton stroke={stroke} offset={1} />
                <StrokeDeleteButton stroke={stroke} />
            </div>
        </div></li>;
}

/**
 * Generate a list of strokes with controls to adjust them
 * @param {Stroke[]} props.strokes
 */
function StrokeStatsList(props: { strokes: Stroke[] }) {
    return (<div id="strokeList"><ol>
        {props.strokes?.map((stroke) => <StrokeStatsListItem key={stroke.id} stroke={stroke} />)}
    </ol></div>);
}