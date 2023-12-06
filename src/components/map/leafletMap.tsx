import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import ReactLeafletGoogleLayer from 'react-leaflet-google-layer'
import { useState, useEffect } from 'preact/hooks';
import { enableSmoothZoom } from 'leaflet.smoothwheelzoom';
import { getSetting } from 'common/utils';
import { roundCourseParams } from 'services/rounds';

export function LeafletMap(props) {
    const [map, setMap] = useState(null);
    mapView = map;
    const { children, ...options } = props;
    const availableHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
    const mapHeight = 0.8 * availableHeight;
    const heightStyle = `height:${mapHeight}px`
    const gmapsKey = getSetting("googleMapsAPIKey");

    useEffect(() => {
        if (map) {
            enableSmoothZoom(map, 1.5);
            addTooltipDecluttering(map, 85)
        }
    })

    return <MapContainer className="h-[200px] w-full relative" zoom={18} maxZoom={24} maxNativeZoom={18}
        style={heightStyle} center={[36.567383, -121.947729]}
        ref={setMap}
        {...options}>
        {gmapsKey ?
            (<ReactLeafletGoogleLayer apiKey={gmapsKey} type='satellite' maxZoom='24' attribution='' />)
            : <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />}
        {children}
    </MapContainer>
}

/**
 * Recenter the map on a point
 * Options for key include "currentPosition", "currentHole", "course". Default to currentPosition.
 * @param {String} [key]
 */
function mapRecenter(key?: string) {
    if (!key) {
        if (currentHole) {
            key = "currentHole";
        } else if (currentPositionRead()) {
            key = "currentPosition";
        } else {
            key = "course"
        }
    }

    if (key == "course") {
        mapRecenterCourse();
    } else if (key == "currentHole") {
        mapRecenterHole();
    } else if (key == "currentPosition") {
        mapRecenterCurrentPosition();
    }
}

function mapRecenterBbox(bbox, flyoptions = { animate: true, duration: 0.33 }, map?: L.Map) {
    if (!map) map = mapView;
    map.flyToBounds(bbox, flyoptions);
}

function mapRecenterCourse(flyoptions = { animate: true, duration: 0.33 }, map?: L.Map) {
    const bbox = courses.getGolfCourseBbox(roundCourseParams(round));
    if (!bbox) return;
    console.debug("Recentering on course");
    mapRecenterBbox(bbox, flyoptions, map);
}

function mapRecenterHole(flyoptions = { animate: true, duration: 0.33 }, map?: L.Map) {
    if (!map) map = mapView;
    let bbox = courses.getGolfHoleBbox(roundCourseParams(round), currentHole.index);
    if (bbox) {
        console.debug("Recentering on current hole");
        mapRecenterBbox(bbox)
    } else if (currentHole.pin) {
        console.debug("Recentering on current pin");
        map.flyTo([currentHole.pin.y, currentHole.pin.x], 18, flyoptions);
    }
}

function mapRecenterCurrentPosition(flyoptions = { animate: true, duration: 0.33 }, map?: L.Map) {
    if (!map) map = mapView;
    if (!currentPositionEnabled || !currentPosition) return
    console.debug("Recentering on current position");
    map.flyTo([currentPosition.coords.latitude, currentPosition.coords.longitude], 20, flyoptions);
}


function addTooltipDecluttering(map: L.Map, percentScreenFree: number = 60): void {
    const tooltipSize = { width: 55, height: 32 }; // Size of each tooltip

    // Function to calculate the maximum number of tooltips that can be displayed
    const calculateMaxTooltips = (): number => {
        const mapSize = map.getSize();
        const mapArea = mapSize.x * mapSize.y;
        const tooltipArea = tooltipSize.width * tooltipSize.height;
        const maxTooltips = Math.floor(mapArea * (1 - percentScreenFree / 100) / tooltipArea);
        return maxTooltips > 0 ? maxTooltips : 0;
    };

    const updateTooltipsVisibility = () => {
        const bounds = map.getBounds();
        let markers = [] as L.Marker[];
        map.eachLayer(layer => { if (layer instanceof L.Marker) markers.push(layer) });
        const visibleMarkers = markers.filter(marker => bounds.contains(marker.getLatLng()));
        const tooltipThreshold = calculateMaxTooltips();
        if (visibleMarkers.length > tooltipThreshold) {
            markers.forEach(marker => marker.closeTooltip());
        } else {
            markers.forEach(marker => marker.openTooltip());
        }
    };

    map.on('zoomend', updateTooltipsVisibility);
    updateTooltipsVisibility();
}