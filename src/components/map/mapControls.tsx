
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
    const dist = formatDistance(getDistance(pos, props.location), opt);
    const rawDist = formatDistanceAsNumber(getDistance(pos, props.location), opt);
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

export function MapControlsLower() {
    return (<div id="mapControlsWrapper">
        <MapControlsRight />
        <MapControlsLeft />
    </div>);
}

export function MapControlsUpper() {
    return <MapControlsUpperRight />
}