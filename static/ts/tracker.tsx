/**
 * Golf App
 * A JavaScript program for tracking golf rounds and locations.
 */
// Dependencies
import * as L from "leaflet";
import { Loader } from "@googlemaps/js-api-loader";
import "leaflet.gridlayer.googlemutant/dist/Leaflet.GoogleMutant";
import { enableSmoothZoom } from "leaflet.smoothwheelzoom";
import * as turf from "@turf/turf";
import chroma from "chroma-js";
import { typeid } from "typeid-js";
import { h, render, VNode } from 'preact';
import { useState, useMemo } from 'preact/hooks';

// Modules
import * as grids from "./grids.js";
import { getDistance, formatDistance, formatDistanceAsNumber, formatDistanceOptions } from "./projections.js";
import { PositionError } from "./errors.js";
import { showError, hideError, touch, getUnitsSetting } from "./utils.js";
import * as cache from "./cache.js";
import { roundCreate, roundCourseParams, roundLoad, roundSave } from "./rounds.js";
import { SG_SPLINES } from "./coeffs20231205.js";
import { getUsableClubs } from "./clubs.js";

// Static images
import circleMarkerImg from "../img/unselected-2x.png";
import selectedMarkerImg from "../img/selected-2x.png";
import targetImg from "../img/targeted-2x.png";
import flagImg from "../img/flag.png";

// Variables
let mapView: any;
let round: Round = roundCreate();
let currentHole: Hole = round.holes.at(-1);
let layers: object = {};
let currentPosition: GeolocationPosition;
let currentPositionEnabled: boolean;
let activeStroke: Stroke;
let displayUnits = getUnitsSetting();

/**
 * ===========
 * Strokes
 * ===========
 */

/**
 * Shows the current position on the map and logs it as a stroke.
 * @param {GeolocationPositionIsh} position - The current geolocation position.
 * @param {object} options - any additional options to set on Stroke
 */
function strokeCreate(position: GeolocationPositionIsh, options: object = {}) {
    // handle no current hole
    if (currentHole == undefined) {
        currentHole = round.holes.reduce((latest, hole) => {
            return hole.index > latest.index && hole.strokes.length > 0 ? hole : latest
        })
        holeSelect(currentHole.index);
    }

    // Create the stroke object
    const course = roundCourseParams(round);
    const stroke: Stroke = {
        id: typeid("stroke").toString(),
        index: currentHole.strokes.length,
        holeIndex: currentHole.index,
        start: {
            x: position.coords.longitude,
            y: position.coords.latitude,
            crs: "EPSG:4326",
        },
        terrain: grids.getGolfTerrainAt(course, [position.coords.latitude, position.coords.longitude]),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...options
    };
    if (currentHole.pin) {
        stroke.aim = currentHole.pin;
    }

    // Add the stroke to the data layer
    currentHole.strokes.push(stroke);
    touch(currentHole, round);

    // Add the stroke to the view
    strokeMarkerCreate(stroke);
    rerender();
}

/**
 * Delete a stroke out of the round
 * @param {Number} holeIndex
 * @param {Number} strokeIndex
 */
function strokeDelete(holeIndex, strokeIndex: number) {
    console.debug(`Deleting stroke i${strokeIndex} from hole i${holeIndex}`)
    let hole = round.holes.find(h => h.index === holeIndex);
    if (hole) {
        // Delete from data layer
        hole.strokes.splice(strokeIndex, 1);

        // Reindex remaining strokes
        hole.strokes.forEach((stroke, index) => stroke.index = index);

        // Update hole
        touch(hole, round);

        // Rerender views
        holeViewDelete()
        holeViewCreate(hole)
        rerender();
    }
}

/**
 * Reorders a stroke within a Hole
 * @param {Number} holeIndex the hole to reorder (1-indexed)
 * @param {Number} strokeIndex the stroke index to reorder (0-indexed)
 * @param {Number} offset movment relative to the current strokeIndex
 */
function strokeReorder(holeIndex: number, strokeIndex: number, offset: number) {
    console.debug(`Moving stroke i${strokeIndex} from hole i${holeIndex} by ${offset}`)
    const hole = round.holes[holeIndex]
    const mover = hole.strokes[strokeIndex]
    if (offset < 0) {
        offset = Math.max(offset, -strokeIndex)
    } else {
        offset = Math.min(offset, hole.strokes.length - strokeIndex - 1)
    }
    hole.strokes.splice(strokeIndex, 1)
    hole.strokes.splice(strokeIndex + offset, 0, mover)
    hole.strokes.forEach((stroke, index) => stroke.index = index);

    // Update hole
    touch(hole, round);

    // Update the map and polylines
    rerender()
}

/**
 * Get the distance from this stroke to the next
 * @param {Stroke} stroke
 */
function strokeDistance(stroke: Stroke): number {
    const nextStart = strokeNextStart(stroke)
    return getDistance(stroke.start, nextStart);
}

/**
 * Set the dispersion for a stroke
 * @param {Stroke} stroke the stroke
 * @param {number | string} [val] the value to set the dispersion to
 * @returns {number} the dispersion of this stroke
 */
function convertAndSetStrokeDispersion(stroke: Stroke, val: number | string): number {
    const distOpts = { from_unit: displayUnits, to_unit: "meters", output: "number", precision: 3 } as formatDistanceOptions;
    touch(stroke, strokeHole(stroke), round);
    stroke.dispersion = formatDistanceAsNumber(val, distOpts);
    return stroke.dispersion;
}

function strokeUpdateTerrain(stroke: Stroke, strokeRound?: Round) {
    if (!strokeRound) strokeRound = round;
    const course = roundCourseParams(strokeRound);
    stroke.terrain = grids.getGolfTerrainAt(course, [stroke.start.y, stroke.start.x])
    touch(stroke);
}

/**
 * Reset a stroke to aim at the pin
 * @param stroke the stroke to reset aim for
 * @returns the updated stroke
 */
function strokeAimReset(stroke: Stroke): Stroke {
    const hole = strokeHole(stroke);
    stroke.aim = hole.pin;
    touch(stroke, hole, round);
    return stroke;
}

/**
 * Get the hole for a stroke
 * @param stroke the stroke to get the hole for
 * @returns the hole for the stroe
 */
function strokeHole(stroke: Stroke): Hole {
    return round.holes[stroke.holeIndex];
}

function strokeNextStroke(stroke: Stroke): Stroke {
    let hole = strokeHole(stroke);
    if (!hole || stroke.index == hole.strokes.length) {
        return undefined;
    }
    return hole.strokes[stroke.index + 1];
}

function strokeLastStroke(stroke: Stroke): Stroke {
    let hole = strokeHole(stroke);
    if (!hole || stroke.index == 0) {
        return undefined;
    }
    return hole.strokes[stroke.index - 1];
}

function strokeNextStart(stroke: Stroke): Coordinate {
    let nextStroke = strokeNextStroke(stroke);
    if (nextStroke) {
        return nextStroke.start;
    }
    return strokeHole(stroke).pin;
}

function strokeLastStart(stroke: Stroke): Coordinate {
    let lastStroke = strokeLastStroke(stroke);
    if (lastStroke) {
        return lastStroke.start;
    }
    return undefined;
}

function strokeClosestStroke(stroke: Stroke): Stroke {
    let lastStroke = strokeLastStroke(stroke);
    let nextStroke = strokeNextStroke(stroke);
    if (!lastStroke && !nextStroke) {
        return undefined
    } else if (!lastStroke) {
        return nextStroke;
    } else if (!nextStroke) {
        return lastStroke;
    }

    let lastDist = getDistance(stroke.start, lastStroke.start);
    let nextDist = getDistance(stroke.start, nextStroke.start);
    if (lastDist < nextDist) {
        return lastStroke;
    } else {
        return nextStroke;
    }
}

/**
 * Adds a stroke marker to the map.
 * @param {Stroke} stroke - the stroke to add a marker for
 * @param {Object} options - Marker options.
 */
function strokeMarkerCreate(stroke: Stroke, options?: object) {
    console.debug(`Creating stroke markers for stroke ${stroke.index}`);
    const coordinate = stroke.start;
    const icon = L.icon({
        iconUrl: circleMarkerImg, // replace with the path to your flag icon
        iconSize: [30, 30], // size of the icon
    });
    let opt = { draggable: true, opacity: .8, icon, holeIndex: stroke.holeIndex, strokeIndex: stroke.index }
    if (options !== undefined) {
        opt = {
            ...opt,
            ...options
        }
    }
    let id = strokeMarkerID(stroke)
    let marker = markerCreate(id, coordinate, opt);
    let direction: L.Direction = "right";
    let offset: L.PointExpression = [10, 0];
    let closestStroke = strokeClosestStroke(stroke);
    if (closestStroke && closestStroke.start.x > stroke.start.x) {
        direction = "left";
        offset = [-10, 0];
    }
    marker.bindTooltip(
        (function () { return strokeTooltipText(stroke) }),
        { permanent: true, direction: direction, offset: offset });
    marker.on('click', strokeMarkerActivateCallback(marker));
    marker.on('dragend', () => strokeUpdateTerrain(stroke));
}

/**
 * Updates all stroke marker tooltips
 */
function strokeMarkerUpdate() {
    for (const hole of round.holes) {
        for (const stroke of hole.strokes) {
            let marker = layerRead(strokeMarkerID(stroke))
            if (!marker) {
                continue
            }
            let tooltip = marker.getTooltip();
            if (tooltip) {
                tooltip.update()
            }
        }
    }
}

/**
 * Return a function that can be used to activate a stroke marker
 * @param {L.Marker} marker the leaflet map marker
 * @returns {function}
 */
function strokeMarkerActivateCallback(marker: L.Marker): () => void {
    // callback doesn't need to handle the click event
    return (() => strokeMarkerActivate(marker));
}

/**
 * Activate a stroke marker
 * @param {L.Marker} marker the leaflet map marker
 */
function strokeMarkerActivate(marker: L.Marker) {
    const opt = marker.options as any;

    // Set current hole to this one if missing
    const stroke = round.holes[opt["holeIndex"]].strokes[opt["strokeIndex"]];
    if (!currentHole) {
        holeSelect(opt["holeIndex"]);
        marker = layerRead(strokeMarkerID(stroke));
    }

    // Deactivate the currently active marker if there is one
    const alreadySelected = activeStroke == stroke;
    if (activeStroke) {
        strokeMarkerDeactivate();
    }
    if (alreadySelected) {
        return
    }

    // Activate the clicked marker
    const activeIcon = L.icon({
        iconUrl: selectedMarkerImg,
        iconSize: [30, 30],
    });
    marker.setIcon(activeIcon);
    marker.getElement().classList.add('active-marker');
    activeStroke = currentHole.strokes[opt.strokeIndex];

    // Register deactivation clicks
    mapView.addEventListener("click", strokeMarkerDeactivate)

    // Rerender stroke list
    rerender('active');
}

/**
 * Deactivate an aim marker when the user clicks on the map
 */
function strokeMarkerDeactivate(e?) {

    // Ignore clicks that originate from tooltips
    if (e?.originalEvent.target.classList.contains("leaflet-pane")) {
        return
    }

    if (activeStroke) {
        let activeStrokeMarker = layerRead(strokeMarkerID(activeStroke));
        activeStrokeMarker.getElement().classList.remove('active-marker');
        const inactiveIcon = L.icon({
            iconUrl: circleMarkerImg,
            iconSize: [30, 30],
        });
        activeStrokeMarker.setIcon(inactiveIcon);
        activeStroke = null;

        // Hide the "Set aim" button and remove the aim marker
        strokeMarkerAimDelete();

        // Delete deactivation clicks
        mapView.removeEventListener("click", strokeMarkerDeactivate);

        rerender("map");
    }
}


/**
 * Create an aim marker where the user has currently clicked
 */
function strokeMarkerAimCreate() {
    if (!activeStroke) {
        console.error("Cannot add aim, no active stroke")
        return
    }

    let aim = { ...activeStroke.aim };
    const aimIcon = L.icon({
        iconUrl: targetImg, // replace with the path to your flag icon
        iconSize: [30, 30], // size of the icon
        tooltipAnchor: [15, -15]
    });
    const options = {
        draggable: true,
        icon: aimIcon,
        title: "Aim point",
        zIndexOffset: 1000
    };
    let marker = markerCreate("active_aim", aim, options);
    marker.bindTooltip(strokeMarkerAimTooltip, { permanent: true, direction: "top", offset: [-15, 0] })
    marker.once('drag', () => activeStroke.aim = aim);
    let ring = L.circle(marker.getLatLng(), { radius: activeStroke.dispersion, color: "#fff", opacity: 0.5, weight: 2 })
    layerCreate("active_aim_ring", ring);
    gridCreate();
    strokeMarkerAimUpdate();
}

/**
 * Output the content for a Stroke's Aim marker's tooltip
 * @returns {String}
 */
function strokeMarkerAimTooltip(): string {
    const distanceOptions = { to_unit: displayUnits, include_unit: true }
    const aimDistance = formatDistance(getDistance(activeStroke.start, activeStroke.aim), distanceOptions);
    const pinDistance = formatDistance(getDistance(activeStroke.aim, currentHole.pin), distanceOptions);
    let text = `${aimDistance} to aim<br> ${pinDistance} to pin`;

    const sggrid = layerRead("active_grid");
    if (sggrid?.options.grid) {
        const wsg = sggrid.options.grid.properties.weightedStrokesGained.toFixed(2);
        text += `<br> SG Aim ${wsg}`
    }
    return text
}

/**
 * Update the tooltip and aim ring for a Stroke's Aim marker
 */
function strokeMarkerAimUpdate() {
    try {
        const marker = layerRead("active_aim")
        marker.getTooltip().update();
        layerRead("active_aim_ring").setLatLng(marker.getLatLng());
    } catch (e) {
        return;
    }
}

/**
 * Delete the current active stroke's aim marker, ring, and grid
 */
function strokeMarkerAimDelete() {
    // Hide aim layers
    layerDelete("active_aim");
    layerDelete("active_aim_ring");

    // Hide any grid
    gridDelete();
}

/**
 * Create a unique ID for a Stroke
 * @param {Stroke} stroke
 * @returns {String}
 */
function strokeMarkerID(stroke: Stroke): string {
    return `stroke_marker_${stroke.index}_hole_${stroke.holeIndex}`
}

/**
 * Create a unique ID for a Stroke AIm marker
 * @param {Stroke} stroke
 * @returns {String}
 */
function strokeMarkerAimID(stroke: Stroke): string {
    return `stroke_marker_aim_${stroke.index}_hole_${stroke.holeIndex}`
}

/**
 * Create a unique ID for a Stroke SG grid
 * @param {Stroke} stroke
 * @returns {String}
 */
function strokeSgGridID(stroke: Stroke): string {
    return `stroke_${stroke.index}_hole_${stroke.holeIndex}_sg_grid`
}

/**
 * Return the tooltip text for a stroke marker
 * @param {Stroke} stroke
 */
function strokeTooltipText(stroke: Stroke) {
    const club = stroke.club;
    const distanceOptions = { to_unit: displayUnits, include_unit: true }
    const distance = formatDistance(strokeDistance(stroke), distanceOptions);
    return `${club} (${distance})`
}


/**
 * =====
 * Grids
 * =====
 */

/**
 * Duck type a GridOptions object that allows us to reference the grid from GeoJSON layers
 */
interface GridOptions extends L.GeoJSONOptions {
    grid: L.GeoJSON
}

/**
 * Create the currently active grid type
 * @param {string} type the type of grid to render, from grids.GRID_TYPES
 */
function gridCreate(type?: string) {
    if (type == grids.gridTypes.STROKES_GAINED) {
        sgGridCreate();
    } else if (type == grids.gridTypes.TARGET) {
        targetGridCreate();
    } else {
        sgGridCreate();
    }
}

/**
 * Delete the currently active grid type
 */
function gridDelete() {
    layerDelete("active_grid");
}

/**
 * Update the currently active grid type
 * @param {string} [type] the type of grid to update to
 * @returns {Promise} a promise for when the grid is done refreshing
 */
function gridUpdate(type?: string): Promise<any> {
    // Get current layer type
    if (!type) {
        let layer = layerRead("active_grid");
        if (layer) {
            type = layer.options.grid.properties.type;
        }
    }
    gridDelete();

    // Create new grid given type (default to SG)
    if (activeStroke && currentHole.pin) {
        gridCreate(type);
        strokeMarkerAimUpdate();
        return Promise.resolve(true);
    } else {
        return Promise.reject(new Error("No grid to update"));
    }
}

/**
 * Create a Strokes Gained probability grid around the current aim point
 */
function sgGridCreate() {
    if (!activeStroke) {
        console.error("No active stroke, cannot create sg grid");
        return
    } else if (!currentHole.pin) {
        console.error("Pin not set, cannot create sg grid");
        return
    } else if (layerRead("active_grid")) {
        console.warn("Grid already exists, recreating");
        layerDelete("active_grid");
    }

    const grid = grids.sgGrid(
        [activeStroke.start.y, activeStroke.start.x],
        [activeStroke.aim.y, activeStroke.aim.x],
        [currentHole.pin.y, currentHole.pin.x],
        activeStroke.dispersion,
        roundCourseParams(round),
        activeStroke.terrain);

    // Check if any grid returned, for example if the data didn't load or something
    if (grid instanceof Error) {
        return
    }
    // Create alpha/colorscale
    const colorscale: chroma.Scale = chroma.scale('RdYlGn').domain([-.25, .15]);
    const alphamid = 1 / grid.features.length;
    const clip = (num, min, max) => Math.min(Math.max(num, min), max)
    const options: GridOptions = {
        style: function (feature) {
            return {
                stroke: false,
                fillColor: colorscale(feature.properties.strokesGained).hex(),
                fillOpacity: clip(feature.properties.probability / alphamid * 0.2, 0.1, 0.7)
            }
        },
        grid: grid
    }
    const gridLayer = L.geoJSON(grid, options).bindPopup(function (layer: any) {
        const props = layer.feature.properties;
        const sg = props.strokesGained;
        const prob = (props.probability * 100);
        const er = grids.erf(props.distanceToAim, 0, activeStroke.dispersion)
        const ptile = (1 - er) * 100;
        return `SG: ${sg.toFixed(2)}
                    | ${props.terrainType}
                    | Prob: ${prob.toFixed(2)}%
                    | ${ptile.toFixed(1)}%ile`;
    });
    layerCreate("active_grid", gridLayer);
}

/**
 * Create a relative strokes gained grid for aiming at each cell in a grid
 */
function targetGridCreate() {
    if (!activeStroke) {
        console.error("No active stroke, cannot create sg grid");
        return
    } else if (!currentHole.pin) {
        console.error("Pin not set, cannot create sg grid");
        return
    } else if (layerRead("active_grid")) {
        console.warn("Grid already exists, recreating");
        layerDelete("active_grid");
    }

    const grid = grids.targetGrid(
        [activeStroke.start.y, activeStroke.start.x],
        [activeStroke.aim.y, activeStroke.aim.x],
        [currentHole.pin.y, currentHole.pin.x],
        activeStroke.dispersion,
        roundCourseParams(round),
        activeStroke.terrain);
    const bestCell = grid.properties.idealStrokesGained;

    // Check if any grid returned, for example if the data didn't load or something
    if (grid instanceof Error) {
        return
    }
    // Create alpha/colorscale
    const colorscale = chroma.scale('RdYlGn').domain([-.25, .25]);
    const options: GridOptions = {
        style: function (feature) {
            const ideal = feature.properties.weightedStrokesGained == bestCell;
            if (ideal) {
                return {
                    stroke: true,
                    fillColor: "#FFD700",
                    fillOpacity: 0.8
                }
            }
            return {
                stroke: false,
                fillColor: colorscale(feature.properties.relativeStrokesGained).hex(),
                fillOpacity: 0.5
            }
        },
        grid: grid
    }
    const gridLayer = L.geoJSON(grid, options).bindPopup(function (layer: any) {
        const props = layer.feature.properties;
        const wsg = props.weightedStrokesGained;
        const rwsg = props.relativeStrokesGained;
        return `SG: ${wsg.toFixed(2)}
                    | vs Aim: ${rwsg.toFixed(2)}`
    });
    layerCreate("active_grid", gridLayer);
}

/**
 * ============
 * Stroke Lines
 * ============
 */

/**
 * Create a stroke line for a given hole
 * @param {Hole} hole
 */
function strokelineCreate(hole: Hole) {
    console.debug("Creating stroke line for hole i" + hole.index)
    let points = strokelinePoints(hole);

    // Only create polyline if there's more than one point
    if (points.length == 0) {
        return
    }

    // Add Line to map
    let strokeline = L.polyline(points, {
        color: 'white',
        weight: 2,
        interactive: false
    });
    let id = strokelineID(hole);
    layerCreate(id, strokeline);
    return strokeline
}

/**
 * Rerender Stroke Lines
 */
function strokelineUpdate() {
    let layers = layerReadAll();
    let selected = {}
    for (let id in layers) {
        if (id.includes("strokeline")) {
            selected[id] = layers[id];
        }
    }
    for (let hole of round.holes) {
        let id = strokelineID(hole);
        if (Object.keys(selected).includes(id)) {
            selected[id].setLatLngs(strokelinePoints(hole));
        }
    }
}

/**
 * Helper function just to generate point arrays for a hole
 * @param {Hole} hole
 * @returns {L.LatLng[]}
 */
function strokelinePoints(hole: Hole): L.LatLng[] {
    let points = []
    // Sort strokes by index and convert to LatLng objects
    hole.strokes.sort((a, b) => a.index - b.index);
    hole.strokes.forEach(stroke => {
        points.push(L.latLng(stroke.start.y, stroke.start.x));
    });

    // If a pin is set, add it to the end of the polyline
    if (hole.pin) {
        points.push(L.latLng(hole.pin.y, hole.pin.x));
    }
    return points
}

/**
 * Generate a unique layer primary key for this hole
 * @param {Hole} hole
 * @returns String
 */
function strokelineID(hole: Hole) {
    return `strokeline_hole_${hole.index}`
}

/**
 * ====
 * Holes
 * ====
 */

/**
 * Select a new hole and update pointers/views to match
 * @param {number} holeIndex
 */
function holeSelect(holeIndex: number) {
    if (holeIndex == -1) {
        holeViewDelete();

        round.holes.forEach(function (hole) {
            holeViewCreate(hole);
        });

        currentHole = undefined;
        mapRecenter("course");
    } else if (!(round.holes[holeIndex])) {
        console.error(`Attempted to select hole i${holeIndex} but does not exist!`);
        return
    } else {
        currentHole = round.holes[holeIndex];

        // Delete all hole-specific layers and active states
        holeViewDelete();

        // Add all the layers of this new hole
        holeViewCreate(currentHole);
        mapRecenter("currentHole");
    }
    rerender("full");

}

/**
 * Returns a unique layer ID for a given Hole
 * @param {Hole} hole the hole interface object from round
 * @returns {String}
 */
function holePinID(hole: Hole): string {
    return `pin_hole_i${hole.index}`
}

/**
 * Adds a pin marker to the map.
 * @param {Hole} hole - The hole to add a pin for
 */
function pinMarkerCreate(hole: Hole) {
    console.debug("Creating pin marker for hole i" + hole.index)
    const coordinate = hole.pin;
    const holeIndex = hole.index;
    const flagIcon = L.icon({
        iconUrl: flagImg, // replace with the path to your flag icon
        iconSize: [60, 60], // size of the icon
        iconAnchor: [30, 60]
    });
    const options = {
        draggable: true,
        icon: flagIcon,
        title: String(holeIndex),
        zIndexOffset: -1000
    };
    const id = holePinID(hole);
    markerCreate(id, coordinate, options);
}

function pinMarkerUpdate(hole: Hole) {
    const id = holePinID(hole);
    const layer = layerRead(id);
    if (!layer) {
        return
    }

    layer.setLatLng(L.latLng(hole.pin.y, hole.pin.x))
}

/**
 * Draw a hole line showing the intended playing line
 * @param {Hole} hole the Hole interface object
 */
function holeLineCreate(hole: Hole) {
    let line = grids.getGolfHoleLine(roundCourseParams(round), hole.index);
    if (line instanceof Error) {
        return
    }
    let layer = L.geoJSON(line, {
        style: () => {
            return {
                stroke: true,
                color: '#fff',
                weight: 2,
                opacity: 0.5
            }
        },
        interactive: false
    });
    layerCreate(holeLineId(hole), layer);
}

/**
 * Return a unique ID for a hole line layer
 * @param {Hole} hole the Hole interface object
 * @returns {String} a unique ID
 */
function holeLineId(hole: Hole): string {
    return `hole_i${hole.index}_line`
}

/**
 * ======
 * Rounds
 * ======
 */

/**
 * Loads saved round data and initializes relevant variables
 * @returns {Promise} returns the round once all data is loaded
 */
function loadRoundData(): Promise<Round> {
    const loaded = loadData();
    if (!loaded) {
        return;
    }
    console.log("Rehydrating round from cache");

    const params = roundCourseParams(round);
    if (grids.getGolfCourseData(params) instanceof Error) {
        return grids.fetchGolfCourseData(params, true)
            .then(() => loadRoundData());
    } else {
        currentHole = round.holes.at(0);
        return Promise.resolve(loaded);
    }
}

/**
 * =====
 * Clubs
 * =====
 */

/**
 * Create a new stroke for a given club at current position
 * @param {GeolocationPositionIsh} position the locaation to create a stroke at
 * @param {Club} club the club to create a stroke with
 */
function clubStrokeCreate(position: GeolocationPositionIsh, club: Club) {
    let options = {
        club: club.name,
        dispersion: club.dispersion,
    }
    if (club.name == "Penalty") options['terrain'] = "penalty";
    strokeCreate(position, options)
}

/**
 * ==============
 * Saving/Loading
 * ==============
 */

/**
 * Save round data to localstorage
 */
function saveData() {
    roundSave(round);
}

/**
 * Loads the data from localStorage and initializes the map.
 * @returns {Round} the loaded round or undefined
 */
function loadData(): Round {
    const loaded = roundLoad();
    if (!loaded) return;
    round = loaded;
    return round;
}

/**
 * ===========
 * Base Marker
 * ===========
 */

/**
 * Adds a marker to the map.
 * @param {string} name - the name of the marker
 * @param {Coordinate} coordinate - The coordinate object {x, y, crs}.
 * @param {Object} options - Marker options.
 * @returns {L.Marker} a leaflet marker
 */
function markerCreate(name: string, coordinate: Coordinate, options?: object): L.Marker {
    options = { draggable: true, ...options }
    const marker = L.marker([coordinate.y, coordinate.x], options);
    marker.on("drag", handleMarkerDrag(marker, coordinate));
    marker.on("dragend", (() => rerender("dragend")));
    layerCreate(name, marker)
    strokelineUpdate();
    return marker
}

/**
 * Shortcut factory for marker drag callbacks
 * @param {L.Marker} marker
 */
function handleMarkerDrag(marker: L.Marker, coordinate) {
    return (function mdrag(event) {
        const position = marker.getLatLng();
        coordinate.x = position.lng;
        coordinate.y = position.lat;
        rerender();
    });
}

/**
 * ========
 * LayerSet
 * A frontend for tracking and reading back out layers
 * ========
 */

/**
 * Store a layer in the layerSet
 * @param {String} id
 * @param {*} object
 */
function layerCreate(id: string, object: any) {
    if (layers[id]) {
        console.error(`Layer Error: ID ${id} already exists!`)
        return
    }
    layers[id] = object
    mapView.addLayer(object)
}

/**
 * Get a view layer from the Layer Set using an ID
 * @param {String} id
 * @returns {*} object from db
 */
function layerRead(id: string): any {
    return layers[id]
}

/**
 * Delete a layer with a given ID
 * @param {String} id
 */
function layerDelete(id: string) {
    if (layers[id]) {
        mapView.removeLayer(layers[id])
        delete layers[id]
    }
}

/**
 * Delete all layers
 */
function layerDeleteAll() {
    for (const id in layers) {
        mapView.removeLayer(layers[id])
        delete layers[id]
    }
}

/**
 * Return an object of id to layers
 * @returns {Object}
 */
function layerReadAll(): object {
    return layers
}

/**
 * =========
 * Utilities
 * =========
 */

/**
 * Get the user's location from browser or cache
 * @param {boolean} force set to true to skip location cache
 * @returns {Promise} resolves with a GeolocationPositionIsh
 */
function getLocation(force?: boolean): Promise<any> {
    // If location is not yet tracked, turn on BG tracking + force refresh
    if (!(currentPositionEnabled)) {
        currentPositionUpdate();
        force = true;
    }
    return new Promise((resolve, reject) => {
        const position = currentPositionRead();
        if (position && !(force)) {
            resolve(position);
        } else if (!navigator.geolocation) {
            // Create a custom position error
            let e = new PositionError("Geolocation is not supported by this browser.", 2);
            reject(e);
        } else {
            const options = { maximumAge: 5000, timeout: 5000, enableHighAccuracy: true }
            navigator.geolocation.getCurrentPosition(resolve, reject, options);
        }
    });
}

/**
 * Get the user's location and compare against a condition
 * The condition function will be called with the GeolocationPositionIsh, should
 * return True to accept the geolocation or False to reject the promise
 * @param {Function} condition
 * @returns {Promise} resolves with a GeolocationPositionIsh-ish
 */
function getLocationIf(condition: Function): Promise<any> {
    return getLocation().then((position) => {
        if (condition(position)) {
            return position;
        } else {
            throw new Error("Failed conditional test");
        }
    });
}

/**
 * Ask the user to click the map to set a location
 * For example, if the user is way out of bounds
 * @returns {Promise<GeolocationPositionIsh>} the click location as a promise
 */
function getClickLocation(): Promise<GeolocationPositionIsh> {
    return new Promise((resolve) => {
        const error = new PositionError("Click the map to set location", 0);
        showError(error, -1);
        mapView.on('click', (e) => {
            const clickPosition = {
                coords: {
                    latitude: e.latlng.lat,
                    longitude: e.latlng.lng,
                }
            }
            hideError();
            resolve(clickPosition);
        });
    });
}

/**
 * Get either the user's location in a given bound or ask them to click
 * @param {turf.FeatureCollection} bound
 * @returns {Promise} resolves with a GeolocationPositionIsh-ish
 */
function getLocationWithin(bound: turf.FeatureCollection): Promise<GeolocationPositionIsh> {
    return getLocationIf((position) => {
        const point = turf.point([position.coords.longitude, position.coords.latitude])
        return turf.booleanWithin(point, bound)
    }).catch(getClickLocation);
}

/**
 * Get either the user's location in the map or ask them to click
 * Only useful because polygonizing the map for turf is a pain
 * @returns {Promise} resolves with a GeolocationPositionIsh-ish
 */
function getLocationOnMap(): Promise<GeolocationPositionIsh> {
    return getLocationIf((position) => {
        const userLatLng = L.latLng(position.coords.latitude, position.coords.longitude);
        return mapView.getBounds().contains(userLatLng)
    }).catch(getClickLocation);
}

/**
 * Shortcut to get current position from cache
 * @param {number} maximumAge the maximum length of time since update to accept
 * @returns {GeolocationPosition}
 */
function currentPositionRead(maximumAge = 5000): GeolocationPosition {
    // Expire current position if beyond timeout (5s)
    if ((currentPosition?.timestamp < (Date.now() - maximumAge))
        || (currentPosition?.coords.accuracy > 10)) {
        return undefined;
    }
    return currentPosition;
}

/**
 * Shortcut to get current position from cache as a Coordinate
 * @param {number} maximumAge the maximum length of time since update to accept
 * @returns {Coordinate}
 */
function currentCoordRead(maximumAge = 5000): Coordinate {
    const pos = currentPositionRead(maximumAge);
    if (!pos) return undefined;
    return { x: pos.coords.longitude, y: pos.coords.latitude, crs: "EPSG:4326" };
}

/**
 * =======================
 * Views/Output formatting
 * =======================
 */

/**
 * Initialize the leaflet map and satellite baselayer
 */
function mapViewCreate(mapid) {
    if (mapView) return; // Skip initialized map already
    const mapContainer = document.getElementById(mapid);

    // Calculate 80% of the available vertical space
    const availableHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
    const mapHeight = 0.8 * availableHeight;

    // Set the height of the container element
    mapContainer.style.height = mapHeight + 'px';

    // Initialize the Leaflet map
    let gmapsKey = cache.get("googleMapsAPIKey");
    if (!gmapsKey && typeof (gmapsKey) != "string") {
        gmapsKey = prompt("Enter a Google Maps API key to initialize the map:")
        cache.set("googleMapsAPIKey", gmapsKey);
    }

    const loader = new Loader({
        apiKey: gmapsKey,
        version: "weekly",
    });
    loader.importLibrary("maps");
    mapView = L.map(mapid, {
        attributionControl: false
    }).setView([36.567383, -121.947729], 18);
    L.gridLayer.googleMutant({
        type: "satellite",
        maxZoom: 24,
        attribution: "",
    }).addTo(mapView);
    enableSmoothZoom(mapView, 1.5);
    addTooltipDecluttering(mapView, 85);
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

function mapRecenterBbox(bbox, flyoptions = { animate: true, duration: 0.33 }) {
    mapView.flyToBounds(bbox, flyoptions);
}

function mapRecenterCourse(flyoptions = { animate: true, duration: 0.33 }) {
    const bbox = grids.getGolfCourseBbox(roundCourseParams(round));
    if (!bbox) return;
    console.debug("Recentering on course");
    mapRecenterBbox(bbox);
}

function mapRecenterHole(flyoptions = { animate: true, duration: 0.33 }) {
    let bbox = grids.getGolfHoleBbox(roundCourseParams(round), currentHole.index);
    if (bbox) {
        console.debug("Recentering on current hole");
        mapRecenterBbox(bbox)
    } else if (currentHole.pin) {
        console.debug("Recentering on current pin");
        mapView.flyTo([currentHole.pin.y, currentHole.pin.x], 18, flyoptions);
    }
}

function mapRecenterCurrentPosition(flyoptions = { animate: true, duration: 0.33 }) {
    if (!currentPositionEnabled || !currentPosition) return
    console.debug("Recentering on current position");
    mapView.flyTo([currentPosition.coords.latitude, currentPosition.coords.longitude], 20, flyoptions);
}

/**
 * Render the set of markers/layers for a given hole
 * @param {Hole} hole the hole object from round
 */
function holeViewCreate(hole: Hole) {
    console.debug(`Rendering layers for hole i${hole.index}`)
    hole.strokes.forEach(function (stroke) {
        strokeMarkerCreate(stroke);
    });
    if (hole.pin) {
        pinMarkerCreate(hole);
    }
    strokelineCreate(hole);
    holeLineCreate(hole);
}

/**
 * Delete all hole specific view layers
 */
function holeViewDelete() {
    strokeMarkerDeactivate();
    const allLayers = layerReadAll();
    for (let id in allLayers) {
        if (id.includes("hole_") || id.includes("active_")) {
            layerDelete(id);
        }
    }
}

/**
 * Set up a marker on the map which tracks current user position and caches location
 */
function currentPositionUpdate() {
    currentPositionEnabled = true;
    navigator.geolocation.watchPosition((position) => {
        const markerID = "currentPosition";
        currentPosition = position;
        let latlong: L.LatLngExpression = [position.coords.latitude, position.coords.longitude];
        let currentPositionMarker = layerRead(markerID)
        if (currentPositionMarker) {
            // If the marker already exists, just update its position
            currentPositionMarker.setLatLng(latlong);
            currentPositionMarker.getPopup().update();
        } else {
            // Create a new marker and add it to the map
            currentPositionMarker = L.circleMarker(
                latlong,
                { radius: 10, fillColor: "#4A89F3", color: "#FFF", weight: 1, opacity: 0.8, fillOpacity: 0.8 }
            );
            currentPositionMarker.bindPopup(positionMarkerPopupText)
            layerCreate(markerID, currentPositionMarker);
        }

        // Update live distance box
        upperMapControlsUpdate();
    }, showPositionError, {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 1000
    });
}

function positionMarkerPopupText(layer: L.Marker) {
    if (!currentHole) return "";
    const latlng = layer.getLatLng();
    const coord = { x: latlng["lng"], y: latlng["lat"], crs: "EPSG:4236" }
    const dOpt = { to_unit: displayUnits, include_unit: true }
    const dist = formatDistance(getDistance(coord, currentHole.pin), dOpt);
    return `${dist} to pin`;
}

/**
 * View components
 */

interface AppMenuItem { href: string, icon: VNode, text: string }
function AppMenuItem(props: AppMenuItem) {
    return <a href={props.href}><span className="menuIcon">{props.icon}</span>{props.text}</a>
}

function AppMenuNewLink() {
    const href = "new.html";
    const icon = <svg xmlns="http://www.w3.org/2000/svg" height="16" width="12" viewBox="0 0 384 512"><path d="M384 192c0 66.8-34.1 125.6-85.8 160H85.8C34.1 317.6 0 258.8 0 192C0 86 86 0 192 0S384 86 384 192zM242.1 256.6c0 18.5-15 33.5-33.5 33.5c-4.9 0-9.1 5.1-5.4 8.4c5.9 5.2 13.7 8.4 22.1 8.4c18.5 0 33.5-15 33.5-33.5c0-8.5-3.2-16.2-8.4-22.1c-3.3-3.7-8.4 .5-8.4 5.4zm-52.3-49.3c-4.9 0-9.1 5.1-5.4 8.4c5.9 5.2 13.7 8.4 22.1 8.4c18.5 0 33.5-15 33.5-33.5c0-8.5-3.2-16.2-8.4-22.1c-3.3-3.7-8.4 .5-8.4 5.4c0 18.5-15 33.5-33.5 33.5zm113.5-17.5c0 18.5-15 33.5-33.5 33.5c-4.9 0-9.1 5.1-5.4 8.4c5.9 5.2 13.7 8.4 22.1 8.4c18.5 0 33.5-15 33.5-33.5c0-8.5-3.2-16.2-8.4-22.1c-3.3-3.7-8.4 .5-8.4 5.4zM96 416c0-17.7 14.3-32 32-32h64 64c17.7 0 32 14.3 32 32s-14.3 32-32 32H240c-8.8 0-16 7.2-16 16v16c0 17.7-14.3 32-32 32s-32-14.3-32-32V464c0-8.8-7.2-16-16-16H128c-17.7 0-32-14.3-32-32z" /></svg>
    const text = "New round"
    return <AppMenuItem href={href} text={text} icon={icon} />
}

function AppMenuStatsLink() {
    const href = "stats.html";
    const icon = <svg xmlns="http://www.w3.org/2000/svg" height="16" width="16" viewBox="0 0 512 512"><path d="M64 64c0-17.7-14.3-32-32-32S0 46.3 0 64V400c0 44.2 35.8 80 80 80H480c17.7 0 32-14.3 32-32s-14.3-32-32-32H80c-8.8 0-16-7.2-16-16V64zm406.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L320 210.7l-57.4-57.4c-12.5-12.5-32.8-12.5-45.3 0l-112 112c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L240 221.3l57.4 57.4c12.5 12.5 32.8 12.5 45.3 0l128-128z" /></svg>
    const text = "Stats"
    return <AppMenuItem href={href} text={text} icon={icon} />
}

function AppMenuSettingsLink() {
    const href = "settings.html";
    const icon = <svg xmlns="http://www.w3.org/2000/svg" height="16" width="16" viewBox="0 0 512 512"><path d="M495.9 166.6c3.2 8.7 .5 18.4-6.4 24.6l-43.3 39.4c1.1 8.3 1.7 16.8 1.7 25.4s-.6 17.1-1.7 25.4l43.3 39.4c6.9 6.2 9.6 15.9 6.4 24.6c-4.4 11.9-9.7 23.3-15.8 34.3l-4.7 8.1c-6.6 11-14 21.4-22.1 31.2c-5.9 7.2-15.7 9.6-24.5 6.8l-55.7-17.7c-13.4 10.3-28.2 18.9-44 25.4l-12.5 57.1c-2 9.1-9 16.3-18.2 17.8c-13.8 2.3-28 3.5-42.5 3.5s-28.7-1.2-42.5-3.5c-9.2-1.5-16.2-8.7-18.2-17.8l-12.5-57.1c-15.8-6.5-30.6-15.1-44-25.4L83.1 425.9c-8.8 2.8-18.6 .3-24.5-6.8c-8.1-9.8-15.5-20.2-22.1-31.2l-4.7-8.1c-6.1-11-11.4-22.4-15.8-34.3c-3.2-8.7-.5-18.4 6.4-24.6l43.3-39.4C64.6 273.1 64 264.6 64 256s.6-17.1 1.7-25.4L22.4 191.2c-6.9-6.2-9.6-15.9-6.4-24.6c4.4-11.9 9.7-23.3 15.8-34.3l4.7-8.1c6.6-11 14-21.4 22.1-31.2c5.9-7.2 15.7-9.6 24.5-6.8l55.7 17.7c13.4-10.3 28.2-18.9 44-25.4l12.5-57.1c2-9.1 9-16.3 18.2-17.8C227.3 1.2 241.5 0 256 0s28.7 1.2 42.5 3.5c9.2 1.5 16.2 8.7 18.2 17.8l12.5 57.1c15.8 6.5 30.6 15.1 44 25.4l55.7-17.7c8.8-2.8 18.6-.3 24.5 6.8c8.1 9.8 15.5 20.2 22.1 31.2l4.7 8.1c6.1 11 11.4 22.4 15.8 34.3zM256 336a80 80 0 1 0 0-160 80 80 0 1 0 0 160z" /></svg>
    const text = "Settings"
    return <AppMenuItem href={href} text={text} icon={icon} />
}

function AppMenu() {
    return <div className="appMenu">
        <AppMenuNewLink />
        <AppMenuStatsLink />
        <AppMenuSettingsLink />
    </div>
}

function MenuButton() {
    const [menuVisible, setMenuVisible] = useState(false);

    const toggleMenu = () => {
        setMenuVisible(!menuVisible);
    };

    return (<div className="menuButton">
        <button id="menuButton" className="mapButton" onClick={toggleMenu}>
            <svg height="1.25em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 18L20 18" stroke="#000000" strokeWidth="2" strokeLinecap="round" />
                <path d="M4 12L20 12" stroke="#000000" strokeWidth="2" strokeLinecap="round" />
                <path d="M4 6L20 6" stroke="#000000" strokeWidth="2" strokeLinecap="round" />
            </svg>
        </button>
        {menuVisible && <AppMenu />}
    </div>);
}

function MapRecenterButton() {
    const onClick = () => mapRecenter();
    return (<button id="recenter" className="mapButton" onClick={onClick}>
        <svg xmlns="http://www.w3.org/2000/svg" height="1.25em" viewBox="0 0 448 512"><path d="M429.6 92.1c4.9-11.9 2.1-25.6-7-34.7s-22.8-11.9-34.7-7l-352 144c-14.2 5.8-22.2 20.8-19.3 35.8s16.1 25.8 31.4 25.8H224V432c0 15.3 10.8 28.4 25.8 31.4s30-5.1 35.8-19.3l144-352z" />
        </svg>
    </button>);
}

function StrokeAddButton() {
    const handleStrokeAddClick = () => {
        clubStrokeViewToggle();
        strokeMarkerDeactivate();
    }
    return (<button id="strokeAdd" className="success mapButton" onClick={handleStrokeAddClick}>
        <svg xmlns="http://www.w3.org/2000/svg" height="1.25em" viewBox="0 0 448 512">
            <path d="M256 80c0-17.7-14.3-32-32-32s-32 14.3-32 32V224H48c-17.7 0-32 14.3-32 32s14.3 32 32 32H192V432c0 17.7 14.3 32 32 32s32-14.3 32-32V288H400c17.7 0 32-14.3 32-32s-14.3-32-32-32H256V80z" />
        </svg>
    </button>);
}

function StrokeAimResetButton() {
    const classes = ["mapButton", activeStroke ? "" : "inactive"];
    const onClick = () => {
        strokeAimReset(activeStroke);
        rerender("full");
    }
    return (<button id="strokeAimReset" className={classes.join(' ')} onClick={onClick}>
        <svg xmlns="http://www.w3.org/2000/svg" height="1.25em" viewBox="0 0 512 512">
            <path d="M48 24C48 10.7 37.3 0 24 0S0 10.7 0 24V64 350.5 400v88c0 13.3 10.7 24 24 24s24-10.7 24-24V388l80.3-20.1c41.1-10.3 84.6-5.5 122.5 13.4c44.2 22.1 95.5 24.8 141.7 7.4l34.7-13c12.5-4.7 20.8-16.6 20.8-30V66.1c0-23-24.2-38-44.8-27.7l-9.6 4.8c-46.3 23.2-100.8 23.2-147.1 0c-35.1-17.6-75.4-22-113.5-12.5L48 52V24zm0 77.5l96.6-24.2c27-6.7 55.5-3.6 80.4 8.8c54.9 27.4 118.7 29.7 175 6.8V334.7l-24.4 9.1c-33.7 12.6-71.2 10.7-103.4-5.4c-48.2-24.1-103.3-30.1-155.6-17.1L48 338.5v-237z" />
        </svg>
    </button>);
}

function DistanceTracker(props: { location: Coordinate, name: string }) {
    const active = currentHole?.pin && currentPositionRead();
    if (!active) return;
    const opt = { to_unit: displayUnits, include_unit: true };
    const pos = currentCoordRead();
    const dist = formatDistanceAsNumber(getDistance(pos, props.location), opt);
    if (dist > 650) return
    const id = `distanceTo${props.name}Container`;
    return (<div id={id} className="mapInfoBox">
        <span>{props.name}</span>
        <div id="distanceToPin">
            {dist}
        </div>
    </div>);
}

function PinDistanceTracker() {
    const pinCoord = currentHole?.pin;
    const name = "Pin"
    return <DistanceTracker location={pinCoord} name={name} />
}

function MapControlsUpperRight() {
    return <div id="mapControlsUpperRight" className="mapControlsContainer">
        <MenuButton />
        <PinDistanceTracker />
    </div>
}

function MapControlsRight() {
    return (<div className="mapControlsContainer" id="mapControlsRight">
        <MapRecenterButton />
        <StrokeAddButton />
    </div>)
}

function MapControlsLeft() {
    return (<div className="mapControlsContainer" id="mapControlsLeft">
        <StrokeAimResetButton />
    </div>)
}

function MapControlsLower() {
    return (<div id="mapControlsWrapper">
        <MapControlsRight />
        <MapControlsLeft />
    </div>);
}

function MapControlsUpper() {
    return <MapControlsUpperRight />
}

function HoleInfo(props: { hole: Hole, round: Round }) {
    const round = props.round;
    const hole = props.hole;
    let stats = [];
    if (hole) {
        stats.push(`${currentHole.strokes.length} Strokes`);
        if (hole.par) stats.push(`Par ${currentHole.par}`);
        if (hole.handicap) stats.push(`Hcp ${currentHole.handicap}`);
    } else {
        stats.push(round.course);
    }
    let text = stats.join(' | ');
    return <div id="holeStats"> | {text}</div>
}

/**
 * Update a given select element with current hole options
 * @param {number} props.currentHoleIndex
 * @param {Hole[]} props.holes
 */
function HoleSelector(props: { currentHoleIndex: number, holes: Hole[] }) {
    const handleSelect = (e) => holeSelect(parseInt(e.target.value));
    const value = Number.isFinite(props.currentHoleIndex) ? props.currentHoleIndex : -1;
    const selector = (<select id="holeSelector" value={value} onInput={handleSelect}>
        <option value="-1">Overview</option>
        {props.holes.map((hole) => <option value={hole.index} key={hole.id}>{`Hole ${hole.index + 1}`}</option>)}
    </select>);
    return selector;
}

function HoleChangeControl() {
    const holeDec = () => handleHoleIncrement(-1);
    const holeInc = () => handleHoleIncrement(1);
    const element = <span className="holeControls">
        <a href="#" id="holeSelectBack" className="holeSelectNudge" onClick={holeDec}>&lt;</a>
        <HoleSelector currentHoleIndex={currentHole?.index} holes={round.holes} />
        <a href="#" id="holeSelectNext" className="holeSelectNudge" onClick={holeInc}>&gt;</a>
    </span>
    return element
}

function HoleControls(props: { hole: Hole, round: Round }) {
    const id = "holeControlsContainer"
    return <div className="buttonRow" id={id}>
        <HoleChangeControl />
        <HoleInfo hole={props.hole} round={props.round} />
    </div>
}

/**
 * Create a list item for the Stroke Stats list
 * @param {Stroke} props.stroke
 * @returns {HTMLElement} the li element for the list
 */
function StrokeStatsListItem(props: { stroke: Stroke }) {
    const stroke = props.stroke;
    const distOptions = { to_unit: displayUnits, precision: 1, include_unit: true }
    const distance = formatDistance(strokeDistance(stroke), distOptions);
    const selectedClass = 'strokeStatsListItemSelected';
    const clickHandler = () => {
        if (activeStroke == stroke) {
            strokeMarkerDeactivate();
        } else {
            strokeMarkerActivate(layerRead(strokeMarkerID(stroke)));
        }
    };
    let classes = ["strokeStatsListItem", "listCell"];
    if (activeStroke && activeStroke == stroke) classes.push(selectedClass);
    const item = (<li key={stroke.id}><div className={classes.join(' ')} id={stroke.id} onClick={clickHandler}>
        <div className="strokeDetails">
            {`${stroke.index + 1}.  ${stroke.club} (${distance})`} | &#xb1;
            <DispersionLink stroke={stroke} distOptions={distOptions} />
        </div>
        <div className="strokeControls">
            <StrokeMoveButton stroke={stroke} offset={-1} />
            <StrokeMoveButton stroke={stroke} offset={1} />
            <StrokeDeleteButton stroke={stroke} />
        </div>
    </div></li>)

    return item;
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

function DispersionLink(props: { stroke: Stroke, distOptions?: formatDistanceOptions, id?: string }): VNode {
    const distOptions = props.distOptions || { to_unit: displayUnits, precision: 1, include_unit: true };
    const formattedDistance = formatDistance(props.stroke.dispersion, distOptions);
    const clickHandler = (e) => {
        strokeDistancePrompt(props.stroke);
        e.stopPropagation();
    }
    return (<a href="#" onClick={clickHandler} id={props.id}>{formattedDistance}</a>);
}

function strokeDistancePrompt(stroke: Stroke) {
    let disp = prompt("Enter a dispersion:");
    if (disp === null || disp === "") return;
    if (!Number.isFinite(parseFloat(disp))) return showError("Invalid dispersion");
    const dispersion = convertAndSetStrokeDispersion(stroke, disp);
    rerender("full");
    return dispersion;
}

function classedDiv(newClass: string, props) {
    const classes = [newClass, props.className].join(' ');
    const newProps = { ...props, className: classes }
    return h('div', newProps);
}

function ControlCard(props) {
    return classedDiv("card", props);
}

function ControlCardHeader(props) {
    return classedDiv("cardTitle", props);
}
function ControlCardValue(props) {
    let length = 3;
    let wordLength = 3;
    if (typeof props.children === 'string') {
        length = props.children.length;
        wordLength = longestWord(props.children);
    }

    let lengthClass;
    if (length < 4) {
        lengthClass = "";
    } else if (wordLength < 8 && length < 12) {
        lengthClass = "cardValueMed";
    } else {
        lengthClass = "cardValueLong"
    }
    const classes = ["cardValue", lengthClass, props.className].join(' ');
    const newProps = { ...props, className: classes };
    return <div className="cardValueOuter">{h('div', newProps)}</div>;
}
function ControlCardFooter(props) {
    return classedDiv("cardFooter", props);
}

function longestWord(text: string) {
    const matches: string[] = text.match(/\S+/g) || [];
    let longest: string = "";
    if (matches.length > 0) {
        longest = matches.reduce((a, b) => a.length > b.length ? a : b);
    }
    return longest.length;
}

function ClubMenuOption(props: { club: Club, callback?: (club: Club, e: Event) => void }) {
    if (!props.club) return;
    const onClick = (e) => (props.callback && props.callback(props.club, e));
    return <ControlCard className={`clubOption clickable club-${props.club?.name.toLocaleLowerCase()}`} onClick={onClick} >
        <input type="hidden" value={props.club?.dispersion}></input>
        <ControlCardHeader></ControlCardHeader>
        <ControlCardValue>{props.club?.name}</ControlCardValue>
        <ControlCardFooter></ControlCardFooter>
    </ControlCard>
}

function ClubMenu(props: { clubs?: Club[], callback?: (club: Club, e: Event) => void }) {
    const clubs = props.clubs || getUsableClubs();
    return <div className="takeover">
        <div className="clubMenu takeoverMenu cardContainer">
            {clubs.map((club) => <ClubMenuOption club={club} callback={props.callback} />)}
        </div>
    </div>
}

function ClubControl(props: { stroke: Stroke }) {
    const [menuVisible, setMenuVisible] = useState(false);
    const toggleMenu = () => setMenuVisible(!menuVisible);
    const onClick = () => toggleMenu();
    const clubClick = (club: Club, e) => {
        const loadStroke = round.holes[props.stroke.holeIndex].strokes[props.stroke.index];
        if (!loadStroke) return;
        loadStroke.club = club.name;
        touch(loadStroke);
        saveData();
    }
    return <ControlCard className="clubControlCard clickable" onClick={onClick}>
        <ControlCardHeader>Club</ControlCardHeader>
        <ControlCardValue>{props.stroke?.club}</ControlCardValue>
        <ControlCardFooter></ControlCardFooter>
        {menuVisible && <ClubMenu callback={clubClick} />}
    </ControlCard>
}

function GridTypeControl() {
    const activeGrid = layerRead('active_grid'); // TODO: replace with a prop/context pass
    const activeType = activeGrid?.options.grid.properties.type;
    const onClick = () => {
        gridDelete();
        const types = Object.values(grids.gridTypes)
        const newType = types[types.indexOf(activeType) + 1];
        gridCreate(newType);
        strokeMarkerAimUpdate();
        rerender('controls');
    }
    return <ControlCard className="gridTypeControlCard clickable" onClick={onClick}>
        <ControlCardHeader>Grid</ControlCardHeader>
        <ControlCardValue>{activeType}</ControlCardValue>
        <ControlCardFooter></ControlCardFooter>
    </ControlCard>
}

function DispersionControl(props: { stroke: Stroke, distOptions?: formatDistanceOptions }) {
    if (!props.stroke) return;
    const onClick = () => strokeDistancePrompt(props.stroke);
    const distOptions = props.distOptions || { to_unit: displayUnits, precision: 1, include_unit: false };
    const formattedDistance = formatDistance(props.stroke?.dispersion, distOptions);
    return <ControlCard className="dispersionControlCard clickable" onClick={onClick}>
        <ControlCardHeader>Dispersion</ControlCardHeader>
        <ControlCardValue>{formattedDistance}</ControlCardValue>
        <ControlCardFooter>{distOptions.to_unit}</ControlCardFooter>
    </ControlCard>
}

const terrainIcons = {
    'green': <svg xmlns="http://www.w3.org/2000/svg" height="32" width="28" viewBox="0 0 448 512"><path d="M48 24C48 10.7 37.3 0 24 0S0 10.7 0 24V64 350.5 400v88c0 13.3 10.7 24 24 24s24-10.7 24-24V388l80.3-20.1c41.1-10.3 84.6-5.5 122.5 13.4c44.2 22.1 95.5 24.8 141.7 7.4l34.7-13c12.5-4.7 20.8-16.6 20.8-30V66.1c0-23-24.2-38-44.8-27.7l-9.6 4.8c-46.3 23.2-100.8 23.2-147.1 0c-35.1-17.6-75.4-22-113.5-12.5L48 52V24zm0 77.5l96.6-24.2c27-6.7 55.5-3.6 80.4 8.8c54.9 27.4 118.7 29.7 175 6.8V334.7l-24.4 9.1c-33.7 12.6-71.2 10.7-103.4-5.4c-48.2-24.1-103.3-30.1-155.6-17.1L48 338.5v-237z" /></svg>,
    'fairway': <svg xmlns="http://www.w3.org/2000/svg" height="32" width="36" viewBox="0 0 576 512"><path d="m 306.5 357.9 c 22.5 15.5 50 26.1 77.5 26.1 c 26.9 0 55.4 -10.8 77.4 -26.1 l 0 0 c 11.9 -8.5 28.1 -7.8 39.2 1.7 c 14.4 11.9 32.5 21 50.6 25.2 c 17.2 4 27.9 21.2 23.9 38.4 s -21.2 27.9 -38.4 23.9 c -24.5 -5.7 -44.9 -16.5 -58.2 -25 c -29 15.6 -61.5 25.9 -94.5 25.9 c -31.9 0 -60.6 -9.9 -80.4 -18.9 c -5.8 -2.7 -11.1 -5.3 -15.6 -7.7 c -4.5 2.4 -9.7 5.1 -15.6 7.7 c -19.8 9 -48.5 18.9 -80.4 18.9 c -33 0 -65.5 -10.3 -94.5 -25.8 c -13.4 8.4 -33.7 19.3 -58.2 25 c -17.2 4 -34.4 -6.7 -38.4 -23.9 s 6.7 -34.4 23.9 -38.4 c 18.1 -4.2 36.2 -13.3 50.6 -25.2 c 11.1 -9.4 27.3 -10.1 39.2 -1.7 l 0 0 c 22.1 15.2 50.5 26 77.4 26 c 27.5 0 55 -10.6 77.5 -26.1 c 11.1 -7.9 25.9 -7.9 37 0 z" /></svg>,
    'rough': <svg xmlns="http://www.w3.org/2000/svg" height="32" width="32" viewBox="0 0 512 512"><path d="m 44.73 208.17 c 15.93 0 28.8 -12.87 28.8 -28.8 l 0 -28.8 c 0 -15.93 12.87 -28.8 28.8 -28.8 s 28.8 12.87 28.8 28.8 l -0 288 c 0 15.93 12.87 28.8 28.8 28.8 s 28.8 -12.87 28.8 -28.8 l 0 -288 c 0 -47.7 -38.7 -86.4 -86.4 -86.4 s -86.4 38.7 -86.4 86.4 l 0 28.8 c 0 15.93 12.87 28.8 28.8 28.8 z m 316.8 -57.6 c 15.93 0 28.8 -12.87 28.8 -28.8 l 0 -28.8 c 0 -47.7 -38.7 -86.4 -86.4 -86.4 s -86.4 38.7 -86.4 86.4 l -0 345.6 c 0 15.93 12.87 28.8 28.8 28.8 s 28.8 -12.87 28.8 -28.8 l 0 -345.6 c 0 -15.93 12.87 -28.8 28.8 -28.8 s 28.8 12.87 28.8 28.8 l 0 28.8 c 0 15.93 12.87 28.8 28.8 28.8 z m 115.2 201.6 l 0 -28.8 c 0 -47.7 -38.7 -86.4 -86.4 -86.4 s -86.4 38.7 -86.4 86.4 l -0 115.2 c 0 15.93 12.87 28.8 28.8 28.8 s 28.8 -12.87 28.8 -28.8 l 0 -115.2 c 0 -15.93 12.87 -28.8 28.8 -28.8 s 28.8 12.87 28.8 28.8 l 0 28.8 c 0 15.93 12.87 28.8 28.8 28.8 s 28.8 -12.87 28.8 -28.8 z" /></svg>,
    'bunker': <svg xmlns="http://www.w3.org/2000/svg" height="32" width="36" viewBox="0 0 576 512"><path d="M346.3 271.8l-60.1-21.9L214 448H32c-17.7 0-32 14.3-32 32s14.3 32 32 32H544c17.7 0 32-14.3 32-32s-14.3-32-32-32H282.1l64.1-176.2zm121.1-.2l-3.3 9.1 67.7 24.6c18.1 6.6 38-4.2 39.6-23.4c6.5-78.5-23.9-155.5-80.8-208.5c2 8 3.2 16.3 3.4 24.8l.2 6c1.8 57-7.3 113.8-26.8 167.4zM462 99.1c-1.1-34.4-22.5-64.8-54.4-77.4c-.9-.4-1.9-.7-2.8-1.1c-33-11.7-69.8-2.4-93.1 23.8l-4 4.5C272.4 88.3 245 134.2 226.8 184l-3.3 9.1L434 269.7l3.3-9.1c18.1-49.8 26.6-102.5 24.9-155.5l-.2-6zM107.2 112.9c-11.1 15.7-2.8 36.8 15.3 43.4l71 25.8 3.3-9.1c19.5-53.6 49.1-103 87.1-145.5l4-4.5c6.2-6.9 13.1-13 20.5-18.2c-79.6 2.5-154.7 42.2-201.2 108z" /></svg>,
    'recovery': <svg xmlns="http://www.w3.org/2000/svg" height="32" width="32" viewBox="0 0 512 512"><path d="M254.4 6.6c3.5-4.3 9-6.5 14.5-5.7C315.8 7.2 352 47.4 352 96c0 11.2-1.9 22-5.5 32H352c35.3 0 64 28.7 64 64c0 19.1-8.4 36.3-21.7 48H408c39.8 0 72 32.2 72 72c0 23.2-11 43.8-28 57c34.1 5.7 60 35.3 60 71c0 39.8-32.2 72-72 72H72c-39.8 0-72-32.2-72-72c0-35.7 25.9-65.3 60-71c-17-13.2-28-33.8-28-57c0-39.8 32.2-72 72-72h13.7C104.4 228.3 96 211.1 96 192c0-35.3 28.7-64 64-64h16.2c44.1-.1 79.8-35.9 79.8-80c0-9.2-1.5-17.9-4.3-26.1c-1.8-5.2-.8-11.1 2.8-15.4z" /></svg>,
    'tee': <svg xmlns="http://www.w3.org/2000/svg" height="32" width="24" viewBox="0 0 384 512"><path d="M384 192c0 66.8-34.1 125.6-85.8 160H85.8C34.1 317.6 0 258.8 0 192C0 86 86 0 192 0S384 86 384 192zM242.1 256.6c0 18.5-15 33.5-33.5 33.5c-4.9 0-9.1 5.1-5.4 8.4c5.9 5.2 13.7 8.4 22.1 8.4c18.5 0 33.5-15 33.5-33.5c0-8.5-3.2-16.2-8.4-22.1c-3.3-3.7-8.4 .5-8.4 5.4zm-52.3-49.3c-4.9 0-9.1 5.1-5.4 8.4c5.9 5.2 13.7 8.4 22.1 8.4c18.5 0 33.5-15 33.5-33.5c0-8.5-3.2-16.2-8.4-22.1c-3.3-3.7-8.4 .5-8.4 5.4c0 18.5-15 33.5-33.5 33.5zm113.5-17.5c0 18.5-15 33.5-33.5 33.5c-4.9 0-9.1 5.1-5.4 8.4c5.9 5.2 13.7 8.4 22.1 8.4c18.5 0 33.5-15 33.5-33.5c0-8.5-3.2-16.2-8.4-22.1c-3.3-3.7-8.4 .5-8.4 5.4zM96 416c0-17.7 14.3-32 32-32h64 64c17.7 0 32 14.3 32 32s-14.3 32-32 32H240c-8.8 0-16 7.2-16 16v16c0 17.7-14.3 32-32 32s-32-14.3-32-32V464c0-8.8-7.2-16-16-16H128c-17.7 0-32-14.3-32-32z" /></svg>,
    'penalty': <svg xmlns="http://www.w3.org/2000/svg" height="32" width="32" viewBox="0 0 512 512"><path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c-9.4 9.4-9.4 24.6 0 33.9l47 47-47 47c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l47-47 47 47c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-47-47 47-47c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-47 47-47-47c-9.4-9.4-24.6-9.4-33.9 0z" /></svg>,
    'out_of_bounds': <svg xmlns="http://www.w3.org/2000/svg" height="32" width="28" viewBox="0 0 448 512"><path d="M368 128c0 44.4-25.4 83.5-64 106.4V256c0 17.7-14.3 32-32 32H176c-17.7 0-32-14.3-32-32V234.4c-38.6-23-64-62.1-64-106.4C80 57.3 144.5 0 224 0s144 57.3 144 128zM168 176a32 32 0 1 0 0-64 32 32 0 1 0 0 64zm144-32a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zM3.4 273.7c7.9-15.8 27.1-22.2 42.9-14.3L224 348.2l177.7-88.8c15.8-7.9 35-1.5 42.9 14.3s1.5 35-14.3 42.9L295.6 384l134.8 67.4c15.8 7.9 22.2 27.1 14.3 42.9s-27.1 22.2-42.9 14.3L224 419.8 46.3 508.6c-15.8 7.9-35 1.5-42.9-14.3s-1.5-35 14.3-42.9L152.4 384 17.7 316.6C1.9 308.7-4.5 289.5 3.4 273.7z" /></svg>,
}
function TerrainOption(props: { stroke: Stroke, type: string }) {
    const onClick = (e) => {
        if (props.type == "" || props.type in SG_SPLINES) {
            const stroke = round.holes[props.stroke.holeIndex].strokes[props.stroke.index];
            stroke.terrain = props.type;
            touch(stroke);
            saveData();
        } else {
            showError(new PositionError("Terrain type not recognized", 4));
            console.error(`Terrain type not recognized, got ${props.type}`);
        }
        rerender("dragend");
    }
    const icon = terrainIcons[props.type];
    const formattedType = props.type.replaceAll("_", " ");
    return <ControlCard className={`terrainOption clickable ${props.type}`} onClick={onClick}>
        <input type="hidden" value={props.type}></input>
        <ControlCardHeader></ControlCardHeader>
        <ControlCardValue>{icon}</ControlCardValue>
        <ControlCardFooter>{formattedType}</ControlCardFooter>
    </ControlCard>
}

function TerrainMenu(props: { stroke: Stroke, types?: string[] }) {
    const types = props.types || Object.keys(SG_SPLINES).map((key) => key);
    return <div className="takeover">
        <div className="terrainMenu takeoverMenu cardContainer">
            {types.map((type) => <TerrainOption type={type} stroke={props.stroke} />)}
        </div>
    </div>
}

function TerrainControl(props: { stroke: Stroke }) {
    const [menuVisible, setMenuVisible] = useState(false);
    const toggleMenu = () => setMenuVisible(!menuVisible);
    const onClick = () => toggleMenu();
    const currentTerrain = props.stroke?.terrain
    const formattedTerrain = currentTerrain.replaceAll("_", " ");
    const icon = terrainIcons[currentTerrain];
    return <ControlCard className="dispersionControlCard clickable" onClick={onClick}>
        <ControlCardHeader>Terrain</ControlCardHeader>
        <ControlCardValue>{icon}</ControlCardValue>
        <ControlCardFooter>{formattedTerrain}</ControlCardFooter>
        {menuVisible && <TerrainMenu stroke={props.stroke} />}
    </ControlCard>
}

function AimStatsControls(props: { stroke: Stroke, round: Round }) {
    const activeGridLayer = layerRead('active_grid'); // TODO: replace with a prop/context pass
    const activeGrid = activeGridLayer.options.grid;
    const activeType = activeGrid?.properties.type;
    const active = activeType == grids.gridTypes.STROKES_GAINED;
    if (!activeGrid) return; // No grid to load
    const stroke = props.stroke;
    const round = props.round;
    const hole = round.holes[stroke.holeIndex];
    const wsg = activeGrid.properties.weightedStrokesGained;
    const sr = activeGrid.properties.strokesRemainingStart;
    const sa = hole.strokes.length - stroke.index - 1;
    let srn = 0;
    if (sa > 0) {
        const nextStroke = hole.strokes[stroke.index + 1];
        const nextStart = nextStroke.start;
        const nextDistance = getDistance(nextStroke.start, hole.pin);
        const nextTerrain = nextStroke.terrain || grids.getGolfTerrainAt(roundCourseParams(round), [nextStart.y, nextStart.x]);
        srn = grids.strokesRemaining(nextDistance, nextTerrain);
    }
    const sga = sr - srn - 1;
    const onClick = () => {
        if (active) return
        gridDelete();
        gridCreate(grids.gridTypes.STROKES_GAINED)
        strokeMarkerAimUpdate();
        rerender('controls');
    }

    const header = "SG: Aim"
    const value = wsg.toFixed(2);
    const footer = `${sga.toFixed(2)} SG`
    return <ControlCard className="aimStatsControlCard clickable" onClick={onClick}>
        <ControlCardHeader>{header}</ControlCardHeader>
        <ControlCardValue>{value}</ControlCardValue>
        <ControlCardFooter>{footer}</ControlCardFooter>
    </ControlCard>
}

function BestAimControl(props: { stroke: Stroke }) {
    const activeGridLayer = layerRead('active_grid'); // TODO: replace with a prop/context pass
    const activeGrid = activeGridLayer.options.grid;
    const activeType = activeGrid?.properties.type;
    const active = activeType == grids.gridTypes.TARGET;
    const onClick = () => {
        if (active) return
        gridDelete();
        gridCreate(grids.gridTypes.TARGET)
        strokeMarkerAimUpdate();
        rerender('controls');
    }
    let value = "-";
    let footer = "recalculate";
    if (active) {
        const sgi = activeGrid?.properties.idealStrokesGained;
        const wsg = activeGrid?.properties.weightedStrokesGained;
        const sgs = wsg - sgi;
        value = sgs.toFixed(2);
        footer = "vs best aim";
    }
    return <ControlCard className="gridTypeControlCard clickable" onClick={onClick}>
        <ControlCardHeader>SG: Ideal</ControlCardHeader>
        <ControlCardValue>{value}</ControlCardValue>
        <ControlCardFooter>{footer}</ControlCardFooter>
    </ControlCard>
}


function ActiveStrokeControls(props: { activeStroke: Stroke, round: Round }) {
    if (!props.activeStroke) return;
    return <div id="activeStrokeControls" className="buttonRow">
        <div className="cardContainer hoscro">
            <AimStatsControls stroke={props.activeStroke} round={props.round} />
            <BestAimControl stroke={props.activeStroke} />
            <TerrainControl stroke={props.activeStroke} />
            <ClubControl stroke={props.activeStroke} />
            <DispersionControl stroke={props.activeStroke} />
        </div>
    </div>
}

/**
 * Scorecard helpers
 */
interface ScorecardTDProps { hole: Hole }
function HoleTD(props: ScorecardTDProps) {
    const hole = props.hole;
    return <td key={[hole.id, "Hole"].join()}>{(hole.index + 1)}</td>
}

function HdcpTD(props: ScorecardTDProps) {
    const hole = props.hole;
    return <td key={[hole.id, "Hdcp"].join()}>{hole.handicap || ""}</td>
}

function ParTD(props: ScorecardTDProps) {
    const hole = props.hole;
    return <td key={[hole.id, "Par"].join()}>{hole.par || ""}</td>
}

function ScoreTD(props: ScorecardTDProps) {
    const hole = props.hole;
    const strokes = hole.strokes.length;
    if (!hole.par) {
        return <td key={[hole.id, "Score"].join()}>{strokes}</td>
    } else {
        const par = hole.par || 0;
        const relative = strokes - par;
        const text = `${hole.strokes.length} (${relative >= 0 ? "+" : ""}${relative})`;
        return <td key={[hole.id, "Score"].join()} className={scoreClass(relative)}>{text}</td>
    }
}

function ScorecardRow(props: { hole: Hole, holeCol?: boolean, hdcpCol?: boolean, parCol?: boolean, scoreCol?: boolean }) {
    const opts = {
        holeCol: props.holeCol ?? true,
        hdcpCol: props.hdcpCol ?? true,
        parCol: props.parCol ?? true,
        scoreCol: props.scoreCol ?? true,
    };
    const hole = props.hole;
    const key = ['row', hole.id].join();
    return (<tr key={key} onClick={() => holeSelect(hole.index)}>
        {opts.holeCol && <HoleTD hole={hole} />}
        {opts.parCol && <ParTD hole={hole} />}
        {opts.hdcpCol && <HdcpTD hole={hole} />}
        {opts.scoreCol && <ScoreTD hole={hole} />}
    </tr>);
}

function HoleTotalTD() {
    return <td key="hole-total">Total</td>;
}
function HdcpTotalTD() {
    return <td key="hdcp-total"></td>;
}
function ParTotalTD(props: { round: Round }) {
    const round = props.round;
    return <td key="par-total">{round.holes.reduce((acc, hole) => acc + hole.par, 0)}</td>
}
function ScoreTotalTD(props: { round: Round }) {
    const round = props.round;
    const strokes = round.holes.reduce((acc, hole) => acc + hole.strokes.length, 0);
    if (round.holes[0].par) {
        const par = round.holes.reduce((acc, hole) => acc + hole.par, 0);
        const relative = strokes - par;
        const text = `${strokes} (${relative >= 0 ? "+" : ""}${relative})`;
        return <td key="score-total" className={scoreClass(relative)}>{text}</td>;
    } else {
        return <td key="score-total">{strokes}</td>;
    }
}

function ScorecardTotalRow(props: { round: Round, holeCol?: boolean, hdcpCol?: boolean, parCol?: boolean, scoreCol?: boolean }) {
    const opts = {
        holeCol: props.holeCol ?? true,
        hdcpCol: props.hdcpCol ?? true,
        parCol: props.parCol ?? true,
        scoreCol: props.scoreCol ?? true,
    };
    return <tr className="totals">
        {opts.holeCol && <HoleTotalTD />}
        {opts.parCol && <ParTotalTD round={props.round} />}
        {opts.hdcpCol && <HdcpTotalTD />}
        {opts.scoreCol && <ScoreTotalTD round={props.round} />}
    </tr>
}

/**
 * Create a scorecard as table
 */
function Scorecard(props: { round: Round }) {
    const scoringRound = props.round;
    if (currentHole) return;
    const holeCol = true;
    const hdcpCol = !!props.round?.holes[0].handicap;
    const parCol = !!props.round?.holes[0].par
    const scoreCol = true;

    return (<table className="scorecard">
        <thead><tr>
            {holeCol && <td>Hole</td>}
            {hdcpCol && <td>Hdcp</td>}
            {parCol && <td>Par</td>}
            {scoreCol && <td>Score</td>}
        </tr></thead>
        <tbody>
            {scoringRound.holes.map((hole) => <ScorecardRow key={hole.id} hole={hole} holeCol hdcpCol parCol scoreCol />)}
            <ScorecardTotalRow round={round} holeCol hdcpCol parCol scoreCol />
        </tbody>
    </table>);
}

/**
 * Return the score class (birdie, bogey, etc)
 * @param relativeScore the score relative to par
 * @returns {string} the score class
 */
function scoreClass(relativeScore: number): string {
    const s = Math.round(relativeScore);
    if (s >= 2) {
        return "double_bogey";
    } else if (s == 1) {
        return "bogey";
    } else if (s == 0) {
        return "par";
    } else if (s == -1) {
        return "birdie";
    } else if (s == -2) {
        return "eagle";
    } else {
        return "albatross";
    }
}

function StrokeAndHoleControls(props: { activeStroke: Stroke, hole: Hole, round: Round }) {
    return <div className="StrokeAndHoleControls">
        <HoleControls hole={props.hole} round={props.round} />
        <ActiveStrokeControls activeStroke={props.activeStroke} round={props.round} />
        <hr />
        <Scorecard round={props.round} />
        <StrokeStatsList strokes={props.hole?.strokes} />
    </div>
}

function SubMapControls() {
    return (<>
        <MapControlsLower />
        <StrokeAndHoleControls activeStroke={activeStroke} hole={currentHole} round={round} />
    </>)
}

/**
 * Create a link that deletes this stroke
 * @param {Stroke} stroke
 * @returns {HTMLElement}
 */
function StrokeDeleteButton(props: { stroke: Stroke }): VNode {
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
function StrokeMoveButton(props: { stroke: Stroke, offset: number }): VNode {
    const stroke = props.stroke;
    const icon = (props.offset > 0 ? <span>&#8595;</span> : <span>&#8593;</span>)
    const clickHandler = (e) => {
        strokeReorder(stroke.holeIndex, stroke.index, props.offset);
        e.stopPropagation();
    }
    return <button onClick={clickHandler}>{icon}</button>
}

/**
 * Rerendering handlers
 */
function subMapControlsUpdate() {
    const el = document.getElementById("subMapControls");
    render(<SubMapControls />, el);
}

function upperMapControlsUpdate() {
    const el = document.querySelector('div#upperMapControls');
    render(<MapControlsUpper />, el);
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

/**
 * Rerender key views based on volatile data
 * @param {string} category the category of rerender to perform.
 */
function rerenderLines() {
    strokelineUpdate();
}
function rerenderMarkers() {
    strokeMarkerUpdate();
    strokeMarkerAimUpdate();
    if (currentHole) {
        pinMarkerUpdate(currentHole);
    }
}
function rerenderControls() {
    subMapControlsUpdate();
    upperMapControlsUpdate();
    saveData();
}
function rerenderActiveGrids() {
    if (!activeStroke) return
    gridUpdate().then(() => {
        strokeMarkerAimUpdate();
        subMapControlsUpdate();
    }).catch((error) => console.error(error));
}
function rerenderActiveStates() {
    if (!activeStroke) return
    strokeMarkerAimDelete();
    strokeMarkerAimCreate();
}

function rerender(category: string = "map") {
    const categories = {
        // Base rerenders
        lines: [rerenderLines],
        markers: [rerenderMarkers],
        activeGrids: [rerenderActiveGrids],
        activeStates: [rerenderActiveStates],
        controls: [rerenderControls],

        // Grouped rerenders
        map: [rerenderLines, rerenderMarkers, rerenderControls],
        dragend: [rerenderActiveGrids],
        active: [rerenderActiveStates, rerenderControls],
        full: [rerenderLines, rerenderMarkers, rerenderControls, rerenderActiveStates]
    }

    if (!(category in categories)) throw new Error("Rerender not recognized");
    categories[category].forEach((action) => action());
}

/**
 * Render a set of Club buttons into an HTML element based on an array of Club objects
 * @param {Array} clubs
 * @param {HTMLElement} targetElement
 */
const clubDataFields = ["dispersion"]
function clubStrokeViewCreate(clubs, targetElement) {
    clubs.forEach((clubData) => {
        const button = document.createElement("button");
        button.textContent = clubData.name;
        button.id = clubData.id;

        // Add additional attributes or styles to the button
        if (clubDataFields) {
            clubDataFields.forEach(field => {
                if (clubData[field]) {
                    button.setAttribute(`data-${field}`, clubData[field]);
                }
            });
        }

        if (clubData.style) {
            Object.assign(button.style, clubData.style);
        }

        if (clubData.class) {
            button.classList.add(clubData.class)
        }

        // Wire it up for action
        button.addEventListener("click", clubStrokeCreateCallback(clubData))

        targetElement.appendChild(button);
    });
}

/**
 * Handle a click on a club stroke create button
 * @param {Club} club
 * @returns {function}
 */
function clubStrokeCreateCallback(club: Club): () => void {
    return (() => {
        clubStrokeViewToggle();
        getLocationOnMap().then((position) => {
            clubStrokeCreate(position, club);
        });
    });
}

/**
 * Show or Hide the Club screen for stroke creation
 */
function clubStrokeViewToggle() {
    const el = document.getElementById("clubStrokeCreateContainer")
    el.classList.toggle("inactive");
    if (!(currentPositionEnabled)) {
        currentPositionUpdate()
    }
}
/**
 * =========================
 * Handlers for click events
 * =========================
 */

/**
 * Handles the window onload event.
 */
function handleLoad() {
    loadRoundData().then(() => {
        mapViewCreate("mapid");
        clubStrokeViewCreate(getUsableClubs(), document.getElementById("clubStrokeCreateContainer"));
        holeSelect(-1);
    });
}

function handleHoleIncrement(incr) {
    let curHoleNum = -1;
    if (currentHole) {
        curHoleNum = currentHole.index;
    }
    curHoleNum += incr;

    if (curHoleNum >= round.holes.length) {
        curHoleNum = -1;
    } else if (curHoleNum < -1) {
        curHoleNum = round.holes.length - 1;
    }
    holeSelect(curHoleNum);
}

function showPositionError(error: PositionError) {
    let er = new Error();
    switch (error.code) {
        case error.PERMISSION_DENIED:
            er.message = "User denied the request for Geolocation.";
            break;
        case error.POSITION_UNAVAILABLE:
            er.message = "Location information is unavailable.";
            break;
        case error.TIMEOUT:
            er.message = "The request to get user location timed out.";
            break;
        case error.UNKNOWN_ERROR:
            er.message = "An unknown error occurred.";
            break;
        default:
            er.message = error.message;
            break;
    }
    showError(er);
}

// Event listeners

window.addEventListener('load', handleLoad);
document.getElementById("clubStrokeCreateContainerClose").addEventListener("click", clubStrokeViewToggle);
document.getElementById("panicButton").addEventListener("click", () => { throw new Error("PANIC!!!") });