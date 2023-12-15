import { GeoJSON, LayerGroup, Polyline } from "react-leaflet";
import { useCourseContext } from "hooks/useCourseContext";
import { getHoleLine } from "services/courses";
import { coordToLatLon } from "common/projections";
import { PinMarker } from "components/map/pinMarker";
import { StrokeMarker } from "components/map/stroke";
import { useRoundContext } from "hooks/useRoundContext";
import { useActiveHolesContext, useHolesStateManagerContext } from "hooks/useActiveHolesContext";
import { holeColumns } from "hooks/useStateManager";
import { getHoleFromRoundByID } from "services/rounds";


/**
 * Draw a hole line showing the intended playing line
 * @param {Hole} hole the Hole interface object
 */
const HoleLine = ({ hole }: { hole: Hole }) => {
    const course = useCourseContext();
    const data = getHoleLine(course.data.value, hole.index);
    const style = {
        stroke: true,
        color: 'white',
        weight: 2,
        opacity: 0.5
    }
    return <GeoJSON data={data} style={style} interactive={false} />
}
const StrokeLine = ({ hole }: { hole: Hole }) => {
    const points = strokelinePoints(hole);
    const options = {
        color: 'white',
        weight: 2,
        interactive: false
    };
    return <Polyline positions={points} pathOptions={options} />
}

/**
 * Helper function just to generate point arrays for a hole
 */
function strokelinePoints(hole: Hole): [number, number][] {
    // Sort strokes by index and convert to LatLng objects
    const strokes = [...hole.strokes].sort((a, b) => a.index - b.index);
    const points = strokes.map(stroke => coordToLatLon(stroke.start))
    if (hole.pin) {
        points.push(coordToLatLon(hole.pin));
    }
    return points
}

function HoleStrokeMarkers({ hole }) {
    return <LayerGroup>
        {hole.strokes.map(stroke => <StrokeMarker key={stroke.id} stroke={stroke} />)}
    </LayerGroup>
}


const colToComponent = {
    [holeColumns.STROKE_LINE]: StrokeLine,
    [holeColumns.HOLE_LINE]: HoleLine,
    [holeColumns.PIN]: PinMarker,
    [holeColumns.STROKE_MARKERS]: HoleStrokeMarkers,
}

export const HolesLayers = () => {
    const round = useRoundContext().data.value;
    const holeManager = useHolesStateManagerContext();
    const groups = Object.values(holeColumns).map((col) => {
        const activeHoles = holeManager.getAllActive(col).map(hole => getHoleFromRoundByID(round, hole));
        const holes = activeHoles.length > 0 ? activeHoles : round.holes;
        const Component = colToComponent[col];
        if (!Component) return
        return holes.map((hole) => (<Component hole={hole} />))
    });
    return <LayerGroup>
        {groups}
    </LayerGroup>
}

const _HolesLayers = () => {
    const round = useRoundContext().data.value;
    const activeHoles = useActiveHolesContext(round);
    const holes = activeHoles.length > 0 ? activeHoles : round.holes;
    return <LayerGroup>
        {holes.map(hole => <HoleLayers hole={hole} />)}
    </LayerGroup>

}

/**
 * Render the set of markers/layers for a given hole
 * @param {Hole} hole the hole object from round
 */
export const HoleLayers = ({ hole }: { hole: Hole }) => {
    return <LayerGroup key={hole.id}>
        {hole.strokes.map(stroke => <StrokeMarker key={stroke.id} stroke={stroke} />)}
        <PinMarker hole={hole} />
        <HoleLine hole={hole} />
        <StrokeLine hole={hole} />
    </LayerGroup>
}
