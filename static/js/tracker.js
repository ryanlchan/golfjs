/**
 * Golf App
 * A JavaScript program for tracking golf rounds and locations.
 */

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
    console.debug(`Deleting stroke ${strokeIndex} from hole ${holeNumber}`)
    let hole = round.holes.find(h => h.number === holeNumber);
    if (hole) {
        let stroke = hole.strokes[strokeIndex];
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
 * @param {Number} holeNumber the hole to reorder (1-indexed)
 * @param {Number} strokeIndex the stroke index to reorder (0-indexed)
 * @param {Number} offset movment relative to the current strokeIndex
 */
function strokeMove(holeNumber, strokeIndex, offset) {
    console.debug(`Moving stroke ${strokeIndex} from hole ${holeNumber} by ${offset}`)
    undoCreate("strokeMove");
    const hole = round.holes[holeNumber - 1]
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
 * @param {Object*} stroke
 */
function strokeDistance(stroke) {
    let distance = 0;
    const hole = round.holes[stroke.hole - 1]
    const following = hole.strokes[stroke.index + 1]
    if (following) {
        distance = getDistance(stroke.start, following.start);
    } else if (hole.pin) {
        distance = getDistance(stroke.start, hole.pin);
    }

    return distance
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
        iconUrl: "static/img/circle-ypad.png", // replace with the path to your flag icon
        iconSize: [30, 45], // size of the icon
        iconAnchor: [15, 30]
    });
    let opt = { draggable: true, opacity: .8, icon, strokeIndex: stroke.index }
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
        { permanent: true, direction: "top", offset: [0, 0] })
    marker.on('click', strokeMarkerActivate(marker));
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
 * @param {Marker} marker the leaflet map marker
 * @returns {function}
 */
function strokeMarkerActivate(marker) {
    // callback doesn't need to handle the click event
    return (() => {
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
        } else {
            strokeMarkerAimCreateButton.classList.remove("inactive")
        }

        // Register deactivation clicks
        mapView.addEventListener("click", strokeMarkerDeactivate)
    });
}

/**
 * Deactivate an aim marker when the user clicks on the map
 */
function strokeMarkerDeactivate(e) {

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
        console.error("Cannot add aim, no active stroke")
        return
    }

    if (e) {
        activeStroke.aim = {
            x: e.latlng.lng,
            y: e.latlng.lat,
            crs: "EPSG:4326"
        }
    }
    let marker = markerCreate("active_aim", activeStroke.aim);
    marker.bindTooltip(strokeMarkerAimTooltip, { permanent: true, direction: "top", offset: [-15, 0] })
    let ring = L.circle(marker.getLatLng(), { radius: activeStroke.dispersion, color: "#fff", opacity: 0.5, weight: 2 })
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
 * @param {Object} stroke
 * @returns {String}
 */
function strokeMarkerID(stroke) {
    return `stroke_marker_${stroke.index}_hole_${stroke.hole}`
}

/**
 * Create a unique ID for a Stroke AIm marker
 * @param {Object} stroke
 * @returns {String}
 */
function strokeMarkerAimID(stroke) {
    return `stroke_marker_aim_${stroke.index}_hole_${stroke.hole}`
}

/**
 * Create a unique ID for a Stroke SG grid
 * @param {Object} stroke
 * @returns {String}
 */
function strokeSgGridID(stroke) {
    return `stroke_${stroke.index}_hole_${stroke.hole}_sg_grid`
}

/**
 * Return the tooltip text for a stroke marker
 * @param {Object} stroke
 */
function strokeTooltipText(stroke) {
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
 * Create the currently active grid type
 */
function gridCreate(type) {
    if (type == gridTypes.STROKES_GAINED) {
        sgGridCreate();
    } else if (type == gridTypes.TARGET) {
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

    let grid = sgGrid(
        [activeStroke.start.y, activeStroke.start.x],
        [activeStroke.aim.y, activeStroke.aim.x],
        [currentHole.pin.y, currentHole.pin.x],
        activeStroke.dispersion,
        roundCourseParams(round));

    // Check if any grid returned, for example if the data didn't load or something
    if (grid instanceof Error) {
        return
    }
    // Create alpha/colorscale
    let colorscale = chroma.scale('RdYlGn').domain([-.25, .15]);
    let alphamid = 1 / grid.features.length;
    const clip = (num, min, max) => Math.min(Math.max(num, min), max)
    let gridLayer = L.geoJSON(grid, {
        style: function (feature) {
            return {
                stroke: false,
                fillColor: colorscale(feature.properties.strokesGained).hex(),
                fillOpacity: clip(feature.properties.probability / alphamid * 0.2, 0.1, 0.7)
            }
        },
        grid: grid
    }).bindPopup(function (layer) {
        const props = layer.feature.properties;
        const sg = props.strokesGained;
        const prob = (props.probability * 100);
        const er = erf(props.distanceToAim, 0, activeStroke.dispersion)
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

    let grid = targetGrid(
        [activeStroke.start.y, activeStroke.start.x],
        [activeStroke.aim.y, activeStroke.aim.x],
        [currentHole.pin.y, currentHole.pin.x],
        activeStroke.dispersion,
        roundCourseParams(round));

    // Check if any grid returned, for example if the data didn't load or something
    if (grid instanceof Error) {
        return
    }
    // Create alpha/colorscale
    let colorscale = chroma.scale('RdYlGn').domain([-.25, .25]);
    let gridLayer = L.geoJSON(grid, {
        style: function (feature) {
            return {
                stroke: false,
                fillColor: colorscale(feature.properties.relativeStrokesGained).hex(),
                fillOpacity: 0.5
            }
        },
        grid: grid
    }).bindPopup(function (layer) {
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
 * @param {Object} hole
 */
function strokelineCreate(hole) {
    console.debug("Creating stroke line for hole " + hole.number)
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
 * @param {Object} hole
 * @returns {Array[latLng]}
 */
function strokelinePoints(hole) {
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
 * @param {Object} hole
 * @returns String
 */
function strokelineID(hole) {
    return `strokeline_hole_${hole.number}`
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
    } else {
        console.error(`Attempted to select hole ${holeNum} but does not exist!`);
    }

    // Delete all hole-specific layers and active states
    holeViewDelete();

    // Add all the layers of this new hole
    holeViewCreate(currentHole);
    rerender();
    mapRecenter("currentHole")
}

/**
 * Returns a unique layer ID for a given Hole
 * @param {Hole} hole the hole interface object from round
 * @returns {String}
 */
function holePinID(hole) {
    return `pin_hole_${hole.number}`
}

/**
 * Adds a pin marker to the map.
 * @param {Object} hole - The hole to add a pin for
 */
function pinMarkerCreate(hole) {
    console.debug("Creating pin marker for hole " + hole.number)
    const coordinate = hole.pin;
    const holeNum = hole.number
    const flagIcon = L.icon({
        iconUrl: "static/img/flag.png", // replace with the path to your flag icon
        iconSize: [60, 60], // size of the icon
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
    let line = getGolfHoleLine(roundCourseParams(round), hole.number)
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
function holeLineDelete(hole) {
    if (hole) {
        layerDelete(holeLineId(hole));
    } else {
        for (let hole of round.holes) {
            layerDelete(holeLineID(hole));
        }
    }
}

/**
 * Return a unique ID for a hole line layer
 * @param {Hole} hole the Hole interface object
 * @returns {String} a unique ID
 */
function holeLineId(hole) {
    return `hole_${hole.number}_line`
}

/**
 * ======
 * Rounds
 * ======
 */

/**
 * Create a new round and clear away all old data
 * Tries to background fetch course data and will call #roundUpdateWithData after loaded
 */
function roundCreate(courseParams) {
    // Set undo point
    undoCreate("roundCreate")
    let inputVal = document.getElementById("courseName").value;
    if (!courseParams && !inputVal) {
        console.error("Cannot create a round without any inputs");
        return
    } else if (!courseParams) {
        courseParams = { courseName: document.getElementById("courseName").value }
    }
    let courseName = courseParams["name"];
    let courseId = courseParams["id"];

    // Reset all major data
    localStorage.removeItem("golfData");
    round = { ...defaultRound(), course: courseName, courseId: courseId };
    currentHole = round.holes.at(0)
    currentStrokeIndex = 0;
    layerDeleteAll();
    fetchGolfCourseData(courseParams).then(roundUpdateWithData);
}

/**
 * After downloading polygons, update the Round with relevant data like pins and holes
 * @param {FeatureCollection} courseData the polygons for this course
 */
function roundUpdateWithData(courseData) {
    let lines = courseData.features.filter((feature) => feature.properties.golf && feature.properties.golf == "hole")
    for (let line of lines) {
        const number = parseInt(line.properties.ref);
        const green = getGolfHoleGreen(roundCourseParams(round), number);
        const cog = turf.center(green).geometry.coordinates;
        const pin = {
            x: cog[0],
            y: cog[1],
            crs: "EPSG:4326",
        };
        let hole = { ...defaultCurrentHole(), number: number, pin: pin };
        if (line.properties.par) {
            hole["par"] = parseInt(line.properties.par)
        }
        if (line.properties.handicap) {
            hole["handicap"] = parseInt(line.properties.handicap)
        }
        round.holes[hole.number - 1] = { ...hole, ...round.holes[hole.number - 1] }
    }
    holeSelectViewUpdate();
    rerender();
    for (let hole of round.holes) {
        holeViewCreate(hole)
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
    return { 'name': round.course, 'id': round.courseId }
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
    }
    strokeCreate(position, options)
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
 */
function loadData() {
    const loadedData = JSON.parse(localStorage.getItem("golfData"));
    if (loadedData) {
        round = loadedData;
        console.log("Rehydrating round from localStorage")
        round.holes.forEach(function (hole) {
            holeViewCreate(hole);
        });

        const lastHole = round.holes.reduce((acc, hole) => {
            if (hole.strokes.length > 0) {
                return hole.number;
            } else {
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
 * @param {Object} coordinate - The coordinate object { x, y, crs }.
 * @param {Object} options - Marker options.
 */
function markerCreate(name, coordinate, options) {
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
    console.debug(`Created a new undo point for action#${action}`)
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
function layerCreate(id, object) {
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
function layerRead(id) {
    return layers[id]
}

/**
 * Delete a layer with a given ID
 * @param {String} id
 */
function layerDelete(id) {
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
function layerReadAll() {
    return layers
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

    const a =
        Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c; // meters
    return distance;
}

/**
 * Get the user's location from browser or cache
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
        } else if (!navigator.geolocation) {
            // Create a custom position error
            let e = new Error("Geolocation is not supported by this browser.");
            e.code = 2;
            e.POSITION_UNAVAILABLE = 2;
            reject(e);
        } else {
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
        } else {
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
            }
            document.getElementById("error").innerText = ""
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
        const point = turf.point([position.coords.longitude, position.coords.latitude])
        return turf.booleanWithin(point, bound)
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
        return mapView.getBounds().contains(userLatLng)
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
 * Dumb function to translate from 4 coord bbox to 2x2 latlong bbox
 * @param {Array} turfbb
 */
function turfbbToleafbb(turfbb) {
    bb = [...turfbb] // copy it so we're not destructive...
    bb.reverse();
    return [bb.slice(0, 2), bb.slice(2)];
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
 * @param {String} key
 */
function mapRecenter(key) {
    let flyoptions = {
        animate: true,
        duration: 0.33
    }
    if (key == "course") {
        let course = getGolfCourseData(roundCourseParams(round));
        if (course instanceof Error) {
            return
        } else {
            console.debug("Recentering on course")
            mapView.flyToBounds(turfbbToleafbb(turf.bbox(course)), flyoptions)
        }
    } else if (key == "currentHole") {
        let line = getGolfHoleLine(roundCourseParams(round), currentHole.number);
        if (line instanceof Error) {
            return
        } else if (line) {
            console.debug("Recentering on current hole")
            mapView.flyToBounds(turfbbToleafbb(turf.bbox(line)), flyoptions)
        } else if (currentHole.pin) {
            console.debug("Recentering on current pin")
            mapView.flyTo([currentHole.pin.y, currentHole.pin.x], 18, flyoptions)
        }
    } else if (!key || key == "currentPosition") {
        if (currentPositionEnabled && currentPosition) {
            console.debug("Recentering on current position")
            mapView.flyTo([currentPosition.coords.latitude, currentPosition.coords.longitude], 20, flyoptions)
        }
    }
}

/**
 * Render the set of markers/layers for a given hole
 * @param {Object} hole the hole object from round
 */
function holeViewCreate(hole) {
    console.debug(`Rendering layers for hole ${hole.number}`)
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
 * @param {Element} element a select element that we will populate with options
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
 * @param {Element} element
 */
function holeSelectViewUpdate() {
    if (!holeSelector) {
        return
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
        option.value = hole.number;
        option.text = `Hole ${hole.number}`;
        holeSelector.appendChild(option);
    }
    holeSelector.value = currentHole.number
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
        timeout: 5000,
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
        currentHole.strokes.forEach(function (stroke, index) {
            let distance = 0;
            if (currentHole.strokes[index + 1]) {
                distance = getDistance(stroke.start, currentHole.strokes[index + 1].start);
            } else if (currentHole.pin) {
                distance = getDistance(stroke.start, currentHole.pin);
            }
            const listItem = document.createElement("li");
            listItem.innerHTML = `${index + 1}. ${stroke.club} (${Math.round(distance)}m) | `;
            let actions = [strokeDeleteViewCreate(stroke), " | ", strokeMoveViewCreate(stroke, -1), " | ", strokeMoveViewCreate(stroke, 1)];
            listItem.append(...actions);
            strokeElement.appendChild(listItem);
        });
    } else {
        holeElement.innerText = "";
        strokeElement.innerHTML = "";
    }
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
        srn = strokesRemainingFrom(startPoint, pinCoord, roundCourseParams(round));
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
    while (selector.firstChild) {
        selector.removeChild(selector.firstChild);
    }
    for (let type in gridTypes) {
        let opt = document.createElement('option');
        opt.value = gridTypes[type];
        opt.innerText = gridTypes[type];
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
    link.innerHTML = "delete";
    link.id = `stroke_${stroke.index}_delete`
    link.addEventListener("click", (() => {
        strokeDelete(stroke.hole, stroke.index);
    }));
    return link
}

/**
 * Create a link that moves this stroke
 * @param {Object} stroke the stroke to move
 * @param {Number} offset the offset for the stroke index
 * @returns {link}
 */
function strokeMoveViewCreate(stroke, offset) {
    let link = document.createElement("button");
    link.innerHTML = `Move ${offset}`;
    link.id = `stroke_${stroke.index}_move_${offset}`
    link.addEventListener("click", (() => {
        strokeMove(stroke.hole, stroke.index, offset);
    }));
    return link
}

/**
 * Rerender key views based on volatile data
 */
function rerender(type) {
    // Render calls that can occur any time, high perf
    if (!type) {
        roundViewUpdate();
        strokelineUpdate();
        strokeMarkerUpdate();
        strokeMarkerAimUpdate();
        holeStatsUpdate();
        saveData();
    }
    // Render calls that should happen only after drags finish
    if (type == "dragend" && activeStroke) {
        gridUpdate().then(() => {
            aimStatsUpdate();
            strokeMarkerAimUpdate();
        }, (error) => console.error(error));
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
    const el = document.getElementById("clubStrokeCreateContainer")
    el.classList.toggle("inactive");
    if (!(currentPositionEnabled)) {
        currentPositionUpdate()
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
function osmCourseID(type, id) {
    return `osm-${type}-${id}`
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
    let courseData = { 'name': round.course, 'id': round.courseId }
    fetchGolfCourseData(courseData).then(() => mapRecenter("currentHole"));
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
 */
function handleRoundCreateClickCallback(courseParams) {
    return (() => {

        let courseName;
        let courseId;

        if (courseParams) {
            courseName = courseParams["name"];
            courseId = courseParams["id"];
        } else {
            courseName = document.getElementById("courseName").value;
        }

        if (!courseName && !courseId) {
            alert("Course name cannot be blank!");
            return
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
            return courseSearch(query).then(courseSearchViewUpdate);
        } else {
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