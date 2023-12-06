/**
 * Golf App
 * A JavaScript program for tracking golf rounds and locations.
 */
// Dependencies
import * as L from "leaflet";
import "leaflet.gridlayer.googlemutant/dist/Leaflet.GoogleMutant";
import { enableSmoothZoom } from "leaflet.smoothwheelzoom";
import { typeid } from "typeid-js";
import { h, render, VNode } from 'preact';
import { useState, useEffect } from 'preact/hooks';
;

// Modules
import * as grids from "services/grids.js";
import * as courses from "services/courses.js";
import { getDistance, formatDistance, formatDistanceAsNumber, formatDistanceOptions } from "common/projections.js";
import { PositionError } from "common/errors.js";
import { showError, hideError, touch, getUnitsSetting, getSetting } from "common/utils.js";
import * as cache from "common/cache.js";
import { roundCreate, roundCourseParams, roundLoad, roundSave } from "services/rounds.js";
import { SG_SPLINES } from "services/coeffs20231205.js";
import { getUsableClubs } from "services/clubs.js";

// Static images
import circleMarkerImg from "./assets/img/unselected-2x.png";
import selectedMarkerImg from "./assets/img/selected-2x.png";
import targetImg from "./assets/img/targeted-2x.png";
import flagImg from "./assets/img/flag.png";

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
 * ========
 * LayerSet
 * A frontend for tracking and reading back out layers
 * maybe not necessary anymore??
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
 * =======================
 * Views/Output formatting
 * =======================
 */

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

function App() {
    return <div className="app">
        <ErrorModal message="Test" timeout={1} />
        <div id='mapid'>
            <LeafletMap></LeafletMap>
            <div id="upperMapControls">
                <MapControlsUpper />
            </div>
        </div>
        <div id="subMapControls" class="bodyContainer">
            <SubMapControls />
            <div id="clubStrokeCreateContainer" class="inactive">
                <div id="clubStrokeCreateContainerCloseContainer">
                    <button id="clubStrokeCreateContainerClose" class="dark">Close and go back</button>
                </div>
            </div>
        </div>
        <div className="bodyContainer">
        </div>
    </div>

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
        render(<App />, document.getElementById('appContainer'))
        clubStrokeViewCreate(getUsableClubs(), document.getElementById("clubStrokeCreateContainer"));
        holeSelect(-1);
    });
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