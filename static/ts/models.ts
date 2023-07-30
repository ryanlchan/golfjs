// Actual models
interface Coordinate {
    x: number,
    y: number,
    crs: string
}

interface Round {
    date: string,
    course: string,
    courseId?: string,
    holes: Hole[],
}

interface Hole {
    number: number,
    pin?: Coordinate,
    par?: number,
    handicap?: number,
    strokes: Stroke[]
}

interface Stroke {
    index: number,
    hole: number,
    start: Coordinate,
    aim?: Coordinate,
    club?: string,
    dispersion?: number,
    terrain?: string
}

interface Course {
    name: string,
    id?: string
}

interface Action {
    action: string,
    round: Round,
    currentHoleNum: number,
    currentStrokeIndex: number
    activeStroke: Stroke
}

interface Club {
    name: string,
    dispersion: number
}


// Helpful types
interface GeolocationPositionIsh {
    coords: {
        latitude: any,
        longitude: any
    }
}

// Errors
class PositionError extends Error {
    code: number;
    PERMISSION_DENIED: 1
    POSITION_UNAVAILABLE: 2
    TIMEOUT: 3
    UNKNOWN_ERROR: 4

    constructor(msg: string, code: number) {
        super(msg);
        this.code = code;
    }
}