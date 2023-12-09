/**
 * Golf App
 * A JavaScript program for tracking golf rounds and locations.
 */
// Dependencies
import * as L from "leaflet";
import "leaflet.gridlayer.googlemutant/dist/Leaflet.GoogleMutant";
import { enableSmoothZoom } from "leaflet.smoothwheelzoom";
import { typeid } from "typeid-js";
import { h, render, JSX } from 'preact';
import { useState, useEffect, useErrorBoundary } from 'preact/hooks';
;

// Modules
import { PositionError } from "common/errors.js";
import { showError } from "common/utils.js";
import * as cache from "common/cache.js";
import { roundNew, roundCourseParams, roundLoad, roundSave } from "services/rounds.js";
import { SG_SPLINES } from "services/coeffs20231205.js";
import { getUsableClubs, useClubs } from "services/clubs.js";

// Static images
import circleMarkerImg from "./assets/img/unselected-2x.png";
import selectedMarkerImg from "./assets/img/selected-2x.png";
import targetImg from "./assets/img/targeted-2x.png";
import flagImg from "./assets/img/flag.png";
import { getLocationOnMap } from "common/location";
import { ActiveStrokeControls } from "components/controlCards/activeStrokeControlCards";
import { ErrorModal } from "components/errorModal";
import { HoleInfo } from "components/holeInfo";
import { LeafletMap } from "components/map/leafletMap";
import { MapControlsLower, MapControlsUpper } from "components/map/mapControls";
import { Scorecard } from "components/scorecard";
import { SettingsStore, initSettingsStore } from "hooks/settingsStore";
import { initRoundStore, RoundStore } from 'hooks/roundStore';
import { useCourse } from "hooks/useCourse";
import { useStats } from "hooks/useStats";
import { SettingsContext } from "contexts/settingsContext";

// Variables
let mapView: any;
let round: Round = roundNew();
let currentHole: Hole = round.holes.at(-1);
let layers: object = {};
let currentPosition: GeolocationPosition;
let currentPositionEnabled: boolean;
let activeStroke: Stroke;
let displayUnits = getUnitsSetting();


/**
 * =======================
 * Views/Output formatting
 * =======================
 */

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

function generateAppState() {
    const settingsStore = initSettingsStore();
    const roundStore = initRoundStore();
    return { settingsStore, roundStore }
}

function App({ roundStore, settingsStore }: { roundStore: RoundStore, settingsStore: SettingsStore }) {
    const [error, resetError] = useErrorBoundary();
    const courseStore = useCourse(roundStore);
    const statsStore = useStats(roundStore, courseStore);

    return <SettingsContext.Provider value={settingsStore}>
        <div className="app">
            {error && <ErrorModal message={error} timeout={10} />}
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
    </SettingsContext.Provider>

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
    render(<App />, document.getElementById('appContainer'))
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