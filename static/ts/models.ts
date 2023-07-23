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
}

interface Course {
    name: string,
    id: string
}

interface Action {
    action: string,
    round: Round,
    currentHoleNum: number,
    currentStrokeIndex: number
}

class NoGeolocationError extends Error {
    code: number;
    POSITION_DENIED: 1
    POSITION_UNAVAILABLE: 2

    constructor(msg: string, code: number) {
        super(msg);
        this.code = code;
    }
}