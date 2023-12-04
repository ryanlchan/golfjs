import { typeid } from "typeid-js";
/**
 * Round Migrations
 * TODO: Probably need a better way to handle this
 */

/* Latest version */
interface Round extends Round2p1 { }
interface Hole extends Hole2p1 { }
interface Stroke extends Stroke2p1 { }

/* V2.1: Change to indexes, add ID's */
interface Round2p1 extends HasUpdateDates {
    id?: string,
    version?: number,
    date: string,
    course: string,
    courseId?: string,
    holes: Hole[],
}

interface Hole2p1 extends HasUpdateDates {
    id?: string,
    index: number,
    pin?: Coordinate,
    par?: number,
    handicap?: number,
    strokes: Stroke[]
}

interface Stroke2p1 extends HasUpdateDates {
    id?: string,
    index: number,
    holeIndex: number,
    start: Coordinate,
    aim?: Coordinate,
    club?: string,
    dispersion?: number,
    terrain?: string
}

/* V1.1 */
interface Round1p1 extends HasUpdateDates {
    version?: number,
    date: string,
    course: string,
    courseId?: string,
    holes: Hole1p1[],
}

interface Hole1p1 extends HasUpdateDates {
    number: number,
    course: string,
    pin?: Coordinate,
    par?: number,
    handicap?: number,
    strokes: Stroke1p1[]
}

interface Stroke1p1 extends HasUpdateDates {
    index: number,
    course: string,
    start: Coordinate,
    aim?: Coordinate,
    club?: string,
    dispersion?: number,
    terrain?: string
}

/**
 * Migrate a round from version 1.1 to 2.0
 * @param {Round} round 
 * @returns {Round} the updated Round
 */
function migrate1p1to2p1(round: Round1p1): Round {
    let newHoles = round.holes.map((hole) => {
        let pin = hole.pin || hole.strokes[-1].start;
        let holeIndex = hole.number - 1;

        let newStrokes = hole.strokes.map((stroke) => {
            let newStroke: Stroke2p1 = {
                id: typeid("stroke").toString(),
                index: stroke.index,
                holeIndex,
                start: stroke.start,
                aim: pin,
                club: "?",
                dispersion: -0.15,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            return newStroke;
        });

        let newHole: Hole2p1 = {
            id: typeid("hole").toString(),
            index: holeIndex,
            strokes: newStrokes,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        return newHole;
    });

    let newRound: Round2p1 = {
        id: typeid("round").toString(),
        date: round.date,
        course: round.course,
        holes: newHoles,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 2.1
    };

    return newRound;
}

export function migrateLocalStorageToForage(key, value): any[] {
    let namespace;
    const split = key.split("-") as string[];

    // Transfer old rounds
    if (split[0] == "priorRounds") {
        namespace = "rounds";
        const rounds = JSON.parse(value);
        return Object.values(rounds).map((round: Round) => [round.id, round, namespace]);
    } else if (split[0] == "golfData") {
        namespace = "rounds";
        const round = JSON.parse(value);
        const roundEntry = [round.id, round, namespace];
        const latestEntry = ["latest", round.id, namespace];
        return [roundEntry, latestEntry];
    }

    // Parse and preserve settings
    if (split[0] == "settings") {
        value = JSON.parse(value);
    }

    // Skip existing stats - will regenerate in new format
    if (split[0] == "stats") {
        return;
    }

    // Skip existing courseData - will reparse in new format
    if (split[0] == "courseData") {
        return
    }

    // Everything else (googleMaps keys, etc)
    return [[key, value, namespace]];

}