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
    index: number,
    pin?: Coordinate,
    par?: number,
    handicap?: number,
    strokes: Stroke[]
}

interface Stroke {
    index: number,
    holeIndex: number,
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
    currentHoleIndex: number,
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