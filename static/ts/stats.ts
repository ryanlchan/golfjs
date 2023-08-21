// stats.ts
import { point, distance, bearing } from '@turf/turf';
import { erf, cdf, sgGrid } from './grids';
import * as turf from "@turf/turf";
import { coordToPoint, getDistance, formatDistance } from './projections';

interface roundStatsCache {
    round: roundStats,
    holes: holeStats[],
    strokes: strokeStats[]
    breakdowns?: breakdownStats
}

interface roundStats extends strokesSummary {
    par: number,
    filter?: string,
    strokesRemaining: number
}

interface holeStats extends strokesSummary {
    index: number,
    par: number,
    strokesRemaining: number
}

interface strokeStats {
    index: number,
    holeIndex: number,
    club: string,
    terrain: string,
    distanceToAim: number,
    distanceToPin: number,
    distanceToActual: number,
    proximityActualToAim: proximityStats,
    proximityActualToPin: proximityStats,
    strokesRemaining: number,
    strokesGained: number,
    strokesGainedPredicted: number,
    strokesGainedOverPredicted: number,
    strokesGainedPercentile: number,
    bearingAim: number,
    bearingPin: number,
    bearingActual: number
}

interface strokesSummary {
    strokes: number,
    strokesGained: number,
    strokesGainedPredicted: number,
    strokesGainedPercentile: number,
    proximityPercentile: number
}

interface proximityStats {
    proximity: number,
    proximityCrossTrack: number,
    proximityAlongTrack: number,
    proximityPercentile: number,
    proximityPercentileCrossTrack: number,
    proximityPercentileAlongTrack: number,
}

interface breakdownStats {
    putts: strokesSummary,
    chips: strokesSummary,
    approaches: strokesSummary,
    drives: strokesSummary,
    total?: strokesSummary
}

/**
 * Cache operations
 */
function getHoleStats(cache: roundStatsCache, holeIndex: number): holeStats {
    return cache.holes.filter((el) => el.index == holeIndex)[0];
}

function setHoleStats(cache: roundStatsCache, stats: holeStats): void {
    cache.holes.push(stats);
}

function getStrokeStats(cache: roundStatsCache, holeIndex: number, strokeIndex: number): strokeStats {
    return cache.strokes.filter((el) => el.index == strokeIndex && el.holeIndex == holeIndex)[0];
}

function setStrokeStats(cache: roundStatsCache, stats: strokeStats): void {
    cache.strokes.push(stats);
}

function setRoundStats(cache: roundStatsCache, stats: roundStats): void {
    cache.round = stats;
}

/**
 * Utilities
 */

function getHoleFromRound(round: Round, holeIndex: number): Hole {
    return round.holes[holeIndex];
}

function getHolePinFromRound(round: Round, holeIndex: number): Coordinate {
    const hole = getHoleFromRound(round, holeIndex);
    if (!hole) return
    return hole.pin
}

function getStrokeFromRound(round: Round, holeIndex: number, strokeIndex: number): Stroke {
    const hole = getHoleFromRound(round, holeIndex);
    return hole.strokes[strokeIndex]
}

function getStrokeFollowingFromRound(round: Round, stroke: Stroke): Stroke {
    return getStrokeFromRound(round, stroke.holeIndex, stroke.index + 1);
}

function getStrokeEndFromRound(round: Round, stroke: Stroke): Coordinate {
    const following = getStrokeFollowingFromRound(round, stroke);
    if (following) return following.start;
    return getHolePinFromRound(round, stroke.holeIndex);
}

/**
 * Statistics
 */

/**
 * Runs a full recalculation of a round 
 * @param round the round to recalculate
 * @returns {roundStatsCache}
 */
export function calculateRoundStatsCache(round: Round, unit?: string): roundStatsCache {
    let rstats: roundStats = defaultRoundStats();
    const cache: roundStatsCache = {
        round: null,
        holes: [],
        strokes: []
    };

    // Create config entries
    const roundCourseParams = { 'name': round.course, 'id': round.courseId }

    // Iterate over round holes forward, 1-18
    for (let hole of round.holes) {
        const pin = hole.pin;
        let strokeEnd = pin;
        let hstats: holeStats = defaultHoleStats(hole);

        // Within each hole, calculate strokes gained from last stroke backwards
        let holeAcc = hole.strokes.reduceRight((acc: any, stroke: Stroke) => {
            const srnext = acc.srnext;
            const grid = sgGrid(
                [stroke.start.y, stroke.start.x],
                [stroke.aim.y, stroke.aim.x],
                [pin.y, pin.x],
                stroke.dispersion,
                roundCourseParams,
                stroke.terrain
            );
            const index = stroke.index;
            const holeIndex = stroke.holeIndex;
            const terrain = grid.properties.terrain;
            const distanceToAim = getDistance(stroke.start, stroke.aim);
            const distanceToPin = getDistance(stroke.start, pin);
            const distanceToActual = getDistance(stroke.start, strokeEnd);
            const proximityActualToAim = proximityStatsActualToAim(stroke, round, strokeEnd);
            const proximityActualToPin = proximityStatsActualToPin(stroke, round, grid, pin);
            const strokesRemaining = grid.properties.strokesRemainingStart;
            const strokesGained = grid.properties.strokesRemainingStart - srnext - 1;
            const strokesGainedPredicted = grid.properties.weightedStrokesGained;
            const strokesGainedOverPredicted = strokesGained - strokesGainedPredicted;
            const strokesGainedPercentile = grid.features.reduce(
                (prior, el) => prior + (el.properties.strokesGained <= strokesGained),
                0
            ) / grid.features.length;
            const bearingAim = turf.bearing(coordToPoint(stroke.start), coordToPoint(stroke.aim));
            const bearingPin = turf.bearing(coordToPoint(stroke.start), coordToPoint(pin));
            const bearingActual = turf.bearing(coordToPoint(stroke.start), coordToPoint(strokeEnd));

            const stats: strokeStats = {
                index: index,
                holeIndex: holeIndex,
                club: stroke.club,
                terrain: terrain,
                distanceToAim: distanceToAim,
                distanceToPin: distanceToPin,
                distanceToActual: distanceToActual,
                proximityActualToAim: proximityActualToAim,
                proximityActualToPin: proximityActualToPin,
                strokesRemaining: strokesRemaining,
                strokesGained: strokesGained,
                strokesGainedPredicted: strokesGainedPredicted,
                strokesGainedOverPredicted: strokesGainedOverPredicted,
                strokesGainedPercentile: strokesGainedPercentile,
                bearingAim: bearingAim,
                bearingPin: bearingPin,
                bearingActual: bearingActual,
            }

            // Add strokes to respective caches
            setStrokeStats(cache, stats);

            // Calculate hole stats
            if (stroke.index == 0) {
                hstats.strokesRemaining = strokesRemaining;
                if (hstats.par === undefined) {
                    hstats.par = Math.round(strokesRemaining);
                }
            }

            // Update acc and return
            acc.srnext = strokesRemaining;
            acc.strokes.push(stats);
            return acc;
        }, { srnext: 0, strokes: [] });

        // Calculate the rest of the hole stats
        let hsummary = summarizeStrokes(holeAcc.strokes);
        hstats = { ...hstats, ...hsummary };

        // Add hole to cache
        setHoleStats(cache, hstats);
    }

    // Calculate round stats after holes are all done
    let rsummary = summarizeStrokes(cache.strokes);
    rstats = { ...rstats, ...rsummary }
    cache.holes.forEach((el) => {
        rstats.par += el.par;
        rstats.strokesRemaining += el.strokesRemaining;
    })
    setRoundStats(cache, rstats);
    return cache;
}

function breakdownStrokes(cache: roundStatsCache, unit?: string): any {
    // Create stats breakdown caches
    let putts = [];
    let chips = [];
    let approaches = [];
    let drives = [];

    // Configurations and helpers
    const distanceOptions = { to_unit: unit ? unit : "yds", include_unit: false }

    cache.strokes.forEach((stroke) => {
        const distanceToAimInUnits = parseFloat(formatDistance(stroke.distanceToAim, distanceOptions));
        const hole = getHoleStats(cache, stroke.holeIndex);

        if (stroke.club == "P" || stroke.terrain == "green") {
            putts.push(stroke);
        } else if (distanceToAimInUnits <= 100) {
            chips.push(stroke);
        } else if (stroke.index == 0 && hole.par > 3) {
            drives.push(stroke);
        } else {
            approaches.push(stroke);
        }
    });

    return { putts: putts, chips: chips, approaches: approaches, drives: drives }
}

export function calculateBreakdownStats(cache: roundStatsCache, unit?: string): breakdownStats {
    const breakdowns = breakdownStrokes(cache, unit);
    return {
        putts: summarizeStrokes(breakdowns.putts),
        chips: summarizeStrokes(breakdowns.chips),
        approaches: summarizeStrokes(breakdowns.approaches),
        drives: summarizeStrokes(breakdowns.drives),
    }
}

// Create some summarization functions
const sum = (list: number[]) => list.reduce((acc, el) => acc + el);
const average = (list: number[]) => sum(list) / list.length;

function summarizeStrokes(strokes: strokeStats[]): strokesSummary {
    if (strokes.length == 0) return
    let summary = defaultStrokesSummary();
    let strokeAcc = {
        strokesGained: [],
        strokesGainedPredicted: [],
        strokesGainedPercentile: [],
        proximityPercentile: []
    }
    const summFunc = {
        strokesGained: sum,
        strokesGainedPredicted: sum,
        strokesGainedPercentile: average,
        proximityPercentile: average
    }

    // Iterate through strokes and map relevant stats
    strokes.forEach((el: strokeStats) => {
        for (let key in strokeAcc) {
            if (key == "proximityPercentile") {
                strokeAcc[key].push(el.proximityActualToAim[key])
            } else {
                strokeAcc[key].push(el[key])
            }
        }
    });

    // Reduce into summary
    for (let key in strokeAcc) {
        summary[key] = summFunc[key](strokeAcc[key]);
    }
    summary.strokes = strokes.length;

    return summary;
}

function xyProximities(start: Coordinate, aim: Coordinate, end: Coordinate): [number, number] {
    // Convert degrees to radians
    function toRadians(degrees: number): number {
        return degrees * Math.PI / 180;
    }

    // Create points
    const startPoint = point([start.x, start.y]);
    const aimPoint = point([aim.x, aim.y]);
    const endPoint = point([end.x, end.y]);


    // Calculate the great-circle distance between the two points in meters
    const d = distance(startPoint, endPoint, { units: 'meters' });
    const dAim = distance(startPoint, aimPoint, { units: 'meters' });

    // Calculate the initial compass bearing from the start point to the end point in radians
    const theta_end = toRadians(bearing(startPoint, endPoint));
    const theta_aim = toRadians(bearing(startPoint, aimPoint));
    const theta = theta_end - theta_aim;

    // Calculate the cross-track and along-track distances
    const dXt = d * Math.sin(theta);
    const dAt = d * Math.cos(theta);

    // Return the cross-track and along-track distances in meters
    return [dXt, dAim - dAt];
}

function proximityStatsActualToAim(stroke: Stroke, round: Round, end?: Coordinate): proximityStats {
    if (!end) {
        end = getStrokeEndFromRound(round, stroke);
    }
    const proximity = getDistance(stroke.aim, end);
    const dispersion = stroke.dispersion > 0 ? stroke.dispersion : -stroke.dispersion * getDistance(stroke.aim, stroke.start);;
    const [pX, pA] = xyProximities(stroke.start, stroke.aim, end);
    const proximityPerc = 2 * cdf(-Math.abs(proximity), 0, dispersion);
    const pXPerc = cdf(pX, 0, dispersion);
    const pAPerc = cdf(pA, 0, dispersion);
    return {
        proximity,
        proximityCrossTrack: pX,
        proximityAlongTrack: pA,
        proximityPercentile: proximityPerc,
        proximityPercentileCrossTrack: pXPerc,
        proximityPercentileAlongTrack: pAPerc,
    }
}

function proximityStatsActualToPin(stroke: Stroke, round: Round, grid: turf.FeatureCollection, pin?: Coordinate): proximityStats {
    if (!pin) {
        pin = getHolePinFromRound(round, stroke.holeIndex);
    }
    const end = getStrokeEndFromRound(round, stroke);
    const proximity = getDistance(end, pin);
    const [pX, pA] = xyProximities(stroke.start, pin, end);
    const proximityPerc = grid.features.reduce((acc, el) => el.distanceToPin < proximity ? acc + 1 : acc, 0) / grid.features.length;
    return {
        proximity,
        proximityCrossTrack: pX,
        proximityAlongTrack: pA,
        proximityPercentile: proximityPerc,
        proximityPercentileCrossTrack: undefined,
        proximityPercentileAlongTrack: undefined,
    }
}

function defaultRoundStats(filter?: string): roundStats {
    return {
        strokes: 0,
        par: 0,
        strokesRemaining: 0,
        strokesGained: 0,
        strokesGainedPredicted: 0,
        strokesGainedPercentile: 0,
        proximityPercentile: 0,
        filter: filter ? filter : undefined
    };
}

function defaultHoleStats(hole: Hole): holeStats {
    return {
        index: hole.index,
        par: hole.par,
        strokes: hole.strokes.length,
        strokesRemaining: 0,
        strokesGained: 0,
        strokesGainedPredicted: 0,
        strokesGainedPercentile: 0,
        proximityPercentile: 0
    }
}

function defaultStrokesSummary(): strokesSummary {
    return {
        strokes: 0,
        strokesGained: 0,
        strokesGainedPredicted: 0,
        strokesGainedPercentile: 0,
        proximityPercentile: 0
    }
}


/**
 * Views
 */


export function createStatsView(stats: breakdownStats): HTMLElement {
    // Create the table and table head
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');

    // Add table headers
    const headerRow = document.createElement('tr');
    ['Type', 'Strokes', 'Strokes Gained', 'Strokes Gained Predicted', 'Strokes Gained Percentile', 'Proximity Percentile'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Extract data from stats and push to the table body
    for (const [key, value] of Object.entries(stats)) {
        if (!value) continue;
        const row = document.createElement('tr');

        const typeTd = document.createElement('td');
        typeTd.textContent = key;
        row.appendChild(typeTd);

        const strokesTd = document.createElement('td');
        strokesTd.textContent = value.strokes.toString();
        row.appendChild(strokesTd);

        const strokesGainedTd = document.createElement('td');
        strokesGainedTd.textContent = value.strokesGained.toFixed(3);
        row.appendChild(strokesGainedTd);

        const strokesGainedPredictedTd = document.createElement('td');
        strokesGainedPredictedTd.textContent = value.strokesGainedPredicted.toFixed(3);
        row.appendChild(strokesGainedPredictedTd);

        const strokesGainedPercentileTd = document.createElement('td');
        strokesGainedPercentileTd.textContent = value.strokesGainedPercentile.toFixed(3);
        row.appendChild(strokesGainedPercentileTd);

        const proximityPercentileTd = document.createElement('td');
        proximityPercentileTd.textContent = value.proximityPercentile.toFixed(3);
        row.appendChild(proximityPercentileTd);

        tbody.appendChild(row);
    }
    table.appendChild(tbody);

    return table;
}

let cache: roundStatsCache;
let breakdowns: breakdownStats;

function handleLoad() {
    new Promise(() => {
        const round = JSON.parse(localStorage.getItem("golfData"));
        const unit = localStorage.getItem("displayUnit") ? localStorage.getItem("displayUnit") : "yards";
        const output = document.getElementById("breakdownTables");
        const cache = calculateRoundStatsCache(round, unit);
        const breakdowns = calculateBreakdownStats(cache, unit);
        breakdowns.total = cache.round;
        const table = createStatsView(breakdowns);
        output.replaceChildren(table);
    });
}
window.onload = handleLoad;

