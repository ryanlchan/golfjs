import * as L from 'leaflet';
import { Circle, LayerGroup, Marker, Tooltip, useMap } from "react-leaflet";

import circleMarkerImg from "assets/img/unselected-2x.png";
import selectedMarkerImg from "assets/img/selected-2x.png";
import targetImg from "assets/img/targeted-2x.png";

import { coordToLatLon, formatDistance, getDistance } from "common/projections";
import { useRoundContext } from "hooks/useRoundContext";
import { strokeGetClosestStroke, strokeGetDistance, strokeUpdateAim, strokeUpdateStart } from "services/strokes";
import { useCourseContext } from 'hooks/useCourseContext';
import { useStrokesStateManagerContext } from 'hooks/useActiveStrokesContext';
import { useHolesStateManagerContext } from 'hooks/useActiveHolesContext';
import { getHoleFromRound, getStrokeFromRoundByID } from 'services/rounds';
import { useDistanceOptionsContext } from 'hooks/useDisplayUnits';
import { useStrokeStatsContext } from 'hooks/useStatsContext';
import { strokeColumns } from 'hooks/useStateManager';
import { SGGrid } from 'components/map/sgGrid';
import { useRef, useState } from 'preact/hooks';

const activeIcon = L.icon({ iconUrl: selectedMarkerImg, iconSize: [30, 30], })
const inactiveIcon = L.icon({ iconUrl: circleMarkerImg, iconSize: [30, 30], });
export const StrokeMarker = ({ stroke }) => {
    const roundStore = useRoundContext();
    const courseStore = useCourseContext();
    const map = useMap();
    const [active, setActive] = useActiveState(stroke);
    const icon = active ? activeIcon : inactiveIcon;
    const onClick = () => {
        setActive(!active);
    }
    let isLoading;
    const onDrag = (e) => {
        if (isLoading) return
        isLoading = true;
        roundStore.mutate((roundDraft) => {
            const coord = { x: e.latlng.lng, y: e.latlng.lat, crs: "EPSG:4326" };
            const strokeDraft = getStrokeFromRoundByID(roundDraft, stroke.id);
            strokeUpdateStart(strokeDraft, coord, roundDraft, courseStore.data.value)
        });
        setTimeout(() => isLoading = false, 33);
    }
    const { eventHandlers, renderDrag } = useDraggable();
    const options = {
        position: coordToLatLon(stroke.start),
        draggable: active,
        opacity: .8,
        icon,
        holeIndex: stroke.holeIndex,
        strokeIndex: stroke.index,
        eventHandlers: {
            click: onClick,
            drag: onDrag,
            ...eventHandlers
        }
    }
    return renderDrag(<Marker {...options}>
        <StrokeTooltip stroke={stroke} roundStore={roundStore} />
    </Marker>)
}

const setActiveState = (stroke, toState, round, strokeManager, holeManager) => {
    try {
        const hole = getHoleFromRound(round.data.value, stroke.holeIndex);
        console.log("Setting active state to " + toState)
        if (toState) {
            strokeManager.activateOnly(stroke.id);
            if (!holeManager.isActive(hole.id)) holeManager.activateOnly(hole.id);
        } else {
            strokeManager.deactivate(stroke.id);
        }
    } catch (e) {
        console.error(e);
    }
}

const useActiveState = (stroke: Stroke): [boolean, (to) => void] => {
    const holeManager = useHolesStateManagerContext();
    const strokeManager = useStrokesStateManagerContext();
    const round = useRoundContext();
    const state = strokeManager.isActive(stroke.id);
    const setter = to => setActiveState(stroke, to, round, strokeManager, holeManager);
    return [state, setter]
}

const StrokeTooltip = ({ stroke, roundStore }) => {
    const round = roundStore.data.value;
    const closestStroke = strokeGetClosestStroke(stroke, round);
    const left = closestStroke && closestStroke.start.x > stroke.start.x
    const direction: L.Direction = left ? "left" : "right";
    const offset: L.PointExpression = left ? [-10, 0] : [10, 0];
    const text = strokeTooltipText(stroke, round);
    const options = { permanent: true, direction: direction, offset: offset };
    return <Tooltip {...options}>{text}</Tooltip>
}

/**
 * Return the tooltip text for a stroke marker
 * @param {Stroke} stroke
 */
function strokeTooltipText(stroke: Stroke, round: Round) {
    const club = stroke.club;
    const distanceOptions = useDistanceOptionsContext();
    const distance = formatDistance(strokeGetDistance(stroke, round), distanceOptions);
    return `${club} (${distance})`
}

/**
 * Create an aim marker where the user has currently clicked
 */
const StrokeAimMarker = ({ stroke }: { stroke: Stroke }) => {
    const aimIcon = L.icon({
        iconUrl: targetImg, // replace with the path to your flag icon
        iconSize: [30, 30], // size of the icon
        tooltipAnchor: [15, -15]
    });
    const roundStore = useRoundContext();
    const aimCoord = coordToLatLon(stroke.aim);
    let isLoading;
    const onDrag = (e) => {
        if (isLoading) return;
        isLoading = true;

        roundStore.mutate((roundDraft) => {
            const coord = { x: e.latlng.lng, y: e.latlng.lat, crs: "EPSG:4326" };
            const strokeDraft = getStrokeFromRoundByID(roundDraft, stroke.id);
            strokeUpdateAim(strokeDraft, coord, roundDraft)
        });
        setTimeout(() => { isLoading = false }, 33);
    }
    const { eventHandlers, renderDrag } = useDraggable();
    const options = {
        position: aimCoord,
        draggable: true,
        icon: aimIcon,
        title: "Aim point",
        zIndexOffset: 1000,
        eventHandlers: { drag: onDrag, ...eventHandlers }
    };
    const circleOptions = {
        center: aimCoord,
        radius: stroke.dispersion,
        color: "white",
        opacity: 0.5,
        weight: 2,
        eventHandlers: {
            click: (e) => e.originalEvent.view.L.DomEvent.stopPropagation(e),
        }
    }
    return renderDrag(<LayerGroup key={stroke.id}>
        <Marker {...options} />
        <Circle {...circleOptions} />
        <StrokeAimTooltip stroke={stroke} roundStore={roundStore} />
    </LayerGroup>)
}

const useDraggable = () => {
    const [dragging, setDrag] = useState(false);
    const eventHandlers = {
        dragstart: () => setDrag(true),
        dragend: () => setDrag(false)
    }
    const renderDrag = (components) => {
        const cachedRender = useRef(null);
        if (!dragging) cachedRender.current = components
        return cachedRender.current;
    }
    return { dragging, eventHandlers, renderDrag }
}

const StrokeAimTooltip = ({ stroke, roundStore }) => {
    const options = {
        permanent: true,
        direction: "top" as L.Direction,
        offset: [-15, 0] as L.PointExpression
    }
    const round = roundStore.data.value;
    const hole = getHoleFromRound(round, stroke.holeIndex);
    return <Tooltip {...options}>
        {strokeMarkerAimTooltip(stroke, hole)}
    </Tooltip>
}

/**
 * Output the content for a Stroke's Aim marker's tooltip
 * @returns {String}
 */
function strokeMarkerAimTooltip(stroke: Stroke, hole: Hole): string {
    const distanceOptions = useDistanceOptionsContext();
    const aimDistance = formatDistance(getDistance(stroke.start, stroke.aim), distanceOptions);
    const pinDistance = formatDistance(getDistance(stroke.aim, hole.pin), distanceOptions);
    const strokeStats = useStrokeStatsContext(stroke);
    const sgp = strokeStats?.strokesGainedPredicted
    let text = `${aimDistance} to aim<br> ${pinDistance} to pin`;
    if (sgp) text += `<br> SG Aim ${sgp}`
    return text
}

const colToComponent = {
    [strokeColumns.AIM_MARKERS]: StrokeAimMarker,
    [strokeColumns.GRID_STROKES_GAINED]: SGGrid,
    [strokeColumns.GRID_BEST_AIM]: targetGrid
}

export const StrokesLayers = () => {
    const round = useRoundContext().data.value;
    const manager = useStrokesStateManagerContext();
    const groups = Object.values(strokeColumns).map((col) => {
        const active = manager.getAllActive(col).map(stroke => getStrokeFromRoundByID(round, stroke));
        const Component = colToComponent[col];
        if (!Component) return
        return active.map((stroke) => (<Component stroke={stroke} />))
    });
    return <LayerGroup>
        {groups}
    </LayerGroup>
}