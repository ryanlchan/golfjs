import "preact/debug";
/**
 * Golf App
 * A JavaScript program for tracking golf rounds and locations.
*/
// Dependencies
import { render } from 'preact';
import { useErrorBoundary, useMemo } from 'preact/hooks';
import { signal, useSignal } from "@preact/signals";

// Modules

// Hooks
import { type SettingsStore, settingsStore } from "hooks/settingsStore";
import { RoundStore, roundStore } from 'hooks/roundStore';
import { useCourse } from "hooks/courseStore";
import { useStats } from "hooks/statsStore";
import { useGeolocated } from "hooks/useLocation";
import { useStateManager } from "hooks/useStateManager";

// Contexts
import { AppContext } from "contexts/appContext";
import { StatsContext } from "contexts/statsContext";
import { DataContext } from "contexts/dataContext";

// Components
import { ErrorModal } from "components/errorModal";
import { MODAL_TYPES, ModalProps } from "common/modals";
import { GolfMap } from "components/map/golfMap";
import { MapControlsLower, MapControlsUpper } from "components/map/mapControls";
import { ActiveHoleControls } from "components/holeSelector";
import { StrokeControls } from "components/strokeControls";
import { SignaledModal } from "components/modal";

/**
 * =======================
 * Views/Output formatting
 * =======================
 */

function generateAppState() {
    const rs = roundStore();
    rs.load();
    return { settingsStore: settingsStore(), roundStore: rs }
}

function TrackerContext({ appContext, statsContext, dataContext, children }) {
    return <AppContext.Provider value={appContext}>
        <StatsContext.Provider value={statsContext}>
            <DataContext.Provider value={dataContext}>
                {children}
            </DataContext.Provider>
        </StatsContext.Provider>
    </AppContext.Provider>
}

function TrackerPage({ roundStore, settingsStore }: { roundStore: RoundStore, settingsStore: SettingsStore }) {
    const [error, resetError] = useErrorBoundary();
    const stateManager = useStateManager();
    const courseStore = useCourse(roundStore);
    const statsStore = useStats(roundStore, courseStore);
    const modal = useSignal(null as ModalProps);
    const geolocationResult = useGeolocated({
        positionOptions: { enableHighAccuracy: true, maximumAge: 60000, timeout: 5000 },
        watchPosition: true,
        userDecisionTimeout: 10000,
        suppressLocationOnMount: true
    })
    if (error && modal.value != error) modal.value = {
        message: error.message, timeout: 10000, type: MODAL_TYPES.ERROR
    };
    const appContext = useMemo(() => ({
        settingsStore,
        stateManager,
        geolocationResult,
        modal,
        mapMutator: signal(null)
    }), []);
    const dataContext = useMemo(() => ({ roundStore, courseStore }), [])
    return <TrackerContext appContext={appContext} dataContext={dataContext} statsContext={statsStore}>
        <div className="app">
            {error && <ErrorModal message={error} timeout={10} />}
            <SignaledModal sig={modal} />
            <div id='mapid'>
                <GolfMap />
                <div id="upperMapControls">
                    <MapControlsUpper />
                </div>
            </div>
            <div id="subMapControls" className="bodyContainer">
                <MapControlsLower />
                <ActiveHoleControls roundStore={roundStore} />
                <StrokeControls />
            </div>
            <div className="bodyContainer">
            </div>
        </div>
    </TrackerContext>
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
    const props = generateAppState()
    render(<TrackerPage {...props} />, document.getElementById('appContainer'))
}

// Event listeners
window.addEventListener('load', handleLoad);
window.secretdebugfunction = () => { debugger };