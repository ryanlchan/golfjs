// stats.ts
import { point, distance, bearing, FeatureCollection } from '@turf/turf';
import * as chroma from "chroma-js";

import { cdf, sgGrid } from './grids';
import { coordToPoint, getDistance, formatDistance, formatDistanceAsNumber } from './projections';
import { roundID, roundLoad } from './rounds';
import { touch } from './utils';
import * as cacheUtils from "./cache";
import { getUnitsSetting } from "./utils";

interface RoundStatsCache extends HasUpdateDates {
    round: RoundStats,
    holes: HoleStats[],
    strokes: StrokeStats[]
    breakdowns?: BreakdownStats
}

interface RoundStats extends StrokesSummary, HasUpdateDates {
    par: number,
    filter?: string,
    strokesRemaining: number
}

interface HoleStats extends StrokesSummary, HasUpdateDates {
    index: number,
    par: number,
    strokesRemaining: number
}

interface StrokeStats extends HasUpdateDates {
    index: number,
    holeIndex: number,
    club: string,
    terrain: string,
    distanceToAim: number,
    distanceToPin: number,
    distanceToActual: number,
    proximityActualToAim: ProximityStats,
    proximityActualToPin: ProximityStats,
    strokesRemaining: number,
    strokesGained: number,
    strokesGainedPredicted: number,
    strokesGainedOverPredicted: number,
    strokesGainedPercentile: number,
    bearingAim: number,
    bearingPin: number,
    bearingActual: number
}

interface StrokesSummary extends HasUpdateDates {
    strokes: number,
    strokesGained: number,
    strokesGainedPredicted: number,
    strokesGainedPercentile: number,
    proximity?: number,
    proximityCrossTrack?: number,
    proximityPercentile: number
}

interface ProximityStats {
    proximity: number,
    proximityCrossTrack: number,
    proximityAlongTrack: number,
    proximityPercentile: number,
    proximityPercentileCrossTrack: number,
    proximityPercentileAlongTrack: number,
}

interface BreakdownStats {
    putts: StrokesSummary,
    chips: StrokesSummary,
    approaches: StrokesSummary,
    drives: StrokesSummary,
    total?: StrokesSummary
}

/**
 * Cache operations
 */
function getHoleStats(cache: RoundStatsCache, holeIndex: number): HoleStats {
    return cache.holes.filter((el) => el.index == holeIndex)[0];
}

function setHoleStats(cache: RoundStatsCache, stats: HoleStats): void {
    cache.holes.push(stats);
}

function getStrokeStats(cache: RoundStatsCache, holeIndex: number, strokeIndex: number): StrokeStats {
    return cache.strokes.filter((el) => el.index == strokeIndex && el.holeIndex == holeIndex)[0];
}

function setStrokeStats(cache: RoundStatsCache, stats: StrokeStats): void {
    cache.strokes.push(stats);
}

function setRoundStats(cache: RoundStatsCache, stats: RoundStats): void {
    cache.round = stats;
}

function statsCacheKey(round: Round) {
    return `stats-${roundID(round)}`;
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
 * @param cache? the prior round cache, optinoally, for an update
 * @returns {RoundStatsCache}
 */
export function calculateRoundStatsCache(round: Round, cache?: RoundStatsCache): RoundStatsCache {
    let rstats: RoundStats = defaultRoundStats();
    if (!cache) {
        cache = {
            round: null,
            holes: [],
            strokes: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    // Create config entries
    const roundCourseParams = { 'name': round.course, 'id': round.courseId }

    // Iterate over round holes forward, 1-18
    for (let hole of round.holes) {
        const pin = hole.pin;
        let hstats: HoleStats = defaultHoleStats(hole);

        // Within each hole, calculate strokes gained from last stroke backwards
        let holeAcc = hole.strokes.reduceRight((acc: any, stroke: Stroke) => {
            let stats: StrokeStats = getStrokeStats(cache, stroke.holeIndex, stroke.index);
            if (!stats || (stats.updatedAt < stroke.updatedAt)) {
                const srnext = acc.srnext;
                const strokeEnd = acc.strokeEnd;
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
                const proximityActualToAim = ProximityStatsActualToAim(stroke, round, strokeEnd);
                const proximityActualToPin = ProximityStatsActualToPin(stroke, round, grid, pin);
                const strokesRemaining = grid.properties.strokesRemainingStart;
                const strokesGained = grid.properties.strokesRemainingStart - srnext - 1;
                const strokesGainedPredicted = grid.properties.weightedStrokesGained;
                const strokesGainedOverPredicted = strokesGained - strokesGainedPredicted;
                const strokesGainedPercentile = grid.features.reduce(
                    (prior, el) => prior + (el.properties.strokesGained <= strokesGained ? el.properties.probability : 0),
                    0
                );
                const bearingAim = bearing(coordToPoint(stroke.start), coordToPoint(stroke.aim));
                const bearingPin = bearing(coordToPoint(stroke.start), coordToPoint(pin));
                const bearingActual = bearing(coordToPoint(stroke.start), coordToPoint(strokeEnd));

                stats = {
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
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }

                // Add strokes to respective caches
                setStrokeStats(cache, stats);
            }

            // Calculate hole stats
            if (stroke.index == 0) {
                hstats.strokesRemaining = stats.strokesRemaining;
            }
            if ((stroke.index == 0) && (hstats.par === undefined)) {
                hstats.par = Math.round(stats.strokesRemaining);
            }

            // Update acc and return
            acc.srnext = stats.strokesRemaining;
            acc.strokeEnd = stroke.start;
            acc.strokes.push(stats);
            return acc;
        }, { srnext: 0, strokes: [], strokeEnd: pin });

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

    // Update last touch
    touch(cache);

    return cache;
}

function breakdownStrokes(cache: RoundStatsCache): object {
    // Create stats breakdown caches
    let putts = [];
    let chips = [];
    let approaches = [];
    let drives = [];

    // Configurations and helpers
    const distanceOptions = { to_unit: getUnitsSetting(), include_unit: false }

    cache.strokes.forEach((stroke) => {
        const distanceToAimInUnits = formatDistanceAsNumber(stroke.distanceToAim, distanceOptions);
        const hole = getHoleStats(cache, stroke.holeIndex);

        if (stroke.club == "P" || stroke.terrain == "green") {
            putts.push(stroke);
        } else if (distanceToAimInUnits <= 100) {
            chips.push(stroke);
        } else if (stroke.index == 0 && (hole.par && hole.par > 3)) {
            drives.push(stroke);
        } else {
            approaches.push(stroke);
        }
    });

    return { putts: putts, chips: chips, approaches: approaches, drives: drives, total: cache.strokes }
}

/**
 * Summarizes a group of stroke breakdowns
 * @param {object<string, StrokeStats[]>} groups an object with string keys and an array of StrokeStats,
 *  Should mimic outpt of breakdownStrokes()
 * @returns {BreakdownStats} stats summarized by keys
 */
export function summarizeStrokeGroups(groups: object): BreakdownStats {
    let out = {}
    for (let [key, value] of Object.entries(groups)) {
        out[key] = summarizeStrokes(value);
    }
    return out as BreakdownStats;
}

// Create some summarization functions
const sum = (list: number[]) => list.reduce((acc, el) => acc + el);
const average = (list: number[]) => sum(list) / list.length;

/**
 * Create summaries for an array of StrokeStats
 * @param strokes an array of StrokeStats to summarize
 * @returns {StrokesSummary} a summary cache of stats
 */
function summarizeStrokes(strokes: StrokeStats[]): StrokesSummary {
    if (strokes.length == 0) return
    let summary = defaultStrokesSummary();
    let strokeAcc = {
        strokesGained: [],
        strokesGainedPredicted: [],
        strokesGainedPercentile: [],
        proximity: [],
        proximityCrossTrack: [],
        proximityPercentile: [],
    }
    const summFunc = {
        strokesGained: sum,
        strokesGainedPredicted: sum,
        strokesGainedPercentile: average,
        proximity: average,
        proximityCrossTrack: average,
        proximityPercentile: average
    }

    // Iterate through strokes and map relevant stats
    strokes.forEach((el: StrokeStats) => {
        for (let key in strokeAcc) {
            if (key.startsWith("proximity")) {
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

function ProximityStatsActualToAim(stroke: Stroke, round: Round, end?: Coordinate): ProximityStats {
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

function ProximityStatsActualToPin(stroke: Stroke, round: Round, grid: FeatureCollection, pin?: Coordinate): ProximityStats {
    if (!pin) {
        pin = getHolePinFromRound(round, stroke.holeIndex);
    }
    const end = getStrokeEndFromRound(round, stroke);
    const proximity = getDistance(end, pin);
    const [pX, pA] = xyProximities(stroke.start, pin, end);
    const proximityPerc = grid.features.reduce(
        (acc, el) => acc + (el.properties.distanceToHole > proximity ? el.properties.probability : 0),
        0);
    return {
        proximity,
        proximityCrossTrack: pX,
        proximityAlongTrack: pA,
        proximityPercentile: proximityPerc,
        proximityPercentileCrossTrack: undefined,
        proximityPercentileAlongTrack: undefined,
    }
}

function defaultRoundStats(filter?: string): RoundStats {
    return {
        strokes: 0,
        par: 0,
        strokesRemaining: 0,
        strokesGained: 0,
        strokesGainedPredicted: 0,
        strokesGainedPercentile: 0,
        proximityPercentile: 0,
        filter: filter ? filter : undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

function defaultHoleStats(hole: Hole): HoleStats {
    return {
        index: hole.index,
        par: hole.par,
        strokes: hole.strokes.length,
        strokesRemaining: 0,
        strokesGained: 0,
        strokesGainedPredicted: 0,
        strokesGainedPercentile: 0,
        proximityPercentile: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    }
}

function defaultStrokesSummary(): StrokesSummary {
    return {
        strokes: 0,
        strokesGained: 0,
        strokesGainedPredicted: 0,
        strokesGainedPercentile: 0,
        proximityPercentile: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    }
}


/**
 * Views
 */


export function createStatsView(cache: RoundStatsCache): HTMLElement {
    const percScale = chroma.scale(['red', 'black', 'green']).domain([0.2, 0.5, 0.8]);

    // Calculate breakdowns
    const breakdowns = breakdownStrokes(cache);
    const stats = summarizeStrokeGroups(breakdowns);

    // Create the table and table head
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');

    // Add table headers
    const headerRow = document.createElement('tr');
    const transforms = {
        'Type': (type: string, stats: StrokesSummary) => type,
        'Strokes': (type: string, stats: StrokesSummary) => stats.strokes.toString(),
        'SG (total)': (type: string, stats: StrokesSummary) => stats.strokesGained,
        'SG (avg)': (type: string, stats: StrokesSummary) => stats.strokesGained / stats.strokes,
        'SG Predicted (total)': (type: string, stats: StrokesSummary) => stats.strokesGainedPredicted,
        'SG Predicted (avg)': (type: string, stats: StrokesSummary) => stats.strokesGainedPredicted / stats.strokes,
        'SG Percentile': (type: string, stats: StrokesSummary) => stats.strokesGainedPercentile,
        'Proximity': (type: string, stats: StrokesSummary) => stats.proximity,
        'Proximity Offline': (type: string, stats: StrokesSummary) => stats.proximityCrossTrack,
        'Proximity Percentile': (type: string, stats: StrokesSummary) => stats.proximityPercentile,
    }
    const headers = Object.keys(transforms);
    headers.forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Extract data from stats
    let data = [];
    for (const [key, value] of Object.entries(stats)) {
        if (!value) continue
        let row = [];
        for (let col in transforms) {
            row.push(transforms[col](key, value));
        }
        data.push(row);
    }

    // Create min/max scales
    let domains = [];
    let scales = [];
    for (let row of data) {
        if (row[0] == "total") continue
        for (let [ix, col] of row.entries()) {
            if (typeof col !== 'number') continue
            if (domains[ix] == undefined) {
                domains[ix] = [col, col];
            } else if (col < domains[ix][0]) {
                domains[ix][0] = col;
            } else if (col > domains[ix][1]) {
                domains[ix][1] = col;
            }
        }
    };
    for (let [ix, el] of domains.entries()) {
        if (typeof el === 'undefined') continue
        scales[ix] = chroma.scale(['red', 'black', 'green']).domain(el);
    };

    //push to the table body
    for (let values of data) {
        const row = document.createElement('tr');
        for (let [ix, value] of values.entries()) {
            const td = document.createElement('td');
            td.textContent = typeof value === 'number' ? value.toFixed(3) : value;

            if (["Type", "Strokes"].some((el) => el == headers[ix])) {
                // Color scaling exclusions
            } else if (headers[ix].includes('Percentile')) {
                td.style.color = percScale(value);
            } else if (scales[ix]) {
                td.style.color = scales[ix](value);
            }

            row.appendChild(td);
        };

        // If a user clicks a row, show only those strokes in the breakdowns
        row.onclick = () => {
            const strokeTable = document.getElementById("strokeStatsTable");
            const strokeList = createStrokeStatsTable(breakdowns[values[0]]);
            strokeTable.replaceWith(strokeList);
        }
        tbody.appendChild(row);
    };
    table.appendChild(tbody);
    table.id = "statsViewTable";

    return table;
}

function createStrokeStatsTable(strokes: StrokeStats[]): HTMLElement {
    const percScale = chroma.scale(['red', 'black', 'green']).domain([0.2, 0.5, 0.8]);
    const sgScale = chroma.scale(['red', 'black', 'green']).domain([-0.5, 0, 0.3]);
    const distanceOptions = { to_unit: getUnitsSetting(), include_unit: false }

    // Create the table, table head, and table body
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    table.appendChild(thead);
    table.appendChild(tbody);

    // Define table headers
    const headers = [
        'Hole', 'Stroke', 'Club', 'Terrain', `To Aim`,
        `To Actual`, 'SG',
        'SG Predicted', 'SG Percentile',
        'Proximity',
        'Proximity Offline',
        'Proximity Percentile'
    ];

    // Add table headers to the thead
    const headerRow = document.createElement('tr');
    headers.forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    // Iterate over strokes to populate tbody
    strokes = [...strokes].sort((a, b) => a.holeIndex * 100 + a.index - b.holeIndex * 100 - b.index);

    // Extract desired data from the current StrokeStats object
    const clubCount = {};
    const terrainCount = {};
    let totalDistanceToAim = 0;
    let totalDistanceToActual = 0;
    let totalStrokesGained = 0;
    let totalStrokesGainedPredicted = 0;
    let totalStrokesGainedPercentile = 0;
    let totalProximity = 0;
    let totalProximityCrossTrack = 0;
    let totalProximityPercentile = 0;

    const data = strokes.map((stats) => {
        let formattedTerrain = stats.terrain.replaceAll("_", " ");

        if (clubCount[stats.club]) {
            clubCount[stats.club]++;
        } else {
            clubCount[stats.club] = 1
        }

        if (terrainCount[formattedTerrain]) {
            terrainCount[formattedTerrain]++;
        } else {
            terrainCount[formattedTerrain] = 1
        }

        totalDistanceToAim += stats.distanceToAim;
        totalDistanceToActual += stats.distanceToActual;
        totalStrokesGained += stats.strokesGained;
        totalStrokesGainedPredicted += stats.strokesGainedPredicted;
        totalStrokesGainedPercentile += stats.strokesGainedPercentile;
        totalProximityPercentile += stats.proximityActualToAim.proximityPercentile;
        totalProximity += stats.proximityActualToAim.proximity;
        totalProximityCrossTrack += stats.proximityActualToAim.proximityCrossTrack;

        return [
            (stats.holeIndex + 1).toString(),
            (stats.index + 1).toString(),
            stats.club,
            formattedTerrain,
            formatDistance(stats.distanceToAim, distanceOptions),
            formatDistance(stats.distanceToActual, distanceOptions),
            stats.strokesGained,
            stats.strokesGainedPredicted,
            stats.strokesGainedPercentile,
            formatDistance(stats.proximityActualToAim.proximity, distanceOptions),
            formatDistance(stats.proximityActualToAim.proximityCrossTrack, distanceOptions),
            stats.proximityActualToAim.proximityPercentile
        ];
    })

    // Populate the current row with data
    const rows = data.map((values) => {
        const row = document.createElement('tr');
        const tds = values.map((value, ix) => {
            const td = document.createElement('td');
            td.textContent = typeof value === 'number' ? value.toFixed(3) : value;
            if (headers[ix].includes('Percentile')) {
                td.style.color = percScale(value);
            } else if (headers[ix].includes('SG')) {
                td.style.color = sgScale(value);
            }
            return td;
        })
        row.replaceChildren(...tds);
        return row;
    });

    // Append the current row to the tbody
    tbody.replaceChildren(...rows);

    // Add Totals row
    totalDistanceToAim = totalDistanceToAim / data.length;
    totalDistanceToActual = totalDistanceToActual / data.length;
    totalStrokesGained = totalStrokesGained / data.length;
    totalStrokesGainedPredicted = totalStrokesGainedPredicted / data.length;
    totalStrokesGainedPercentile = totalStrokesGainedPercentile / data.length;
    totalProximityPercentile = totalProximityPercentile / data.length;
    totalProximity = totalProximity / data.length;
    totalProximityCrossTrack = totalProximityCrossTrack / data.length;

    const totals = ["Total", "", clubCount, terrainCount,
        formatDistance(totalDistanceToAim, distanceOptions),
        formatDistance(totalDistanceToActual, distanceOptions),
        totalStrokesGained, totalStrokesGainedPredicted,
        totalStrokesGainedPercentile, totalProximity,
        totalProximityCrossTrack, totalProximityPercentile
    ]
    const row = document.createElement('tr');
    const tds = totals.map((value, ix) => {
        const td = document.createElement('td');
        if (typeof value === 'number') {
            td.textContent = value.toFixed(3);
        } else if (typeof value === 'string') {
            td.textContent = value;
        } else if (typeof value === 'object') {
            td.innerHTML = explodeCounts(value);
        } else {
            td.textContent = JSON.stringify(value);
        }
        if (headers[ix].includes('Percentile')) {
            td.style.color = percScale(value);
        } else if (headers[ix].includes('Strokes Gained')) {
            td.style.color = sgScale(value);
        }
        return td;
    })
    row.replaceChildren(...tds);
    tbody.appendChild(row);
    table.id = "strokeStatsTable";

    return table;
}

function explodeCounts(obj: object): string {
    let out = "";
    let counts = Object.entries(obj);
    counts.sort((a, b) => a[1] - b[1]);
    for (let [key, count] of counts) {
        out = out.concat(`${count} ${key},<br/>`)
    }
    return out
}

function generateView() {
    const output = document.getElementById("breakdownTables");
    const round = roundLoad();

    // Output round metadata
    const header = document.getElementById("roundTitle");
    header.innerText = `${round.course} - ${round.date}`;

    // Create loading bar
    const prog = document.createElement('progress');
    output.replaceChildren(prog);

    // Generate or load cache
    const key = statsCacheKey(round);
    let cache = cacheUtils.getJSON(key) as RoundStatsCache;
    if (!cache || (round.updatedAt && cache.updatedAt && cache.updatedAt < round.updatedAt)) {
        cache = calculateRoundStatsCache(round);
        cacheUtils.setJSON(key, cache);
    }

    // Generate breakdowns data
    const table = createStatsView(cache);
    const strokeList = createStrokeStatsTable(cache.strokes);
    output.replaceChildren(table, strokeList);
}

function regenerateView() {
    const round = roundLoad();
    const key = statsCacheKey(round);
    cacheUtils.remove(key);
    new Promise(() => generateView());
}

function handleLoad() {
    new Promise(() => generateView());
}
window.onload = handleLoad;
document.getElementById("regenerate").addEventListener('click', regenerateView);
