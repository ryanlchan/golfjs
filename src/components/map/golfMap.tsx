import { MapContainer, TileLayer } from 'react-leaflet';
import * as L from 'leaflet';
import ReactLeafletGoogleLayer from 'react-leaflet-google-layer'
import { useState, useEffect, useMemo } from 'preact/hooks';
import { enableSmoothZoom } from 'leaflet.smoothwheelzoom';
import * as turf from '@turf/turf';

import { getHoleFromRoundByID } from 'services/rounds';
import { getBbox, getHoleLine } from 'services/courses';
import { useSettingsFromContext } from 'hooks/useSettingsContext';

import { holeStateManager } from 'hooks/useStateManager';
import { useMapMutatorContext } from 'hooks/useMapMutatorContext';
import { useStateManagerContext } from 'hooks/useStateManagerContext';
import { useCourseContext } from 'hooks/useCourseContext';
import { useRoundContext } from 'hooks/useRoundContext';
import { type Signal } from '@preact/signals';
import { HolesLayers } from './hole';
import { type ComponentChildren } from 'preact';
import { StrokesLayers } from './stroke';
import { useHolesStateManagerContext } from 'hooks/useActiveHolesContext';

export function GolfMap({ children, ...options }: { children?: ComponentChildren }) {
    const [map, setMap] = useState(null);
    const mapMutatorSignal = useMapMutator(map);
    useMapEffects(map);
    useCourseEffects(mapMutatorSignal.value);

    const mapHeight = useMapHeight();
    const style = { height: `${mapHeight}px` };
    const settings = useSettingsFromContext();
    const gmapsKey = settings.data.value['gmapsKey'];

    return <MapContainer className="h-[200px] w-full relative" zoom={18}
        style={style} center={[36.567383, -121.947729]} ref={setMap} {...options}>
        {gmapsKey ?
            (<ReactLeafletGoogleLayer apiKey={gmapsKey} type='satellite' maxZoom={24} attribution='' />)
            : <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={24} maxNativeZoom={18} />}
        <StrokesLayers />
        <HolesLayers />
        {children}
    </MapContainer>
}

/**
 * Take in references to the map and the app context, and return a mutator that
 * allows this component to control the map
 * @param map the map reference from useMap()
 * @param appContext the value from AppContext.Consumer
 * @returns a mutator object
 */
interface FlyOptions { animate: boolean, duration: number };
export interface MapMutator {
    recenter: () => void,
    recenterBbox: (bbox: number[], flyoptions?: FlyOptions) => void,
    recenterCourse: (options?: FlyOptions) => void,
    recenterHole: (options?: FlyOptions) => void,
    map: L.Map
}
function mapMutator(map: L.Map, stateManager, courseStore, roundStore): MapMutator {
    const recenterBbox = (bbox, flyoptions = { animate: true, duration: 0.33 }) => {
        map?.flyToBounds(bbox, flyoptions);
    }

    const recenterCourse = (flyoptions = { animate: true, duration: 0.33 }) => {
        const bbox = getBbox(courseStore.data.value);
        if (!bbox) return;
        recenterBbox(bbox, flyoptions);
    }

    const recenterHole = (flyoptions = { animate: true, duration: 0.33 }) => {
        const activeIds = holeStateManager(stateManager).getAllActive();
        const activeHoles = activeIds.map(id => getHoleFromRoundByID(roundStore.data.value, id));
        const polys = turf.featureCollection(activeHoles.map((hole) => getHoleLine(courseStore.data.value, hole.index)));
        const buffered = turf.buffer(polys, 1, { units: "meters" });
        let bbox = getBbox(buffered);
        if (!bbox) console.warn("Cannot recenter onto hole")
        recenterBbox(bbox, flyoptions)
    }

    const recenter = (flyoptions = { animate: true, duration: 0.33 }) => {
        const activeHoleManager = holeStateManager(stateManager);
        activeHoleManager.getAllActive().length > 0 ? recenterHole(flyoptions) : recenterCourse(flyoptions)
    }
    return { recenter, recenterBbox, recenterCourse, recenterHole, map }
}

const useMapMutator = (map): Signal<MapMutator> => {
    return useMemo(() => {
        const stateManager = useStateManagerContext();
        const courseStore = useCourseContext();
        const roundStore = useRoundContext();
        const mapManager = mapMutator(map, stateManager, courseStore, roundStore);
        const mapMutatorSignal = useMapMutatorContext();
        mapMutatorSignal.value = mapManager;
        return mapMutatorSignal
    }, [map])
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
    let zoomCallbackID;
    const delayedUpdate = () => {
        clearTimeout(zoomCallbackID);
        zoomCallbackID = setTimeout(() => updateTooltipsVisibility(), 200)
    }
    map.on('zoomend', delayedUpdate);
    updateTooltipsVisibility();
}

const useMapEffects = (map) => {
    useEffect(() => {
        if (map) {
            enableSmoothZoom(map, 1.5);
            addTooltipDecluttering(map, 85)
        }
    }, [map])
}

const useCourseEffects = (mapMutator: MapMutator) => {
    const course = useCourseContext();
    const holeManager = useHolesStateManagerContext();
    useEffect(() => {
        try {
            if (course && !course.isLoading.value && course.data.value.features?.length > 0) {
                mapMutator.recenter();
            }
        } catch (e) {
            console.error(e);
            debugger;
        }
    }, [holeManager.getAllActive()])
}

const useMapHeight = () => {
    const availableHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
    return 0.8 * availableHeight;
}