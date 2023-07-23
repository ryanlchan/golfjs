(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
/**
 * Golf App
 * A JavaScript program for tracking golf rounds and locations.
 */
// import * as L from "leaflet";
// import type { GeoJSONOptions } from "leaflet";
// import * as turf from "@turf/turf";
// import * as grids from "./grids";
// import { wait } from "./grids";
// import chroma from "chroma-js";
// Variables
let mapView;
let round = defaultRound();
let currentHole = round.holes.at(-1);
let currentStrokeIndex = currentHole.strokes.length;
let layers = {};
let actionStack = [];
let currentPosition;
let currentPositionEnabled;
let holeSelector;
let activeStroke;
/**
 * ===========
 * Stroke CRUD
 * ===========
 */
/**
 * Shows the current position on the map and logs it as a stroke.
 * @param {GeolocationPosition} position - The current geolocation position.
 * @param {object} options - any additional options to set on Stroke
 */
function strokeCreate(position, options = {}) {
    // set an undo point
    undoCreate("strokeCreate");
    // Create the stroke object
    const stroke = {
        index: currentStrokeIndex,
        hole: currentHole.number,
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
 * @param {Number} holeId
 * @param {Number} strokeIndex
 */
function strokeDelete(holeNumber, strokeIndex) {
    console.debug(`Deleting stroke ${strokeIndex} from hole ${holeNumber}`);
    let hole = round.holes.find(h => h.number === holeNumber);
    if (hole) {
        undoCreate("strokeDelete");
        // Delete from data layer
        hole.strokes.splice(strokeIndex, 1);
        // Reindex remaining strokes
        hole.strokes.forEach((stroke, index) => stroke.index = index);
        // Reset stroke index
        currentStrokeIndex = hole.strokes.length;
        // Rerender views
        holeViewDelete();
        holeViewCreate(hole);
        rerender();
    }
}
/**
 * Reorders a stroke within a Hole
 * @param {Number} holeNumber the hole to reorder (1-indexed)
 * @param {Number} strokeIndex the stroke index to reorder (0-indexed)
 * @param {Number} offset movment relative to the current strokeIndex
 */
function strokeMove(holeNumber, strokeIndex, offset) {
    console.debug(`Moving stroke ${strokeIndex} from hole ${holeNumber} by ${offset}`);
    undoCreate("strokeMove");
    const hole = round.holes[holeNumber - 1];
    const mover = hole.strokes[strokeIndex];
    if (offset < 0) {
        offset = Math.max(offset, -strokeIndex);
    }
    else {
        offset = Math.min(offset, hole.strokes.length - strokeIndex - 1);
    }
    hole.strokes.splice(strokeIndex, 1);
    hole.strokes.splice(strokeIndex + offset, 0, mover);
    hole.strokes.forEach((stroke, index) => stroke.index = index);
    // Update the map and polylines
    rerender();
}
/**
 * Get the distance from this stroke to the next
 * @param {Object*} stroke
 */
function strokeDistance(stroke) {
    let distance = 0;
    const hole = round.holes[stroke.hole - 1];
    const following = hole.strokes[stroke.index + 1];
    if (following) {
        distance = getDistance(stroke.start, following.start);
    }
    else if (hole.pin) {
        distance = getDistance(stroke.start, hole.pin);
    }
    return distance;
}
/**
 * Adds a stroke marker to the map.
 * @param {Object} stroke - the stroke to add a marker for
 * @param {Object} options - Marker options.
 */
function strokeMarkerCreate(stroke, options) {
    console.debug(`Creating stroke markers for stroke ${stroke.index}`);
    const coordinate = stroke.start;
    const icon = L.icon({
        iconUrl: "static/img/circle-ypad.png",
        iconSize: [30, 45],
        iconAnchor: [15, 30]
    });
    let opt = { draggable: true, opacity: .8, icon, strokeIndex: stroke.index };
    if (options !== undefined) {
        opt = {
            ...opt,
            ...options
        };
    }
    let id = strokeMarkerID(stroke);
    let marker = markerCreate(id, coordinate, opt);
    marker.bindTooltip((function () { return strokeTooltipText(stroke); }), { permanent: true, direction: "top", offset: [0, -10] });
    marker.on('click', strokeMarkerActivateCallback(marker));
}
/**
 * Updates all stroke marker tooltips
 */
function strokeMarkerUpdate() {
    for (const hole of round.holes) {
        for (const stroke of hole.strokes) {
            let marker = layerRead(strokeMarkerID(stroke));
            if (!marker) {
                continue;
            }
            let tooltip = marker.getTooltip();
            if (tooltip) {
                tooltip.update();
            }
        }
    }
}
/**
 * Return a function that can be used to activate a stroke marker
 * @param {Marker} marker the leaflet map marker
 * @returns {function}
 */
function strokeMarkerActivateCallback(marker) {
    // callback doesn't need to handle the click event
    return (() => strokeMarkerActivate(marker));
}
/**
 * Activate a stroke marker
 * @param {Marker} marker the leaflet map marker
 */
function strokeMarkerActivate(marker) {
    // Deactivate the currently active marker if there is one
    if (activeStroke) {
        strokeMarkerDeactivate();
    }
    // Activate the clicked marker
    marker.getElement().classList.add('active-marker');
    activeStroke = currentHole.strokes[marker.options.strokeIndex];
    // Show the set Aim button
    if (activeStroke.aim) {
        strokeMarkerAimCreate();
    }
    else {
        strokeMarkerAimCreateButton.classList.remove("inactive");
    }
    // Register deactivation clicks
    mapView.addEventListener("click", strokeMarkerDeactivate);
}
/**
 * Deactivate an aim marker when the user clicks on the map
 */
function strokeMarkerDeactivate(e) {
    // Ignore clicks that originate from tooltips
    if (e && e.originalEvent.target.classList.contains("leaflet-pane")) {
        return;
    }
    if (activeStroke) {
        let activeStrokeMarker = layerRead(strokeMarkerID(activeStroke));
        activeStrokeMarker.getElement().classList.remove('active-marker');
        activeStroke = null;
        // Hide the "Set aim" button and remove the aim marker
        strokeMarkerAimDelete();
        // Delete deactivation clicks
        mapView.removeEventListener("click", strokeMarkerDeactivate);
    }
}
/**
 * Create an aim marker where the user has currently clicked
 * @param {Event} e the click event on the map
 */
function strokeMarkerAimCreate(e) {
    // Unbind the map click event handler
    mapView.off('click', strokeMarkerAimCreate);
    if (!activeStroke) {
        console.error("Cannot add aim, no active stroke");
        return;
    }
    if (e) {
        activeStroke.aim = {
            x: e.latlng.lng,
            y: e.latlng.lat,
            crs: "EPSG:4326"
        };
    }
    let marker = markerCreate("active_aim", activeStroke.aim);
    marker.bindTooltip(strokeMarkerAimTooltip, { permanent: true, direction: "top", offset: [-15, 0] });
    let ring = L.circle(marker.getLatLng(), { radius: activeStroke.dispersion, color: "#fff", opacity: 0.5, weight: 2 });
    layerCreate("active_aim_ring", ring);
    gridCreate();
    activeStrokeStatsCreate();
}
/**
 * Output the content for a Stroke's Aim marker's tooltip
 * @returns {String}
 */
function strokeMarkerAimTooltip() {
    const aimDistance = getDistance(activeStroke.start, activeStroke.aim).toFixed(1);
    const pinDistance = getDistance(activeStroke.aim, currentHole.pin).toFixed(1);
    let text = `${aimDistance}m to aim<br> ${pinDistance}m to pin`;
    const sggrid = layerRead("active_grid");
    if (sggrid && sggrid.options.grid) {
        const wsg = sggrid.options.grid.properties.weightedStrokesGained.toFixed(3);
        text += `<br> SG Aim ${wsg}`;
    }
    return text;
}
/**
 * Update the tooltip and aim ring for a Stroke's Aim marker
 */
function strokeMarkerAimUpdate() {
    try {
        const marker = layerRead("active_aim");
        marker.getTooltip().update();
        layerRead("active_aim_ring").setLatLng(marker.getLatLng());
    }
    catch (e) {
        return;
    }
}
/**
 * Delete the current active stroke's aim marker, ring, and grid
 */
function strokeMarkerAimDelete() {
    // Hide Aim button
    strokeMarkerAimCreateButton.classList.add("inactive");
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
 * @param {Object} stroke
 * @returns {String}
 */
function strokeMarkerID(stroke) {
    return `stroke_marker_${stroke.index}_hole_${stroke.hole}`;
}
/**
 * Create a unique ID for a Stroke AIm marker
 * @param {Object} stroke
 * @returns {String}
 */
function strokeMarkerAimID(stroke) {
    return `stroke_marker_aim_${stroke.index}_hole_${stroke.hole}`;
}
/**
 * Create a unique ID for a Stroke SG grid
 * @param {Object} stroke
 * @returns {String}
 */
function strokeSgGridID(stroke) {
    return `stroke_${stroke.index}_hole_${stroke.hole}_sg_grid`;
}
/**
 * Return the tooltip text for a stroke marker
 * @param {Object} stroke
 */
function strokeTooltipText(stroke) {
    const club = stroke.club;
    const distance = strokeDistance(stroke).toFixed(1);
    return `${club} (${distance}m)`;
}
/**
 * Create the currently active grid type
 * @param {string} type the type of grid to render, from grids.GRID_TYPES
 */
function gridCreate(type) {
    if (type == grids.gridTypes.STROKES_GAINED) {
        sgGridCreate();
    }
    else if (type == grids.gridTypes.TARGET) {
        targetGridCreate();
    }
    else {
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
function gridUpdate(type) {
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
        return Promise.resolve(gridCreate(type));
    }
    else {
        return Promise.reject(new Error("No grid to update"));
    }
}
/**
 * Create a Strokes Gained probability grid around the current aim point
 */
function sgGridCreate() {
    if (!activeStroke) {
        console.error("No active stroke, cannot create sg grid");
        return;
    }
    else if (!currentHole.pin) {
        console.error("Pin not set, cannot create sg grid");
        return;
    }
    else if (layerRead("active_grid")) {
        console.warn("Grid already exists, recreating");
        layerDelete("active_grid");
    }
    const grid = grids.sgGrid([activeStroke.start.y, activeStroke.start.x], [activeStroke.aim.y, activeStroke.aim.x], [currentHole.pin.y, currentHole.pin.x], activeStroke.dispersion, roundCourseParams(round));
    // Check if any grid returned, for example if the data didn't load or something
    if (grid instanceof Error) {
        return;
    }
    // Create alpha/colorscale
    const colorscale = chroma.scale('RdYlGn').domain([-.25, .15]);
    const alphamid = 1 / grid.features.length;
    const clip = (num, min, max) => Math.min(Math.max(num, min), max);
    const options = {
        style: function (feature) {
            return {
                stroke: false,
                fillColor: colorscale(feature.properties.strokesGained).hex(),
                fillOpacity: clip(feature.properties.probability / alphamid * 0.2, 0.1, 0.7)
            };
        },
        grid: grid
    };
    const gridLayer = L.geoJSON(grid, options).bindPopup(function (layer) {
        const props = layer.feature.properties;
        const sg = props.strokesGained;
        const prob = (props.probability * 100);
        const er = grids.erf(props.distanceToAim, 0, activeStroke.dispersion);
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
        return;
    }
    else if (!currentHole.pin) {
        console.error("Pin not set, cannot create sg grid");
        return;
    }
    else if (layerRead("active_grid")) {
        console.warn("Grid already exists, recreating");
        layerDelete("active_grid");
    }
    const grid = grids.targetGrid([activeStroke.start.y, activeStroke.start.x], [activeStroke.aim.y, activeStroke.aim.x], [currentHole.pin.y, currentHole.pin.x], activeStroke.dispersion, roundCourseParams(round));
    // Check if any grid returned, for example if the data didn't load or something
    if (grid instanceof Error) {
        return;
    }
    // Create alpha/colorscale
    const colorscale = chroma.scale('RdYlGn').domain([-.25, .25]);
    const options = {
        style: function (feature) {
            return {
                stroke: false,
                fillColor: colorscale(feature.properties.relativeStrokesGained).hex(),
                fillOpacity: 0.5
            };
        },
        grid: grid
    };
    const gridLayer = L.geoJSON(grid, options).bindPopup(function (layer) {
        const props = layer.feature.properties;
        const wsg = props.weightedStrokesGained;
        const rwsg = props.relativeStrokesGained;
        return `SG: ${wsg.toFixed(3)}
            | vs Aim: ${rwsg.toFixed(3)}`;
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
 * @param {Object} hole
 */
function strokelineCreate(hole) {
    console.debug("Creating stroke line for hole " + hole.number);
    let points = strokelinePoints(hole);
    // Only create polyline if there's more than one point
    if (points.length == 0) {
        return;
    }
    // Add Line to map
    let strokeline = L.polyline(points, {
        color: 'white',
        weight: 2,
        interactive: false
    });
    let id = strokelineID(hole);
    layerCreate(id, strokeline);
    return strokeline;
}
/**
 * Rerender Stroke Lines
 */
function strokelineUpdate() {
    let layers = layerReadAll();
    let selected = {};
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
        layerDelete(strokelineID(hole));
    }
}
/**
 * Helper function just to generate point arrays for a hole
 * @param {Object} hole
 * @returns {Array[latLng]}
 */
function strokelinePoints(hole) {
    let points = [];
    // Sort strokes by index and convert to LatLng objects
    hole.strokes.sort((a, b) => a.index - b.index).forEach(stroke => {
        points.push(L.latLng(stroke.start.y, stroke.start.x));
    });
    // If a pin is set, add it to the end of the polyline
    if (hole.pin) {
        points.push(L.latLng(hole.pin.y, hole.pin.x));
    }
    return points;
}
/**
 * Generate a unique layer primary key for this hole
 * @param {Object} hole
 * @returns String
 */
function strokelineID(hole) {
    return `strokeline_hole_${hole.number}`;
}
/**
 * ====
 * Holes
 * ====
 */
/**
 * Select a new hole and update pointers/views to match
 * @param {Number} holeNum
 */
function holeSelect(holeNum) {
    // Update currentHole
    if (round.holes[holeNum - 1]) {
        currentHole = round.holes[holeNum - 1];
        currentStrokeIndex = currentHole.strokes.length;
    }
    else {
        console.error(`Attempted to select hole ${holeNum} but does not exist!`);
    }
    // Delete all hole-specific layers and active states
    holeViewDelete();
    // Add all the layers of this new hole
    holeViewCreate(currentHole);
    rerender();
    mapRecenter("currentHole");
}
/**
 * Returns a unique layer ID for a given Hole
 * @param {Hole} hole the hole interface object from round
 * @returns {String}
 */
function holePinID(hole) {
    return `pin_hole_${hole.number}`;
}
/**
 * Adds a pin marker to the map.
 * @param {Object} hole - The hole to add a pin for
 */
function pinMarkerCreate(hole) {
    console.debug("Creating pin marker for hole " + hole.number);
    const coordinate = hole.pin;
    const holeNum = hole.number;
    const flagIcon = L.icon({
        iconUrl: "static/img/flag.png",
        iconSize: [60, 60],
        iconAnchor: [30, 60]
    });
    const options = {
        draggable: true,
        icon: flagIcon,
        title: String(holeNum),
    };
    const id = holePinID(hole);
    markerCreate(id, coordinate, options);
}
/**
 * Draw a hole line showing the intended playing line
 * @param {Hole} hole the Hole interface object
 */
function holeLineCreate(hole) {
    let line = grids.getGolfHoleLine(roundCourseParams(round), hole.number);
    if (line instanceof Error) {
        return;
    }
    let layer = L.geoJSON(line, {
        style: () => {
            return {
                stroke: true,
                color: '#fff',
                weight: 2,
                opacity: 0.5
            };
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
function holeLineDelete(hole) {
    if (hole) {
        layerDelete(holeLineId(hole));
    }
    else {
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
function holeLineId(hole) {
    return `hole_${hole.number}_line`;
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
function roundCreate(courseParams) {
    // Set undo point
    undoCreate("roundCreate");
    let el = document.getElementById("courseName");
    if (!(el instanceof HTMLInputElement)) {
        return;
    }
    let inputVal = el.value;
    if (!courseParams && !inputVal) {
        console.error("Cannot create a round without any inputs");
        return;
    }
    else if (!courseParams) {
        let el = document.getElementById("courseName");
        if (!(el instanceof HTMLInputElement)) {
            return;
        }
        let inputVal = el.value;
        courseParams = { courseName: inputVal };
    }
    let courseName = courseParams["name"];
    let courseId = courseParams["id"];
    // Reset all major data
    localStorage.removeItem("golfData");
    round = { ...defaultRound(), course: courseName, courseId: courseId };
    currentHole = round.holes.at(0);
    currentStrokeIndex = 0;
    layerDeleteAll();
    grids.fetchGolfCourseData(courseParams).then(roundUpdateWithData);
}
/**
 * After downloading polygons, update the Round with relevant data like pins and holes
 * @param {FeatureCollection} courseData the polygons for this course
 */
function roundUpdateWithData(courseData) {
    let lines = courseData.features.filter((feature) => feature.properties.golf && feature.properties.golf == "hole");
    for (let line of lines) {
        const number = parseInt(line.properties.ref);
        const cog = grids.getGolfHoleGreenCenter(roundCourseParams(round), number);
        const pin = {
            x: cog[0],
            y: cog[1],
            crs: "EPSG:4326",
        };
        let hole = { ...defaultCurrentHole(), number: number, pin: pin };
        if (line.properties.par) {
            hole["par"] = parseInt(line.properties.par);
        }
        if (line.properties.handicap) {
            hole["handicap"] = parseInt(line.properties.handicap);
        }
        round.holes[hole.number - 1] = { ...hole, ...round.holes[hole.number - 1] };
    }
    holeSelectViewUpdate();
    rerender();
    for (let hole of round.holes) {
        holeViewCreate(hole);
    }
    mapRecenter("course");
}
/**
 * Return a default Hole object conforming to the interface
 * @returns {Hole} a default Hole interface
 */
function defaultCurrentHole() {
    return {
        number: 1,
        strokes: [],
    };
}
/**
 * Returns a default Round object conforming to the interface
 * @returns {Round} a default Round interface
 */
function defaultRound() {
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
function roundCourseParams(round) {
    return { 'name': round.course, 'id': round.courseId };
}
/**
 * =====
 * Clubs
 * =====
 */
/**
 * Create a new stroke for a given club at current position
 * @param {Object} position
 */
function clubStrokeCreate(position, club) {
    let options = {
        club: club.name,
        dispersion: club.dispersion,
    };
    strokeCreate(position, options);
}
/**
 * Lookup function to get all clubs in the backend, currently static
 * @returns {Array}
 */
function clubReadAll() {
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
    ];
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
    localStorage.setItem("golfData", JSON.stringify({ ...round }));
}
/**
 * Loads the data from localStorage and initializes the map.
 */
function loadData() {
    const loadedData = JSON.parse(localStorage.getItem("golfData"));
    if (loadedData) {
        round = loadedData;
        console.log("Rehydrating round from localStorage");
        round.holes.forEach(function (hole) {
            holeViewCreate(hole);
        });
        const lastHole = round.holes.reduce((acc, hole) => {
            if (hole.strokes.length > 0) {
                return hole.number;
            }
            else {
                return acc;
            }
        }, 1);
        currentHole = round.holes[lastHole - 1];
        currentStrokeIndex = currentHole.strokes.length;
    }
    rerender();
}
/**
 * ===========
 * Base Marker
 * ===========
 */
/**
 * Adds a marker to the map.
 * @param {string} name - the name of the marker
 * @param {Object} coordinate - The coordinate object { x, y, crs }.
 * @param {Object} options - Marker options.
 * @returns {Marker} a leaflet marker
 */
function markerCreate(name, coordinate, options) {
    options = { draggable: true, ...options };
    const marker = L.marker([coordinate.y, coordinate.x], options);
    marker.on("drag", handleMarkerDrag(marker, coordinate));
    marker.on("dragend", (() => rerender("dragend")));
    layerCreate(name, marker);
    strokelineUpdate();
    return marker;
}
/**
 * Shortcut factory for marker drag callbacks
 * @param {L.marker} marker
 */
function handleMarkerDrag(marker, coordinate) {
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
function undoCreate(action) {
    actionStack.push({
        action,
        round: structuredClone(round),
        currentHoleNum: currentHole.number,
        currentStrokeIndex,
    });
    console.debug(`Created a new undo point for action#${action}`);
}
/**
 * Undo off the top of the action stack
 */
function undoRun() {
    if (actionStack.length > 0) {
        const previousAction = actionStack.pop();
        round = previousAction.round;
        currentHole = round.holes[previousAction.currentHoleNum - 1];
        currentStrokeIndex = previousAction.currentStrokeIndex;
        holeSelect(previousAction.currentHoleNum);
        saveData();
    }
    else {
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
function layerCreate(id, object) {
    if (layers[id]) {
        console.error(`Layer Error: ID ${id} already exists!`);
        return;
    }
    layers[id] = object;
    mapView.addLayer(object);
}
/**
 * Get a view layer from the Layer Set using an ID
 * @param {String} id
 * @returns {*} object from db
 */
function layerRead(id) {
    return layers[id];
}
/**
 * Delete a layer with a given ID
 * @param {String} id
 */
function layerDelete(id) {
    if (layers[id]) {
        mapView.removeLayer(layers[id]);
        delete layers[id];
    }
}
/**
 * Delete all layers
 */
function layerDeleteAll() {
    for (const id in layers) {
        mapView.removeLayer(layers[id]);
        delete layers[id];
    }
}
/**
 * Return an object of id to layers
 * @returns {Object}
 */
function layerReadAll() {
    return layers;
}
/**
 * =========
 * Utilities
 * =========
 */
/**
 * Calculates the distance between two coordinates in meters.
 * @param {Object} coord1 - The first coordinate object { x, y }.
 * @param {Object} coord2 - The second coordinate object { x, y }.
 * @returns {number} The distance between the coordinates in meters.
 */
function getDistance(coord1, coord2) {
    const lat1 = coord1.y;
    const lon1 = coord1.x;
    const lat2 = coord2.y;
    const lon2 = coord2.x;
    const R = 6371e3; // meters
    const phi1 = (lat1 * Math.PI) / 180; // phi, lambda in radians
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // meters
    return distance;
}
/**
 * Get the user's location from browser or cache
 * @param {boolean} force set to true to skip location cache
 * @returns {Promise} resolves with a GeolocationPosition
 */
function getLocation(force) {
    // If location is not yet tracked, turn on BG tracking + force refresh
    if (!(currentPositionEnabled)) {
        currentPositionUpdate();
        force = true;
    }
    return new Promise((resolve, reject) => {
        const position = currentPositionRead();
        if (position && !(force)) {
            resolve(position);
        }
        else if (!navigator.geolocation) {
            // Create a custom position error
            let e = new NoGeolocationError("Geolocation is not supported by this browser.", 2);
            reject(e);
        }
        else {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        }
    });
}
/**
 * Get the user's location and compare against a condition
 * The condition function will be called with the GeolocationPosition, should
 * return True to accept the geolocation or False to reject the promise
 * @param {Function} condition
 * @returns {Promise} resolves with a GeolocationPosition-ish
 */
function getLocationIf(condition) {
    return getLocation().then((position) => {
        if (condition(position)) {
            return position;
        }
        else {
            throw new Error("Failed conditional test");
        }
    });
}
/**
 * Ask the user to click the map to set a location
 * For example, if the user is way out of bounds
 * @returns {coordinate} the click location
 */
function getClickLocation() {
    return new Promise((resolve) => {
        document.getElementById("error").innerText = "Click the map to set location";
        mapView.on('click', (e) => {
            const clickPosition = {
                coords: {
                    latitude: e.latlng.lat,
                    longitude: e.latlng.lng,
                }
            };
            document.getElementById("error").innerText = "";
            resolve(clickPosition);
        });
    });
}
/**
 * Get either the user's location in a given bound or ask them to click
 * @param {FeatureCollection} bound
 * @returns {Promise} resolves with a GeolocationPosition-ish
 */
function getLocationWithin(bound) {
    return getLocationIf((position) => {
        const point = turf.point([position.coords.longitude, position.coords.latitude]);
        return turf.booleanWithin(point, bound);
    }).catch(getClickLocation);
}
/**
 * Get either the user's location in the map or ask them to click
 * Only useful because polygonizing the map for turf is a pain
 * @returns {Promise} resolves with a GeolocationPosition-ish
 */
function getLocationOnMap() {
    return getLocationIf((position) => {
        const userLatLng = L.latLng(position.coords.latitude, position.coords.longitude);
        return mapView.getBounds().contains(userLatLng);
    }).catch(getClickLocation);
}
/**
 * Shortcut to get current position from cache
 * @returns {GeolocationPosition}
 */
function currentPositionRead() {
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
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery &copy; <a href="https://www.mapbox.com/">Mapbox</a>',
        maxZoom: 22,
        maxNativeZoom: 19,
        id: "mapbox/satellite-v9",
        tileSize: 512,
        zoomOffset: -1,
        accessToken: "pk.eyJ1IjoicnlhbmxjaGFuIiwiYSI6ImNsamwyb2JwcDBuYzMzbHBpb2l0dHg2ODIifQ.vkFG7K0DrbHs5O1W0CIvzw", // replace with your Mapbox access token
    }).addTo(mapView);
}
/**
 * Recenter the map on a point
 * Options for key include "currentPosition", "currentHole", "course". Default to currentPosition.
 * @param {String} key
 */
function mapRecenter(key) {
    let flyoptions = {
        animate: true,
        duration: 0.33
    };
    if (key == "course") {
        let bbox = grids.getGolfCourseBbox(roundCourseParams(round));
        if (bbox) {
            console.debug("Recentering on course");
            mapView.flyToBounds(bbox, flyoptions);
        }
    }
    else if (key == "currentHole") {
        let bbox = grids.getGolfHoleBbox(roundCourseParams(round), currentHole.number);
        if (bbox) {
            console.debug("Recentering on current hole");
            mapView.flyToBounds(bbox, flyoptions);
        }
        else if (currentHole.pin) {
            console.debug("Recentering on current pin");
            mapView.flyTo([currentHole.pin.y, currentHole.pin.x], 18, flyoptions);
        }
    }
    else if (!key || key == "currentPosition") {
        if (currentPositionEnabled && currentPosition) {
            console.debug("Recentering on current position");
            mapView.flyTo([currentPosition.coords.latitude, currentPosition.coords.longitude], 20, flyoptions);
        }
    }
}
/**
 * Render the set of markers/layers for a given hole
 * @param {Object} hole the hole object from round
 */
function holeViewCreate(hole) {
    console.debug(`Rendering layers for hole ${hole.number}`);
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
function holeSelectViewCreate(element) {
    //Register this element as the current hole selector
    holeSelector = element;
    // Populate the select with options
    holeSelectViewUpdate();
    // Add event listener to handle selection changes
    element.addEventListener('change', function () {
        let selectedHoleNumber = parseInt(this.value, 10);
        holeSelect(selectedHoleNumber);
    });
}
/**
 * Update a given select element with current hole options
 */
function holeSelectViewUpdate() {
    if (!holeSelector) {
        return;
    }
    if (!(holeSelector instanceof HTMLSelectElement)) {
        return;
    }
    while (holeSelector.firstChild) {
        holeSelector.removeChild(holeSelector.firstChild);
    }
    for (let hole of round.holes) {
        if (!hole) {
            // Sometimes polys return extra holes for whatever reason, skip them
            break;
        }
        let option = document.createElement('option');
        option.value = hole.number.toString();
        option.text = `Hole ${hole.number}`;
        holeSelector.appendChild(option);
    }
    holeSelector.value = currentHole.number.toString();
}
/**
 * Set up a marker on the map which tracks current user position and caches location
 */
function currentPositionUpdate() {
    currentPositionEnabled = true;
    navigator.geolocation.watchPosition((position) => {
        const markerID = "currentPosition";
        currentPosition = position;
        let latlong = [position.coords.latitude, position.coords.longitude];
        let currentPositionMarker = layerRead(markerID);
        if (currentPositionMarker) {
            // If the marker already exists, just update its position
            currentPositionMarker.setLatLng(latlong);
        }
        else {
            // Create a new marker and add it to the map
            currentPositionMarker = L.circleMarker(latlong, { radius: 10, fillColor: "#4A89F3", color: "#FFF", weight: 1, opacity: 0.8, fillOpacity: 0.8 });
            layerCreate(markerID, currentPositionMarker);
        }
    }, showError, {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 1000
    });
}
/**
 * Updates the round data displayed on the page.
 */
function roundViewUpdate() {
    const locationData = document.getElementById("locationData");
    locationData.textContent = JSON.stringify({ ...round }, null, 2);
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
            text += ` | Par ${currentHole.par}`;
        }
        if (currentHole.handicap) {
            text += ` | Hcp ${currentHole.handicap}`;
        }
        holeElement.innerText = text;
        strokeElement.innerHTML = "";
        currentHole.strokes.forEach(function (stroke) {
            strokeElement.appendChild(strokeStatsListItem(stroke));
        });
    }
    else {
        holeElement.innerText = "";
        strokeElement.innerHTML = "";
    }
}
/**
 * Create a list item for the Stroke Stats list
 * @param {Stroke} stroke
 * @returns {element} the li element for the list
 */
function strokeStatsListItem(stroke) {
    let distance = 0;
    if (currentHole.strokes[stroke.index + 1]) {
        distance = getDistance(stroke.start, currentHole.strokes[stroke.index + 1].start);
    }
    else if (currentHole.pin) {
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
            stroke.dispersion = disp;
            rerender("full");
        }
        // Force a rerender of the grid
    });
    text.appendChild(dispersionLink);
    const buttons = document.createElement("div");
    buttons.classList.add("strokeControls");
    buttons.append(strokeSelectViewCreate(stroke), strokeMoveViewCreate(stroke, -1), strokeMoveViewCreate(stroke, 1), strokeDeleteViewCreate(stroke));
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
    const layer = layerRead("active_grid");
    if (!layer) {
        return; // No grid to load
    }
    const grid = layer.options.grid;
    // Calculate stats
    const stroke = activeStroke;
    const hole = round.holes[stroke.hole - 1];
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
    let text = `SG Aim: ${wsg.toFixed(3)} | SG Actual: ${sga.toFixed(3)} | SR: ${sr.toFixed(3)}`;
    // Add divider
    text += "<hr/>";
    el.innerHTML = text;
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
        return;
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
    wait(10).then(() => gridCreate(this.value));
}
/**
 * Create a link that deletes this stroke
 * @param {Object} stroke
 * @returns {link}
 */
function strokeDeleteViewCreate(stroke) {
    let link = document.createElement("button");
    link.innerHTML = "&#215;";
    link.id = `stroke_${stroke.index}_delete`;
    link.classList.add("danger");
    link.addEventListener("click", (() => {
        strokeDelete(stroke.hole, stroke.index);
    }));
    return link;
}
/**
 * Create a link that selects this stroke
 * @param {Object} stroke
 * @returns {link}
 */
function strokeSelectViewCreate(stroke) {
    let link = document.createElement("button");
    let icon;
    let state;
    let cls;
    let func;
    let arg;
    if (stroke == activeStroke) {
        icon = "&#x26AC;";
        state = "deactivate";
        cls = "secondary";
        func = strokeMarkerDeactivate;
        arg = null;
    }
    else {
        icon = "&#x2609;";
        state = "activate";
        cls = "success";
        func = strokeMarkerActivate;
        arg = layerRead(strokeMarkerID(stroke));
    }
    link.innerHTML = icon;
    link.id = `stroke_${stroke.index}_${state}`;
    link.classList.add(cls);
    link.addEventListener("click", (() => {
        func(arg);
        rerender();
    }));
    return link;
}
/**
 * Create a link that moves this stroke
 * @param {Object} stroke the stroke to move
 * @param {Number} offset the offset for the stroke index
 * @returns {link}
 */
function strokeMoveViewCreate(stroke, offset) {
    let link = document.createElement("button");
    let icon = (offset > 0 ? "&#8595;" : "&#8593;");
    link.innerHTML = icon;
    link.id = `stroke_${stroke.index}_move_${offset}`;
    link.addEventListener("click", (() => {
        strokeMove(stroke.hole, stroke.index, offset);
    }));
    return link;
}
/**
 * Rerender key views based on volatile data
 * @param {string} type the type of rerender to perform. Can be `full` or `dragend`
 */
function rerender(type) {
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
    // Rerender everything
    if (type == "full") {
        strokeMarkerAimDelete();
        strokeMarkerAimCreate();
    }
}
/**
 * Render a set of Club buttons into an HTML element based on an array of Club objects
 * @param {Array} clubs
 * @param {HTMLElement} targetElement
 */
const clubDataFields = ["dispersion"];
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
            button.classList.add(clubData.class);
        }
        // Wire it up for action
        button.addEventListener("click", clubStrokeCreateCallback(clubData));
        targetElement.appendChild(button);
    });
}
/**
 * Handle a click on a club stroke create button
 * @param {Object} club
 * @returns {Function}
 */
function clubStrokeCreateCallback(club) {
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
    const el = document.getElementById("clubStrokeCreateContainer");
    el.classList.toggle("inactive");
    if (!(currentPositionEnabled)) {
        currentPositionUpdate();
    }
}
/**
 * Render the results from a course search via nominatim
 * @param {Object} results the results from Nominatim search
 */
function courseSearchViewUpdate(results) {
    let resultList = document.getElementById("courseSearchResults");
    resultList.innerHTML = "";
    // Iterate over the results and display each match
    results.forEach((result) => {
        let listItem = document.createElement("li");
        let link = document.createElement("a");
        let courseParams = { 'name': result.namedetails.name, 'id': osmCourseID(result.osm_type, result.osm_id) };
        link.innerText = result.display_name;
        link.setAttribute("href", `#${result.osm_id}`);
        link.addEventListener('click', handleRoundCreateClickCallback(courseParams));
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
function osmCourseID(type, id) {
    return `osm-${type}-${id}`;
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
    loadData();
    let courseData = { 'name': round.course, 'id': round.courseId };
    grids.fetchGolfCourseData(courseData).then(() => mapRecenter("currentHole"));
    holeSelectViewCreate(document.getElementById('holeSelector'));
    gridTypeSelectCreate();
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
function handleRoundCreateClickCallback(courseParams) {
    return (() => {
        let courseName;
        let courseId;
        if (courseParams) {
            courseName = courseParams["name"];
            courseId = courseParams["id"];
        }
        else {
            let el = document.getElementById("courseName");
            if (!(el instanceof HTMLInputElement)) {
                return;
            }
            courseName = el.value;
        }
        if (!courseName && !courseId) {
            alert("Course name cannot be blank!");
            return;
        }
        if (confirm("Are you sure you want to start a new round? All current data will be lost.")) {
            roundCreate(courseParams);
            holeSelectViewUpdate();
            rerender();
        }
    });
}
/**
 * If the user is not in the current course, allow them to click the screen to
 * set a new stroke's location
 */
function handleStrokeMarkerAimCreateClick() {
    mapView.on("click", strokeMarkerAimCreate);
    mapView.off("click", strokeMarkerDeactivate);
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
    mapRecenter("currentHole");
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
        }
        else {
            document.getElementById("courseSearchResults").innerHTML = "";
        }
    }, 500);
}
/**
 * Shows an error message based on the geolocation error code.
 * @param {PositionError} error - The geolocation error object.
 */
function showError(error) {
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
            document.getElementById("error").innerText = error.text;
            break;
    }
}
// Event listeners
let strokeMarkerAimCreateButton = document.getElementById("strokeMarkerAimCreate");
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

},{}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJ0cmFja2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7OztHQUdHO0FBRUgsZ0NBQWdDO0FBQ2hDLGlEQUFpRDtBQUNqRCxzQ0FBc0M7QUFDdEMsb0NBQW9DO0FBQ3BDLGtDQUFrQztBQUNsQyxrQ0FBa0M7QUFFbEMsWUFBWTtBQUNaLElBQUksT0FBWSxDQUFDO0FBQ2pCLElBQUksS0FBSyxHQUFVLFlBQVksRUFBRSxDQUFDO0FBQ2xDLElBQUksV0FBVyxHQUFTLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDM0MsSUFBSSxrQkFBa0IsR0FBVyxXQUFXLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQztBQUM1RCxJQUFJLE1BQU0sR0FBVyxFQUFFLENBQUM7QUFDeEIsSUFBSSxXQUFXLEdBQWEsRUFBRSxDQUFDO0FBQy9CLElBQUksZUFBb0MsQ0FBQztBQUN6QyxJQUFJLHNCQUErQixDQUFDO0FBQ3BDLElBQUksWUFBeUIsQ0FBQztBQUM5QixJQUFJLFlBQW9CLENBQUM7QUFFekI7Ozs7R0FJRztBQUVIOzs7O0dBSUc7QUFDSCxTQUFTLFlBQVksQ0FBQyxRQUE2QixFQUFFLFVBQWtCLEVBQUU7SUFDckUsb0JBQW9CO0lBQ3BCLFVBQVUsQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUUzQiwyQkFBMkI7SUFDM0IsTUFBTSxNQUFNLEdBQVc7UUFDbkIsS0FBSyxFQUFFLGtCQUFrQjtRQUN6QixJQUFJLEVBQUUsV0FBVyxDQUFDLE1BQU07UUFDeEIsS0FBSyxFQUFFO1lBQ0gsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxNQUFNLENBQUMsU0FBUztZQUM1QixDQUFDLEVBQUUsUUFBUSxDQUFDLE1BQU0sQ0FBQyxRQUFRO1lBQzNCLEdBQUcsRUFBRSxXQUFXO1NBQ25CO1FBQ0QsR0FBRyxPQUFPO0tB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QUFnQixDQUFDLE9BQU8sRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO0FBQzFHLFFBQVEsQ0FBQyxjQUFjLENBQUMsYUFBYSxDQUFDLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLDhCQUE4QixFQUFFLENBQUMsQ0FBQztBQUNuRyxRQUFRLENBQUMsY0FBYyxDQUFDLGFBQWEsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxzQkFBc0IsQ0FBQyxDQUFDO0FBQ3pGLFFBQVEsQ0FBQyxjQUFjLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsMEJBQTBCLENBQUMsQ0FBQztBQUNqRyxRQUFRLENBQUMsY0FBYyxDQUFDLFlBQVksQ0FBQyxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO0FBQ3ZGLFFBQVEsQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLG1CQUFtQixDQUFDLENBQUM7QUFDbkYsMkJBQTJCLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLGdDQUFnQyxDQUFDLENBQUM7QUFDeEYsUUFBUSxDQUFDLGNBQWMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsdUJBQXVCLENBQUMsQ0FBQyIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsIi8qKlxuICogR29sZiBBcHBcbiAqIEEgSmF2YVNjcmlwdCBwcm9ncmFtIGZvciB0cmFja2luZyBnb2xmIHJvdW5kcyBhbmQgbG9jYXRpb25zLlxuICovXG5cbi8vIGltcG9ydCAqIGFzIEwgZnJvbSBcImxlYWZsZXRcIjtcbi8vIGltcG9ydCB0eXBlIHsgR2VvSlNPTk9wdGlvbnMgfSBmcm9tIFwibGVhZmxldFwiO1xuLy8gaW1wb3J0ICogYXMgdHVyZiBmcm9tIFwiQHR1cmYvdHVyZlwiO1xuLy8gaW1wb3J0ICogYXMgZ3JpZHMgZnJvbSBcIi4vZ3JpZHNcIjtcbi8vIGltcG9ydCB7IHdhaXQgfSBmcm9tIFwiLi9ncmlkc1wiO1xuLy8gaW1wb3J0IGNocm9tYSBmcm9tIFwiY2hyb21hLWpzXCI7XG5cbi8vIFZhcmlhYmxlc1xubGV0IG1hcFZpZXc6IGFueTtcbmxldCByb3VuZDogUm91bmQgPSBkZWZhdWx0Um91bmQoKTtcbmxldCBjdXJyZW50SG9sZTogSG9sZSA9IHJvdW5kLmhvbGVzLmF0KC0xKTtcbmxldCBjdXJyZW50U3Ryb2tlSW5kZXg6IG51bWJlciA9IGN1cnJlbnRIb2xlLnN0cm9rZXMubGVuZ3RoO1xubGV0IGxheWVyczogb2JqZWN0ID0ge307XG5sZXQgYWN0aW9uU3RhY2s6IEFjdGlvbltdID0gW107XG5sZXQgY3VycmVudFBvc2l0aW9uOiBHZW9sb2NhdGlvblBvc2l0aW9uO1xubGV0IGN1cnJlbnRQb3NpdGlvbkVuYWJsZWQ6IGJvb2xlYW47XG5sZXQgaG9sZVNlbGVjdG9yOiBIVE1MRWxlbWVudDtcbmxldCBhY3RpdmVTdHJva2U6IFN0cm9rZTtcblxuLyoqXG4gKiA9PT09PT09PT09PVxuICogU3Ryb2tlIENSVURcbiAqID09PT09PT09PT09XG4gKi9cblxuLyoqXG4gKiBTaG93cyB0aGUgY3VycmVudCBwb3NpdGlvbiBvbiB0aGUgbWFwIGFuZCBsb2dzIGl0IGFzIGEgc3Ryb2tlLlxuICogQHBhcmFtIHtHZW9sb2NhdGlvblBvc2l0aW9ufSBwb3NpdGlvbiAtIFRoZSBjdXJyZW50IGdlb2xvY2F0aW9uIHBvc2l0aW9uLlxuICogQHBhcmFtIHtvYmplY3R9IG9wdGlvbnMgLSBhbnkgYWRkaXRpb25hbCBvcHRpb25zIHRvIHNldCBvbiBTdHJva2VcbiAqL1xuZnVuY3Rpb24gc3Ryb2tlQ3JlYXRlKHBvc2l0aW9uOiBHZW9sb2NhdGlvblBvc2l0aW9uLCBvcHRpb25zOiBvYmplY3QgPSB7fSkge1xuICAgIC8vIHNldCBhbiB1bmRvIHBvaW50XG4gICAgdW5kb0NyZWF0ZShcInN0cm9rZUNyZWF0ZVwiKTtcblxuICAgIC8vIENyZWF0ZSB0aGUgc3Ryb2tlIG9iamVjdFxuICAgIGNvbnN0IHN0cm9rZTogU3Ryb2tlID0ge1xuICAgICAgICBpbmRleDogY3VycmVudFN0cm9rZUluZGV4LFxuICAgICAgICBob2xlOiBjdXJyZW50SG9sZS5udW1iZXIsXG4gICAgICAgIHN0YXJ0OiB7XG4gICAgICAgICAgICB4OiBwb3NpdGlvbi5jb29yZHMubG9uZ2l0dWRlLFxuICAgICAgICAgICAgeTogcG9zaXRpb24uY29vcmRzLmxhdGl0dWRlLFxuICAgICAgICAgICAgY3JzOiBcIkVQU0c6NDMyNlwiLFxuICAgICAgICB9LFxuICAgICAgICAuLi5vcHRpb25zXG4gICAgfTtcbiAgICBpZiAoY3VycmVudEhvbGUucGluKSB7XG4gICAgICAgIHN0cm9rZS5haW0gPSB7IC4uLmN1cnJlbnRIb2xlLnBpbiB9O1xuICAgIH1cblxuICAgIC8vIEFkZCB0aGUgc3Ryb2tlIHRvIHRoZSBkYXRhIGxheWVyXG4gICAgY3VycmVudEhvbGUuc3Ryb2tlcy5wdXNoKHN0cm9rZSk7XG4gICAgY3VycmVudFN0cm9rZUluZGV4Kys7XG5cbiAgICAvLyBBZGQgdGhlIHN0cm9rZSB0byB0aGUgdmlld1xuICAgIHN0cm9rZU1hcmtlckNyZWF0ZShzdHJva2UpO1xuICAgIHJlcmVuZGVyKCk7XG59XG5cbi8qKlxuICogRGVsZXRlIGEgc3Ryb2tlIG91dCBvZiB0aGUgcm91bmRcbiAqIEBwYXJhbSB7TnVtYmVyfSBob2xlSWRcbiAqIEBwYXJhbSB7TnVtYmVyfSBzdHJva2VJbmRleFxuICovXG5mdW5jdGlvbiBzdHJva2VEZWxldGUoaG9sZU51bWJlciwgc3Ryb2tlSW5kZXgpIHtcbiAgICBjb25zb2xlLmRlYnVnKGBEZWxldGluZyBzdHJva2UgJHtzdHJva2VJbmRleH0gZnJvbSBob2xlICR7aG9sZU51bWJlcn1gKVxuICAgIGxldCBob2xlID0gcm91bmQuaG9sZXMuZmluZChoID0+IGgubnVtYmVyID09PSBob2xlTnVtYmVyKTtcbiAgICBpZiAoaG9sZSkge1xuICAgICAgICB1bmRvQ3JlYXRlKFwic3Ryb2tlRGVsZXRlXCIpO1xuXG4gICAgICAgIC8vIERlbGV0ZSBmcm9tIGRhdGEgbGF5ZXJcbiAgICAgICAgaG9sZS5zdHJva2VzLnNwbGljZShzdHJva2VJbmRleCwgMSk7XG5cbiAgICAgICAgLy8gUmVpbmRleCByZW1haW5pbmcgc3Ryb2tlc1xuICAgICAgICBob2xlLnN0cm9rZXMuZm9yRWFjaCgoc3Ryb2tlLCBpbmRleCkgPT4gc3Ryb2tlLmluZGV4ID0gaW5kZXgpO1xuXG4gICAgICAgIC8vIFJlc2V0IHN0cm9rZSBpbmRleFxuICAgICAgICBjdXJyZW50U3Ryb2tlSW5kZXggPSBob2xlLnN0cm9rZXMubGVuZ3RoO1xuXG4gICAgICAgIC8vIFJlcmVuZGVyIHZpZXdzXG4gICAgICAgIGhvbGVWaWV3RGVsZXRlKClcbiAgICAgICAgaG9sZVZpZXdDcmVhdGUoaG9sZSlcbiAgICAgICAgcmVyZW5kZXIoKTtcbiAgICB9XG59XG5cbi8qKlxuICogUmVvcmRlcnMgYSBzdHJva2Ugd2l0aGluIGEgSG9sZVxuICogQHBhcmFtIHtOdW1iZXJ9IGhvbGVOdW1iZXIgdGhlIGhvbGUgdG8gcmVvcmRlciAoMS1pbmRleGVkKVxuICogQHBhcmFtIHtOdW1iZXJ9IHN0cm9rZUluZGV4IHRoZSBzdHJva2UgaW5kZXggdG8gcmVvcmRlciAoMC1pbmRleGVkKVxuICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldCBtb3ZtZW50IHJlbGF0aXZlIHRvIHRoZSBjdXJyZW50IHN0cm9rZUluZGV4XG4gKi9cbmZ1bmN0aW9uIHN0cm9rZU1vdmUoaG9sZU51bWJlciwgc3Ryb2tlSW5kZXgsIG9mZnNldCkge1xuICAgIGNvbnNvbGUuZGVidWcoYE1vdmluZyBzdHJva2UgJHtzdHJva2VJbmRleH0gZnJvbSBob2xlICR7aG9sZU51bWJlcn0gYnkgJHtvZmZzZXR9YClcbiAgICB1bmRvQ3JlYXRlKFwic3Ryb2tlTW92ZVwiKTtcbiAgICBjb25zdCBob2xlID0gcm91bmQuaG9sZXNbaG9sZU51bWJlciAtIDFdXG4gICAgY29uc3QgbW92ZXIgPSBob2xlLnN0cm9rZXNbc3Ryb2tlSW5kZXhdXG4gICAgaWYgKG9mZnNldCA8IDApIHtcbiAgICAgICAgb2Zmc2V0ID0gTWF0aC5tYXgob2Zmc2V0LCAtc3Ryb2tlSW5kZXgpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgb2Zmc2V0ID0gTWF0aC5taW4ob2Zmc2V0LCBob2xlLnN0cm9rZXMubGVuZ3RoIC0gc3Ryb2tlSW5kZXggLSAxKVxuICAgIH1cbiAgICBob2xlLnN0cm9rZXMuc3BsaWNlKHN0cm9rZUluZGV4LCAxKVxuICAgIGhvbGUuc3Ryb2tlcy5zcGxpY2Uoc3Ryb2tlSW5kZXggKyBvZmZzZXQsIDAsIG1vdmVyKVxuICAgIGhvbGUuc3Ryb2tlcy5mb3JFYWNoKChzdHJva2UsIGluZGV4KSA9PiBzdHJva2UuaW5kZXggPSBpbmRleCk7XG4gICAgLy8gVXBkYXRlIHRoZSBtYXAgYW5kIHBvbHlsaW5lc1xuICAgIHJlcmVuZGVyKClcbn1cblxuLyoqXG4gKiBHZXQgdGhlIGRpc3RhbmNlIGZyb20gdGhpcyBzdHJva2UgdG8gdGhlIG5leHRcbiAqIEBwYXJhbSB7T2JqZWN0Kn0gc3Ryb2tlXG4gKi9cbmZ1bmN0aW9uIHN0cm9rZURpc3RhbmNlKHN0cm9rZSkge1xuICAgIGxldCBkaXN0YW5jZSA9IDA7XG4gICAgY29uc3QgaG9sZSA9IHJvdW5kLmhvbGVzW3N0cm9rZS5ob2xlIC0gMV1cbiAgICBjb25zdCBmb2xsb3dpbmcgPSBob2xlLnN0cm9rZXNbc3Ryb2tlLmluZGV4ICsgMV1cbiAgICBpZiAoZm9sbG93aW5nKSB7XG4gICAgICAgIGRpc3RhbmNlID0gZ2V0RGlzdGFuY2Uoc3Ryb2tlLnN0YXJ0LCBmb2xsb3dpbmcuc3RhcnQpO1xuICAgIH0gZWxzZSBpZiAoaG9sZS5waW4pIHtcbiAgICAgICAgZGlzdGFuY2UgPSBnZXREaXN0YW5jZShzdHJva2Uuc3RhcnQsIGhvbGUucGluKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGlzdGFuY2Vcbn1cblxuLyoqXG4gKiBBZGRzIGEgc3Ryb2tlIG1hcmtlciB0byB0aGUgbWFwLlxuICogQHBhcmFtIHtPYmplY3R9IHN0cm9rZSAtIHRoZSBzdHJva2UgdG8gYWRkIGEgbWFya2VyIGZvclxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSBNYXJrZXIgb3B0aW9ucy5cbiAqL1xuZnVuY3Rpb24gc3Ryb2tlTWFya2VyQ3JlYXRlKHN0cm9rZSwgb3B0aW9ucz8pIHtcbiAgICBjb25zb2xlLmRlYnVnKGBDcmVhdGluZyBzdHJva2UgbWFya2VycyBmb3Igc3Ryb2tlICR7c3Ryb2tlLmluZGV4fWApO1xuICAgIGNvbnN0IGNvb3JkaW5hdGUgPSBzdHJva2Uuc3RhcnQ7XG4gICAgY29uc3QgaWNvbiA9IEwuaWNvbih7XG4gICAgICAgIGljb25Vcmw6IFwic3RhdGljL2ltZy9jaXJjbGUteXBhZC5wbmdcIiwgLy8gcmVwbGFjZSB3aXRoIHRoZSBwYXRoIHRvIHlvdXIgZmxhZyBpY29uXG4gICAgICAgIGljb25TaXplOiBbMzAsIDQ1XSwgLy8gc2l6ZSBvZiB0aGUgaWNvblxuICAgICAgICBpY29uQW5jaG9yOiBbMTUsIDMwXVxuICAgIH0pO1xuICAgIGxldCBvcHQgPSB7IGRyYWdnYWJsZTogdHJ1ZSwgb3BhY2l0eTogLjgsIGljb24sIHN0cm9rZUluZGV4OiBzdHJva2UuaW5kZXggfVxuICAgIGlmIChvcHRpb25zICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgb3B0ID0ge1xuICAgICAgICAgICAgLi4ub3B0LFxuICAgICAgICAgICAgLi4ub3B0aW9uc1xuICAgICAgICB9XG4gICAgfVxuICAgIGxldCBpZCA9IHN0cm9rZU1hcmtlcklEKHN0cm9rZSlcbiAgICBsZXQgbWFya2VyID0gbWFya2VyQ3JlYXRlKGlkLCBjb29yZGluYXRlLCBvcHQpO1xuICAgIG1hcmtlci5iaW5kVG9vbHRpcChcbiAgICAgICAgKGZ1bmN0aW9uICgpIHsgcmV0dXJuIHN0cm9rZVRvb2x0aXBUZXh0KHN0cm9rZSkgfSksXG4gICAgICAgIHsgcGVybWFuZW50OiB0cnVlLCBkaXJlY3Rpb246IFwidG9wXCIsIG9mZnNldDogWzAsIC0xMF0gfSlcbiAgICBtYXJrZXIub24oJ2NsaWNrJywgc3Ryb2tlTWFya2VyQWN0aXZhdGVDYWxsYmFjayhtYXJrZXIpKTtcbn1cblxuLyoqXG4gKiBVcGRhdGVzIGFsbCBzdHJva2UgbWFya2VyIHRvb2x0aXBzXG4gKi9cbmZ1bmN0aW9uIHN0cm9rZU1hcmtlclVwZGF0ZSgpIHtcbiAgICBmb3IgKGNvbnN0IGhvbGUgb2Ygcm91bmQuaG9sZXMpIHtcbiAgICAgICAgZm9yIChjb25zdCBzdHJva2Ugb2YgaG9sZS5zdHJva2VzKSB7XG4gICAgICAgICAgICBsZXQgbWFya2VyID0gbGF5ZXJSZWFkKHN0cm9rZU1hcmtlcklEKHN0cm9rZSkpXG4gICAgICAgICAgICBpZiAoIW1hcmtlcikge1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsZXQgdG9vbHRpcCA9IG1hcmtlci5nZXRUb29sdGlwKCk7XG4gICAgICAgICAgICBpZiAodG9vbHRpcCkge1xuICAgICAgICAgICAgICAgIHRvb2x0aXAudXBkYXRlKClcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuLyoqXG4gKiBSZXR1cm4gYSBmdW5jdGlvbiB0aGF0IGNhbiBiZSB1c2VkIHRvIGFjdGl2YXRlIGEgc3Ryb2tlIG1hcmtlclxuICogQHBhcmFtIHtNYXJrZXJ9IG1hcmtlciB0aGUgbGVhZmxldCBtYXAgbWFya2VyXG4gKiBAcmV0dXJucyB7ZnVuY3Rpb259XG4gKi9cbmZ1bmN0aW9uIHN0cm9rZU1hcmtlckFjdGl2YXRlQ2FsbGJhY2sobWFya2VyKSB7XG4gICAgLy8gY2FsbGJhY2sgZG9lc24ndCBuZWVkIHRvIGhhbmRsZSB0aGUgY2xpY2sgZXZlbnRcbiAgICByZXR1cm4gKCgpID0+IHN0cm9rZU1hcmtlckFjdGl2YXRlKG1hcmtlcikpO1xufVxuXG4vKipcbiAqIEFjdGl2YXRlIGEgc3Ryb2tlIG1hcmtlclxuICogQHBhcmFtIHtNYXJrZXJ9IG1hcmtlciB0aGUgbGVhZmxldCBtYXAgbWFya2VyXG4gKi9cbmZ1bmN0aW9uIHN0cm9rZU1hcmtlckFjdGl2YXRlKG1hcmtlcikge1xuICAgIC8vIERlYWN0aXZhdGUgdGhlIGN1cnJlbnRseSBhY3RpdmUgbWFya2VyIGlmIHRoZXJlIGlzIG9uZVxuICAgIGlmIChhY3RpdmVTdHJva2UpIHtcbiAgICAgICAgc3Ryb2tlTWFya2VyRGVhY3RpdmF0ZSgpO1xuICAgIH1cblxuICAgIC8vIEFjdGl2YXRlIHRoZSBjbGlja2VkIG1hcmtlclxuICAgIG1hcmtlci5nZXRFbGVtZW50KCkuY2xhc3NMaXN0LmFkZCgnYWN0aXZlLW1hcmtlcicpO1xuICAgIGFjdGl2ZVN0cm9rZSA9IGN1cnJlbnRIb2xlLnN0cm9rZXNbbWFya2VyLm9wdGlvbnMuc3Ryb2tlSW5kZXhdO1xuXG4gICAgLy8gU2hvdyB0aGUgc2V0IEFpbSBidXR0b25cbiAgICBpZiAoYWN0aXZlU3Ryb2tlLmFpbSkge1xuICAgICAgICBzdHJva2VNYXJrZXJBaW1DcmVhdGUoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBzdHJva2VNYXJrZXJBaW1DcmVhdGVCdXR0b24uY2xhc3NMaXN0LnJlbW92ZShcImluYWN0aXZlXCIpXG4gICAgfVxuXG4gICAgLy8gUmVnaXN0ZXIgZGVhY3RpdmF0aW9uIGNsaWNrc1xuICAgIG1hcFZpZXcuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIHN0cm9rZU1hcmtlckRlYWN0aXZhdGUpXG59XG5cbi8qKlxuICogRGVhY3RpdmF0ZSBhbiBhaW0gbWFya2VyIHdoZW4gdGhlIHVzZXIgY2xpY2tzIG9uIHRoZSBtYXBcbiAqL1xuZnVuY3Rpb24gc3Ryb2tlTWFya2VyRGVhY3RpdmF0ZShlPykge1xuXG4gICAgLy8gSWdub3JlIGNsaWNrcyB0aGF0IG9yaWdpbmF0ZSBmcm9tIHRvb2x0aXBzXG4gICAgaWYgKGUgJiYgZS5vcmlnaW5hbEV2ZW50LnRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoXCJsZWFmbGV0LXBhbmVcIikpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgaWYgKGFjdGl2ZVN0cm9rZSkge1xuICAgICAgICBsZXQgYWN0aXZlU3Ryb2tlTWFya2VyID0gbGF5ZXJSZWFkKHN0cm9rZU1hcmtlcklEKGFjdGl2ZVN0cm9rZSkpO1xuICAgICAgICBhY3RpdmVTdHJva2VNYXJrZXIuZ2V0RWxlbWVudCgpLmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZS1tYXJrZXInKTtcbiAgICAgICAgYWN0aXZlU3Ryb2tlID0gbnVsbDtcblxuICAgICAgICAvLyBIaWRlIHRoZSBcIlNldCBhaW1cIiBidXR0b24gYW5kIHJlbW92ZSB0aGUgYWltIG1hcmtlclxuICAgICAgICBzdHJva2VNYXJrZXJBaW1EZWxldGUoKTtcblxuICAgICAgICAvLyBEZWxldGUgZGVhY3RpdmF0aW9uIGNsaWNrc1xuICAgICAgICBtYXBWaWV3LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBzdHJva2VNYXJrZXJEZWFjdGl2YXRlKTtcbiAgICB9XG59XG5cblxuLyoqXG4gKiBDcmVhdGUgYW4gYWltIG1hcmtlciB3aGVyZSB0aGUgdXNlciBoYXMgY3VycmVudGx5IGNsaWNrZWRcbiAqIEBwYXJhbSB7RXZlbnR9IGUgdGhlIGNsaWNrIGV2ZW50IG9uIHRoZSBtYXBcbiAqL1xuZnVuY3Rpb24gc3Ryb2tlTWFya2VyQWltQ3JlYXRlKGU/KSB7XG4gICAgLy8gVW5iaW5kIHRoZSBtYXAgY2xpY2sgZXZlbnQgaGFuZGxlclxuICAgIG1hcFZpZXcub2ZmKCdjbGljaycsIHN0cm9rZU1hcmtlckFpbUNyZWF0ZSk7XG5cbiAgICBpZiAoIWFjdGl2ZVN0cm9rZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiQ2Fubm90IGFkZCBhaW0sIG5vIGFjdGl2ZSBzdHJva2VcIilcbiAgICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgaWYgKGUpIHtcbiAgICAgICAgYWN0aXZlU3Ryb2tlLmFpbSA9IHtcbiAgICAgICAgICAgIHg6IGUubGF0bG5nLmxuZyxcbiAgICAgICAgICAgIHk6IGUubGF0bG5nLmxhdCxcbiAgICAgICAgICAgIGNyczogXCJFUFNHOjQzMjZcIlxuICAgICAgICB9XG4gICAgfVxuICAgIGxldCBtYXJrZXIgPSBtYXJrZXJDcmVhdGUoXCJhY3RpdmVfYWltXCIsIGFjdGl2ZVN0cm9rZS5haW0pO1xuICAgIG1hcmtlci5iaW5kVG9vbHRpcChzdHJva2VNYXJrZXJBaW1Ub29sdGlwLCB7IHBlcm1hbmVudDogdHJ1ZSwgZGlyZWN0aW9uOiBcInRvcFwiLCBvZmZzZXQ6IFstMTUsIDBdIH0pXG4gICAgbGV0IHJpbmcgPSBMLmNpcmNsZShtYXJrZXIuZ2V0TGF0TG5nKCksIHsgcmFkaXVzOiBhY3RpdmVTdHJva2UuZGlzcGVyc2lvbiwgY29sb3I6IFwiI2ZmZlwiLCBvcGFjaXR5OiAwLjUsIHdlaWdodDogMiB9KVxuICAgIGxheWVyQ3JlYXRlKFwiYWN0aXZlX2FpbV9yaW5nXCIsIHJpbmcpO1xuICAgIGdyaWRDcmVhdGUoKTtcbiAgICBhY3RpdmVTdHJva2VTdGF0c0NyZWF0ZSgpO1xufVxuXG4vKipcbiAqIE91dHB1dCB0aGUgY29udGVudCBmb3IgYSBTdHJva2UncyBBaW0gbWFya2VyJ3MgdG9vbHRpcFxuICogQHJldHVybnMge1N0cmluZ31cbiAqL1xuZnVuY3Rpb24gc3Ryb2tlTWFya2VyQWltVG9vbHRpcCgpIHtcbiAgICBjb25zdCBhaW1EaXN0YW5jZSA9IGdldERpc3RhbmNlKGFjdGl2ZVN0cm9rZS5zdGFydCwgYWN0aXZlU3Ryb2tlLmFpbSkudG9GaXhlZCgxKTtcbiAgICBjb25zdCBwaW5EaXN0YW5jZSA9IGdldERpc3RhbmNlKGFjdGl2ZVN0cm9rZS5haW0sIGN1cnJlbnRIb2xlLnBpbikudG9GaXhlZCgxKTtcbiAgICBsZXQgdGV4dCA9IGAke2FpbURpc3RhbmNlfW0gdG8gYWltPGJyPiAke3BpbkRpc3RhbmNlfW0gdG8gcGluYDtcblxuICAgIGNvbnN0IHNnZ3JpZCA9IGxheWVyUmVhZChcImFjdGl2ZV9ncmlkXCIpO1xuICAgIGlmIChzZ2dyaWQgJiYgc2dncmlkLm9wdGlvbnMuZ3JpZCkge1xuICAgICAgICBjb25zdCB3c2cgPSBzZ2dyaWQub3B0aW9ucy5ncmlkLnByb3BlcnRpZXMud2VpZ2h0ZWRTdHJva2VzR2FpbmVkLnRvRml4ZWQoMyk7XG4gICAgICAgIHRleHQgKz0gYDxicj4gU0cgQWltICR7d3NnfWBcbiAgICB9XG4gICAgcmV0dXJuIHRleHRcbn1cblxuLyoqXG4gKiBVcGRhdGUgdGhlIHRvb2x0aXAgYW5kIGFpbSByaW5nIGZvciBhIFN0cm9rZSdzIEFpbSBtYXJrZXJcbiAqL1xuZnVuY3Rpb24gc3Ryb2tlTWFya2VyQWltVXBkYXRlKCkge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IG1hcmtlciA9IGxheWVyUmVhZChcImFjdGl2ZV9haW1cIilcbiAgICAgICAgbWFya2VyLmdldFRvb2x0aXAoKS51cGRhdGUoKTtcbiAgICAgICAgbGF5ZXJSZWFkKFwiYWN0aXZlX2FpbV9yaW5nXCIpLnNldExhdExuZyhtYXJrZXIuZ2V0TGF0TG5nKCkpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbn1cblxuLyoqXG4gKiBEZWxldGUgdGhlIGN1cnJlbnQgYWN0aXZlIHN0cm9rZSdzIGFpbSBtYXJrZXIsIHJpbmcsIGFuZCBncmlkXG4gKi9cbmZ1bmN0aW9uIHN0cm9rZU1hcmtlckFpbURlbGV0ZSgpIHtcbiAgICAvLyBIaWRlIEFpbSBidXR0b25cbiAgICBzdHJva2VNYXJrZXJBaW1DcmVhdGVCdXR0b24uY2xhc3NMaXN0LmFkZChcImluYWN0aXZlXCIpXG5cbiAgICAvLyBIaWRlIGFpbSBsYXllcnNcbiAgICBsYXllckRlbGV0ZShcImFjdGl2ZV9haW1cIik7XG4gICAgbGF5ZXJEZWxldGUoXCJhY3RpdmVfYWltX3JpbmdcIik7XG5cbiAgICAvLyBIaWRlIGFueSBncmlkXG4gICAgZ3JpZERlbGV0ZSgpO1xuXG4gICAgLy8gSGlkZSBhY3RpdmUgc3RhdHNcbiAgICBhY3RpdmVTdHJva2VTdGF0c0RlbGV0ZSgpO1xufVxuXG4vKipcbiAqIENyZWF0ZSBhIHVuaXF1ZSBJRCBmb3IgYSBTdHJva2VcbiAqIEBwYXJhbSB7T2JqZWN0fSBzdHJva2VcbiAqIEByZXR1cm5zIHtTdHJpbmd9XG4gKi9cbmZ1bmN0aW9uIHN0cm9rZU1hcmtlcklEKHN0cm9rZSkge1xuICAgIHJldHVybiBgc3Ryb2tlX21hcmtlcl8ke3N0cm9rZS5pbmRleH1faG9sZV8ke3N0cm9rZS5ob2xlfWBcbn1cblxuLyoqXG4gKiBDcmVhdGUgYSB1bmlxdWUgSUQgZm9yIGEgU3Ryb2tlIEFJbSBtYXJrZXJcbiAqIEBwYXJhbSB7T2JqZWN0fSBzdHJva2VcbiAqIEByZXR1cm5zIHtTdHJpbmd9XG4gKi9cbmZ1bmN0aW9uIHN0cm9rZU1hcmtlckFpbUlEKHN0cm9rZSkge1xuICAgIHJldHVybiBgc3Ryb2tlX21hcmtlcl9haW1fJHtzdHJva2UuaW5kZXh9X2hvbGVfJHtzdHJva2UuaG9sZX1gXG59XG5cbi8qKlxuICogQ3JlYXRlIGEgdW5pcXVlIElEIGZvciBhIFN0cm9rZSBTRyBncmlkXG4gKiBAcGFyYW0ge09iamVjdH0gc3Ryb2tlXG4gKiBAcmV0dXJucyB7U3RyaW5nfVxuICovXG5mdW5jdGlvbiBzdHJva2VTZ0dyaWRJRChzdHJva2UpIHtcbiAgICByZXR1cm4gYHN0cm9rZV8ke3N0cm9rZS5pbmRleH1faG9sZV8ke3N0cm9rZS5ob2xlfV9zZ19ncmlkYFxufVxuXG4vKipcbiAqIFJldHVybiB0aGUgdG9vbHRpcCB0ZXh0IGZvciBhIHN0cm9rZSBtYXJrZXJcbiAqIEBwYXJhbSB7T2JqZWN0fSBzdHJva2VcbiAqL1xuZnVuY3Rpb24gc3Ryb2tlVG9vbHRpcFRleHQoc3Ryb2tlKSB7XG4gICAgY29uc3QgY2x1YiA9IHN0cm9rZS5jbHViO1xuICAgIGNvbnN0IGRpc3RhbmNlID0gc3Ryb2tlRGlzdGFuY2Uoc3Ryb2tlKS50b0ZpeGVkKDEpXG4gICAgcmV0dXJuIGAke2NsdWJ9ICgke2Rpc3RhbmNlfW0pYFxufVxuXG5cbi8qKlxuICogPT09PT1cbiAqIEdyaWRzXG4gKiA9PT09PVxuICovXG5cbi8qKlxuICogRHVjayB0eXBlIGEgR3JpZE9wdGlvbnMgb2JqZWN0IHRoYXQgYWxsb3dzIHVzIHRvIHJlZmVyZW5jZSB0aGUgZ3JpZCBmcm9tIEdlb0pTT04gbGF5ZXJzXG4gKi9cbmludGVyZmFjZSBHcmlkT3B0aW9ucyBleHRlbmRzIEdlb0pTT05PcHRpb25zIHtcbiAgICBncmlkOiBMLkdlb0pTT05cbn1cblxuLyoqXG4gKiBDcmVhdGUgdGhlIGN1cnJlbnRseSBhY3RpdmUgZ3JpZCB0eXBlXG4gKiBAcGFyYW0ge3N0cmluZ30gdHlwZSB0aGUgdHlwZSBvZiBncmlkIHRvIHJlbmRlciwgZnJvbSBncmlkcy5HUklEX1RZUEVTXG4gKi9cbmZ1bmN0aW9uIGdyaWRDcmVhdGUodHlwZT86IHN0cmluZykge1xuICAgIGlmICh0eXBlID09IGdyaWRzLmdyaWRUeXBlcy5TVFJPS0VTX0dBSU5FRCkge1xuICAgICAgICBzZ0dyaWRDcmVhdGUoKTtcbiAgICB9IGVsc2UgaWYgKHR5cGUgPT0gZ3JpZHMuZ3JpZFR5cGVzLlRBUkdFVCkge1xuICAgICAgICB0YXJnZXRHcmlkQ3JlYXRlKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgc2dHcmlkQ3JlYXRlKCk7XG4gICAgfVxufVxuXG4vKipcbiAqIERlbGV0ZSB0aGUgY3VycmVudGx5IGFjdGl2ZSBncmlkIHR5cGVcbiAqL1xuZnVuY3Rpb24gZ3JpZERlbGV0ZSgpIHtcbiAgICBhaW1TdGF0c0RlbGV0ZSgpO1xuICAgIGxheWVyRGVsZXRlKFwiYWN0aXZlX2dyaWRcIik7XG59XG5cbi8qKlxuICogVXBkYXRlIHRoZSBjdXJyZW50bHkgYWN0aXZlIGdyaWQgdHlwZVxuICogQHBhcmFtIHtzdHJpbmd9IFt0eXBlXSB0aGUgdHlwZSBvZiBncmlkIHRvIHVwZGF0ZSB0b1xuICogQHJldHVybnMge1Byb21pc2V9IGEgcHJvbWlzZSBmb3Igd2hlbiB0aGUgZ3JpZCBpcyBkb25lIHJlZnJlc2hpbmdcbiAqL1xuZnVuY3Rpb24gZ3JpZFVwZGF0ZSh0eXBlPykge1xuICAgIC8vIEdldCBjdXJyZW50IGxheWVyIHR5cGVcbiAgICBpZiAoIXR5cGUpIHtcbiAgICAgICAgbGV0IGxheWVyID0gbGF5ZXJSZWFkKFwiYWN0aXZlX2dyaWRcIik7XG4gICAgICAgIGlmIChsYXllcikge1xuICAgICAgICAgICAgdHlwZSA9IGxheWVyLm9wdGlvbnMuZ3JpZC5wcm9wZXJ0aWVzLnR5cGU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZ3JpZERlbGV0ZSgpO1xuXG4gICAgLy8gQ3JlYXRlIG5ldyBncmlkIGdpdmVuIHR5cGUgKGRlZmF1bHQgdG8gU0cpXG4gICAgaWYgKGFjdGl2ZVN0cm9rZSAmJiBjdXJyZW50SG9sZS5waW4pIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShncmlkQ3JlYXRlKHR5cGUpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKFwiTm8gZ3JpZCB0byB1cGRhdGVcIikpO1xuICAgIH1cbn1cblxuLyoqXG4gKiBDcmVhdGUgYSBTdHJva2VzIEdhaW5lZCBwcm9iYWJpbGl0eSBncmlkIGFyb3VuZCB0aGUgY3VycmVudCBhaW0gcG9pbnRcbiAqL1xuZnVuY3Rpb24gc2dHcmlkQ3JlYXRlKCkge1xuICAgIGlmICghYWN0aXZlU3Ryb2tlKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJObyBhY3RpdmUgc3Ryb2tlLCBjYW5ub3QgY3JlYXRlIHNnIGdyaWRcIik7XG4gICAgICAgIHJldHVyblxuICAgIH0gZWxzZSBpZiAoIWN1cnJlbnRIb2xlLnBpbikge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiUGluIG5vdCBzZXQsIGNhbm5vdCBjcmVhdGUgc2cgZ3JpZFwiKTtcbiAgICAgICAgcmV0dXJuXG4gICAgfSBlbHNlIGlmIChsYXllclJlYWQoXCJhY3RpdmVfZ3JpZFwiKSkge1xuICAgICAgICBjb25zb2xlLndhcm4oXCJHcmlkIGFscmVhZHkgZXhpc3RzLCByZWNyZWF0aW5nXCIpO1xuICAgICAgICBsYXllckRlbGV0ZShcImFjdGl2ZV9ncmlkXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IGdyaWQgPSBncmlkcy5zZ0dyaWQoXG4gICAgICAgIFthY3RpdmVTdHJva2Uuc3RhcnQueSwgYWN0aXZlU3Ryb2tlLnN0YXJ0LnhdLFxuICAgICAgICBbYWN0aXZlU3Ryb2tlLmFpbS55LCBhY3RpdmVTdHJva2UuYWltLnhdLFxuICAgICAgICBbY3VycmVudEhvbGUucGluLnksIGN1cnJlbnRIb2xlLnBpbi54XSxcbiAgICAgICAgYWN0aXZlU3Ryb2tlLmRpc3BlcnNpb24sXG4gICAgICAgIHJvdW5kQ291cnNlUGFyYW1zKHJvdW5kKSk7XG5cbiAgICAvLyBDaGVjayBpZiBhbnkgZ3JpZCByZXR1cm5lZCwgZm9yIGV4YW1wbGUgaWYgdGhlIGRhdGEgZGlkbid0IGxvYWQgb3Igc29tZXRoaW5nXG4gICAgaWYgKGdyaWQgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgICAgICByZXR1cm5cbiAgICB9XG4gICAgLy8gQ3JlYXRlIGFscGhhL2NvbG9yc2NhbGVcbiAgICBjb25zdCBjb2xvcnNjYWxlOiBjaHJvbWEuU2NhbGUgPSBjaHJvbWEuc2NhbGUoJ1JkWWxHbicpLmRvbWFpbihbLS4yNSwgLjE1XSk7XG4gICAgY29uc3QgYWxwaGFtaWQgPSAxIC8gZ3JpZC5mZWF0dXJlcy5sZW5ndGg7XG4gICAgY29uc3QgY2xpcCA9IChudW0sIG1pbiwgbWF4KSA9PiBNYXRoLm1pbihNYXRoLm1heChudW0sIG1pbiksIG1heClcbiAgICBjb25zdCBvcHRpb25zOiBHcmlkT3B0aW9ucyA9IHtcbiAgICAgICAgc3R5bGU6IGZ1bmN0aW9uIChmZWF0dXJlKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHN0cm9rZTogZmFsc2UsXG4gICAgICAgICAgICAgICAgZmlsbENvbG9yOiBjb2xvcnNjYWxlKGZlYXR1cmUucHJvcGVydGllcy5zdHJva2VzR2FpbmVkKS5oZXgoKSxcbiAgICAgICAgICAgICAgICBmaWxsT3BhY2l0eTogY2xpcChmZWF0dXJlLnByb3BlcnRpZXMucHJvYmFiaWxpdHkgLyBhbHBoYW1pZCAqIDAuMiwgMC4xLCAwLjcpXG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGdyaWQ6IGdyaWRcbiAgICB9XG4gICAgY29uc3QgZ3JpZExheWVyID0gTC5nZW9KU09OKGdyaWQsIG9wdGlvbnMpLmJpbmRQb3B1cChmdW5jdGlvbiAobGF5ZXI6IGFueSkge1xuICAgICAgICBjb25zdCBwcm9wcyA9IGxheWVyLmZlYXR1cmUucHJvcGVydGllcztcbiAgICAgICAgY29uc3Qgc2cgPSBwcm9wcy5zdHJva2VzR2FpbmVkO1xuICAgICAgICBjb25zdCBwcm9iID0gKHByb3BzLnByb2JhYmlsaXR5ICogMTAwKTtcbiAgICAgICAgY29uc3QgZXIgPSBncmlkcy5lcmYocHJvcHMuZGlzdGFuY2VUb0FpbSwgMCwgYWN0aXZlU3Ryb2tlLmRpc3BlcnNpb24pXG4gICAgICAgIGNvbnN0IHB0aWxlID0gKDEgLSBlcikgKiAxMDA7XG4gICAgICAgIHJldHVybiBgU0c6ICR7c2cudG9GaXhlZCgzKX1cbiAgICAgICAgICAgIHwgJHtwcm9wcy50ZXJyYWluVHlwZX1cbiAgICAgICAgICAgIHwgUHJvYjogJHtwcm9iLnRvRml4ZWQoMil9JVxuICAgICAgICAgICAgfCAke3B0aWxlLnRvRml4ZWQoMSl9JWlsZWA7XG4gICAgfSk7XG4gICAgbGF5ZXJDcmVhdGUoXCJhY3RpdmVfZ3JpZFwiLCBncmlkTGF5ZXIpO1xuICAgIGFpbVN0YXRzQ3JlYXRlKCk7XG59XG5cbi8qKlxuICogQ3JlYXRlIGEgcmVsYXRpdmUgc3Ryb2tlcyBnYWluZWQgZ3JpZCBmb3IgYWltaW5nIGF0IGVhY2ggY2VsbCBpbiBhIGdyaWRcbiAqL1xuZnVuY3Rpb24gdGFyZ2V0R3JpZENyZWF0ZSgpIHtcbiAgICBpZiAoIWFjdGl2ZVN0cm9rZSkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiTm8gYWN0aXZlIHN0cm9rZSwgY2Fubm90IGNyZWF0ZSBzZyBncmlkXCIpO1xuICAgICAgICByZXR1cm5cbiAgICB9IGVsc2UgaWYgKCFjdXJyZW50SG9sZS5waW4pIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIlBpbiBub3Qgc2V0LCBjYW5ub3QgY3JlYXRlIHNnIGdyaWRcIik7XG4gICAgICAgIHJldHVyblxuICAgIH0gZWxzZSBpZiAobGF5ZXJSZWFkKFwiYWN0aXZlX2dyaWRcIikpIHtcbiAgICAgICAgY29uc29sZS53YXJuKFwiR3JpZCBhbHJlYWR5IGV4aXN0cywgcmVjcmVhdGluZ1wiKTtcbiAgICAgICAgbGF5ZXJEZWxldGUoXCJhY3RpdmVfZ3JpZFwiKTtcbiAgICB9XG5cbiAgICBjb25zdCBncmlkID0gZ3JpZHMudGFyZ2V0R3JpZChcbiAgICAgICAgW2FjdGl2ZVN0cm9rZS5zdGFydC55LCBhY3RpdmVTdHJva2Uuc3RhcnQueF0sXG4gICAgICAgIFthY3RpdmVTdHJva2UuYWltLnksIGFjdGl2ZVN0cm9rZS5haW0ueF0sXG4gICAgICAgIFtjdXJyZW50SG9sZS5waW4ueSwgY3VycmVudEhvbGUucGluLnhdLFxuICAgICAgICBhY3RpdmVTdHJva2UuZGlzcGVyc2lvbixcbiAgICAgICAgcm91bmRDb3Vyc2VQYXJhbXMocm91bmQpKTtcblxuICAgIC8vIENoZWNrIGlmIGFueSBncmlkIHJldHVybmVkLCBmb3IgZXhhbXBsZSBpZiB0aGUgZGF0YSBkaWRuJ3QgbG9hZCBvciBzb21ldGhpbmdcbiAgICBpZiAoZ3JpZCBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAgIHJldHVyblxuICAgIH1cbiAgICAvLyBDcmVhdGUgYWxwaGEvY29sb3JzY2FsZVxuICAgIGNvbnN0IGNvbG9yc2NhbGUgPSBjaHJvbWEuc2NhbGUoJ1JkWWxHbicpLmRvbWFpbihbLS4yNSwgLjI1XSk7XG4gICAgY29uc3Qgb3B0aW9uczogR3JpZE9wdGlvbnMgPSB7XG4gICAgICAgIHN0eWxlOiBmdW5jdGlvbiAoZmVhdHVyZSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzdHJva2U6IGZhbHNlLFxuICAgICAgICAgICAgICAgIGZpbGxDb2xvcjogY29sb3JzY2FsZShmZWF0dXJlLnByb3BlcnRpZXMucmVsYXRpdmVTdHJva2VzR2FpbmVkKS5oZXgoKSxcbiAgICAgICAgICAgICAgICBmaWxsT3BhY2l0eTogMC41XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGdyaWQ6IGdyaWRcbiAgICB9XG4gICAgY29uc3QgZ3JpZExheWVyID0gTC5nZW9KU09OKGdyaWQsIG9wdGlvbnMpLmJpbmRQb3B1cChmdW5jdGlvbiAobGF5ZXI6IGFueSkge1xuICAgICAgICBjb25zdCBwcm9wcyA9IGxheWVyLmZlYXR1cmUucHJvcGVydGllcztcbiAgICAgICAgY29uc3Qgd3NnID0gcHJvcHMud2VpZ2h0ZWRTdHJva2VzR2FpbmVkO1xuICAgICAgICBjb25zdCByd3NnID0gcHJvcHMucmVsYXRpdmVTdHJva2VzR2FpbmVkO1xuICAgICAgICByZXR1cm4gYFNHOiAke3dzZy50b0ZpeGVkKDMpfVxuICAgICAgICAgICAgfCB2cyBBaW06ICR7cndzZy50b0ZpeGVkKDMpfWBcbiAgICB9KTtcbiAgICBsYXllckNyZWF0ZShcImFjdGl2ZV9ncmlkXCIsIGdyaWRMYXllcik7XG4gICAgYWltU3RhdHNDcmVhdGUoKTtcbn1cblxuLyoqXG4gKiA9PT09PT09PT09PT1cbiAqIFN0cm9rZSBMaW5lc1xuICogPT09PT09PT09PT09XG4gKi9cblxuLyoqXG4gKiBDcmVhdGUgYSBzdHJva2UgbGluZSBmb3IgYSBnaXZlbiBob2xlXG4gKiBAcGFyYW0ge09iamVjdH0gaG9sZVxuICovXG5mdW5jdGlvbiBzdHJva2VsaW5lQ3JlYXRlKGhvbGUpIHtcbiAgICBjb25zb2xlLmRlYnVnKFwiQ3JlYXRpbmcgc3Ryb2tlIGxpbmUgZm9yIGhvbGUgXCIgKyBob2xlLm51bWJlcilcbiAgICBsZXQgcG9pbnRzID0gc3Ryb2tlbGluZVBvaW50cyhob2xlKTtcblxuICAgIC8vIE9ubHkgY3JlYXRlIHBvbHlsaW5lIGlmIHRoZXJlJ3MgbW9yZSB0aGFuIG9uZSBwb2ludFxuICAgIGlmIChwb2ludHMubGVuZ3RoID09IDApIHtcbiAgICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8gQWRkIExpbmUgdG8gbWFwXG4gICAgbGV0IHN0cm9rZWxpbmUgPSBMLnBvbHlsaW5lKHBvaW50cywge1xuICAgICAgICBjb2xvcjogJ3doaXRlJyxcbiAgICAgICAgd2VpZ2h0OiAyLFxuICAgICAgICBpbnRlcmFjdGl2ZTogZmFsc2VcbiAgICB9KTtcbiAgICBsZXQgaWQgPSBzdHJva2VsaW5lSUQoaG9sZSk7XG4gICAgbGF5ZXJDcmVhdGUoaWQsIHN0cm9rZWxpbmUpO1xuICAgIHJldHVybiBzdHJva2VsaW5lXG59XG5cbi8qKlxuICogUmVyZW5kZXIgU3Ryb2tlIExpbmVzXG4gKi9cbmZ1bmN0aW9uIHN0cm9rZWxpbmVVcGRhdGUoKSB7XG4gICAgbGV0IGxheWVycyA9IGxheWVyUmVhZEFsbCgpO1xuICAgIGxldCBzZWxlY3RlZCA9IHt9XG4gICAgZm9yIChsZXQgaWQgaW4gbGF5ZXJzKSB7XG4gICAgICAgIGlmIChpZC5pbmNsdWRlcyhcInN0cm9rZWxpbmVcIikpIHtcbiAgICAgICAgICAgIHNlbGVjdGVkW2lkXSA9IGxheWVyc1tpZF07XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yIChsZXQgaG9sZSBvZiByb3VuZC5ob2xlcykge1xuICAgICAgICBsZXQgaWQgPSBzdHJva2VsaW5lSUQoaG9sZSk7XG4gICAgICAgIGlmIChPYmplY3Qua2V5cyhzZWxlY3RlZCkuaW5jbHVkZXMoaWQpKSB7XG4gICAgICAgICAgICBzZWxlY3RlZFtpZF0uc2V0TGF0TG5ncyhzdHJva2VsaW5lUG9pbnRzKGhvbGUpKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLyoqXG4gKiBDbGVhcnMgdGhlIGN1cnJlbnQgcG9seWxpbmVzIGNvbm5lY3RpbmcgbWFya2Vyc1xuICovXG5mdW5jdGlvbiBzdHJva2VsaW5lRGVsZXRlQWxsKCkge1xuICAgIGZvciAoY29uc3QgaG9sZSBvZiByb3VuZC5ob2xlcykge1xuICAgICAgICBsYXllckRlbGV0ZShzdHJva2VsaW5lSUQoaG9sZSkpXG4gICAgfVxufVxuXG4vKipcbiAqIEhlbHBlciBmdW5jdGlvbiBqdXN0IHRvIGdlbmVyYXRlIHBvaW50IGFycmF5cyBmb3IgYSBob2xlXG4gKiBAcGFyYW0ge09iamVjdH0gaG9sZVxuICogQHJldHVybnMge0FycmF5W2xhdExuZ119XG4gKi9cbmZ1bmN0aW9uIHN0cm9rZWxpbmVQb2ludHMoaG9sZSkge1xuICAgIGxldCBwb2ludHMgPSBbXVxuICAgIC8vIFNvcnQgc3Ryb2tlcyBieSBpbmRleCBhbmQgY29udmVydCB0byBMYXRMbmcgb2JqZWN0c1xuICAgIGhvbGUuc3Ryb2tlcy5zb3J0KChhLCBiKSA9PiBhLmluZGV4IC0gYi5pbmRleCkuZm9yRWFjaChzdHJva2UgPT4ge1xuICAgICAgICBwb2ludHMucHVzaChMLmxhdExuZyhzdHJva2Uuc3RhcnQueSwgc3Ryb2tlLnN0YXJ0LngpKTtcbiAgICB9KTtcblxuICAgIC8vIElmIGEgcGluIGlzIHNldCwgYWRkIGl0IHRvIHRoZSBlbmQgb2YgdGhlIHBvbHlsaW5lXG4gICAgaWYgKGhvbGUucGluKSB7XG4gICAgICAgIHBvaW50cy5wdXNoKEwubGF0TG5nKGhvbGUucGluLnksIGhvbGUucGluLngpKTtcbiAgICB9XG4gICAgcmV0dXJuIHBvaW50c1xufVxuXG4vKipcbiAqIEdlbmVyYXRlIGEgdW5pcXVlIGxheWVyIHByaW1hcnkga2V5IGZvciB0aGlzIGhvbGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBob2xlXG4gKiBAcmV0dXJucyBTdHJpbmdcbiAqL1xuZnVuY3Rpb24gc3Ryb2tlbGluZUlEKGhvbGUpIHtcbiAgICByZXR1cm4gYHN0cm9rZWxpbmVfaG9sZV8ke2hvbGUubnVtYmVyfWBcbn1cblxuLyoqXG4gKiA9PT09XG4gKiBIb2xlc1xuICogPT09PVxuICovXG5cbi8qKlxuICogU2VsZWN0IGEgbmV3IGhvbGUgYW5kIHVwZGF0ZSBwb2ludGVycy92aWV3cyB0byBtYXRjaFxuICogQHBhcmFtIHtOdW1iZXJ9IGhvbGVOdW1cbiAqL1xuZnVuY3Rpb24gaG9sZVNlbGVjdChob2xlTnVtKSB7XG4gICAgLy8gVXBkYXRlIGN1cnJlbnRIb2xlXG4gICAgaWYgKHJvdW5kLmhvbGVzW2hvbGVOdW0gLSAxXSkge1xuICAgICAgICBjdXJyZW50SG9sZSA9IHJvdW5kLmhvbGVzW2hvbGVOdW0gLSAxXTtcbiAgICAgICAgY3VycmVudFN0cm9rZUluZGV4ID0gY3VycmVudEhvbGUuc3Ryb2tlcy5sZW5ndGg7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihgQXR0ZW1wdGVkIHRvIHNlbGVjdCBob2xlICR7aG9sZU51bX0gYnV0IGRvZXMgbm90IGV4aXN0IWApO1xuICAgIH1cblxuICAgIC8vIERlbGV0ZSBhbGwgaG9sZS1zcGVjaWZpYyBsYXllcnMgYW5kIGFjdGl2ZSBzdGF0ZXNcbiAgICBob2xlVmlld0RlbGV0ZSgpO1xuXG4gICAgLy8gQWRkIGFsbCB0aGUgbGF5ZXJzIG9mIHRoaXMgbmV3IGhvbGVcbiAgICBob2xlVmlld0NyZWF0ZShjdXJyZW50SG9sZSk7XG4gICAgcmVyZW5kZXIoKTtcbiAgICBtYXBSZWNlbnRlcihcImN1cnJlbnRIb2xlXCIpXG59XG5cbi8qKlxuICogUmV0dXJucyBhIHVuaXF1ZSBsYXllciBJRCBmb3IgYSBnaXZlbiBIb2xlXG4gKiBAcGFyYW0ge0hvbGV9IGhvbGUgdGhlIGhvbGUgaW50ZXJmYWNlIG9iamVjdCBmcm9tIHJvdW5kXG4gKiBAcmV0dXJucyB7U3RyaW5nfVxuICovXG5mdW5jdGlvbiBob2xlUGluSUQoaG9sZSkge1xuICAgIHJldHVybiBgcGluX2hvbGVfJHtob2xlLm51bWJlcn1gXG59XG5cbi8qKlxuICogQWRkcyBhIHBpbiBtYXJrZXIgdG8gdGhlIG1hcC5cbiAqIEBwYXJhbSB7T2JqZWN0fSBob2xlIC0gVGhlIGhvbGUgdG8gYWRkIGEgcGluIGZvclxuICovXG5mdW5jdGlvbiBwaW5NYXJrZXJDcmVhdGUoaG9sZSkge1xuICAgIGNvbnNvbGUuZGVidWcoXCJDcmVhdGluZyBwaW4gbWFya2VyIGZvciBob2xlIFwiICsgaG9sZS5udW1iZXIpXG4gICAgY29uc3QgY29vcmRpbmF0ZSA9IGhvbGUucGluO1xuICAgIGNvbnN0IGhvbGVOdW0gPSBob2xlLm51bWJlclxuICAgIGNvbnN0IGZsYWdJY29uID0gTC5pY29uKHtcbiAgICAgICAgaWNvblVybDogXCJzdGF0aWMvaW1nL2ZsYWcucG5nXCIsIC8vIHJlcGxhY2Ugd2l0aCB0aGUgcGF0aCB0byB5b3VyIGZsYWcgaWNvblxuICAgICAgICBpY29uU2l6ZTogWzYwLCA2MF0sIC8vIHNpemUgb2YgdGhlIGljb25cbiAgICAgICAgaWNvbkFuY2hvcjogWzMwLCA2MF1cbiAgICB9KTtcbiAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgICBkcmFnZ2FibGU6IHRydWUsXG4gICAgICAgIGljb246IGZsYWdJY29uLFxuICAgICAgICB0aXRsZTogU3RyaW5nKGhvbGVOdW0pLFxuICAgIH07XG4gICAgY29uc3QgaWQgPSBob2xlUGluSUQoaG9sZSk7XG4gICAgbWFya2VyQ3JlYXRlKGlkLCBjb29yZGluYXRlLCBvcHRpb25zKTtcbn1cblxuLyoqXG4gKiBEcmF3IGEgaG9sZSBsaW5lIHNob3dpbmcgdGhlIGludGVuZGVkIHBsYXlpbmcgbGluZVxuICogQHBhcmFtIHtIb2xlfSBob2xlIHRoZSBIb2xlIGludGVyZmFjZSBvYmplY3RcbiAqL1xuZnVuY3Rpb24gaG9sZUxpbmVDcmVhdGUoaG9sZSkge1xuICAgIGxldCBsaW5lID0gZ3JpZHMuZ2V0R29sZkhvbGVMaW5lKHJvdW5kQ291cnNlUGFyYW1zKHJvdW5kKSwgaG9sZS5udW1iZXIpXG4gICAgaWYgKGxpbmUgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgICAgICByZXR1cm5cbiAgICB9XG4gICAgbGV0IGxheWVyID0gTC5nZW9KU09OKGxpbmUsIHtcbiAgICAgICAgc3R5bGU6ICgpID0+IHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc3Ryb2tlOiB0cnVlLFxuICAgICAgICAgICAgICAgIGNvbG9yOiAnI2ZmZicsXG4gICAgICAgICAgICAgICAgd2VpZ2h0OiAyLFxuICAgICAgICAgICAgICAgIG9wYWNpdHk6IDAuNVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBpbnRlcmFjdGl2ZTogZmFsc2VcbiAgICB9KTtcbiAgICBsYXllckNyZWF0ZShob2xlTGluZUlkKGhvbGUpLCBsYXllcik7XG59XG5cbi8qKlxuICogRGVsZXRlIGEgaG9sZSdzIGxpbmUsIG9yIGFsbCBob2xlIGxpbmVzXG4gKiBAcGFyYW0ge0hvbGV9IGhvbGUgdGhlIEhvbGUgaW50ZXJmYWNlIG9iamVjdCwgb3B0aW9uYWwuIElmIG5vdCBnaXZlbiwgZGVsZXRlXG4gKiBhbGwgaG9sZSBsaW5lc1xuICovXG5mdW5jdGlvbiBob2xlTGluZURlbGV0ZShob2xlKSB7XG4gICAgaWYgKGhvbGUpIHtcbiAgICAgICAgbGF5ZXJEZWxldGUoaG9sZUxpbmVJZChob2xlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgZm9yIChsZXQgaG9sZSBvZiByb3VuZC5ob2xlcykge1xuICAgICAgICAgICAgbGF5ZXJEZWxldGUoaG9sZUxpbmVJZChob2xlKSk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbi8qKlxuICogUmV0dXJuIGEgdW5pcXVlIElEIGZvciBhIGhvbGUgbGluZSBsYXllclxuICogQHBhcmFtIHtIb2xlfSBob2xlIHRoZSBIb2xlIGludGVyZmFjZSBvYmplY3RcbiAqIEByZXR1cm5zIHtTdHJpbmd9IGEgdW5pcXVlIElEXG4gKi9cbmZ1bmN0aW9uIGhvbGVMaW5lSWQoaG9sZSkge1xuICAgIHJldHVybiBgaG9sZV8ke2hvbGUubnVtYmVyfV9saW5lYFxufVxuXG4vKipcbiAqID09PT09PVxuICogUm91bmRzXG4gKiA9PT09PT1cbiAqL1xuXG4vKipcbiAqIENyZWF0ZSBhIG5ldyByb3VuZCBhbmQgY2xlYXIgYXdheSBhbGwgb2xkIGRhdGFcbiAqIFRyaWVzIHRvIGJhY2tncm91bmQgZmV0Y2ggY291cnNlIGRhdGEgYW5kIHdpbGwgY2FsbCAjcm91bmRVcGRhdGVXaXRoRGF0YSBhZnRlciBsb2FkZWRcbiAqIEBwYXJhbSB7Q291cnNlfSBjb3Vyc2VQYXJhbXMgdGhlIGNvdXJzZVxuICovXG5mdW5jdGlvbiByb3VuZENyZWF0ZShjb3Vyc2VQYXJhbXMpIHtcbiAgICAvLyBTZXQgdW5kbyBwb2ludFxuICAgIHVuZG9DcmVhdGUoXCJyb3VuZENyZWF0ZVwiKVxuICAgIGxldCBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY291cnNlTmFtZVwiKTtcbiAgICBpZiAoIShlbCBpbnN0YW5jZW9mIEhUTUxJbnB1dEVsZW1lbnQpKSB7XG4gICAgICAgIHJldHVyblxuICAgIH1cbiAgICBsZXQgaW5wdXRWYWw6IHN0cmluZyA9IGVsLnZhbHVlO1xuICAgIGlmICghY291cnNlUGFyYW1zICYmICFpbnB1dFZhbCkge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiQ2Fubm90IGNyZWF0ZSBhIHJvdW5kIHdpdGhvdXQgYW55IGlucHV0c1wiKTtcbiAgICAgICAgcmV0dXJuXG4gICAgfSBlbHNlIGlmICghY291cnNlUGFyYW1zKSB7XG4gICAgICAgIGxldCBlbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY291cnNlTmFtZVwiKTtcbiAgICAgICAgaWYgKCEoZWwgaW5zdGFuY2VvZiBIVE1MSW5wdXRFbGVtZW50KSkge1xuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgbGV0IGlucHV0VmFsOiBzdHJpbmcgPSBlbC52YWx1ZTtcbiAgICAgICAgY291cnNlUGFyYW1zID0geyBjb3Vyc2VOYW1lOiBpbnB1dFZhbCB9XG4gICAgfVxuICAgIGxldCBjb3Vyc2VOYW1lID0gY291cnNlUGFyYW1zW1wibmFtZVwiXTtcbiAgICBsZXQgY291cnNlSWQgPSBjb3Vyc2VQYXJhbXNbXCJpZFwiXTtcblxuICAgIC8vIFJlc2V0IGFsbCBtYWpvciBkYXRhXG4gICAgbG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oXCJnb2xmRGF0YVwiKTtcbiAgICByb3VuZCA9IHsgLi4uZGVmYXVsdFJvdW5kKCksIGNvdXJzZTogY291cnNlTmFtZSwgY291cnNlSWQ6IGNvdXJzZUlkIH07XG4gICAgY3VycmVudEhvbGUgPSByb3VuZC5ob2xlcy5hdCgwKVxuICAgIGN1cnJlbnRTdHJva2VJbmRleCA9IDA7XG4gICAgbGF5ZXJEZWxldGVBbGwoKTtcbiAgICBncmlkcy5mZXRjaEdvbGZDb3Vyc2VEYXRhKGNvdXJzZVBhcmFtcykudGhlbihyb3VuZFVwZGF0ZVdpdGhEYXRhKTtcbn1cblxuLyoqXG4gKiBBZnRlciBkb3dubG9hZGluZyBwb2x5Z29ucywgdXBkYXRlIHRoZSBSb3VuZCB3aXRoIHJlbGV2YW50IGRhdGEgbGlrZSBwaW5zIGFuZCBob2xlc1xuICogQHBhcmFtIHtGZWF0dXJlQ29sbGVjdGlvbn0gY291cnNlRGF0YSB0aGUgcG9seWdvbnMgZm9yIHRoaXMgY291cnNlXG4gKi9cbmZ1bmN0aW9uIHJvdW5kVXBkYXRlV2l0aERhdGEoY291cnNlRGF0YSkge1xuICAgIGxldCBsaW5lcyA9IGNvdXJzZURhdGEuZmVhdHVyZXMuZmlsdGVyKChmZWF0dXJlKSA9PiBmZWF0dXJlLnByb3BlcnRpZXMuZ29sZiAmJiBmZWF0dXJlLnByb3BlcnRpZXMuZ29sZiA9PSBcImhvbGVcIilcbiAgICBmb3IgKGxldCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICAgIGNvbnN0IG51bWJlciA9IHBhcnNlSW50KGxpbmUucHJvcGVydGllcy5yZWYpO1xuICAgICAgICBjb25zdCBjb2cgPSBncmlkcy5nZXRHb2xmSG9sZUdyZWVuQ2VudGVyKHJvdW5kQ291cnNlUGFyYW1zKHJvdW5kKSwgbnVtYmVyKTtcbiAgICAgICAgY29uc3QgcGluID0ge1xuICAgICAgICAgICAgeDogY29nWzBdLFxuICAgICAgICAgICAgeTogY29nWzFdLFxuICAgICAgICAgICAgY3JzOiBcIkVQU0c6NDMyNlwiLFxuICAgICAgICB9O1xuICAgICAgICBsZXQgaG9sZSA9IHsgLi4uZGVmYXVsdEN1cnJlbnRIb2xlKCksIG51bWJlcjogbnVtYmVyLCBwaW46IHBpbiB9O1xuICAgICAgICBpZiAobGluZS5wcm9wZXJ0aWVzLnBhcikge1xuICAgICAgICAgICAgaG9sZVtcInBhclwiXSA9IHBhcnNlSW50KGxpbmUucHJvcGVydGllcy5wYXIpXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGxpbmUucHJvcGVydGllcy5oYW5kaWNhcCkge1xuICAgICAgICAgICAgaG9sZVtcImhhbmRpY2FwXCJdID0gcGFyc2VJbnQobGluZS5wcm9wZXJ0aWVzLmhhbmRpY2FwKVxuICAgICAgICB9XG4gICAgICAgIHJvdW5kLmhvbGVzW2hvbGUubnVtYmVyIC0gMV0gPSB7IC4uLmhvbGUsIC4uLnJvdW5kLmhvbGVzW2hvbGUubnVtYmVyIC0gMV0gfVxuICAgIH1cbiAgICBob2xlU2VsZWN0Vmlld1VwZGF0ZSgpO1xuICAgIHJlcmVuZGVyKCk7XG4gICAgZm9yIChsZXQgaG9sZSBvZiByb3VuZC5ob2xlcykge1xuICAgICAgICBob2xlVmlld0NyZWF0ZShob2xlKVxuICAgIH1cbiAgICBtYXBSZWNlbnRlcihcImNvdXJzZVwiKTtcbn1cblxuLyoqXG4gKiBSZXR1cm4gYSBkZWZhdWx0IEhvbGUgb2JqZWN0IGNvbmZvcm1pbmcgdG8gdGhlIGludGVyZmFjZVxuICogQHJldHVybnMge0hvbGV9IGEgZGVmYXVsdCBIb2xlIGludGVyZmFjZVxuICovXG5mdW5jdGlvbiBkZWZhdWx0Q3VycmVudEhvbGUoKTogSG9sZSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgbnVtYmVyOiAxLFxuICAgICAgICBzdHJva2VzOiBbXSxcbiAgICB9O1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBkZWZhdWx0IFJvdW5kIG9iamVjdCBjb25mb3JtaW5nIHRvIHRoZSBpbnRlcmZhY2VcbiAqIEByZXR1cm5zIHtSb3VuZH0gYSBkZWZhdWx0IFJvdW5kIGludGVyZmFjZVxuICovXG5mdW5jdGlvbiBkZWZhdWx0Um91bmQoKTogUm91bmQge1xuICAgIHJldHVybiB7XG4gICAgICAgIGRhdGU6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgY291cnNlOiBcIlJhbmNobyBQYXJrIEdvbGYgQ291cnNlXCIsXG4gICAgICAgIGhvbGVzOiBbZGVmYXVsdEN1cnJlbnRIb2xlKCldLFxuICAgIH07XG59XG5cbi8qKlxuICogUmV0dXJuIGEgY291cnNlIGludGVyZmFjZSBnaXZlbiBhIHJvdW5kIGludGVyZmFjZVxuICogQHBhcmFtIHtSb3VuZH0gcm91bmQgdGhlIHJvdW5kIG9iamVjdFxuICogQHJldHVybnMge0NvdXJzZX0gdGhlIGNvdXJzZSBwYXJhbWV0ZXJzXG4gKi9cbmZ1bmN0aW9uIHJvdW5kQ291cnNlUGFyYW1zKHJvdW5kKSB7XG4gICAgcmV0dXJuIHsgJ25hbWUnOiByb3VuZC5jb3Vyc2UsICdpZCc6IHJvdW5kLmNvdXJzZUlkIH1cbn1cblxuLyoqXG4gKiA9PT09PVxuICogQ2x1YnNcbiAqID09PT09XG4gKi9cblxuLyoqXG4gKiBDcmVhdGUgYSBuZXcgc3Ryb2tlIGZvciBhIGdpdmVuIGNsdWIgYXQgY3VycmVudCBwb3NpdGlvblxuICogQHBhcmFtIHtPYmplY3R9IHBvc2l0aW9uXG4gKi9cbmZ1bmN0aW9uIGNsdWJTdHJva2VDcmVhdGUocG9zaXRpb24sIGNsdWIpIHtcbiAgICBsZXQgb3B0aW9ucyA9IHtcbiAgICAgICAgY2x1YjogY2x1Yi5uYW1lLFxuICAgICAgICBkaXNwZXJzaW9uOiBjbHViLmRpc3BlcnNpb24sXG4gICAgfVxuICAgIHN0cm9rZUNyZWF0ZShwb3NpdGlvbiwgb3B0aW9ucylcbn1cblxuLyoqXG4gKiBMb29rdXAgZnVuY3Rpb24gdG8gZ2V0IGFsbCBjbHVicyBpbiB0aGUgYmFja2VuZCwgY3VycmVudGx5IHN0YXRpY1xuICogQHJldHVybnMge0FycmF5fVxuICovXG5mdW5jdGlvbiBjbHViUmVhZEFsbCgpIHtcbiAgICByZXR1cm4gW1xuICAgICAgICB7IGlkOiAxLCBuYW1lOiBcIkRcIiwgZGlzcGVyc2lvbjogMzkgfSxcbiAgICAgICAgeyBpZDogMiwgbmFtZTogXCIzd1wiLCBkaXNwZXJzaW9uOiAzNSB9LFxuICAgICAgICB7IGlkOiAzLCBuYW1lOiBcIjNoXCIsIGRpc3BlcnNpb246IDI4IH0sXG4gICAgICAgIHsgaWQ6IDQsIG5hbWU6IFwiNGlcIiwgZGlzcGVyc2lvbjogMjMgfSxcbiAgICAgICAgeyBpZDogNSwgbmFtZTogXCI1aVwiLCBkaXNwZXJzaW9uOiAyMS41IH0sXG4gICAgICAgIHsgaWQ6IDYsIG5hbWU6IFwiNmlcIiwgZGlzcGVyc2lvbjogMTcgfSxcbiAgICAgICAgeyBpZDogNywgbmFtZTogXCI3aVwiLCBkaXNwZXJzaW9uOiAxNiB9LFxuICAgICAgICB7IGlkOiA4LCBuYW1lOiBcIjhpXCIsIGRpc3BlcnNpb246IDEzLjUgfSxcbiAgICAgICAgeyBpZDogOSwgbmFtZTogXCI5aVwiLCBkaXNwZXJzaW9uOiAxMS41IH0sXG4gICAgICAgIHsgaWQ6IDEwLCBuYW1lOiBcIlB3XCIsIGRpc3BlcnNpb246IDEwIH0sXG4gICAgICAgIHsgaWQ6IDExLCBuYW1lOiBcIkF3XCIsIGRpc3BlcnNpb246IDcuNSB9LFxuICAgICAgICB7IGlkOiAxMiwgbmFtZTogXCJTd1wiLCBkaXNwZXJzaW9uOiA2IH0sXG4gICAgICAgIHsgaWQ6IDEzLCBuYW1lOiBcIkx3XCIsIGRpc3BlcnNpb246IDUgfSxcbiAgICAgICAgeyBpZDogMTQsIG5hbWU6IFwiUFwiLCBkaXNwZXJzaW9uOiAtMC4xNSB9LFxuICAgICAgICB7IGlkOiAxNSwgbmFtZTogXCJQZW5hbHR5XCIsIGRpc3BlcnNpb246IDEsIGNsYXNzOiBcImRhbmdlclwiIH0sXG4gICAgICAgIHsgaWQ6IDE2LCBuYW1lOiBcIlNraXBcIiwgZGlzcGVyc2lvbjogMSwgY2xhc3M6IFwic2Vjb25kYXJ5XCIgfSxcbiAgICBdXG59XG5cbi8qKlxuICogPT09PT09PT09PT09PT1cbiAqIFNhdmluZy9Mb2FkaW5nXG4gKiA9PT09PT09PT09PT09PVxuICovXG4vKipcbiAqIFNhdmVzIHRoZSBjdXJyZW50IGRhdGEgdG8gbG9jYWxTdG9yYWdlLlxuICovXG5cbi8qKlxuICogU2F2ZSByb3VuZCBkYXRhIHRvIGxvY2Fsc3RvcmFnZVxuICovXG5mdW5jdGlvbiBzYXZlRGF0YSgpIHtcbiAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShcbiAgICAgICAgXCJnb2xmRGF0YVwiLFxuICAgICAgICBKU09OLnN0cmluZ2lmeSh7IC4uLnJvdW5kIH0pXG4gICAgKTtcbn1cblxuLyoqXG4gKiBMb2FkcyB0aGUgZGF0YSBmcm9tIGxvY2FsU3RvcmFnZSBhbmQgaW5pdGlhbGl6ZXMgdGhlIG1hcC5cbiAqL1xuZnVuY3Rpb24gbG9hZERhdGEoKSB7XG4gICAgY29uc3QgbG9hZGVkRGF0YSA9IEpTT04ucGFyc2UobG9jYWxTdG9yYWdlLmdldEl0ZW0oXCJnb2xmRGF0YVwiKSk7XG4gICAgaWYgKGxvYWRlZERhdGEpIHtcbiAgICAgICAgcm91bmQgPSBsb2FkZWREYXRhO1xuICAgICAgICBjb25zb2xlLmxvZyhcIlJlaHlkcmF0aW5nIHJvdW5kIGZyb20gbG9jYWxTdG9yYWdlXCIpXG4gICAgICAgIHJvdW5kLmhvbGVzLmZvckVhY2goZnVuY3Rpb24gKGhvbGUpIHtcbiAgICAgICAgICAgIGhvbGVWaWV3Q3JlYXRlKGhvbGUpO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBsYXN0SG9sZSA9IHJvdW5kLmhvbGVzLnJlZHVjZSgoYWNjLCBob2xlKSA9PiB7XG4gICAgICAgICAgICBpZiAoaG9sZS5zdHJva2VzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaG9sZS5udW1iZXI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBhY2M7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIDEpO1xuICAgICAgICBjdXJyZW50SG9sZSA9IHJvdW5kLmhvbGVzW2xhc3RIb2xlIC0gMV07XG4gICAgICAgIGN1cnJlbnRTdHJva2VJbmRleCA9IGN1cnJlbnRIb2xlLnN0cm9rZXMubGVuZ3RoO1xuICAgIH1cbiAgICByZXJlbmRlcigpO1xufVxuXG4vKipcbiAqID09PT09PT09PT09XG4gKiBCYXNlIE1hcmtlclxuICogPT09PT09PT09PT1cbiAqL1xuXG4vKipcbiAqIEFkZHMgYSBtYXJrZXIgdG8gdGhlIG1hcC5cbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIC0gdGhlIG5hbWUgb2YgdGhlIG1hcmtlclxuICogQHBhcmFtIHtPYmplY3R9IGNvb3JkaW5hdGUgLSBUaGUgY29vcmRpbmF0ZSBvYmplY3QgeyB4LCB5LCBjcnMgfS5cbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gTWFya2VyIG9wdGlvbnMuXG4gKiBAcmV0dXJucyB7TWFya2VyfSBhIGxlYWZsZXQgbWFya2VyXG4gKi9cbmZ1bmN0aW9uIG1hcmtlckNyZWF0ZShuYW1lLCBjb29yZGluYXRlLCBvcHRpb25zPykge1xuICAgIG9wdGlvbnMgPSB7IGRyYWdnYWJsZTogdHJ1ZSwgLi4ub3B0aW9ucyB9XG4gICAgY29uc3QgbWFya2VyID0gTC5tYXJrZXIoW2Nvb3JkaW5hdGUueSwgY29vcmRpbmF0ZS54XSwgb3B0aW9ucyk7XG4gICAgbWFya2VyLm9uKFwiZHJhZ1wiLCBoYW5kbGVNYXJrZXJEcmFnKG1hcmtlciwgY29vcmRpbmF0ZSkpO1xuICAgIG1hcmtlci5vbihcImRyYWdlbmRcIiwgKCgpID0+IHJlcmVuZGVyKFwiZHJhZ2VuZFwiKSkpO1xuICAgIGxheWVyQ3JlYXRlKG5hbWUsIG1hcmtlcilcbiAgICBzdHJva2VsaW5lVXBkYXRlKCk7XG4gICAgcmV0dXJuIG1hcmtlclxufVxuXG4vKipcbiAqIFNob3J0Y3V0IGZhY3RvcnkgZm9yIG1hcmtlciBkcmFnIGNhbGxiYWNrc1xuICogQHBhcmFtIHtMLm1hcmtlcn0gbWFya2VyXG4gKi9cbmZ1bmN0aW9uIGhhbmRsZU1hcmtlckRyYWcobWFya2VyLCBjb29yZGluYXRlKSB7XG4gICAgcmV0dXJuIChmdW5jdGlvbiBtZHJhZyhldmVudCkge1xuICAgICAgICBjb25zdCBwb3NpdGlvbiA9IG1hcmtlci5nZXRMYXRMbmcoKTtcbiAgICAgICAgY29vcmRpbmF0ZS54ID0gcG9zaXRpb24ubG5nO1xuICAgICAgICBjb29yZGluYXRlLnkgPSBwb3NpdGlvbi5sYXQ7XG4gICAgICAgIHJlcmVuZGVyKCk7XG4gICAgfSk7XG59XG5cbi8qKlxuICogPT09PT09PT09PT09PT09PT09XG4gKiBVbmRvIGZ1bmN0aW9uYWx0aXlcbiAqID09PT09PT09PT09PT09PT09PVxuICovXG5cbi8qKlxuICogSGFuZGxlcyB0aGUgY2xpY2sgZXZlbnQgZm9yIHVuZG9pbmcgdGhlIGxhc3QgYWN0aW9uLlxuICovXG5mdW5jdGlvbiBoYW5kbGVVbmRvQWN0aW9uQ2xpY2soKSB7XG4gICAgdW5kb1J1bigpO1xufVxuXG4vKipcbiAqIFNldCBhbiB1bmRvIHBvaW50IHRoYXQgeW91IGNhbiByZXR1cm4gdG9cbiAqIEBwYXJhbSB7U3RyaW5nfSBhY3Rpb25cbiAqL1xuZnVuY3Rpb24gdW5kb0NyZWF0ZShhY3Rpb24pIHtcbiAgICBhY3Rpb25TdGFjay5wdXNoKHtcbiAgICAgICAgYWN0aW9uLFxuICAgICAgICByb3VuZDogc3RydWN0dXJlZENsb25lKHJvdW5kKSxcbiAgICAgICAgY3VycmVudEhvbGVOdW06IGN1cnJlbnRIb2xlLm51bWJlcixcbiAgICAgICAgY3VycmVudFN0cm9rZUluZGV4LFxuICAgIH0pO1xuICAgIGNvbnNvbGUuZGVidWcoYENyZWF0ZWQgYSBuZXcgdW5kbyBwb2ludCBmb3IgYWN0aW9uIyR7YWN0aW9ufWApXG59XG5cbi8qKlxuICogVW5kbyBvZmYgdGhlIHRvcCBvZiB0aGUgYWN0aW9uIHN0YWNrXG4gKi9cbmZ1bmN0aW9uIHVuZG9SdW4oKSB7XG4gICAgaWYgKGFjdGlvblN0YWNrLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgcHJldmlvdXNBY3Rpb24gPSBhY3Rpb25TdGFjay5wb3AoKTtcbiAgICAgICAgcm91bmQgPSBwcmV2aW91c0FjdGlvbi5yb3VuZDtcbiAgICAgICAgY3VycmVudEhvbGUgPSByb3VuZC5ob2xlc1twcmV2aW91c0FjdGlvbi5jdXJyZW50SG9sZU51bSAtIDFdO1xuICAgICAgICBjdXJyZW50U3Ryb2tlSW5kZXggPSBwcmV2aW91c0FjdGlvbi5jdXJyZW50U3Ryb2tlSW5kZXg7XG4gICAgICAgIGhvbGVTZWxlY3QocHJldmlvdXNBY3Rpb24uY3VycmVudEhvbGVOdW0pO1xuICAgICAgICBzYXZlRGF0YSgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZXJyb3JcIikuaW5uZXJUZXh0ID0gXCJObyBhY3Rpb24gdG8gdW5kby5cIjtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIk5vIGFjdGlvbiB0byB1bmRvLlwiKTtcbiAgICB9XG59XG5cbi8qKlxuICogPT09PT09PT1cbiAqIExheWVyU2V0XG4gKiBBIGZyb250ZW5kIGZvciB0cmFja2luZyBhbmQgcmVhZGluZyBiYWNrIG91dCBsYXllcnNcbiAqID09PT09PT09XG4gKi9cblxuLyoqXG4gKiBTdG9yZSBhIGxheWVyIGluIHRoZSBsYXllclNldFxuICogQHBhcmFtIHtTdHJpbmd9IGlkXG4gKiBAcGFyYW0geyp9IG9iamVjdFxuICovXG5mdW5jdGlvbiBsYXllckNyZWF0ZShpZCwgb2JqZWN0KSB7XG4gICAgaWYgKGxheWVyc1tpZF0pIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihgTGF5ZXIgRXJyb3I6IElEICR7aWR9IGFscmVhZHkgZXhpc3RzIWApXG4gICAgICAgIHJldHVyblxuICAgIH1cbiAgICBsYXllcnNbaWRdID0gb2JqZWN0XG4gICAgbWFwVmlldy5hZGRMYXllcihvYmplY3QpXG59XG5cbi8qKlxuICogR2V0IGEgdmlldyBsYXllciBmcm9tIHRoZSBMYXllciBTZXQgdXNpbmcgYW4gSURcbiAqIEBwYXJhbSB7U3RyaW5nfSBpZFxuICogQHJldHVybnMgeyp9IG9iamVjdCBmcm9tIGRiXG4gKi9cbmZ1bmN0aW9uIGxheWVyUmVhZChpZCkge1xuICAgIHJldHVybiBsYXllcnNbaWRdXG59XG5cbi8qKlxuICogRGVsZXRlIGEgbGF5ZXIgd2l0aCBhIGdpdmVuIElEXG4gKiBAcGFyYW0ge1N0cmluZ30gaWRcbiAqL1xuZnVuY3Rpb24gbGF5ZXJEZWxldGUoaWQpIHtcbiAgICBpZiAobGF5ZXJzW2lkXSkge1xuICAgICAgICBtYXBWaWV3LnJlbW92ZUxheWVyKGxheWVyc1tpZF0pXG4gICAgICAgIGRlbGV0ZSBsYXllcnNbaWRdXG4gICAgfVxufVxuXG4vKipcbiAqIERlbGV0ZSBhbGwgbGF5ZXJzXG4gKi9cbmZ1bmN0aW9uIGxheWVyRGVsZXRlQWxsKCkge1xuICAgIGZvciAoY29uc3QgaWQgaW4gbGF5ZXJzKSB7XG4gICAgICAgIG1hcFZpZXcucmVtb3ZlTGF5ZXIobGF5ZXJzW2lkXSlcbiAgICAgICAgZGVsZXRlIGxheWVyc1tpZF1cbiAgICB9XG59XG5cbi8qKlxuICogUmV0dXJuIGFuIG9iamVjdCBvZiBpZCB0byBsYXllcnNcbiAqIEByZXR1cm5zIHtPYmplY3R9XG4gKi9cbmZ1bmN0aW9uIGxheWVyUmVhZEFsbCgpIHtcbiAgICByZXR1cm4gbGF5ZXJzXG59XG5cbi8qKlxuICogPT09PT09PT09XG4gKiBVdGlsaXRpZXNcbiAqID09PT09PT09PVxuICovXG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgZGlzdGFuY2UgYmV0d2VlbiB0d28gY29vcmRpbmF0ZXMgaW4gbWV0ZXJzLlxuICogQHBhcmFtIHtPYmplY3R9IGNvb3JkMSAtIFRoZSBmaXJzdCBjb29yZGluYXRlIG9iamVjdCB7IHgsIHkgfS5cbiAqIEBwYXJhbSB7T2JqZWN0fSBjb29yZDIgLSBUaGUgc2Vjb25kIGNvb3JkaW5hdGUgb2JqZWN0IHsgeCwgeSB9LlxuICogQHJldHVybnMge251bWJlcn0gVGhlIGRpc3RhbmNlIGJldHdlZW4gdGhlIGNvb3JkaW5hdGVzIGluIG1ldGVycy5cbiAqL1xuZnVuY3Rpb24gZ2V0RGlzdGFuY2UoY29vcmQxLCBjb29yZDIpIHtcbiAgICBjb25zdCBsYXQxID0gY29vcmQxLnk7XG4gICAgY29uc3QgbG9uMSA9IGNvb3JkMS54O1xuICAgIGNvbnN0IGxhdDIgPSBjb29yZDIueTtcbiAgICBjb25zdCBsb24yID0gY29vcmQyLng7XG4gICAgY29uc3QgUiA9IDYzNzFlMzsgLy8gbWV0ZXJzXG4gICAgY29uc3QgcGhpMSA9IChsYXQxICogTWF0aC5QSSkgLyAxODA7IC8vIHBoaSwgbGFtYmRhIGluIHJhZGlhbnNcbiAgICBjb25zdCBwaGkyID0gKGxhdDIgKiBNYXRoLlBJKSAvIDE4MDtcbiAgICBjb25zdCBkZWx0YVBoaSA9ICgobGF0MiAtIGxhdDEpICogTWF0aC5QSSkgLyAxODA7XG4gICAgY29uc3QgZGVsdGFMYW1iZGEgPSAoKGxvbjIgLSBsb24xKSAqIE1hdGguUEkpIC8gMTgwO1xuXG4gICAgY29uc3QgYSA9XG4gICAgICAgIE1hdGguc2luKGRlbHRhUGhpIC8gMikgKiBNYXRoLnNpbihkZWx0YVBoaSAvIDIpICtcbiAgICAgICAgTWF0aC5jb3MocGhpMSkgKiBNYXRoLmNvcyhwaGkyKSAqIE1hdGguc2luKGRlbHRhTGFtYmRhIC8gMikgKiBNYXRoLnNpbihkZWx0YUxhbWJkYSAvIDIpO1xuICAgIGNvbnN0IGMgPSAyICogTWF0aC5hdGFuMihNYXRoLnNxcnQoYSksIE1hdGguc3FydCgxIC0gYSkpO1xuXG4gICAgY29uc3QgZGlzdGFuY2UgPSBSICogYzsgLy8gbWV0ZXJzXG4gICAgcmV0dXJuIGRpc3RhbmNlO1xufVxuXG4vKipcbiAqIEdldCB0aGUgdXNlcidzIGxvY2F0aW9uIGZyb20gYnJvd3NlciBvciBjYWNoZVxuICogQHBhcmFtIHtib29sZWFufSBmb3JjZSBzZXQgdG8gdHJ1ZSB0byBza2lwIGxvY2F0aW9uIGNhY2hlXG4gKiBAcmV0dXJucyB7UHJvbWlzZX0gcmVzb2x2ZXMgd2l0aCBhIEdlb2xvY2F0aW9uUG9zaXRpb25cbiAqL1xuZnVuY3Rpb24gZ2V0TG9jYXRpb24oZm9yY2U/KSB7XG4gICAgLy8gSWYgbG9jYXRpb24gaXMgbm90IHlldCB0cmFja2VkLCB0dXJuIG9uIEJHIHRyYWNraW5nICsgZm9yY2UgcmVmcmVzaFxuICAgIGlmICghKGN1cnJlbnRQb3NpdGlvbkVuYWJsZWQpKSB7XG4gICAgICAgIGN1cnJlbnRQb3NpdGlvblVwZGF0ZSgpO1xuICAgICAgICBmb3JjZSA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIGNvbnN0IHBvc2l0aW9uID0gY3VycmVudFBvc2l0aW9uUmVhZCgpO1xuICAgICAgICBpZiAocG9zaXRpb24gJiYgIShmb3JjZSkpIHtcbiAgICAgICAgICAgIHJlc29sdmUocG9zaXRpb24pO1xuICAgICAgICB9IGVsc2UgaWYgKCFuYXZpZ2F0b3IuZ2VvbG9jYXRpb24pIHtcbiAgICAgICAgICAgIC8vIENyZWF0ZSBhIGN1c3RvbSBwb3NpdGlvbiBlcnJvclxuICAgICAgICAgICAgbGV0IGUgPSBuZXcgTm9HZW9sb2NhdGlvbkVycm9yKFwiR2VvbG9jYXRpb24gaXMgbm90IHN1cHBvcnRlZCBieSB0aGlzIGJyb3dzZXIuXCIsIDIpO1xuICAgICAgICAgICAgcmVqZWN0KGUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbmF2aWdhdG9yLmdlb2xvY2F0aW9uLmdldEN1cnJlbnRQb3NpdGlvbihyZXNvbHZlLCByZWplY3QpO1xuICAgICAgICB9XG4gICAgfSk7XG59XG5cbi8qKlxuICogR2V0IHRoZSB1c2VyJ3MgbG9jYXRpb24gYW5kIGNvbXBhcmUgYWdhaW5zdCBhIGNvbmRpdGlvblxuICogVGhlIGNvbmRpdGlvbiBmdW5jdGlvbiB3aWxsIGJlIGNhbGxlZCB3aXRoIHRoZSBHZW9sb2NhdGlvblBvc2l0aW9uLCBzaG91bGRcbiAqIHJldHVybiBUcnVlIHRvIGFjY2VwdCB0aGUgZ2VvbG9jYXRpb24gb3IgRmFsc2UgdG8gcmVqZWN0IHRoZSBwcm9taXNlXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjb25kaXRpb25cbiAqIEByZXR1cm5zIHtQcm9taXNlfSByZXNvbHZlcyB3aXRoIGEgR2VvbG9jYXRpb25Qb3NpdGlvbi1pc2hcbiAqL1xuZnVuY3Rpb24gZ2V0TG9jYXRpb25JZihjb25kaXRpb24pIHtcbiAgICByZXR1cm4gZ2V0TG9jYXRpb24oKS50aGVuKChwb3NpdGlvbikgPT4ge1xuICAgICAgICBpZiAoY29uZGl0aW9uKHBvc2l0aW9uKSkge1xuICAgICAgICAgICAgcmV0dXJuIHBvc2l0aW9uO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRmFpbGVkIGNvbmRpdGlvbmFsIHRlc3RcIik7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuLyoqXG4gKiBBc2sgdGhlIHVzZXIgdG8gY2xpY2sgdGhlIG1hcCB0byBzZXQgYSBsb2NhdGlvblxuICogRm9yIGV4YW1wbGUsIGlmIHRoZSB1c2VyIGlzIHdheSBvdXQgb2YgYm91bmRzXG4gKiBAcmV0dXJucyB7Y29vcmRpbmF0ZX0gdGhlIGNsaWNrIGxvY2F0aW9uXG4gKi9cbmZ1bmN0aW9uIGdldENsaWNrTG9jYXRpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZXJyb3JcIikuaW5uZXJUZXh0ID0gXCJDbGljayB0aGUgbWFwIHRvIHNldCBsb2NhdGlvblwiO1xuICAgICAgICBtYXBWaWV3Lm9uKCdjbGljaycsIChlKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjbGlja1Bvc2l0aW9uID0ge1xuICAgICAgICAgICAgICAgIGNvb3Jkczoge1xuICAgICAgICAgICAgICAgICAgICBsYXRpdHVkZTogZS5sYXRsbmcubGF0LFxuICAgICAgICAgICAgICAgICAgICBsb25naXR1ZGU6IGUubGF0bG5nLmxuZyxcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImVycm9yXCIpLmlubmVyVGV4dCA9IFwiXCJcbiAgICAgICAgICAgIHJlc29sdmUoY2xpY2tQb3NpdGlvbik7XG4gICAgICAgIH0pO1xuICAgIH0pO1xufVxuXG4vKipcbiAqIEdldCBlaXRoZXIgdGhlIHVzZXIncyBsb2NhdGlvbiBpbiBhIGdpdmVuIGJvdW5kIG9yIGFzayB0aGVtIHRvIGNsaWNrXG4gKiBAcGFyYW0ge0ZlYXR1cmVDb2xsZWN0aW9ufSBib3VuZFxuICogQHJldHVybnMge1Byb21pc2V9IHJlc29sdmVzIHdpdGggYSBHZW9sb2NhdGlvblBvc2l0aW9uLWlzaFxuICovXG5mdW5jdGlvbiBnZXRMb2NhdGlvbldpdGhpbihib3VuZCkge1xuICAgIHJldHVybiBnZXRMb2NhdGlvbklmKChwb3NpdGlvbikgPT4ge1xuICAgICAgICBjb25zdCBwb2ludCA9IHR1cmYucG9pbnQoW3Bvc2l0aW9uLmNvb3Jkcy5sb25naXR1ZGUsIHBvc2l0aW9uLmNvb3Jkcy5sYXRpdHVkZV0pXG4gICAgICAgIHJldHVybiB0dXJmLmJvb2xlYW5XaXRoaW4ocG9pbnQsIGJvdW5kKVxuICAgIH0pLmNhdGNoKGdldENsaWNrTG9jYXRpb24pO1xufVxuXG4vKipcbiAqIEdldCBlaXRoZXIgdGhlIHVzZXIncyBsb2NhdGlvbiBpbiB0aGUgbWFwIG9yIGFzayB0aGVtIHRvIGNsaWNrXG4gKiBPbmx5IHVzZWZ1bCBiZWNhdXNlIHBvbHlnb25pemluZyB0aGUgbWFwIGZvciB0dXJmIGlzIGEgcGFpblxuICogQHJldHVybnMge1Byb21pc2V9IHJlc29sdmVzIHdpdGggYSBHZW9sb2NhdGlvblBvc2l0aW9uLWlzaFxuICovXG5mdW5jdGlvbiBnZXRMb2NhdGlvbk9uTWFwKCkge1xuICAgIHJldHVybiBnZXRMb2NhdGlvbklmKChwb3NpdGlvbikgPT4ge1xuICAgICAgICBjb25zdCB1c2VyTGF0TG5nID0gTC5sYXRMbmcocG9zaXRpb24uY29vcmRzLmxhdGl0dWRlLCBwb3NpdGlvbi5jb29yZHMubG9uZ2l0dWRlKTtcbiAgICAgICAgcmV0dXJuIG1hcFZpZXcuZ2V0Qm91bmRzKCkuY29udGFpbnModXNlckxhdExuZylcbiAgICB9KS5jYXRjaChnZXRDbGlja0xvY2F0aW9uKTtcbn1cblxuLyoqXG4gKiBTaG9ydGN1dCB0byBnZXQgY3VycmVudCBwb3NpdGlvbiBmcm9tIGNhY2hlXG4gKiBAcmV0dXJucyB7R2VvbG9jYXRpb25Qb3NpdGlvbn1cbiAqL1xuZnVuY3Rpb24gY3VycmVudFBvc2l0aW9uUmVhZCgpIHtcbiAgICByZXR1cm4gY3VycmVudFBvc2l0aW9uO1xufVxuXG4vKipcbiAqID09PT09PT09PT09PT09PT09PT09PT09XG4gKiBWaWV3cy9PdXRwdXQgZm9ybWF0dGluZ1xuICogPT09PT09PT09PT09PT09PT09PT09PT1cbiAqL1xuXG4vKipcbiAqIEluaXRpYWxpemUgdGhlIGxlYWZsZXQgbWFwIGFuZCBzYXRlbGxpdGUgYmFzZWxheWVyXG4gKi9cbmZ1bmN0aW9uIG1hcFZpZXdDcmVhdGUobWFwaWQpIHtcbiAgICB2YXIgbWFwQ29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQobWFwaWQpO1xuXG4gICAgLy8gQ2FsY3VsYXRlIDgwJSBvZiB0aGUgYXZhaWxhYmxlIHZlcnRpY2FsIHNwYWNlXG4gICAgdmFyIGF2YWlsYWJsZUhlaWdodCA9IHdpbmRvdy5pbm5lckhlaWdodCB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xpZW50SGVpZ2h0IHx8IGRvY3VtZW50LmJvZHkuY2xpZW50SGVpZ2h0O1xuICAgIHZhciBtYXBIZWlnaHQgPSAwLjggKiBhdmFpbGFibGVIZWlnaHQ7XG5cbiAgICAvLyBTZXQgdGhlIGhlaWdodCBvZiB0aGUgY29udGFpbmVyIGVsZW1lbnRcbiAgICBtYXBDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gbWFwSGVpZ2h0ICsgJ3B4JztcblxuICAgIC8vIEluaXRpYWxpemUgdGhlIExlYWZsZXQgbWFwXG4gICAgbWFwVmlldyA9IEwubWFwKG1hcGlkKS5zZXRWaWV3KFszNi41NjczODMsIC0xMjEuOTQ3NzI5XSwgMTgpO1xuICAgIEwudGlsZUxheWVyKFwiaHR0cHM6Ly9hcGkubWFwYm94LmNvbS9zdHlsZXMvdjEve2lkfS90aWxlcy97en0ve3h9L3t5fT9hY2Nlc3NfdG9rZW49e2FjY2Vzc1Rva2VufVwiLCB7XG4gICAgICAgIGF0dHJpYnV0aW9uOlxuICAgICAgICAgICAgJ01hcCBkYXRhICZjb3B5OyA8YSBocmVmPVwiaHR0cHM6Ly93d3cub3BlbnN0cmVldG1hcC5vcmcvXCI+T3BlblN0cmVldE1hcDwvYT4gY29udHJpYnV0b3JzLCA8YSBocmVmPVwiaHR0cHM6Ly9jcmVhdGl2ZWNvbW1vbnMub3JnL2xpY2Vuc2VzL2J5LXNhLzIuMC9cIj5DQy1CWS1TQTwvYT4sIEltYWdlcnkgJmNvcHk7IDxhIGhyZWY9XCJodHRwczovL3d3dy5tYXBib3guY29tL1wiPk1hcGJveDwvYT4nLFxuICAgICAgICBtYXhab29tOiAyMixcbiAgICAgICAgbWF4TmF0aXZlWm9vbTogMTksXG4gICAgICAgIGlkOiBcIm1hcGJveC9zYXRlbGxpdGUtdjlcIixcbiAgICAgICAgdGlsZVNpemU6IDUxMixcbiAgICAgICAgem9vbU9mZnNldDogLTEsXG4gICAgICAgIGFjY2Vzc1Rva2VuOlxuICAgICAgICAgICAgXCJway5leUoxSWpvaWNubGhibXhqYUdGdUlpd2lZU0k2SW1Oc2Ftd3liMkp3Y0RCdVl6TXpiSEJwYjJsMGRIZzJPRElpZlEudmtGRzdLMERyYkhzNU8xVzBDSXZ6d1wiLCAvLyByZXBsYWNlIHdpdGggeW91ciBNYXBib3ggYWNjZXNzIHRva2VuXG4gICAgfSkuYWRkVG8obWFwVmlldyk7XG59XG5cbi8qKlxuICogUmVjZW50ZXIgdGhlIG1hcCBvbiBhIHBvaW50XG4gKiBPcHRpb25zIGZvciBrZXkgaW5jbHVkZSBcImN1cnJlbnRQb3NpdGlvblwiLCBcImN1cnJlbnRIb2xlXCIsIFwiY291cnNlXCIuIERlZmF1bHQgdG8gY3VycmVudFBvc2l0aW9uLlxuICogQHBhcmFtIHtTdHJpbmd9IGtleVxuICovXG5mdW5jdGlvbiBtYXBSZWNlbnRlcihrZXkpIHtcbiAgICBsZXQgZmx5b3B0aW9ucyA9IHtcbiAgICAgICAgYW5pbWF0ZTogdHJ1ZSxcbiAgICAgICAgZHVyYXRpb246IDAuMzNcbiAgICB9XG4gICAgaWYgKGtleSA9PSBcImNvdXJzZVwiKSB7XG4gICAgICAgIGxldCBiYm94ID0gZ3JpZHMuZ2V0R29sZkNvdXJzZUJib3gocm91bmRDb3Vyc2VQYXJhbXMocm91bmQpKTtcbiAgICAgICAgaWYgKGJib3gpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoXCJSZWNlbnRlcmluZyBvbiBjb3Vyc2VcIik7XG4gICAgICAgICAgICBtYXBWaWV3LmZseVRvQm91bmRzKGJib3gsIGZseW9wdGlvbnMpO1xuICAgICAgICB9XG4gICAgfSBlbHNlIGlmIChrZXkgPT0gXCJjdXJyZW50SG9sZVwiKSB7XG4gICAgICAgIGxldCBiYm94ID0gZ3JpZHMuZ2V0R29sZkhvbGVCYm94KHJvdW5kQ291cnNlUGFyYW1zKHJvdW5kKSwgY3VycmVudEhvbGUubnVtYmVyKTtcbiAgICAgICAgaWYgKGJib3gpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoXCJSZWNlbnRlcmluZyBvbiBjdXJyZW50IGhvbGVcIik7XG4gICAgICAgICAgICBtYXBWaWV3LmZseVRvQm91bmRzKGJib3gsIGZseW9wdGlvbnMpO1xuICAgICAgICB9IGVsc2UgaWYgKGN1cnJlbnRIb2xlLnBpbikge1xuICAgICAgICAgICAgY29uc29sZS5kZWJ1ZyhcIlJlY2VudGVyaW5nIG9uIGN1cnJlbnQgcGluXCIpO1xuICAgICAgICAgICAgbWFwVmlldy5mbHlUbyhbY3VycmVudEhvbGUucGluLnksIGN1cnJlbnRIb2xlLnBpbi54XSwgMTgsIGZseW9wdGlvbnMpO1xuICAgICAgICB9XG4gICAgfSBlbHNlIGlmICgha2V5IHx8IGtleSA9PSBcImN1cnJlbnRQb3NpdGlvblwiKSB7XG4gICAgICAgIGlmIChjdXJyZW50UG9zaXRpb25FbmFibGVkICYmIGN1cnJlbnRQb3NpdGlvbikge1xuICAgICAgICAgICAgY29uc29sZS5kZWJ1ZyhcIlJlY2VudGVyaW5nIG9uIGN1cnJlbnQgcG9zaXRpb25cIik7XG4gICAgICAgICAgICBtYXBWaWV3LmZseVRvKFtjdXJyZW50UG9zaXRpb24uY29vcmRzLmxhdGl0dWRlLCBjdXJyZW50UG9zaXRpb24uY29vcmRzLmxvbmdpdHVkZV0sIDIwLCBmbHlvcHRpb25zKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLyoqXG4gKiBSZW5kZXIgdGhlIHNldCBvZiBtYXJrZXJzL2xheWVycyBmb3IgYSBnaXZlbiBob2xlXG4gKiBAcGFyYW0ge09iamVjdH0gaG9sZSB0aGUgaG9sZSBvYmplY3QgZnJvbSByb3VuZFxuICovXG5mdW5jdGlvbiBob2xlVmlld0NyZWF0ZShob2xlKSB7XG4gICAgY29uc29sZS5kZWJ1ZyhgUmVuZGVyaW5nIGxheWVycyBmb3IgaG9sZSAke2hvbGUubnVtYmVyfWApXG4gICAgaG9sZS5zdHJva2VzLmZvckVhY2goZnVuY3Rpb24gKHN0cm9rZSkge1xuICAgICAgICBzdHJva2VNYXJrZXJDcmVhdGUoc3Ryb2tlKTtcbiAgICB9KTtcbiAgICBpZiAoaG9sZS5waW4pIHtcbiAgICAgICAgcGluTWFya2VyQ3JlYXRlKGhvbGUpO1xuICAgIH1cbiAgICBzdHJva2VsaW5lQ3JlYXRlKGhvbGUpO1xuICAgIGhvbGVMaW5lQ3JlYXRlKGhvbGUpO1xufVxuXG4vKipcbiAqIERlbGV0ZSBhbGwgaG9sZSBzcGVjaWZpYyB2aWV3IGxheWVyc1xuICovXG5mdW5jdGlvbiBob2xlVmlld0RlbGV0ZSgpIHtcbiAgICBzdHJva2VNYXJrZXJEZWFjdGl2YXRlKCk7XG4gICAgY29uc3QgYWxsTGF5ZXJzID0gbGF5ZXJSZWFkQWxsKCk7XG4gICAgZm9yIChsZXQgaWQgaW4gYWxsTGF5ZXJzKSB7XG4gICAgICAgIGlmIChpZC5pbmNsdWRlcyhcImhvbGVfXCIpIHx8IGlkLmluY2x1ZGVzKFwiYWN0aXZlX1wiKSkge1xuICAgICAgICAgICAgbGF5ZXJEZWxldGUoaWQpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG4vKipcbiAqIENyZWF0ZSBhIGhvbGUgc2VsZWN0b3IgZ2l2ZW4gYSBzZWxlY3QgZWxlbWVudFxuICogQHBhcmFtIHtIVE1MU2VsZWN0RWxlbWVudH0gZWxlbWVudCBhIHNlbGVjdCBlbGVtZW50IHRoYXQgd2Ugd2lsbCBwb3B1bGF0ZSB3aXRoIG9wdGlvbnNcbiAqL1xuZnVuY3Rpb24gaG9sZVNlbGVjdFZpZXdDcmVhdGUoZWxlbWVudCkge1xuICAgIC8vUmVnaXN0ZXIgdGhpcyBlbGVtZW50IGFzIHRoZSBjdXJyZW50IGhvbGUgc2VsZWN0b3JcbiAgICBob2xlU2VsZWN0b3IgPSBlbGVtZW50O1xuXG4gICAgLy8gUG9wdWxhdGUgdGhlIHNlbGVjdCB3aXRoIG9wdGlvbnNcbiAgICBob2xlU2VsZWN0Vmlld1VwZGF0ZSgpO1xuXG4gICAgLy8gQWRkIGV2ZW50IGxpc3RlbmVyIHRvIGhhbmRsZSBzZWxlY3Rpb24gY2hhbmdlc1xuICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZnVuY3Rpb24gKCkge1xuICAgICAgICBsZXQgc2VsZWN0ZWRIb2xlTnVtYmVyID0gcGFyc2VJbnQodGhpcy52YWx1ZSwgMTApO1xuICAgICAgICBob2xlU2VsZWN0KHNlbGVjdGVkSG9sZU51bWJlcik7XG4gICAgfSk7XG59XG5cbi8qKlxuICogVXBkYXRlIGEgZ2l2ZW4gc2VsZWN0IGVsZW1lbnQgd2l0aCBjdXJyZW50IGhvbGUgb3B0aW9uc1xuICovXG5mdW5jdGlvbiBob2xlU2VsZWN0Vmlld1VwZGF0ZSgpIHtcbiAgICBpZiAoIWhvbGVTZWxlY3Rvcikge1xuICAgICAgICByZXR1cm5cbiAgICB9XG4gICAgaWYgKCEoaG9sZVNlbGVjdG9yIGluc3RhbmNlb2YgSFRNTFNlbGVjdEVsZW1lbnQpKSB7XG4gICAgICAgIHJldHVyblxuICAgIH1cbiAgICB3aGlsZSAoaG9sZVNlbGVjdG9yLmZpcnN0Q2hpbGQpIHtcbiAgICAgICAgaG9sZVNlbGVjdG9yLnJlbW92ZUNoaWxkKGhvbGVTZWxlY3Rvci5maXJzdENoaWxkKTtcbiAgICB9XG4gICAgZm9yIChsZXQgaG9sZSBvZiByb3VuZC5ob2xlcykge1xuICAgICAgICBpZiAoIWhvbGUpIHtcbiAgICAgICAgICAgIC8vIFNvbWV0aW1lcyBwb2x5cyByZXR1cm4gZXh0cmEgaG9sZXMgZm9yIHdoYXRldmVyIHJlYXNvbiwgc2tpcCB0aGVtXG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBsZXQgb3B0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnb3B0aW9uJyk7XG4gICAgICAgIG9wdGlvbi52YWx1ZSA9IGhvbGUubnVtYmVyLnRvU3RyaW5nKCk7XG4gICAgICAgIG9wdGlvbi50ZXh0ID0gYEhvbGUgJHtob2xlLm51bWJlcn1gO1xuICAgICAgICBob2xlU2VsZWN0b3IuYXBwZW5kQ2hpbGQob3B0aW9uKTtcbiAgICB9XG4gICAgaG9sZVNlbGVjdG9yLnZhbHVlID0gY3VycmVudEhvbGUubnVtYmVyLnRvU3RyaW5nKCk7XG59XG5cbi8qKlxuICogU2V0IHVwIGEgbWFya2VyIG9uIHRoZSBtYXAgd2hpY2ggdHJhY2tzIGN1cnJlbnQgdXNlciBwb3NpdGlvbiBhbmQgY2FjaGVzIGxvY2F0aW9uXG4gKi9cbmZ1bmN0aW9uIGN1cnJlbnRQb3NpdGlvblVwZGF0ZSgpIHtcbiAgICBjdXJyZW50UG9zaXRpb25FbmFibGVkID0gdHJ1ZTtcbiAgICBuYXZpZ2F0b3IuZ2VvbG9jYXRpb24ud2F0Y2hQb3NpdGlvbigocG9zaXRpb24pID0+IHtcbiAgICAgICAgY29uc3QgbWFya2VySUQgPSBcImN1cnJlbnRQb3NpdGlvblwiO1xuICAgICAgICBjdXJyZW50UG9zaXRpb24gPSBwb3NpdGlvbjtcbiAgICAgICAgbGV0IGxhdGxvbmc6IEwuTGF0TG5nRXhwcmVzc2lvbiA9IFtwb3NpdGlvbi5jb29yZHMubGF0aXR1ZGUsIHBvc2l0aW9uLmNvb3Jkcy5sb25naXR1ZGVdO1xuICAgICAgICBsZXQgY3VycmVudFBvc2l0aW9uTWFya2VyID0gbGF5ZXJSZWFkKG1hcmtlcklEKVxuICAgICAgICBpZiAoY3VycmVudFBvc2l0aW9uTWFya2VyKSB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgbWFya2VyIGFscmVhZHkgZXhpc3RzLCBqdXN0IHVwZGF0ZSBpdHMgcG9zaXRpb25cbiAgICAgICAgICAgIGN1cnJlbnRQb3NpdGlvbk1hcmtlci5zZXRMYXRMbmcobGF0bG9uZyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBDcmVhdGUgYSBuZXcgbWFya2VyIGFuZCBhZGQgaXQgdG8gdGhlIG1hcFxuICAgICAgICAgICAgY3VycmVudFBvc2l0aW9uTWFya2VyID0gTC5jaXJjbGVNYXJrZXIoXG4gICAgICAgICAgICAgICAgbGF0bG9uZyxcbiAgICAgICAgICAgICAgICB7IHJhZGl1czogMTAsIGZpbGxDb2xvcjogXCIjNEE4OUYzXCIsIGNvbG9yOiBcIiNGRkZcIiwgd2VpZ2h0OiAxLCBvcGFjaXR5OiAwLjgsIGZpbGxPcGFjaXR5OiAwLjggfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGxheWVyQ3JlYXRlKG1hcmtlcklELCBjdXJyZW50UG9zaXRpb25NYXJrZXIpO1xuICAgICAgICB9XG4gICAgfSwgc2hvd0Vycm9yLCB7XG4gICAgICAgIGVuYWJsZUhpZ2hBY2N1cmFjeTogdHJ1ZSxcbiAgICAgICAgdGltZW91dDogNTAwMCxcbiAgICAgICAgbWF4aW11bUFnZTogMTAwMFxuICAgIH0pO1xufVxuXG4vKipcbiAqIFVwZGF0ZXMgdGhlIHJvdW5kIGRhdGEgZGlzcGxheWVkIG9uIHRoZSBwYWdlLlxuICovXG5mdW5jdGlvbiByb3VuZFZpZXdVcGRhdGUoKSB7XG4gICAgY29uc3QgbG9jYXRpb25EYXRhID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsb2NhdGlvbkRhdGFcIik7XG4gICAgbG9jYXRpb25EYXRhLnRleHRDb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoXG4gICAgICAgIHsgLi4ucm91bmQgfSxcbiAgICAgICAgbnVsbCxcbiAgICAgICAgMlxuICAgICk7XG59XG5cbi8qKlxuICogVXBkYXRlcyB0aGUgc3RhdGlzdGljcyBpbmZvcm1hdGlvbiBvbiB0aGUgcGFnZS5cbiAqL1xuZnVuY3Rpb24gaG9sZVN0YXRzVXBkYXRlKCkge1xuICAgIGNvbnN0IGhvbGVFbGVtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJob2xlU3RhdHNcIik7XG4gICAgY29uc3Qgc3Ryb2tlRWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3Ryb2tlU3RhdHNcIik7XG4gICAgaWYgKGN1cnJlbnRIb2xlKSB7XG4gICAgICAgIGxldCB0ZXh0ID0gYHwgJHtjdXJyZW50SG9sZS5zdHJva2VzLmxlbmd0aH0gU3Ryb2tlc2A7XG4gICAgICAgIGlmIChjdXJyZW50SG9sZS5wYXIpIHtcbiAgICAgICAgICAgIHRleHQgKz0gYCB8IFBhciAke2N1cnJlbnRIb2xlLnBhcn1gXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGN1cnJlbnRIb2xlLmhhbmRpY2FwKSB7XG4gICAgICAgICAgICB0ZXh0ICs9IGAgfCBIY3AgJHtjdXJyZW50SG9sZS5oYW5kaWNhcH1gXG4gICAgICAgIH1cbiAgICAgICAgaG9sZUVsZW1lbnQuaW5uZXJUZXh0ID0gdGV4dFxuICAgICAgICBzdHJva2VFbGVtZW50LmlubmVySFRNTCA9IFwiXCI7XG4gICAgICAgIGN1cnJlbnRIb2xlLnN0cm9rZXMuZm9yRWFjaChmdW5jdGlvbiAoc3Ryb2tlKSB7XG4gICAgICAgICAgICBzdHJva2VFbGVtZW50LmFwcGVuZENoaWxkKHN0cm9rZVN0YXRzTGlzdEl0ZW0oc3Ryb2tlKSk7XG4gICAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGhvbGVFbGVtZW50LmlubmVyVGV4dCA9IFwiXCI7XG4gICAgICAgIHN0cm9rZUVsZW1lbnQuaW5uZXJIVE1MID0gXCJcIjtcbiAgICB9XG59XG5cbi8qKlxuICogQ3JlYXRlIGEgbGlzdCBpdGVtIGZvciB0aGUgU3Ryb2tlIFN0YXRzIGxpc3RcbiAqIEBwYXJhbSB7U3Ryb2tlfSBzdHJva2UgXG4gKiBAcmV0dXJucyB7ZWxlbWVudH0gdGhlIGxpIGVsZW1lbnQgZm9yIHRoZSBsaXN0XG4gKi9cbmZ1bmN0aW9uIHN0cm9rZVN0YXRzTGlzdEl0ZW0oc3Ryb2tlKSB7XG4gICAgbGV0IGRpc3RhbmNlID0gMDtcbiAgICBpZiAoY3VycmVudEhvbGUuc3Ryb2tlc1tzdHJva2UuaW5kZXggKyAxXSkge1xuICAgICAgICBkaXN0YW5jZSA9IGdldERpc3RhbmNlKHN0cm9rZS5zdGFydCwgY3VycmVudEhvbGUuc3Ryb2tlc1tzdHJva2UuaW5kZXggKyAxXS5zdGFydCk7XG4gICAgfSBlbHNlIGlmIChjdXJyZW50SG9sZS5waW4pIHtcbiAgICAgICAgZGlzdGFuY2UgPSBnZXREaXN0YW5jZShzdHJva2Uuc3RhcnQsIGN1cnJlbnRIb2xlLnBpbik7XG4gICAgfVxuICAgIGNvbnN0IGxpc3RJdGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImxpXCIpO1xuICAgIGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJzdHJva2VTdGF0Q29udGFpbmVyXCIpO1xuXG4gICAgY29uc3QgdGV4dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgY29uc3QgZGlzcGVyc2lvbkxpbmsgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYVwiKTtcbiAgICB0ZXh0LmNsYXNzTGlzdC5hZGQoXCJzdHJva2VEZXRhaWxzXCIpO1xuICAgIHRleHQuaW5uZXJIVE1MID0gYCR7c3Ryb2tlLmNsdWJ9ICgke01hdGgucm91bmQoZGlzdGFuY2UpfW0pIHwgJiN4YjE7YDtcbiAgICBkaXNwZXJzaW9uTGluay5zZXRBdHRyaWJ1dGUoXCJocmVmXCIsIGAjc3Ryb2tlXyR7c3Ryb2tlLmluZGV4fV9kaXNwZXJzaW9uYCk7XG4gICAgZGlzcGVyc2lvbkxpbmsuaW5uZXJUZXh0ID0gYCR7c3Ryb2tlLmRpc3BlcnNpb259bWA7XG4gICAgZGlzcGVyc2lvbkxpbmsuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgICAgbGV0IGRpc3AgPSBwcm9tcHQoXCJFbnRlciBhIGRpc3BlcnNpb246XCIpO1xuICAgICAgICBpZiAoZGlzcCAhPSBudWxsKSB7XG4gICAgICAgICAgICBzdHJva2UuZGlzcGVyc2lvbiA9IGRpc3A7XG4gICAgICAgICAgICByZXJlbmRlcihcImZ1bGxcIik7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRm9yY2UgYSByZXJlbmRlciBvZiB0aGUgZ3JpZFxuICAgIH0pO1xuICAgIHRleHQuYXBwZW5kQ2hpbGQoZGlzcGVyc2lvbkxpbmspO1xuXG4gICAgY29uc3QgYnV0dG9ucyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgYnV0dG9ucy5jbGFzc0xpc3QuYWRkKFwic3Ryb2tlQ29udHJvbHNcIik7XG4gICAgYnV0dG9ucy5hcHBlbmQoXG4gICAgICAgIHN0cm9rZVNlbGVjdFZpZXdDcmVhdGUoc3Ryb2tlKSxcbiAgICAgICAgc3Ryb2tlTW92ZVZpZXdDcmVhdGUoc3Ryb2tlLCAtMSksXG4gICAgICAgIHN0cm9rZU1vdmVWaWV3Q3JlYXRlKHN0cm9rZSwgMSksXG4gICAgICAgIHN0cm9rZURlbGV0ZVZpZXdDcmVhdGUoc3Ryb2tlKVxuICAgICk7XG5cbiAgICBjb250YWluZXIuYXBwZW5kKHRleHQpO1xuICAgIGNvbnRhaW5lci5hcHBlbmQoYnV0dG9ucyk7XG4gICAgbGlzdEl0ZW0uYXBwZW5kKGNvbnRhaW5lcik7XG4gICAgcmV0dXJuIGxpc3RJdGVtO1xufVxuXG4vKipcbiAqIFVwZGF0ZSBhaW0tc3BlY2lmaWMgYWR2YW5jZWQgc3RhdHNcbiAqL1xuZnVuY3Rpb24gYWltU3RhdHNVcGRhdGUoKSB7XG4gICAgY29uc3QgZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImFpbVN0YXRzXCIpO1xuICAgIGNvbnN0IGxheWVyID0gbGF5ZXJSZWFkKFwiYWN0aXZlX2dyaWRcIilcbiAgICBpZiAoIWxheWVyKSB7XG4gICAgICAgIHJldHVybjsgLy8gTm8gZ3JpZCB0byBsb2FkXG4gICAgfVxuICAgIGNvbnN0IGdyaWQgPSBsYXllci5vcHRpb25zLmdyaWQ7XG5cbiAgICAvLyBDYWxjdWxhdGUgc3RhdHNcbiAgICBjb25zdCBzdHJva2UgPSBhY3RpdmVTdHJva2U7XG4gICAgY29uc3QgaG9sZSA9IHJvdW5kLmhvbGVzW3N0cm9rZS5ob2xlIC0gMV07XG4gICAgY29uc3Qgd3NnID0gZ3JpZC5wcm9wZXJ0aWVzLndlaWdodGVkU3Ryb2tlc0dhaW5lZDtcbiAgICBjb25zdCBzciA9IGdyaWQucHJvcGVydGllcy5zdHJva2VzUmVtYWluaW5nU3RhcnQ7XG4gICAgY29uc3Qgc2EgPSBjdXJyZW50SG9sZS5zdHJva2VzLmxlbmd0aCAtIHN0cm9rZS5pbmRleCAtIDE7XG4gICAgbGV0IHNybiA9IDA7XG4gICAgaWYgKHNhID4gMCkge1xuICAgICAgICBsZXQgbmV4dFN0YXJ0ID0gY3VycmVudEhvbGUuc3Ryb2tlc1tzdHJva2UuaW5kZXggKyAxXS5zdGFydDtcbiAgICAgICAgbGV0IHN0YXJ0UG9pbnQgPSB0dXJmLnBvaW50KFtuZXh0U3RhcnQueCwgbmV4dFN0YXJ0LnldKTtcbiAgICAgICAgbGV0IHBpbkNvb3JkID0gW2hvbGUucGluLngsIGhvbGUucGluLnldO1xuICAgICAgICBzcm4gPSBncmlkcy5zdHJva2VzUmVtYWluaW5nRnJvbShzdGFydFBvaW50LCBwaW5Db29yZCwgcm91bmRDb3Vyc2VQYXJhbXMocm91bmQpKTtcbiAgICB9XG4gICAgY29uc3Qgc2dhID0gc3IgLSBzcm4gLSAxO1xuXG4gICAgbGV0IHRleHQgPSBgU0cgQWltOiAke3dzZy50b0ZpeGVkKDMpfSB8IFNHIEFjdHVhbDogJHtzZ2EudG9GaXhlZCgzKX0gfCBTUjogJHtzci50b0ZpeGVkKDMpfWA7XG5cbiAgICAvLyBBZGQgZGl2aWRlclxuICAgIHRleHQgKz0gXCI8aHIvPlwiO1xuICAgIGVsLmlubmVySFRNTCA9IHRleHQ7XG59XG5cbi8qKlxuICogU2hvdyB0aGUgU3RhdHMgZm9yIGEgc3Ryb2tlXG4gKi9cbmZ1bmN0aW9uIGFjdGl2ZVN0cm9rZVN0YXRzQ3JlYXRlKCkge1xuICAgIGNvbnN0IGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJhY3RpdmVTdHJva2VDb250cm9sc1wiKTtcbiAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKFwiaW5hY3RpdmVcIik7XG4gICAgYWltU3RhdHNVcGRhdGUoKTtcbn1cblxuLyoqXG4gKiBIaWRlIHRoZSBBaW0gc3RhdHMgZm9yIGEgc3Ryb2tlXG4gKi9cbmZ1bmN0aW9uIGFjdGl2ZVN0cm9rZVN0YXRzRGVsZXRlKCkge1xuICAgIGNvbnN0IGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJhY3RpdmVTdHJva2VDb250cm9sc1wiKTtcbiAgICBlbC5jbGFzc0xpc3QuYWRkKFwiaW5hY3RpdmVcIik7XG5cbn1cblxuLyoqXG4gKiBTaG93IHRoZSBBaW0gU3RhdHMgZm9yIGEgc3Ryb2tlXG4gKi9cbmZ1bmN0aW9uIGFpbVN0YXRzQ3JlYXRlKCkge1xuICAgIGNvbnN0IGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJhaW1TdGF0c1wiKTtcbiAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKFwiaW5hY3RpdmVcIik7XG4gICAgYWltU3RhdHNVcGRhdGUoKTtcbn1cblxuLyoqXG4gKiBIaWRlIHRoZSBBaW0gc3RhdHMgZm9yIGEgc3Ryb2tlXG4gKi9cbmZ1bmN0aW9uIGFpbVN0YXRzRGVsZXRlKCkge1xuICAgIGNvbnN0IGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJhaW1TdGF0c1wiKTtcbiAgICBlbC5jbGFzc0xpc3QuYWRkKFwiaW5hY3RpdmVcIik7XG5cbn1cblxuLyoqXG4gKiBDcmVhdGUgYSBzZWxlY3QgZWxlbWVudCB0byBjaG9vc2UgdGhlIHR5cGUgb2YgZ3JpZCB0byByZW5kZXIgZm9yIHRoaXMgc3Ryb2tlXG4gKi9cbmZ1bmN0aW9uIGdyaWRUeXBlU2VsZWN0Q3JlYXRlKCkge1xuICAgIC8vIENyZWF0ZSBuZXcgc2VsZWN0b3JcbiAgICBsZXQgc2VsZWN0b3IgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZ3JpZFR5cGVTZWxlY3QnKTtcbiAgICBpZiAoIShzZWxlY3RvciBpbnN0YW5jZW9mIEhUTUxTZWxlY3RFbGVtZW50KSkge1xuICAgICAgICByZXR1cm5cbiAgICB9XG4gICAgd2hpbGUgKHNlbGVjdG9yLmZpcnN0Q2hpbGQpIHtcbiAgICAgICAgc2VsZWN0b3IucmVtb3ZlQ2hpbGQoc2VsZWN0b3IuZmlyc3RDaGlsZCk7XG4gICAgfVxuICAgIGZvciAobGV0IHR5cGUgaW4gZ3JpZHMuZ3JpZFR5cGVzKSB7XG4gICAgICAgIGxldCBvcHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvcHRpb24nKTtcbiAgICAgICAgb3B0LnZhbHVlID0gZ3JpZHMuZ3JpZFR5cGVzW3R5cGVdO1xuICAgICAgICBvcHQuaW5uZXJUZXh0ID0gZ3JpZHMuZ3JpZFR5cGVzW3R5cGVdO1xuICAgICAgICBzZWxlY3Rvci5hcHBlbmRDaGlsZChvcHQpO1xuICAgIH1cbiAgICBsZXQgYWN0aXZlR3JpZCA9IGxheWVyUmVhZCgnYWN0aXZlX2dyaWQnKTtcbiAgICBpZiAoYWN0aXZlR3JpZCkge1xuICAgICAgICBsZXQgdHlwZSA9IGFjdGl2ZUdyaWQub3B0aW9ucy5ncmlkLnByb3BlcnRpZXMudHlwZTtcbiAgICAgICAgc2VsZWN0b3IudmFsdWUgPSB0eXBlO1xuICAgIH1cbiAgICBzZWxlY3Rvci5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBoYW5kbGVHcmlkVHlwZVNlbGVjdGlvbik7XG59XG5cbi8qKlxuICogSGFuZGxlIHdoZW4gYSBuZXcgZ3JpZCB0eXBlIGlzIHNlbGVjdGVkXG4gKi9cbmZ1bmN0aW9uIGhhbmRsZUdyaWRUeXBlU2VsZWN0aW9uKCkge1xuICAgIGdyaWREZWxldGUoKTtcbiAgICB3YWl0KDEwKS50aGVuKCgpID0+IGdyaWRDcmVhdGUodGhpcy52YWx1ZSkpO1xufVxuXG4vKipcbiAqIENyZWF0ZSBhIGxpbmsgdGhhdCBkZWxldGVzIHRoaXMgc3Ryb2tlXG4gKiBAcGFyYW0ge09iamVjdH0gc3Ryb2tlXG4gKiBAcmV0dXJucyB7bGlua31cbiAqL1xuZnVuY3Rpb24gc3Ryb2tlRGVsZXRlVmlld0NyZWF0ZShzdHJva2UpIHtcbiAgICBsZXQgbGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgbGluay5pbm5lckhUTUwgPSBcIiYjMjE1O1wiO1xuICAgIGxpbmsuaWQgPSBgc3Ryb2tlXyR7c3Ryb2tlLmluZGV4fV9kZWxldGVgXG4gICAgbGluay5jbGFzc0xpc3QuYWRkKFwiZGFuZ2VyXCIpO1xuICAgIGxpbmsuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgoKSA9PiB7XG4gICAgICAgIHN0cm9rZURlbGV0ZShzdHJva2UuaG9sZSwgc3Ryb2tlLmluZGV4KTtcbiAgICB9KSk7XG4gICAgcmV0dXJuIGxpbmtcbn1cblxuLyoqXG4gKiBDcmVhdGUgYSBsaW5rIHRoYXQgc2VsZWN0cyB0aGlzIHN0cm9rZVxuICogQHBhcmFtIHtPYmplY3R9IHN0cm9rZVxuICogQHJldHVybnMge2xpbmt9XG4gKi9cbmZ1bmN0aW9uIHN0cm9rZVNlbGVjdFZpZXdDcmVhdGUoc3Ryb2tlKSB7XG4gICAgbGV0IGxpbmsgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnV0dG9uXCIpO1xuICAgIGxldCBpY29uO1xuICAgIGxldCBzdGF0ZTtcbiAgICBsZXQgY2xzO1xuICAgIGxldCBmdW5jO1xuICAgIGxldCBhcmc7XG5cbiAgICBpZiAoc3Ryb2tlID09IGFjdGl2ZVN0cm9rZSkge1xuICAgICAgICBpY29uID0gXCImI3gyNkFDO1wiO1xuICAgICAgICBzdGF0ZSA9IFwiZGVhY3RpdmF0ZVwiO1xuICAgICAgICBjbHMgPSBcInNlY29uZGFyeVwiXG4gICAgICAgIGZ1bmMgPSBzdHJva2VNYXJrZXJEZWFjdGl2YXRlO1xuICAgICAgICBhcmcgPSBudWxsO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGljb24gPSBcIiYjeDI2MDk7XCI7XG4gICAgICAgIHN0YXRlID0gXCJhY3RpdmF0ZVwiO1xuICAgICAgICBjbHMgPSBcInN1Y2Nlc3NcIjtcbiAgICAgICAgZnVuYyA9IHN0cm9rZU1hcmtlckFjdGl2YXRlO1xuICAgICAgICBhcmcgPSBsYXllclJlYWQoc3Ryb2tlTWFya2VySUQoc3Ryb2tlKSk7XG4gICAgfVxuXG4gICAgbGluay5pbm5lckhUTUwgPSBpY29uXG4gICAgbGluay5pZCA9IGBzdHJva2VfJHtzdHJva2UuaW5kZXh9XyR7c3RhdGV9YDtcbiAgICBsaW5rLmNsYXNzTGlzdC5hZGQoY2xzKTtcbiAgICBsaW5rLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKCkgPT4ge1xuICAgICAgICBmdW5jKGFyZyk7XG4gICAgICAgIHJlcmVuZGVyKCk7XG4gICAgfSkpO1xuICAgIHJldHVybiBsaW5rXG59XG5cbi8qKlxuICogQ3JlYXRlIGEgbGluayB0aGF0IG1vdmVzIHRoaXMgc3Ryb2tlXG4gKiBAcGFyYW0ge09iamVjdH0gc3Ryb2tlIHRoZSBzdHJva2UgdG8gbW92ZVxuICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldCB0aGUgb2Zmc2V0IGZvciB0aGUgc3Ryb2tlIGluZGV4XG4gKiBAcmV0dXJucyB7bGlua31cbiAqL1xuZnVuY3Rpb24gc3Ryb2tlTW92ZVZpZXdDcmVhdGUoc3Ryb2tlLCBvZmZzZXQpIHtcbiAgICBsZXQgbGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgbGV0IGljb24gPSAob2Zmc2V0ID4gMCA/IFwiJiM4NTk1O1wiIDogXCImIzg1OTM7XCIpXG4gICAgbGluay5pbm5lckhUTUwgPSBpY29uO1xuICAgIGxpbmsuaWQgPSBgc3Ryb2tlXyR7c3Ryb2tlLmluZGV4fV9tb3ZlXyR7b2Zmc2V0fWBcbiAgICBsaW5rLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKCkgPT4ge1xuICAgICAgICBzdHJva2VNb3ZlKHN0cm9rZS5ob2xlLCBzdHJva2UuaW5kZXgsIG9mZnNldCk7XG4gICAgfSkpO1xuICAgIHJldHVybiBsaW5rXG59XG5cbi8qKlxuICogUmVyZW5kZXIga2V5IHZpZXdzIGJhc2VkIG9uIHZvbGF0aWxlIGRhdGFcbiAqIEBwYXJhbSB7c3RyaW5nfSB0eXBlIHRoZSB0eXBlIG9mIHJlcmVuZGVyIHRvIHBlcmZvcm0uIENhbiBiZSBgZnVsbGAgb3IgYGRyYWdlbmRgXG4gKi9cbmZ1bmN0aW9uIHJlcmVuZGVyKHR5cGU/OiBzdHJpbmcpIHtcbiAgICAvLyBSZW5kZXIgY2FsbHMgdGhhdCBjYW4gb2NjdXIgYW55IHRpbWUsIGhpZ2ggcGVyZlxuICAgIGlmICghdHlwZSB8fCB0eXBlID09IFwiZnVsbFwiKSB7XG4gICAgICAgIHJvdW5kVmlld1VwZGF0ZSgpO1xuICAgICAgICBzdHJva2VsaW5lVXBkYXRlKCk7XG4gICAgICAgIHN0cm9rZU1hcmtlclVwZGF0ZSgpO1xuICAgICAgICBzdHJva2VNYXJrZXJBaW1VcGRhdGUoKTtcbiAgICAgICAgaG9sZVN0YXRzVXBkYXRlKCk7XG4gICAgICAgIHNhdmVEYXRhKCk7XG4gICAgfVxuXG4gICAgLy8gUmVuZGVyIGNhbGxzIHRoYXQgc2hvdWxkIGhhcHBlbiBvbmx5IGFmdGVyIGRyYWdzIGZpbmlzaFxuICAgIGlmICgodHlwZSA9PSBcImRyYWdlbmRcIiB8fCB0eXBlID09IFwiZnVsbFwiKSAmJiBhY3RpdmVTdHJva2UpIHtcbiAgICAgICAgZ3JpZFVwZGF0ZSgpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgYWltU3RhdHNVcGRhdGUoKTtcbiAgICAgICAgICAgIHN0cm9rZU1hcmtlckFpbVVwZGF0ZSgpO1xuICAgICAgICB9LCAoZXJyb3IpID0+IGNvbnNvbGUuZXJyb3IoZXJyb3IpKTtcbiAgICB9XG5cbiAgICAvLyBSZXJlbmRlciBldmVyeXRoaW5nXG4gICAgaWYgKHR5cGUgPT0gXCJmdWxsXCIpIHtcbiAgICAgICAgc3Ryb2tlTWFya2VyQWltRGVsZXRlKCk7XG4gICAgICAgIHN0cm9rZU1hcmtlckFpbUNyZWF0ZSgpO1xuICAgIH1cbn1cblxuLyoqXG4gKiBSZW5kZXIgYSBzZXQgb2YgQ2x1YiBidXR0b25zIGludG8gYW4gSFRNTCBlbGVtZW50IGJhc2VkIG9uIGFuIGFycmF5IG9mIENsdWIgb2JqZWN0c1xuICogQHBhcmFtIHtBcnJheX0gY2x1YnNcbiAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IHRhcmdldEVsZW1lbnRcbiAqL1xuY29uc3QgY2x1YkRhdGFGaWVsZHMgPSBbXCJkaXNwZXJzaW9uXCJdXG5mdW5jdGlvbiBjbHViU3Ryb2tlVmlld0NyZWF0ZShjbHVicywgdGFyZ2V0RWxlbWVudCkge1xuICAgIGNsdWJzLmZvckVhY2goKGNsdWJEYXRhKSA9PiB7XG4gICAgICAgIGNvbnN0IGJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJidXR0b25cIik7XG4gICAgICAgIGJ1dHRvbi50ZXh0Q29udGVudCA9IGNsdWJEYXRhLm5hbWU7XG4gICAgICAgIGJ1dHRvbi5pZCA9IGNsdWJEYXRhLmlkO1xuXG4gICAgICAgIC8vIEFkZCBhZGRpdGlvbmFsIGF0dHJpYnV0ZXMgb3Igc3R5bGVzIHRvIHRoZSBidXR0b25cbiAgICAgICAgaWYgKGNsdWJEYXRhRmllbGRzKSB7XG4gICAgICAgICAgICBjbHViRGF0YUZpZWxkcy5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoY2x1YkRhdGFbZmllbGRdKSB7XG4gICAgICAgICAgICAgICAgICAgIGJ1dHRvbi5zZXRBdHRyaWJ1dGUoYGRhdGEtJHtmaWVsZH1gLCBjbHViRGF0YVtmaWVsZF0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNsdWJEYXRhLnN0eWxlKSB7XG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKGJ1dHRvbi5zdHlsZSwgY2x1YkRhdGEuc3R5bGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGNsdWJEYXRhLmNsYXNzKSB7XG4gICAgICAgICAgICBidXR0b24uY2xhc3NMaXN0LmFkZChjbHViRGF0YS5jbGFzcylcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFdpcmUgaXQgdXAgZm9yIGFjdGlvblxuICAgICAgICBidXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGNsdWJTdHJva2VDcmVhdGVDYWxsYmFjayhjbHViRGF0YSkpXG5cbiAgICAgICAgdGFyZ2V0RWxlbWVudC5hcHBlbmRDaGlsZChidXR0b24pO1xuICAgIH0pO1xufVxuXG4vKipcbiAqIEhhbmRsZSBhIGNsaWNrIG9uIGEgY2x1YiBzdHJva2UgY3JlYXRlIGJ1dHRvblxuICogQHBhcmFtIHtPYmplY3R9IGNsdWJcbiAqIEByZXR1cm5zIHtGdW5jdGlvbn1cbiAqL1xuZnVuY3Rpb24gY2x1YlN0cm9rZUNyZWF0ZUNhbGxiYWNrKGNsdWIpIHtcbiAgICByZXR1cm4gKCgpID0+IHtcbiAgICAgICAgY2x1YlN0cm9rZVZpZXdUb2dnbGUoKTtcbiAgICAgICAgZ2V0TG9jYXRpb25Pbk1hcCgpLnRoZW4oKHBvc2l0aW9uKSA9PiB7XG4gICAgICAgICAgICBjbHViU3Ryb2tlQ3JlYXRlKHBvc2l0aW9uLCBjbHViKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG59XG5cbi8qKlxuICogU2hvdyBvciBIaWRlIHRoZSBDbHViIHNjcmVlbiBmb3Igc3Ryb2tlIGNyZWF0aW9uXG4gKi9cbmZ1bmN0aW9uIGNsdWJTdHJva2VWaWV3VG9nZ2xlKCkge1xuICAgIGNvbnN0IGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjbHViU3Ryb2tlQ3JlYXRlQ29udGFpbmVyXCIpXG4gICAgZWwuY2xhc3NMaXN0LnRvZ2dsZShcImluYWN0aXZlXCIpO1xuICAgIGlmICghKGN1cnJlbnRQb3NpdGlvbkVuYWJsZWQpKSB7XG4gICAgICAgIGN1cnJlbnRQb3NpdGlvblVwZGF0ZSgpXG4gICAgfVxufVxuXG4vKipcbiAqIFJlbmRlciB0aGUgcmVzdWx0cyBmcm9tIGEgY291cnNlIHNlYXJjaCB2aWEgbm9taW5hdGltXG4gKiBAcGFyYW0ge09iamVjdH0gcmVzdWx0cyB0aGUgcmVzdWx0cyBmcm9tIE5vbWluYXRpbSBzZWFyY2hcbiAqL1xuZnVuY3Rpb24gY291cnNlU2VhcmNoVmlld1VwZGF0ZShyZXN1bHRzKSB7XG4gICAgbGV0IHJlc3VsdExpc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNvdXJzZVNlYXJjaFJlc3VsdHNcIik7XG4gICAgcmVzdWx0TGlzdC5pbm5lckhUTUwgPSBcIlwiO1xuXG4gICAgLy8gSXRlcmF0ZSBvdmVyIHRoZSByZXN1bHRzIGFuZCBkaXNwbGF5IGVhY2ggbWF0Y2hcbiAgICByZXN1bHRzLmZvckVhY2goKHJlc3VsdCkgPT4ge1xuICAgICAgICBsZXQgbGlzdEl0ZW0gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwibGlcIik7XG4gICAgICAgIGxldCBsaW5rID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImFcIik7XG4gICAgICAgIGxldCBjb3Vyc2VQYXJhbXMgPSB7ICduYW1lJzogcmVzdWx0Lm5hbWVkZXRhaWxzLm5hbWUsICdpZCc6IG9zbUNvdXJzZUlEKHJlc3VsdC5vc21fdHlwZSwgcmVzdWx0Lm9zbV9pZCkgfVxuICAgICAgICBsaW5rLmlubmVyVGV4dCA9IHJlc3VsdC5kaXNwbGF5X25hbWU7XG4gICAgICAgIGxpbmsuc2V0QXR0cmlidXRlKFwiaHJlZlwiLCBgIyR7cmVzdWx0Lm9zbV9pZH1gKVxuICAgICAgICBsaW5rLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgaGFuZGxlUm91bmRDcmVhdGVDbGlja0NhbGxiYWNrKGNvdXJzZVBhcmFtcykpXG4gICAgICAgIGxpc3RJdGVtLmFwcGVuZENoaWxkKGxpbmspO1xuICAgICAgICByZXN1bHRMaXN0LmFwcGVuZENoaWxkKGxpc3RJdGVtKTtcbiAgICB9KTtcbn1cblxuLyoqXG4gKiBSZXR1cm4gYSB1bmlxdWUgY291cnNlSUQgY29ycmVzcG9uZGluZyB0byBhbiBPU00gb2JqZWN0XG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZSB0aGUgT1NNIHR5cGUgKHdheSwgcmVsYXRpb24sIGV0YylcbiAqIEBwYXJhbSB7TnVtYmVyfSBpZCB0aGUgT1NNIElEXG4gKiBAcmV0dXJucyB7U3RyaW5nfVxuICovXG5mdW5jdGlvbiBvc21Db3Vyc2VJRCh0eXBlLCBpZCkge1xuICAgIHJldHVybiBgb3NtLSR7dHlwZX0tJHtpZH1gXG59XG5cbi8qKlxuICogPT09PT09PT09PT09PT09PT09PT09PT09PVxuICogSGFuZGxlcnMgZm9yIGNsaWNrIGV2ZW50c1xuICogPT09PT09PT09PT09PT09PT09PT09PT09PVxuICovXG5cbi8qKlxuICogSGFuZGxlcyB0aGUgd2luZG93IG9ubG9hZCBldmVudC5cbiAqL1xuZnVuY3Rpb24gaGFuZGxlTG9hZCgpIHtcbiAgICBtYXBWaWV3Q3JlYXRlKFwibWFwaWRcIik7XG4gICAgY2x1YlN0cm9rZVZpZXdDcmVhdGUoY2x1YlJlYWRBbGwoKSwgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjbHViU3Ryb2tlQ3JlYXRlQ29udGFpbmVyXCIpKTtcbiAgICBsb2FkRGF0YSgpO1xuICAgIGxldCBjb3Vyc2VEYXRhID0geyAnbmFtZSc6IHJvdW5kLmNvdXJzZSwgJ2lkJzogcm91bmQuY291cnNlSWQgfVxuICAgIGdyaWRzLmZldGNoR29sZkNvdXJzZURhdGEoY291cnNlRGF0YSkudGhlbigoKSA9PiBtYXBSZWNlbnRlcihcImN1cnJlbnRIb2xlXCIpKTtcbiAgICBob2xlU2VsZWN0Vmlld0NyZWF0ZShkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaG9sZVNlbGVjdG9yJykpO1xuICAgIGdyaWRUeXBlU2VsZWN0Q3JlYXRlKCk7XG59XG5cbi8qKlxuICogSGFuZGxlcyB0aGUgY2xpY2sgZXZlbnQgZm9yIGxvZ2dpbmcgdGhlIGN1cnJlbnQgbG9jYXRpb24uXG4gKi9cbmZ1bmN0aW9uIGhhbmRsZVN0cm9rZUFkZENsaWNrKCkge1xuICAgIGNsdWJTdHJva2VWaWV3VG9nZ2xlKCk7XG4gICAgc3Ryb2tlTWFya2VyRGVhY3RpdmF0ZSgpO1xufVxuXG4vKipcbiAqIEhhbmRsZXMgdGhlIGNsaWNrIGV2ZW50IGZvciBzdGFydGluZyBhIG5ldyByb3VuZC5cbiAqIEBwYXJhbSB7Q291cnNlfSBbY291cnNlUGFyYW1zXSB0aGUgY291cnNlIHRvIGNyZWF0ZSBmb3IuIElmIG5vdCBwcm92aWRlZCwgdGhlbiBpbmZlcnMgZnJvbSBpbnB1dCBib3guXG4gKi9cbmZ1bmN0aW9uIGhhbmRsZVJvdW5kQ3JlYXRlQ2xpY2tDYWxsYmFjayhjb3Vyc2VQYXJhbXM/KSB7XG4gICAgcmV0dXJuICgoKSA9PiB7XG5cbiAgICAgICAgbGV0IGNvdXJzZU5hbWU7XG4gICAgICAgIGxldCBjb3Vyc2VJZDtcblxuICAgICAgICBpZiAoY291cnNlUGFyYW1zKSB7XG4gICAgICAgICAgICBjb3Vyc2VOYW1lID0gY291cnNlUGFyYW1zW1wibmFtZVwiXTtcbiAgICAgICAgICAgIGNvdXJzZUlkID0gY291cnNlUGFyYW1zW1wiaWRcIl07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZXQgZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNvdXJzZU5hbWVcIik7XG4gICAgICAgICAgICBpZiAoIShlbCBpbnN0YW5jZW9mIEhUTUxJbnB1dEVsZW1lbnQpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb3Vyc2VOYW1lID0gZWwudmFsdWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWNvdXJzZU5hbWUgJiYgIWNvdXJzZUlkKSB7XG4gICAgICAgICAgICBhbGVydChcIkNvdXJzZSBuYW1lIGNhbm5vdCBiZSBibGFuayFcIik7XG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjb25maXJtKFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIHN0YXJ0IGEgbmV3IHJvdW5kPyBBbGwgY3VycmVudCBkYXRhIHdpbGwgYmUgbG9zdC5cIikpIHtcbiAgICAgICAgICAgIHJvdW5kQ3JlYXRlKGNvdXJzZVBhcmFtcyk7XG4gICAgICAgICAgICBob2xlU2VsZWN0Vmlld1VwZGF0ZSgpO1xuICAgICAgICAgICAgcmVyZW5kZXIoKTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuXG4vKipcbiAqIElmIHRoZSB1c2VyIGlzIG5vdCBpbiB0aGUgY3VycmVudCBjb3Vyc2UsIGFsbG93IHRoZW0gdG8gY2xpY2sgdGhlIHNjcmVlbiB0b1xuICogc2V0IGEgbmV3IHN0cm9rZSdzIGxvY2F0aW9uXG4gKi9cbmZ1bmN0aW9uIGhhbmRsZVN0cm9rZU1hcmtlckFpbUNyZWF0ZUNsaWNrKCkge1xuICAgIG1hcFZpZXcub24oXCJjbGlja1wiLCBzdHJva2VNYXJrZXJBaW1DcmVhdGUpO1xuICAgIG1hcFZpZXcub2ZmKFwiY2xpY2tcIiwgc3Ryb2tlTWFya2VyRGVhY3RpdmF0ZSk7XG59XG5cbi8qKlxuICogSGFuZGxlcyB0aGUgY2xpY2sgZXZlbnQgZm9yIHRvZ2dsaW5nIHRoZSByb3VuZCBpbmZvcm1hdGlvbiBkaXNwbGF5LlxuICovXG5mdW5jdGlvbiBoYW5kbGVUb2dnbGVSb3VuZENsaWNrKCkge1xuICAgIGNvbnN0IHJvdW5kRGl2ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3VuZEluZm9cIik7XG4gICAgcm91bmREaXYuY2xhc3NMaXN0LnRvZ2dsZShcImluYWN0aXZlXCIpO1xufVxuXG4vKipcbiAqIEhhbmRsZXMgdGhlIGNsaWNrIGV2ZW50IGZvciBjb3B5aW5nIGxvY2F0aW9uIGRhdGEgdG8gdGhlIGNsaXBib2FyZC5cbiAqL1xuZnVuY3Rpb24gaGFuZGxlQ29weVRvQ2xpcGJvYXJkQ2xpY2soKSB7XG4gICAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsb2NhdGlvbkRhdGFcIikudGV4dENvbnRlbnQpO1xufVxuXG4vKipcbiAqIFJlY2VudGVyIHRoZSBtYXAgb24gdGhlIGN1cnJlbnQgaG9sZVxuICovXG5mdW5jdGlvbiBoYW5kbGVSZWNlbnRlckNsaWNrKCkge1xuICAgIG1hcFJlY2VudGVyKFwiY3VycmVudEhvbGVcIik7XG59XG5cbi8qKlxuICogU2VhcmNoIE5vbWluYXRpbSB3aGVuIGEgdXNlciBpcyBkb25lIHR5cGluZyBpbiB0aGUgY291cnNlIG5hbWUgYm94XG4gKiBEZWJvdW5jZXMgdG8gb25seSBzZWFyY2ggYWZ0ZXIgNTAwbXMgb2YgaW5hY3Rpdml0eVxuICovXG5sZXQgdGltZW91dElkO1xuZnVuY3Rpb24gaGFuZGxlQ291cnNlU2VhcmNoSW5wdXQoKSB7XG4gICAgbGV0IHF1ZXJ5ID0gdGhpcy52YWx1ZTtcblxuICAgIGNsZWFyVGltZW91dCh0aW1lb3V0SWQpO1xuICAgIHRpbWVvdXRJZCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBpZiAocXVlcnkubGVuZ3RoID49IDMpIHtcbiAgICAgICAgICAgIHJldHVybiBncmlkcy5jb3Vyc2VTZWFyY2gocXVlcnkpLnRoZW4oY291cnNlU2VhcmNoVmlld1VwZGF0ZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNvdXJzZVNlYXJjaFJlc3VsdHNcIikuaW5uZXJIVE1MID0gXCJcIjtcbiAgICAgICAgfVxuICAgIH0sIDUwMCk7XG59XG5cbi8qKlxuICogU2hvd3MgYW4gZXJyb3IgbWVzc2FnZSBiYXNlZCBvbiB0aGUgZ2VvbG9jYXRpb24gZXJyb3IgY29kZS5cbiAqIEBwYXJhbSB7UG9zaXRpb25FcnJvcn0gZXJyb3IgLSBUaGUgZ2VvbG9jYXRpb24gZXJyb3Igb2JqZWN0LlxuICovXG5mdW5jdGlvbiBzaG93RXJyb3IoZXJyb3IpIHtcbiAgICBzd2l0Y2ggKGVycm9yLmNvZGUpIHtcbiAgICAgICAgY2FzZSBlcnJvci5QRVJNSVNTSU9OX0RFTklFRDpcbiAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZXJyb3JcIikuaW5uZXJUZXh0ID0gXCJVc2VyIGRlbmllZCB0aGUgcmVxdWVzdCBmb3IgR2VvbG9jYXRpb24uXCI7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBlcnJvci5QT1NJVElPTl9VTkFWQUlMQUJMRTpcbiAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZXJyb3JcIikuaW5uZXJUZXh0ID0gXCJMb2NhdGlvbiBpbmZvcm1hdGlvbiBpcyB1bmF2YWlsYWJsZS5cIjtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIGVycm9yLlRJTUVPVVQ6XG4gICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImVycm9yXCIpLmlubmVyVGV4dCA9IFwiVGhlIHJlcXVlc3QgdG8gZ2V0IHVzZXIgbG9jYXRpb24gdGltZWQgb3V0LlwiO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgZXJyb3IuVU5LTk9XTl9FUlJPUjpcbiAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZXJyb3JcIikuaW5uZXJUZXh0ID0gXCJBbiB1bmtub3duIGVycm9yIG9jY3VycmVkLlwiO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImVycm9yXCIpLmlubmVyVGV4dCA9IGVycm9yLnRleHQ7XG4gICAgICAgICAgICBicmVhaztcbiAgICB9XG59XG5cbi8vIEV2ZW50IGxpc3RlbmVyc1xubGV0IHN0cm9rZU1hcmtlckFpbUNyZWF0ZUJ1dHRvbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic3Ryb2tlTWFya2VyQWltQ3JlYXRlXCIpXG5cbndpbmRvdy5vbmxvYWQgPSBoYW5kbGVMb2FkO1xuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzdHJva2VBZGRcIikuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGhhbmRsZVN0cm9rZUFkZENsaWNrKTtcbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2x1YlN0cm9rZUNyZWF0ZUNvbnRhaW5lckNsb3NlXCIpLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBjbHViU3Ryb2tlVmlld1RvZ2dsZSk7XG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJvdW5kQ3JlYXRlXCIpLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBoYW5kbGVSb3VuZENyZWF0ZUNsaWNrQ2FsbGJhY2soKSk7XG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInRvZ2dsZVJvdW5kXCIpLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBoYW5kbGVUb2dnbGVSb3VuZENsaWNrKTtcbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY29weVRvQ2xpcGJvYXJkXCIpLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBoYW5kbGVDb3B5VG9DbGlwYm9hcmRDbGljayk7XG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInVuZG9BY3Rpb25cIikuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGhhbmRsZVVuZG9BY3Rpb25DbGljayk7XG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInJlY2VudGVyXCIpLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBoYW5kbGVSZWNlbnRlckNsaWNrKTtcbnN0cm9rZU1hcmtlckFpbUNyZWF0ZUJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGhhbmRsZVN0cm9rZU1hcmtlckFpbUNyZWF0ZUNsaWNrKTtcbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY291cnNlTmFtZVwiKS5hZGRFdmVudExpc3RlbmVyKFwiaW5wdXRcIiwgaGFuZGxlQ291cnNlU2VhcmNoSW5wdXQpOyJdfQ==
