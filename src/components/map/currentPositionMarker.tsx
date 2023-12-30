import { formatDistance, getDistance } from "common/projections";
import { useActiveHolesContext } from "hooks/useActiveHolesContext";
import { useDistanceOptionsContext } from "hooks/useDisplayUnits";
import { useLocationContext } from "hooks/useLocationContext";
import { useRoundContext } from "hooks/useRoundContext";
import { useRef } from "preact/hooks";
import { CircleMarker, Popup } from "react-leaflet";

/**
 * Set up a marker on the map which tracks current user position and caches location
 */
export const CurrentPositionMarker = () => {
    const markerRef = useRef();
    const text = markerRef.current && positionMarkerPopupText(markerRef.current)
    const gr = useLocationContext();
    const latlon = [gr.coords.value?.latitude, gr.coords.value?.longitude] as L.LatLngTuple;
    return gr.isGeolocationAvailable.value && <CircleMarker center={latlon} radius={10} fillColor="#4A89F3" color="#FFF" weight={1} opacity={0.8} fillOpacity={0.8} ref={markerRef}>
        {text && <Popup>{text}</Popup>}
    </CircleMarker>
}

function positionMarkerPopupText(layer: L.Marker) {
    const latlng = layer.getLatLng();
    const coord = { x: latlng["lng"], y: latlng["lat"], crs: "EPSG:4236" }
    const dOpt = useDistanceOptionsContext();
    const round = useRoundContext();
    const holes = useActiveHolesContext(round.data.value);
    const dist = formatDistance(getDistance(coord, holes[0]?.pin), dOpt);
    return `${dist} to pin`;
}
