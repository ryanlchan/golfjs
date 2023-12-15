import * as L from 'leaflet';
import { Marker, Tooltip } from "react-leaflet";
import { useState } from "preact/hooks";

import flagImg from "assets/img/flag.png";

import { coordToLatLon } from "common/projections";
import { useHoleStoreContext } from "hooks/holeStore";

export const PinMarker = ({ hole }: { hole: Hole }) => {
    if (!hole.pin) return
    const [active, setActive] = useState(false);
    const holeIndex = hole.index;
    const flagIcon = L.icon({
        iconUrl: flagImg, // replace with the path to your flag icon
        iconSize: [60, 60], // size of the icon
        iconAnchor: [30, 60]
    });
    const holeStore = useHoleStoreContext();
    const eventMap = {
        drag: (e) => {
            holeStore.mutate(hole.index, (draft) => {
                const position = e.target.getLatLon();
                const coord = { x: position.lng, y: position.lat };
                hole.strokes.forEach(stroke => { if (stroke.aim == draft.pin) Object.assign(stroke.aim, coord) })
                Object.assign(draft.pin, coord);
            })
        },
        click: (e) => {
            setActive(!active);
        }
    }
    const options = {
        position: coordToLatLon(hole.pin),
        draggable: active,
        icon: flagIcon,
        title: String(holeIndex),
        zIndexOffset: -1000,
        eventHandlers: eventMap
    };
    return <Marker {...options}>
        {active && <PinTooltip />}
    </Marker>
}

const PinTooltip = () => {
    return <Tooltip direction="top" permanent={true} offset={[0, -60]}>
        Drag to move pin
    </Tooltip>
}