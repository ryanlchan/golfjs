import { useState } from "preact/hooks";

import { formatDistance, formatDistanceAsNumber, getDistance } from "common/projections";
import { MenuButton } from "components/appMenu";
import { ClubMenu } from "components/clubMenu";

import { useActiveHolesContext } from "hooks/useActiveHolesContext";
import { useDisplayUnitsContext } from "hooks/useDisplayUnits";
import { useCoordinateContext, useLocationContext } from "hooks/useLocationContext";
import { useRoundContext } from "hooks/useRoundContext";

import { type GolfClub } from "services/clubs";
import { useMapMutatorContext } from "hooks/useMapMutatorContext";
import { useAppContext } from "contexts/appContext";
import { useDataContext } from "contexts/dataContext";
import { getHolePinFromRound, getStrokesFromRound } from "services/rounds";
import { strokeCreate } from "services/strokes";
import { useActiveStrokesContext } from "hooks/useActiveStrokesContext";
import { strokesStore } from "hooks/strokesStore";

function MapRecenterButton() {
    const mapMutator = useMapMutatorContext().value;
    const onClick = () => mapMutator.recenter();
    return (<button id="recenter" className="mapButton" onClick={onClick}>
        <svg xmlns="http://www.w3.org/2000/svg" height="1.25em" viewBox="0 0 448 512"><path d="M429.6 92.1c4.9-11.9 2.1-25.6-7-34.7s-22.8-11.9-34.7-7l-352 144c-14.2 5.8-22.2 20.8-19.3 35.8s16.1 25.8 31.4 25.8H224V432c0 15.3 10.8 28.4 25.8 31.4s30-5.1 35.8-19.3l144-352z" />
        </svg>
    </button>);
}

function StrokeAddButton({ onAddWithClub }: { onAddWithClub: (c: GolfClub, e: Event) => void }) {
    const [menuVisible, setMenuVisible] = useState(false);
    const toggleMenu = () => setMenuVisible(!menuVisible);
    return (<button id="strokeAdd" className="success mapButton" onClick={toggleMenu}>
        <svg xmlns="http://www.w3.org/2000/svg" height="1.25em" viewBox="0 0 448 512">
            <path d="M256 80c0-17.7-14.3-32-32-32s-32 14.3-32 32V224H48c-17.7 0-32 14.3-32 32s14.3 32 32 32H192V432c0 17.7 14.3 32 32 32s32-14.3 32-32V288H400c17.7 0 32-14.3 32-32s-14.3-32-32-32H256V80z" />
        </svg>
        {menuVisible && <ClubMenu callback={onAddWithClub} />}
    </button>);
}

function StrokeAimResetButton({ onAimReset }: { onAimReset: () => void }) {
    return (<button id="strokeAimReset" className="mapButton" onClick={onAimReset}>
        <svg xmlns="http://www.w3.org/2000/svg" height="1.25em" viewBox="0 0 512 512">
            <path d="M48 24C48 10.7 37.3 0 24 0S0 10.7 0 24V64 350.5 400v88c0 13.3 10.7 24 24 24s24-10.7 24-24V388l80.3-20.1c41.1-10.3 84.6-5.5 122.5 13.4c44.2 22.1 95.5 24.8 141.7 7.4l34.7-13c12.5-4.7 20.8-16.6 20.8-30V66.1c0-23-24.2-38-44.8-27.7l-9.6 4.8c-46.3 23.2-100.8 23.2-147.1 0c-35.1-17.6-75.4-22-113.5-12.5L48 52V24zm0 77.5l96.6-24.2c27-6.7 55.5-3.6 80.4 8.8c54.9 27.4 118.7 29.7 175 6.8V334.7l-24.4 9.1c-33.7 12.6-71.2 10.7-103.4-5.4c-48.2-24.1-103.3-30.1-155.6-17.1L48 338.5v-237z" />
        </svg>
    </button>);
}

function DistanceTracker(props: { location: Coordinate, target: Coordinate, name: string }) {
    const displayUnits = useDisplayUnitsContext();
    const opt = { to_unit: displayUnits, include_unit: true };
    const dist = formatDistance(getDistance(props.location, props.target), opt);
    const rawDist = formatDistanceAsNumber(getDistance(props.location, props.target), opt);
    if (rawDist > 650) return
    const id = `distanceTo${props.name}Container`;
    return (<div id={id} className="mapInfoBox">
        <span>{props.name}</span>
        <div id="distanceToPin">
            {dist}
        </div>
    </div>);
}

function PinDistanceTracker() {
    const geolocationResult = useLocationContext();
    if (!geolocationResult.isGeolocationAvailable.value) return
    const round = useRoundContext().data.value;
    const activeHoles = useActiveHolesContext(round);
    const pinCoord = activeHoles[0]?.pin;
    const coord = useCoordinateContext();
    const name = "Pin"
    return <DistanceTracker target={pinCoord} location={coord} name={name} />
}


/***********
 * Layouts *
 ***********/

export function MapControlsLower() {
    return (
        <div id="mapControlsWrapper">
            <div className="mapControlsContainer" id="mapControlsRight">
                <MapRecenterButton />
                <StrokeAddButton onAddWithClub={useAddWithClubCallback()} />
            </div>
            <div className="mapControlsContainer" id="mapControlsLeft">
                <StrokeAimResetButton onAimReset={useAimResetCallback()} />
            </div>
        </div>
    )
}

export function MapControlsUpper() {
    return <div id="mapControlsUpperRight" className="mapControlsContainer">
        <MenuButton />
        <PinDistanceTracker />
    </div>
}

const useAddWithClubCallback = () => {
    const appContext = useAppContext();
    const dataContext = useDataContext();
    return (club: GolfClub) => {
        const round = dataContext.roundStore?.data.value;
        const course = dataContext.courseStore?.data.value;
        const strokes = getStrokesFromRound(round);
        const holes = useActiveHolesContext(round);
        const hole = holes.at(-1).index || strokes.reduce((acc, s) => s.holeIndex > acc ? s.holeIndex : acc, 0)
        const location = appContext.geolocationResult.raw.value;
        dataContext.roundStore?.mutate((draft) => {
            strokeCreate(
                location,
                hole,
                course,
                draft,
                club
            )
        })
    }
}

const useAimResetCallback = () => {
    const dataContext = useDataContext();
    const round = dataContext.roundStore?.data.value;
    const strokes = useActiveStrokesContext(round);
    return () => {
        const stroke = strokes.at(-1);
        const pin = getHolePinFromRound(round, stroke.holeIndex);
        const store = strokesStore(dataContext.roundStore)
        store.update(stroke, (draft) => {
            draft.aim = pin;
        })
    }
}