/**
 * Golf App
 * A JavaScript program for tracking golf rounds and locations.
 */
// Dependencies
import * as L from "leaflet";
import type { GeoJSONOptions } from "leaflet";
import * as turf from "@turf/turf";
import chroma from "chroma-js";

// Modules
import * as grids from "./grids";
import { wait } from "./grids";

// Static images
import circleMarkerImg from "../img/circle-ypad.png";
import flagImg from "../img/flag.png";
import { STROKES_REMAINING_COEFFS } from "./coeffs20230705";

// Variables
let mapView: any;
let round: Round = defaultRound();
let currentHole: Hole = round.holes.at(-1);
let currentStrokeIndex: number = currentHole.strokes.length;
let layers: object = {};
let actionStack: Action[] = [];
let currentPosition: GeolocationPosition;
let currentPositionEnabled: boolean;
let holeSelector: HTMLElement;
let activeStroke: Stroke;

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
    // set an undo point
    undoCreate("strokeCreate");

    // handle no current hole
    if (currentHole == undefined || currentStrokeIndex == undefined) {
        currentHole = round.holes.reduce((latest, hole) => {
            return hole.index > latest.index && hole.strokes.length > 0 ? hole : latest
        })
        holeSelect(currentHole.index);
    }

    // Create the stroke object
    const stroke: Stroke = {
        index: currentStrokeIndex,
        holeIndex: currentHole.index,
        start: {
            x: position.coords.longitude,
            y: position.coords.latitude,
            crs: "EPSG:4326",
        },
        ...options
    };
    if (currentHole.pin) {
        stroke.aim = { ...currentHole.pin };
    }

    // Add the stroke to the data layer
    currentHole.strokes.push(stroke);
    currentStrokeIndex++;

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
        undoCreate("strokeDelete");

        // Delete from data layer
        hole.strokes.splice(strokeIndex, 1);

        // Reindex remaining strokes
        hole.strokes.forEach((stroke, index) => stroke.index = index);

        // Reset stroke index
        currentStrokeIndex = hole.strokes.length;

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
function strokeMove(holeIndex: number, strokeIndex: number, offset: number) {
    console.debug(`Moving stroke i${strokeIndex} from hole i${holeIndex} by ${offset}`)
    undoCreate("strokeMove");
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
    // Update the map and polylines
    rerender()
}

/**
 * Get the distance from this stroke to the next
 * @param {Stroke} stroke
 */
function strokeDistance(stroke: Stroke): number {
    let distance = 0;
    const hole = round.holes[stroke.holeIndex]
    const following = hole.strokes[stroke.index + 1]
    if (following) {
        distance = getDistance(stroke.start, following.start);
    } else if (hole.pin) {
        distance = getDistance(stroke.start, hole.pin);
    }

    return distance
}

/**
 * Get or set the dispersion for a stroke
 * @param {Stroke} stroke the stroke
 * @param {number | string} [val] the value to set the dispersion to
 * @returns {number} the dispersion of this stroke
 */
function strokeDispersion(stroke: Stroke, val?: number | string): number {
    if (!val) {
        return stroke.dispersion;
    } else if (typeof (val) == "string") {
        return stroke.dispersion = parseFloat(val);
    } else if (typeof (val) == "number") {
        return stroke.dispersion = val;
    } else {
        throw new Error("Dispersion must be set to a number or string");
    }
}

/**
 * Reset a stroke to aim at the pin
 * @param stroke the stroke to reset aim for
 * @returns the updated stroke
 */
function strokeAimReset(stroke: Stroke): Stroke {
    undoCreate("strokeAimReset");
    const hole = getStrokeHole(stroke);
    stroke.aim = { ...hole.pin };
    return stroke;
}

/**
 * Get the hole for a stroke
 * @param stroke the stroke to get the hole for
 * @returns the hole for the stroe
 */
function getStrokeHole(stroke: Stroke): Hole {
    return round.holes[stroke.holeIndex];
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
        iconSize: [30, 45], // size of the icon
        iconAnchor: [15, 30]
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
    marker.bindTooltip(
        (function () { return strokeTooltipText(stroke) }),
        { permanent: true, direction: "top", offset: [0, -10] })
    marker.on('click', strokeMarkerActivateCallback(marker));
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
    let opt = <any>marker.options

    // Set current hole to this one if missing
    if (!currentHole || !currentStrokeIndex) {
        let stroke = round.holes[opt["holeIndex"]].strokes[opt["strokeIndex"]];
        holeSelect(opt["holeIndex"]);
        marker = layerRead(strokeMarkerID(stroke));
    }

    // Deactivate the currently active marker if there is one
    if (activeStroke) {
        strokeMarkerDeactivate();
    }

    // Activate the clicked marker
    marker.getElement().classList.add('active-marker');
    activeStroke = currentHole.strokes[opt.strokeIndex];

    // Show the aim marker
    if (activeStroke.aim) {
        strokeMarkerAimCreate();
    }

    // Register deactivation clicks
    mapView.addEventListener("click", strokeMarkerDeactivate)

    // Rerender stroke list
    holeStatsUpdate();
    strokeTerrainSelectUpdate();
}

/**
 * Deactivate an aim marker when the user clicks on the map
 */
function strokeMarkerDeactivate(e?) {

    // Ignore clicks that originate from tooltips
    if (e && e.originalEvent.target.classList.contains("leaflet-pane")) {
        return
    }

    if (activeStroke) {
        let activeStrokeMarker = layerRead(strokeMarkerID(activeStroke));
        activeStrokeMarker.getElement().classList.remove('active-marker');
        activeStroke = null;

        // Hide the "Set aim" button and remove the aim marker
        strokeMarkerAimDelete();

        // Delete deactivation clicks
        mapView.removeEventListener("click", strokeMarkerDeactivate);

        // Update stroke list
        holeStatsUpdate();
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

    let marker = markerCreate("active_aim", activeStroke.aim);
    marker.bindTooltip(strokeMarkerAimTooltip, { permanent: true, direction: "top", offset: [-15, 0] })
    let ring = L.circle(marker.getLatLng(), { radius: activeStroke.dispersion, color: "#fff", opacity: 0.5, weight: 2 })
    layerCreate("active_aim_ring", ring);
    gridCreate();
    strokeMarkerAimUpdate();
    activeStrokeStatsCreate();
}

/**
 * Output the content for a Stroke's Aim marker's tooltip
 * @returns {String}
 */
function strokeMarkerAimTooltip(): string {
    const aimDistance = getDistance(activeStroke.start, activeStroke.aim).toFixed(1);
    const pinDistance = getDistance(activeStroke.aim, currentHole.pin).toFixed(1);
    let text = `${aimDistance}m to aim<br> ${pinDistance}m to pin`;

    const sggrid = layerRead("active_grid");
    if (sggrid && sggrid.options.grid) {
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

    // Hide active stats
    activeStrokeStatsDelete();
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
    const distance = strokeDistance(stroke).toFixed(1)
    return `${club} (${distance}m)`
}


/**
 * =====
 * Grids
 * =====
 */

/**
 * Duck type a GridOptions object that allows us to reference the grid from GeoJSON layers
 */
interface GridOptions extends GeoJSONOptions {
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
    aimStatsDelete();
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
    aimStatsCreate();
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
    aimStatsCreate();
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
 * Clears the current polylines connecting markers
 */
function strokelineDeleteAll() {
    for (const hole of round.holes) {
        layerDelete(strokelineID(hole))
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
    hole.strokes.sort((a, b) => a.index - b.index).forEach(stroke => {
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
        currentStrokeIndex = undefined;
        mapRecenter("course");
    } else if (!(round.holes[holeIndex])) {
        console.error(`Attempted to select hole i${holeIndex} but does not exist!`);
        return
    } else {
        currentHole = round.holes[holeIndex];
        currentStrokeIndex = currentHole.strokes.length;

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
 * Delete a hole's line, or all hole lines
 * @param {Hole} hole the Hole interface object, optional. If not given, delete
 * all hole lines
 */
function holeLineDelete(hole: Hole) {
    if (hole) {
        layerDelete(holeLineId(hole));
    } else {
        for (let hole of round.holes) {
            layerDelete(holeLineId(hole));
        }
    }
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
 * Create a new round and clear away all old data
 * Tries to background fetch course data and will call #roundUpdateWithData after loaded
 * @param {Course} courseParams the course
 */
function roundCreate(courseParams: Course) {
    // Set undo point
    undoCreate("roundCreate")
    let el = document.getElementById("courseName");
    if (!(el instanceof HTMLInputElement)) {
        return
    }
    let inputVal: string = el.value;
    if (!courseParams && !inputVal) {
        console.error("Cannot create a round without any inputs");
        return
    } else if (!courseParams) {
        let el = document.getElementById("courseName");
        if (!(el instanceof HTMLInputElement)) {
            return
        }
        let inputVal: string = el.value;
        courseParams = { name: inputVal }
    }
    let courseName = courseParams["name"];
    let courseId = courseParams["id"];

    // Reset all major data
    localStorage.removeItem("golfData");
    round = { ...defaultRound(), course: courseName, courseId: courseId };
    currentHole = round.holes.at(0)
    currentStrokeIndex = 0;
    activeStroke = undefined;
    layerDeleteAll();
    grids.fetchGolfCourseData(courseParams).then(roundUpdateWithData);
}

/**
 * After downloading polygons, update the Round with relevant data like pins and holes
 * @param {turf.FeatureCollection} courseData the polygons for this course
 */
function roundUpdateWithData(courseData: turf.FeatureCollection) {
    let lines = courseData.features.filter((feature) => feature.properties.golf && feature.properties.golf == "hole")
    for (let line of lines) {
        const index = parseInt(line.properties.ref) - 1;
        const cog = grids.getGolfHoleGreenCenter(roundCourseParams(round), index);
        const pin = {
            x: cog[0],
            y: cog[1],
            crs: "EPSG:4326",
        };
        let hole = { ...defaultCurrentHole(), index: index, pin: pin };
        if (line.properties.par) {
            hole["par"] = parseInt(line.properties.par)
        }
        if (line.properties.handicap) {
            hole["handicap"] = parseInt(line.properties.handicap)
        }
        round.holes[hole.index] = { ...hole, ...round.holes[hole.index] }
    }
    holeSelectViewUpdate();
    holeSelect(-1);
}

/**
 * Return a default Hole object conforming to the interface
 * @returns {Hole} a default Hole interface
 */
function defaultCurrentHole(): Hole {
    return {
        index: 0,
        strokes: [],
    };
}

/**
 * Returns a default Round object conforming to the interface
 * @returns {Round} a default Round interface
 */
function defaultRound(): Round {
    return {
        date: new Date().toISOString(),
        course: "Rancho Park Golf Course",
        holes: [defaultCurrentHole()],
    };
}

/**
 * Return a course interface given a round interface
 * @param {Round} round the round object
 * @returns {Course} the course parameters
 */
function roundCourseParams(round: Round): Course {
    return { 'name': round.course, 'id': round.courseId }
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
    strokeCreate(position, options)
}

/**
 * Lookup function to get all clubs in the backend, currently static
 * @returns {Array}
 */
function clubReadAll(): Array<any> {
    return [
        { id: 1, name: "D", dispersion: 39 },
        { id: 2, name: "3w", dispersion: 35 },
        { id: 3, name: "3h", dispersion: 28 },
        { id: 4, name: "4i", dispersion: 23 },
        { id: 5, name: "5i", dispersion: 21.5 },
        { id: 6, name: "6i", dispersion: 17 },
        { id: 7, name: "7i", dispersion: 16 },
        { id: 8, name: "8i", dispersion: 13.5 },
        { id: 9, name: "9i", dispersion: 11.5 },
        { id: 10, name: "Pw", dispersion: 10 },
        { id: 11, name: "Aw", dispersion: 7.5 },
        { id: 12, name: "Sw", dispersion: 6 },
        { id: 13, name: "Lw", dispersion: 5 },
        { id: 14, name: "P", dispersion: -0.15 },
        { id: 15, name: "Penalty", dispersion: 1, class: "danger" },
        { id: 16, name: "Skip", dispersion: 1, class: "secondary" },
    ]
}

/**
 * ==============
 * Saving/Loading
 * ==============
 */
/**
 * Saves the current data to localStorage.
 */

/**
 * Save round data to localstorage
 */
function saveData() {
    localStorage.setItem(
        "golfData",
        JSON.stringify({ ...round })
    );
}

/**
 * Loads the data from localStorage and initializes the map.
 * @returns {object | undefined} the loaded round or undefined
 */
function loadData(): object | undefined {
    const loadedData = JSON.parse(localStorage.getItem("golfData"));
    if (loadedData) {
        round = loadedData;
        console.log("Rehydrating round from localStorage")
        holeSelect(-1);
        return round;
    }
    return undefined;
}

/**
 * ===========
 * Base Marker
 * ===========
 */

/**
 * Adds a marker to the map.
 * @param {string} name - the name of the marker
 * @param {Coordinate} coordinate - The coordinate object { x, y, crs }.
 * @param {Object} options - Marker options.
 * @returns {L.Marker} a leaflet marker
 */
function markerCreate(name: string, coordinate: Coordinate, options?: object): L.Marker {
    options = { draggable: true, ...options }
    const marker = L.marker([coordinate.y, coordinate.x], options);
    marker.on("drag", handleMarkerDrag(marker, coordinate));
    marker.on("dragend", (() => rerender("dragend")));
    marker.on("dragstart", () => undoCreate("markerMove"));
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
 * ==================
 * Undo functionaltiy
 * ==================
 */

/**
 * Handles the click event for undoing the last action.
 */
function handleUndoActionClick() {
    undoRun();
}

/**
 * Set an undo point that you can return to
 * @param {String} action
 */
function undoCreate(action: string) {
    // Limit undo stack to 5
    if (actionStack.length > 5) {
        actionStack = actionStack.slice(0, 5);
    }

    // Create undo point
    actionStack.push({
        action,
        round: structuredClone(round),
        currentHoleIndex: currentHole ? currentHole.index : undefined,
        currentStrokeIndex,
        activeStroke: structuredClone(activeStroke)
    });
    console.debug(`Created a new undo point for action#${action}`)
}

/**
 * Undo off the top of the action stack
 */
function undoRun() {
    if (actionStack.length > 0) {
        console.debug("Undoing last action");

        // Calculate values
        const previousAction = actionStack.pop();
        const holeIndex = previousAction.currentHoleIndex ? previousAction.currentHoleIndex : -1;
        const strokeIndex = previousAction.currentStrokeIndex ? previousAction.currentStrokeIndex : undefined;

        // Do the actual reset
        round = previousAction.round;
        currentHole = holeIndex === undefined ? undefined : round.holes[holeIndex];
        currentStrokeIndex = strokeIndex;
        activeStroke = previousAction.activeStroke;

        // Reset displays post-reset
        rerender("full");
    } else {
        document.getElementById("error").innerText = "No action to undo.";
        console.error("No action to undo.");
    }
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
 * Calculates the distance between two coordinates in meters.
 * @param {Coordinate} coord1 - The first coordinate object { x, y }.
 * @param {Coordinate} coord2 - The second coordinate object { x, y }.
 * @returns {number} The distance between the coordinates in meters.
 */
function getDistance(coord1: Coordinate, coord2: Coordinate): number {
    const lat1 = coord1.y;
    const lon1 = coord1.x;
    const lat2 = coord2.y;
    const lon2 = coord2.x;
    const R = 6371e3; // meters
    const phi1 = (lat1 * Math.PI) / 180; // phi, lambda in radians
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c; // meters
    return distance;
}

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
            navigator.geolocation.getCurrentPosition(resolve, reject);
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
        document.getElementById("error").innerText = "Click the map to set location";
        mapView.on('click', (e) => {
            const clickPosition = {
                coords: {
                    latitude: e.latlng.lat,
                    longitude: e.latlng.lng,
                }
            }
            document.getElementById("error").innerText = ""
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
    if (!currentPosition
        || (currentPosition?.timestamp < (Date.now() - maximumAge))
        || (currentPosition?.coords.accuracy > 10)
        || (!mapView.getBounds().contains(
            L.latLng([currentPosition?.coords.latitude, currentPosition?.coords.longitude])
        ))
    ) {
        currentPosition = undefined;
    }
    return currentPosition;
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
    var mapContainer = document.getElementById(mapid);

    // Calculate 80% of the available vertical space
    var availableHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
    var mapHeight = 0.8 * availableHeight;

    // Set the height of the container element
    mapContainer.style.height = mapHeight + 'px';

    // Initialize the Leaflet map
    mapView = L.map(mapid).setView([36.567383, -121.947729], 18);
    L.tileLayer("https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}", {
        attribution:
            'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery &copy; <a href="https://www.mapbox.com/">Mapbox</a>',
        maxZoom: 22,
        maxNativeZoom: 19,
        id: "mapbox/satellite-v9",
        tileSize: 512,
        zoomOffset: -1,
        accessToken:
            "pk.eyJ1IjoicnlhbmxjaGFuIiwiYSI6ImNsamwyb2JwcDBuYzMzbHBpb2l0dHg2ODIifQ.vkFG7K0DrbHs5O1W0CIvzw", // replace with your Mapbox access token
    }).addTo(mapView);
}

/**
 * Recenter the map on a point
 * Options for key include "currentPosition", "currentHole", "course". Default to currentPosition.
 * @param {String} [key]
 */
function mapRecenter(key?: string) {
    let flyoptions = {
        animate: true,
        duration: 0.33
    }
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
        let bbox = grids.getGolfCourseBbox(roundCourseParams(round));
        if (bbox) {
            console.debug("Recentering on course");
            mapView.flyToBounds(bbox, flyoptions);
        }
    } else if (key == "currentHole") {
        let bbox = grids.getGolfHoleBbox(roundCourseParams(round), currentHole.index);
        if (bbox) {
            console.debug("Recentering on current hole");
            mapView.flyToBounds(bbox, flyoptions);
        } else if (currentHole.pin) {
            console.debug("Recentering on current pin");
            mapView.flyTo([currentHole.pin.y, currentHole.pin.x], 18, flyoptions);
        }
    } else if (key == "currentPosition") {
        if (currentPositionEnabled && currentPosition) {
            console.debug("Recentering on current position");
            mapView.flyTo([currentPosition.coords.latitude, currentPosition.coords.longitude], 20, flyoptions);
        }
    }
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
 * Create a hole selector given a select element
 * @param {HTMLSelectElement} element a select element that we will populate with options
 */
function holeSelectViewCreate(element: HTMLSelectElement) {
    //Register this element as the current hole selector
    holeSelector = element;

    // Populate the select with options
    holeSelectViewUpdate();

    // Add event listener to handle selection changes
    element.addEventListener('change', function () {
        let selectedHoleIndex = parseInt(this.value, 10);
        holeSelect(selectedHoleIndex);
    });
}

/**
 * Update a given select element with current hole options
 */
function holeSelectViewUpdate() {
    if (!holeSelector) {
        return
    }
    if (!(holeSelector instanceof HTMLSelectElement)) {
        return
    }
    let overview = document.createElement('option');
    overview.value = "-1";
    overview.text = "Overview";
    let options = [overview];
    for (let hole of round.holes) {
        if (!hole) {
            // Sometimes polys return extra holes for whatever reason, skip them
            break;
        }
        let option = document.createElement('option');
        option.value = hole.index.toString();
        option.text = `Hole ${hole.index + 1}`;
        options.push(option)
    }
    holeSelector.replaceChildren(...options);
    holeSelector.value = currentHole ? currentHole.index.toString() : "-1";
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
        } else {
            // Create a new marker and add it to the map
            currentPositionMarker = L.circleMarker(
                latlong,
                { radius: 10, fillColor: "#4A89F3", color: "#FFF", weight: 1, opacity: 0.8, fillOpacity: 0.8 }
            );
            layerCreate(markerID, currentPositionMarker);
        }
    }, showError, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000
    });
}

/**
 * Updates the round data displayed on the page.
 */
function roundViewUpdate() {
    const locationData = document.getElementById("locationData");
    locationData.textContent = JSON.stringify(
        { ...round },
        null,
        2
    );
}

/**
 * Updates the statistics information on the page.
 */
function holeStatsUpdate() {
    const holeElement = document.getElementById("holeStats");
    const strokeElement = document.getElementById("strokeStats");
    if (currentHole) {
        let text = `| ${currentHole.strokes.length} Strokes`;
        if (currentHole.par) {
            text += ` | Par ${currentHole.par}`
        }
        if (currentHole.handicap) {
            text += ` | Hcp ${currentHole.handicap}`
        }
        holeElement.innerText = text
        strokeElement.innerHTML = "";
        currentHole.strokes.forEach(function (stroke) {
            strokeElement.appendChild(strokeStatsListItem(stroke));
        });
    } else {
        // No current hole, assume overview
        strokeElement.innerHTML = "";
        holeElement.innerHTML = "";
    }
}

/**
 * Create a list item for the Stroke Stats list
 * @param {Stroke} stroke 
 * @returns {HTMLElement} the li element for the list
 */
function strokeStatsListItem(stroke: Stroke): HTMLElement {
    let distance = 0;
    if (currentHole.strokes[stroke.index + 1]) {
        distance = getDistance(stroke.start, currentHole.strokes[stroke.index + 1].start);
    } else if (currentHole.pin) {
        distance = getDistance(stroke.start, currentHole.pin);
    }
    const listItem = document.createElement("li");
    const container = document.createElement("div");
    container.classList.add("strokeStatContainer");

    const text = document.createElement("div");
    const dispersionLink = document.createElement("a");
    text.classList.add("strokeDetails");
    text.innerHTML = `${stroke.club} (${Math.round(distance)}m) | &#xb1;`;
    dispersionLink.setAttribute("href", `#stroke_${stroke.index}_dispersion`);
    dispersionLink.innerText = `${stroke.dispersion}m`;
    dispersionLink.addEventListener("click", () => {
        let disp = prompt("Enter a dispersion:");
        if (disp != null) {
            stroke.dispersion = parseFloat(disp);
            rerender("full");
        }
        // Force a rerender of the grid
    });
    text.appendChild(dispersionLink);

    const buttons = document.createElement("div");
    buttons.classList.add("strokeControls");
    buttons.append(
        strokeSelectViewCreate(stroke),
        strokeMoveViewCreate(stroke, -1),
        strokeMoveViewCreate(stroke, 1),
        strokeDeleteViewCreate(stroke)
    );

    container.append(text);
    container.append(buttons);
    listItem.append(container);
    return listItem;
}

/**
 * Update aim-specific advanced stats
 */
function aimStatsUpdate() {
    const el = document.getElementById("aimStats");
    const layer = layerRead("active_grid")
    if (!layer) {
        return; // No grid to load
    }
    const grid = layer.options.grid;

    // Calculate stats
    const stats = document.createElement("div");
    const stroke = activeStroke;
    const hole = round.holes[stroke.holeIndex];
    const wsg = grid.properties.weightedStrokesGained;
    const sr = grid.properties.strokesRemainingStart;
    const sa = currentHole.strokes.length - stroke.index - 1;
    let srn = 0;
    if (sa > 0) {
        let nextStart = currentHole.strokes[stroke.index + 1].start;
        let startPoint = turf.point([nextStart.x, nextStart.y]);
        let pinCoord = [hole.pin.x, hole.pin.y];
        srn = grids.strokesRemainingFrom(startPoint, pinCoord, roundCourseParams(round));
    }
    const sga = sr - srn - 1;
    stats.innerText = `SG Aim: ${wsg.toFixed(3)} | SG Actual: ${sga.toFixed(3)} | SR: ${sr.toFixed(3)}`;

    // Update dispersion
    const disp = <HTMLInputElement>document.getElementById("dispersionInput");
    disp.value = stroke.dispersion.toString();

    // Add Content
    el.replaceChildren(stats);
}

/**
 * Show the Stats for a stroke
 */
function activeStrokeStatsCreate() {
    const el = document.getElementById("activeStrokeControls");
    el.classList.remove("inactive");
    aimStatsUpdate();
}

/**
 * Hide the Aim stats for a stroke
 */
function activeStrokeStatsDelete() {
    const el = document.getElementById("activeStrokeControls");
    el.classList.add("inactive");

}

/**
 * Show the Aim Stats for a stroke
 */
function aimStatsCreate() {
    const el = document.getElementById("aimStats");
    el.classList.remove("inactive");
    aimStatsUpdate();
}

/**
 * Hide the Aim stats for a stroke
 */
function aimStatsDelete() {
    const el = document.getElementById("aimStats");
    el.classList.add("inactive");

}

/**
 * Create a select element to choose the type of grid to render for this stroke
 */
function gridTypeSelectCreate() {
    // Create new selector
    let selector = document.getElementById('gridTypeSelect');
    if (!(selector instanceof HTMLSelectElement)) {
        return
    }
    while (selector.firstChild) {
        selector.removeChild(selector.firstChild);
    }
    for (let type in grids.gridTypes) {
        let opt = document.createElement('option');
        opt.value = grids.gridTypes[type];
        opt.innerText = grids.gridTypes[type];
        selector.appendChild(opt);
    }
    let activeGrid = layerRead('active_grid');
    if (activeGrid) {
        let type = activeGrid.options.grid.properties.type;
        selector.value = type;
    }
    selector.addEventListener('change', handleGridTypeSelection);
}

/**
 * Handle when a new grid type is selected
 */
function handleGridTypeSelection() {
    gridDelete();
    wait(10).then(() => {
        gridCreate(this.value);
        strokeMarkerAimUpdate();
    });
}

/**
 * Create the stroke terrain input options
 */
function strokeTerrainSelectCreate() {
    const el = document.getElementById("terrainInput");
    let types = [];
    let op = document.createElement("option");
    op.value = "";
    op.text = "Default";
    types.push(op)
    for (let type in STROKES_REMAINING_COEFFS) {
        let op = document.createElement("option");
        op.value = type;
        op.text = type;
        types.push(op)
    }
    el.replaceChildren(...types);
}

/**
 * Update the stroke terrain selector with the current stroke's terrain
 */
function strokeTerrainSelectUpdate() {
    if (!activeStroke) return
    const el = <HTMLSelectElement>document.getElementById("terrainInput");
    const currentTerrain = activeStroke.terrain;
    if (currentTerrain === undefined) {
        el.value = "";
    } else {
        el.value = currentTerrain;
    }
}

/**
 * Create a link that deletes this stroke
 * @param {Stroke} stroke
 * @returns {HTMLElement}
 */
function strokeDeleteViewCreate(stroke: Stroke): HTMLElement {
    let link = document.createElement("button");
    link.innerHTML = "&#215;";
    link.id = `stroke_${stroke.index}_delete`
    link.classList.add("danger");
    link.addEventListener("click", (() => {
        strokeDelete(stroke.holeIndex, stroke.index);
    }));
    return link
}

/**
 * Create a link that selects this stroke
 * @param {Stroke} stroke
 * @returns {HTMLElement}
 */
function strokeSelectViewCreate(stroke: Stroke): HTMLElement {
    let link = document.createElement("button");
    let icon;
    let state;
    let cls;
    let func;
    let arg;

    if (stroke == activeStroke) {
        icon = "&#x26AC;";
        state = "deactivate";
        cls = "secondary"
        func = strokeMarkerDeactivate;
        arg = null;
    } else {
        icon = "&#x2609;";
        state = "activate";
        cls = "success";
        func = strokeMarkerActivate;
        arg = layerRead(strokeMarkerID(stroke));
    }

    link.innerHTML = icon
    link.id = `stroke_${stroke.index}_${state}`;
    link.classList.add(cls);
    link.addEventListener("click", (() => {
        func(arg);
        rerender();
    }));
    return link
}

/**
 * Create a link that moves this stroke
 * @param {Stroke} stroke the stroke to move
 * @param {Number} offset the offset for the stroke index
 * @returns {HTMLElement}
 */
function strokeMoveViewCreate(stroke: Stroke, offset: number): HTMLElement {
    let link = document.createElement("button");
    let icon = (offset > 0 ? "&#8595;" : "&#8593;")
    link.innerHTML = icon;
    link.id = `stroke_${stroke.index}_move_${offset}`
    link.addEventListener("click", (() => {
        strokeMove(stroke.holeIndex, stroke.index, offset);
    }));
    return link
}

/**
 * Rerender key views based on volatile data
 * @param {string} type the type of rerender to perform. Can be `full` or `dragend`
 */
function rerender(type?: string) {
    // Render calls that can occur any time, high perf
    if (!type || type == "full") {
        roundViewUpdate();
        strokelineUpdate();
        strokeMarkerUpdate();
        strokeMarkerAimUpdate();
        holeStatsUpdate();
        saveData();
    }

    // Render calls that should happen only after drags finish
    if ((type == "dragend" || type == "full") && activeStroke) {
        gridUpdate().then(() => {
            aimStatsUpdate();
            strokeMarkerAimUpdate();
        }, (error) => console.error(error));
    }

    // Rerender calls that should happen on full rerenders with active strokes
    if (activeStroke && type == "full") {
        strokeMarkerAimDelete();
        strokeMarkerAimCreate();
        strokeTerrainSelectUpdate();
    }
    if (type == "full" && currentHole) {
        pinMarkerUpdate(currentHole);
    }

    // Rerender everything
    if (type == "full") {
        scorecardViewUpdate();
        holeSelectViewUpdate();
    }
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
 * Render the results from a course search via nominatim
 * @param {any[]} results the results from Nominatim search
 */
function courseSearchViewUpdate(results: any[]) {
    let resultList = document.getElementById("courseSearchResults");
    resultList.innerHTML = "";

    // Iterate over the results and display each match
    results.forEach((result) => {
        let listItem = document.createElement("li");
        let link = document.createElement("a");
        let courseParams = { 'name': result.namedetails.name, 'id': osmCourseID(result.osm_type, result.osm_id) }
        link.innerText = result.display_name;
        link.setAttribute("href", `#${result.osm_id}`)
        link.addEventListener('click', handleRoundCreateClickCallback(courseParams))
        listItem.appendChild(link);
        resultList.appendChild(listItem);
    });
}

/**
 * Return a unique courseID corresponding to an OSM object
 * @param {String} type the OSM type (way, relation, etc)
 * @param {Number} id the OSM ID
 * @returns {String}
 */
function osmCourseID(type: string, id: number): string {
    return `osm-${type}-${id}`
}

/**
 * Create a scorecard as table
 * @param round a round to create a scorecard for
 * @returns {HTMLElement} a table containing the scorecard
 */
function scorecardViewElement(round: Round): HTMLElement {
    // Create the table element
    const table = document.createElement('table');
    table.classList.add("scorecard")

    // Create the table header row
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    thead.appendChild(headerRow);

    // Create the header cells for Hole Numbers
    const holeNumbersHeader = document.createElement('th');
    holeNumbersHeader.textContent = 'Hole';
    headerRow.appendChild(holeNumbersHeader);

    // Optional: Calculate handicaps
    const enableHandicap = !!round.holes[0].handicap
    if (enableHandicap) {
        const handicapHeader = document.createElement('th');
        handicapHeader.textContent = 'Hcp';
        headerRow.appendChild(handicapHeader);
    }

    // Create the header cells for Par
    const parHeader = document.createElement('th');
    parHeader.textContent = 'Par';
    headerRow.appendChild(parHeader);

    // Create the header cells for Score
    const scoreHeader = document.createElement('th');
    scoreHeader.textContent = 'Score';
    headerRow.appendChild(scoreHeader);

    // Append the header row to the table
    table.appendChild(thead);

    // Create body
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);

    // Initialize total counts
    let totalStrokes = 0;
    let totalPar = 0;

    // Create rows for each hole
    for (const hole of round.holes) {
        const row = document.createElement('tr');

        // Create cells for Hole Number
        const holeNumberCell = document.createElement('td');
        holeNumberCell.textContent = (hole.index + 1).toString();
        row.appendChild(holeNumberCell);

        // Create cells for Handicap, if enabled
        if (enableHandicap) {
            const handicapCell = document.createElement('td');
            const handicap = hole.handicap
            handicapCell.textContent = handicap ? handicap.toString() : "";
            row.appendChild(handicapCell);
        }

        // Create cells for Par
        const parCell = document.createElement('td');
        const par = hole.par
        parCell.textContent = par ? par.toString() : "";
        totalPar += par;
        row.appendChild(parCell);

        // Create cells for Score
        const scoreCell = document.createElement('td');
        const strokes = hole.strokes.length;
        const relative = strokes - par;
        totalStrokes += strokes;
        scoreCell.textContent = `${strokes} (${relative >= 0 ? "+" : ""}${relative})`;
        scoreCell.classList.add(scoreClass(relative));
        row.appendChild(scoreCell);

        // Append the row to the table
        tbody.appendChild(row);
    }

    // Create totals row
    const row = document.createElement('tr');

    // Create cells for Hole Number
    const holeNumberCell = document.createElement('td');
    holeNumberCell.textContent = "Total"
    row.appendChild(holeNumberCell);

    // Spacer for handicap, if enabled
    if (enableHandicap) {
        const handicapCell = document.createElement('td');
        handicapCell.textContent = ""
        row.appendChild(handicapCell);
    }

    // Create cells for Par
    const parCell = document.createElement('td');
    parCell.textContent = totalPar.toString();
    row.appendChild(parCell);

    // Create cells for Score
    const scoreCell = document.createElement('td');
    const relative = totalStrokes - totalPar;
    scoreCell.textContent = `${totalStrokes} (${relative >= 0 ? "+" : ""}${relative})`;;
    scoreCell.classList.add(scoreClass(relative));
    row.appendChild(scoreCell);

    // Append the row to the table
    tbody.appendChild(row);

    return table;
}

/**
 * Update the scorecard view with either a table or nothing
 */
function scorecardViewUpdate(): void {
    const scorecard = document.getElementById("overviewStats");
    if (currentHole) {
        scorecard.classList.add("inactive");
    } else {
        scorecard.classList.remove("inactive");
        scorecard.replaceChildren(scorecardViewElement(round));
    }
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

/**
 * =========================
 * Handlers for click events
 * =========================
 */

/**
 * Handles the window onload event.
 */
function handleLoad() {
    mapViewCreate("mapid");
    clubStrokeViewCreate(clubReadAll(), document.getElementById("clubStrokeCreateContainer"));
    gridTypeSelectCreate();
    strokeTerrainSelectCreate();
    const loaded = loadData();
    let course = { 'name': round.course, 'id': round.courseId }
    grids.fetchGolfCourseData(course).then((data) => {
        if (!loaded) {
            roundUpdateWithData(data)
        } else {
            mapRecenter("course");
        }
    });
    holeSelectViewCreate(<HTMLSelectElement>document.getElementById('holeSelector'));
}

/**
 * Handles the click event for logging the current location.
 */
function handleStrokeAddClick() {
    clubStrokeViewToggle();
    strokeMarkerDeactivate();
}

/**
 * Handles the click event for starting a new round.
 * @param {Course} [courseParams] the course to create for. If not provided, then infers from input box.
 */
function handleRoundCreateClickCallback(courseParams?: Course) {
    return (() => {

        let courseName;
        let courseId;

        if (courseParams) {
            courseName = courseParams["name"];
            courseId = courseParams["id"];
        } else {
            let el = document.getElementById("courseName");
            if (!(el instanceof HTMLInputElement)) {
                return
            }
            courseName = el.value;
        }

        if (!courseName && !courseId) {
            alert("Course name cannot be blank!");
            return
        }

        if (confirm("Are you sure you want to start a new round? All current data will be lost.")) {
            roundCreate(courseParams);
            holeSelectViewUpdate();
            rerender("full");
        }
    });
}

/**
 * If the user is not in the current course, allow them to click the screen to
 * set a new stroke's location
 */
function handleStrokeMarkerAimCreateClick() {
    strokeAimReset(activeStroke);
    rerender("full");
}

/**
 * Handles the click event for toggling the round information display.
 */
function handleToggleRoundClick() {
    const roundDiv = document.getElementById("roundInfo");
    roundDiv.classList.toggle("inactive");
}

/**
 * Handles the click event for copying location data to the clipboard.
 */
function handleCopyToClipboardClick() {
    navigator.clipboard.writeText(document.getElementById("locationData").textContent);
}

/**
 * Recenter the map on the current hole
 */
function handleRecenterClick() {
    mapRecenter();
}

/**
 * Search Nominatim when a user is done typing in the course name box
 * Debounces to only search after 500ms of inactivity
 */
let timeoutId;
function handleCourseSearchInput() {
    let query = this.value;

    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
        if (query.length >= 3) {
            return grids.courseSearch(query).then(courseSearchViewUpdate);
        } else {
            document.getElementById("courseSearchResults").innerHTML = "";
        }
    }, 500);
}

/**
 * Take a new dispersion input and update current stroke
 */
function handleDispersionInput() {
    const val = this.value;
    try {
        strokeDispersion(activeStroke, val);
        rerender("full");
    } catch (e) {
        // Dispersion is probably invalid
        console.debug(e.message);
    }
}

/**
 * Take a terrain input and update current stroke
 */
function handleTerrainInput() {
    const val = this.value;
    if (val == "" || val in STROKES_REMAINING_COEFFS) {
        activeStroke.terrain = val;
    } else {
        showError(new PositionError("Terrain type not recognized", 4));
        console.error(`Terrain type not recognized, got ${val}`);
    }
    rerender("dragend");
}

/**
 * Shows an error message based on the geolocation error code.
 * @param {PositionError} error - The geolocation error object.
 */
function showError(error: PositionError) {
    switch (error.code) {
        case error.PERMISSION_DENIED:
            document.getElementById("error").innerText = "User denied the request for Geolocation.";
            break;
        case error.POSITION_UNAVAILABLE:
            document.getElementById("error").innerText = "Location information is unavailable.";
            break;
        case error.TIMEOUT:
            document.getElementById("error").innerText = "The request to get user location timed out.";
            break;
        case error.UNKNOWN_ERROR:
            document.getElementById("error").innerText = "An unknown error occurred.";
            break;
        default:
            document.getElementById("error").innerText = error.message;
            break;
    }
}

// Event listeners
let strokeMarkerAimCreateButton = document.getElementById("strokeMarkerAimCreate")

window.onload = handleLoad;
document.getElementById("strokeAdd").addEventListener("click", handleStrokeAddClick);
document.getElementById("clubStrokeCreateContainerClose").addEventListener("click", clubStrokeViewToggle);
document.getElementById("roundCreate").addEventListener("click", handleRoundCreateClickCallback());
document.getElementById("toggleRound").addEventListener("click", handleToggleRoundClick);
document.getElementById("copyToClipboard").addEventListener("click", handleCopyToClipboardClick);
document.getElementById("undoAction").addEventListener("click", handleUndoActionClick);
document.getElementById("recenter").addEventListener("click", handleRecenterClick);
strokeMarkerAimCreateButton.addEventListener('click', handleStrokeMarkerAimCreateClick);
document.getElementById("courseName").addEventListener("input", handleCourseSearchInput);
document.getElementById("dispersionInput").addEventListener("change", handleDispersionInput);
document.getElementById("terrainInput").addEventListener("change", handleTerrainInput);