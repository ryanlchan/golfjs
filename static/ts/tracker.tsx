/**
 * Golf App
 * A JavaScript program for tracking golf rounds and locations.
 */
// Dependencies
import * as L from "leaflet";
import * as turf from "@turf/turf";
import chroma from "chroma-js";
import { Loader } from "@googlemaps/js-api-loader";
import "./googlemutant.js";
import { typeid } from "typeid-js";
import { render, VNode } from 'preact';

// Modules
import * as grids from "./grids.js";
import { getDistance, formatDistance, formatDistanceAsNumber, formatDistanceOptions } from "./projections.js";
import { PositionError } from "./errors.js";
import { showError, hideError, wait, touch, getUnitsSetting } from "./utils.js";
import * as cache from "./cache.js";
import { roundCreate, roundCourseParams, roundLoad, roundSave } from "./rounds.js";
import { STROKES_REMAINING_COEFFS } from "./coeffs20230705.js";
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
    // Show the set Aim button
    strokeMarkerAimCreateButton.classList.remove("inactive")

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
        const wsg = sggrid.options.grid.properties.weightedStrokesGained.toFixed(3);
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
    // Hide Aim button
    strokeMarkerAimCreateButton.classList.add("inactive")

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
        return `SG: ${sg.toFixed(3)}
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

    // Check if any grid returned, for example if the data didn't load or something
    if (grid instanceof Error) {
        return
    }
    // Create alpha/colorscale
    const colorscale = chroma.scale('RdYlGn').domain([-.25, .25]);
    const options: GridOptions = {
        style: function (feature) {
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
        return `SG: ${wsg.toFixed(3)}
                    | vs Aim: ${rwsg.toFixed(3)}`
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
    mapView = L.map(mapid, { attributionControl: false }).setView([36.567383, -121.947729], 18);
    L.gridLayer.googleMutant({
        type: "satellite",
        maxZoom: 24,
        attribution: "",
    }).addTo(mapView);
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
        distanceToPinViewUpdate();
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

interface HoleInfoProps { hole: Hole, round: Round }
function HoleInfo(props: HoleInfoProps) {
    const round = props.round
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
interface HoleSelectorProps { currentHoleIndex: number, holes: Hole[] }
function HoleSelector(props: HoleSelectorProps) {
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

interface HoleControlsProps { hole: Hole, round: Round }
function HoleControls(props: HoleControlsProps) {
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
interface StrokeStatsListItemProps { stroke: Stroke }
function StrokeStatsListItem(props: StrokeStatsListItemProps) {
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
interface StrokeStatsListProps { strokes: Stroke[] }
function StrokeStatsList(props: StrokeStatsListProps) {
    return (<div id="strokeList"><ol>
        {props.strokes?.map((stroke) => <StrokeStatsListItem stroke={stroke} />)}
    </ol></div>);
}

interface DispersionLinkProps { stroke: Stroke, distOptions?: formatDistanceOptions, id?: string }
function DispersionLink(props: DispersionLinkProps): VNode {
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
    if (!Number.isFinite(disp)) return showError("Invalid dispersion");
    const dispersion = convertAndSetStrokeDispersion(stroke, disp);
    rerender("full");
    return dispersion;
}

interface AimStatsProps { activeStroke: Stroke, round: Round }
function AimStats(props: AimStatsProps) {
    const layer = layerRead("active_grid")
    if (!layer) return; // No grid to load
    const stroke = props.activeStroke;
    const round = props.round;
    const grid = layer.options.grid;
    const hole = round.holes[stroke.holeIndex];
    const wsg = grid.properties.weightedStrokesGained;
    const sr = grid.properties.strokesRemainingStart;
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
    const innerText = `SG Aim: ${wsg.toFixed(3)} | SG Actual: ${sga.toFixed(3)} | SR: ${sr.toFixed(3)}`;

    // Update dispersion
    return <div id="aimStats" className="buttonRow">{innerText}</div>
}

function GridTypeControl() {
    const activeGrid = layerRead('active_grid');
    const activeType = activeGrid?.options.grid.properties.type;
    const id = "gridTypeControlContainer";
    const onInput = (e) => {
        gridDelete();
        gridCreate(e.target.value);
        strokeMarkerAimUpdate();
    }
    return <div className="buttonRow" id={id}>
        <label for={id}>Grid type:</label>
        <select id="gridTypeSelect" onInput={onInput} value={activeType}>
            {Object.values(grids.gridTypes).map(name => <option value={name}>{name}</option>)}
        </select>
    </div>
}

interface DispersionControlProps { stroke: Stroke }
function DispersionControl(props) {
    const id = "dispersionControlContainer";
    return <div className="buttonRow" id={id}>
        <label for={id}>Dispersion:</label>
        <DispersionLink stroke={props.stroke} id={id} />
    </div>
}

interface TerrainControlProps { stroke: Stroke }
function TerrainControl(props: TerrainControlProps) {
    const containerID = "terrainControlContainer";
    const selectID = "terrainControlSelect";
    const currentTerrain = props.stroke?.terrain;
    const hole = strokeHole(props.stroke);
    const onChange = (e) => {
        const val = e.target.value;
        if (val == "" || val in STROKES_REMAINING_COEFFS) {
            props.stroke.terrain = val;
            touch(props.stroke, hole, round);
            saveData();
        } else {
            showError(new PositionError("Terrain type not recognized", 4));
            console.error(`Terrain type not recognized, got ${val}`);
        }
        rerender("dragend");
    }
    return <div className="buttonRow" id={containerID}>
        <label for={containerID}>Terrain:</label>
        <select type="text" id={selectID} value={currentTerrain} onChange={onChange}>
            <option value="">unknown</option>
            {Object.keys(STROKES_REMAINING_COEFFS).map((type) => <option value={type}>{type}</option>)}
        </select>
    </div>
}

interface ActiveStrokeControlsProps { activeStroke: Stroke, round: Round }
function ActiveStrokeControls(props: ActiveStrokeControlsProps) {
    if (!props.activeStroke) return;
    return <div id="activeStrokeControls" className="buttonRow">
        <AimStats activeStroke={activeStroke} round={round} />
        <GridTypeControl />
        <DispersionControl stroke={activeStroke} />
        <TerrainControl stroke={activeStroke} />
    </div>
}

/**
 * Create a scorecard as table
 */
interface ScorecardProps { round: Round }
function Scorecard(props: ScorecardProps) {
    const scoringRound = props.round;
    let metrics = ['Hole', 'Hdcp', 'Par', 'Score'];
    const disableHandicap = !scoringRound.holes[0].handicap;
    const disablePar = !scoringRound.holes[0].par;
    if (disableHandicap) metrics = metrics.filter((el) => el != 'Hdcp');
    if (disablePar) metrics = metrics.filter((el) => el != 'Par');

    const mappers = {
        "Hole": (hole) => <td key={[hole.id, "Hole"].join()}>{(hole.index + 1)}</td>,
        "Hdcp": (hole) => <td key={[hole.id, "Hdcp"].join()}>{hole.handicap || ""}</td>,
        "Par": (hole) => <td key={[hole.id, "Par"].join()}>{hole.par || ""}</td>,
        "Score": (hole) => {
            const strokes = hole.strokes.length;
            let text = strokes;
            if (!disablePar) {
                const par = hole.par || 0;
                const relative = strokes - par;
                text = `${hole.strokes.length} (${relative >= 0 ? "+" : ""}${relative})`;
                return <td key={[hole.id, "Score"].join()} className={scoreClass(relative)}>{text}</td>
            } else {
                return <td key={[hole.id, "Score"].join()}>{hole.strokes.length}</td>
            }
        },
    }
    const totals = {
        "Hole": <td key="hole-total">Total</td>,
        "Hdcp": <td key="hdcp-total"></td>,
        "Par": <td key="par-total">{round.holes.reduce((acc, hole) => acc + hole.par, 0)}</td>,
    }
    const strokes = round.holes.reduce((acc, hole) => acc + hole.strokes.length, 0);
    if (!disablePar) {
        const par = round.holes.reduce((acc, hole) => acc + hole.par, 0);
        const relative = strokes - par;
        const text = `${strokes} (${relative >= 0 ? "+" : ""}${relative})`;
        totals["Score"] = <td key="score-total" className={scoreClass(relative)}>{text}</td>
    } else {
        totals["Score"] = <td key="score-total">{strokes}</td>
    }

    const holeTd = (hole, metric) => mappers[metric](hole)
    const holeRow = (hole, metrics) => {
        return (<tr key={['row', hole.id].join()} onClick={() => holeSelect(hole.index)}>
            {metrics.map((metric) => holeTd(hole, metric))}
        </tr>)
    }
    const totalRow = <tr class="totals">{metrics.map(metric => totals[metric])}</tr>
    // Create the table element
    const classes = ["scorecard", currentHole ? "inactive" : "active"].join(' ');
    const tab = (<table className={classes}>
        <thead><tr>{metrics.map((metric) => <th key={metric}>{metric}</th>)}</tr></thead>
        <tbody>
            {scoringRound.holes.map((hole) => holeRow(hole, metrics))}
            {totalRow}
        </tbody>
    </table>)
    return tab;
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

interface StrokeAndHoleControlsProps { activeStroke: Stroke, hole: Hole, round: Round }
function StrokeAndHoleControls(props: StrokeAndHoleControlsProps) {
    return <div className="StrokeAndHoleControls">
        <HoleControls hole={props.hole} round={props.round} />
        <ActiveStrokeControls activeStroke={props.activeStroke} round={props.round} />
        <hr />
        <Scorecard round={props.round} />
        <StrokeStatsList strokes={props.hole?.strokes} />
    </div>
}

/**
 * Create a link that deletes this stroke
 * @param {Stroke} stroke
 * @returns {HTMLElement}
 */
interface StrokeDeleteButtonProps { stroke: Stroke }
function StrokeDeleteButton(props: StrokeDeleteButtonProps): VNode {
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
interface StrokeMoveButtonProps { stroke: Stroke, offset: number }
function StrokeMoveButton(props: StrokeMoveButtonProps): VNode {
    const stroke = props.stroke;
    const icon = (props.offset > 0 ? <span>&#8595;</span> : <span>&#8593;</span>)
    const clickHandler = (e) => {
        strokeReorder(stroke.holeIndex, stroke.index, props.offset);
        e.stopPropagation();
    }
    return <button onClick={clickHandler}>{icon}</button>
}

function distanceToPinViewUpdate(id: string = "distanceToPin"): void {
    const el = document.getElementById(id);
    const parent = el.parentElement;
    if (currentHole?.pin && currentPositionRead()) {
        parent.classList.remove("inactive");

        const opt = { to_unit: displayUnits, include_unit: true };
        const pos = currentCoordRead();
        const dist = formatDistance(getDistance(pos, currentHole.pin), opt);
        el.innerText = dist;
    } else {
        parent.classList.add("inactive");
    }
}

/**
 * Rerendering handlers
 */
function strokeAndHoleControlsUpdate() {
    const el = document.getElementById("subMapControls");
    render(<StrokeAndHoleControls activeStroke={activeStroke} hole={currentHole} round={round} />, el);
}

/**
 * Rerender key views based on volatile data
 * @param {string} category the category of rerender to perform.
        */
function rerender(category: string = "map") {
    const lines = () => {
        strokelineUpdate();
    }
    const markers = () => {
        strokeMarkerUpdate();
        strokeMarkerAimUpdate();
        if (currentHole) {
            pinMarkerUpdate(currentHole);
        }
    }
    const controls = () => {
        strokeAndHoleControlsUpdate();
        saveData();
    }
    const activeGrids = () => {
        if (!activeStroke) return
        gridUpdate().then(() => {
            strokeMarkerAimUpdate();
            strokeAndHoleControlsUpdate();
        }).catch((error) => console.error(error));
    }
    const activeStates = () => {
        if (!activeStroke) return
        strokeMarkerAimDelete();
        strokeMarkerAimCreate();
    }
    const categories = {
        map: [lines, markers, controls],
        dragend: [activeGrids],
        active: [activeStates, controls],
        full: [lines, markers, controls, activeStates]
    }

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

/**
 * Handles the click event for logging the current location.
 */
function handleStrokeAddClick() {
    clubStrokeViewToggle();
    strokeMarkerDeactivate();
}

/**
 * If the user is not in the current course, allow them to click the screen to
 * set a new stroke's location
 */
function handleStrokeMarkerAimResetClick() {
    strokeAimReset(activeStroke);
    rerender("full");
}

/**
 * Recenter the map on the current hole
 */
function handleRecenterClick() {
    mapRecenter();
}

function handleHoleIncrement(incr) {
    let curHoleNum = -1;
    if (currentHole) {
        curHoleNum = currentHole.index;
    }
    curHoleNum += incr;

    if (curHoleNum >= round.holes.length) {
        curHoleNum = round.holes.length - 1;
    } else if (curHoleNum < -1) {
        curHoleNum = -1;
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
let strokeMarkerAimCreateButton = document.getElementById("strokeAimReset")

window.addEventListener('load', handleLoad);
document.getElementById("strokeAdd").addEventListener("click", handleStrokeAddClick);
document.getElementById("clubStrokeCreateContainerClose").addEventListener("click", clubStrokeViewToggle);
document.getElementById("recenter").addEventListener("click", handleRecenterClick);
strokeMarkerAimCreateButton.addEventListener('click', handleStrokeMarkerAimResetClick);
document.getElementById("panicButton").addEventListener("click", () => { throw new Error("PANIC!!!") });