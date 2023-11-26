// stats.ts
import { point, distance, bearing, FeatureCollection } from '@turf/turf';
import * as chroma from "chroma-js";

import { cdf, sgGrid } from './grids';
import { coordToPoint, getDistance, formatDistance, formatDistanceAsNumber, formatDistanceOptions } from './projections';
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
    bearingActual: number,
    category: string,
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

interface GroupedStrokesSummary {
    [index: string]: StrokesSummary
}

interface GroupedStrokeStats {
    [index: string]: StrokeStats[];
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

class BaseFormatter {
    column: any[];
    domain: [number, number];
    options: object;

    constructor(column: any[], options: object = {}) {
        this.column = column;
        this.options = options;
    }

    // Format each row of the StatsColumn as text
    format = (value) => {
        if (typeof value === 'number') {
            return value.toFixed(3);
        } else if (typeof value === 'string') {
            return value;
        } else if (typeof value === 'object') {
            return explodeCounts(value);
        } else {
            return JSON.stringify(value);
        }
    };

    // Color each row of the StatsColumn, if necessary
    color = (row) => "";

    // Output row as formatted HTML TD object
    rowToTD = (row): HTMLTableCellElement => {
        let td = document.createElement('td');
        td.innerHTML = this.format(row);
        td.style.color = this.color(row);
        return td;
    }

    // Output column as formatted HTML TD objects
    toTDs = (): HTMLTableCellElement[] => this.column.map(this.rowToTD);
}

class StringFormatter extends BaseFormatter {
    format = (row) => row.toString();
}

class ColorScaleFormatter extends BaseFormatter {
    colorScale: any;

    constructor(column: number[]) {
        super(column);
        this.domain = this.calcDomain();
        this.colorScale = chroma.scale(['red', 'black', 'green']).domain(this.domain);
    }

    // Get the min/max values for this StatsColumn
    calcDomain = (): [number, number] => [Math.min(...this.column), Math.max(...this.column)];

    color = (row) => this.colorScale(row);
    format = (value) => typeof value === 'number' ? value.toFixed(3) : value;
}

class InvertedColorScaleFormatter extends ColorScaleFormatter {
    constructor(column: number[]) {
        super(column);
        this.colorScale = chroma.scale(['green', 'black', 'red']).domain(this.domain);
    }
}

class PercentileScaleFormatter extends ColorScaleFormatter {
    calcDomain = (): [number, number] => [0.2, 0.8];
}

class DistanceFormatter extends BaseFormatter {
    distOpts: formatDistanceOptions;

    constructor(column: number[]) {
        super(column);
        this.distOpts = { to_unit: getUnitsSetting(), include_unit: true }
    }
    format = (row) => formatDistance(row, this.distOpts);
}

class InvertedDistanceFormatter extends InvertedColorScaleFormatter {
    distOpts: formatDistanceOptions;

    constructor(column: number[]) {
        super(column);
        this.distOpts = { to_unit: getUnitsSetting(), include_unit: true }
    }
    format = (row) => formatDistance(row, this.distOpts);
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
    const courseParams = { 'name': round.course, 'id': round.courseId }

    // Iterate over round holes forward, 1-18
    for (let hole of round.holes) {
        calcHoleStats(hole, courseParams, cache);
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

function calcHoleStats(hole: Hole, courseParams: Course, cache: RoundStatsCache) {
    let hstats: HoleStats = defaultHoleStats(hole);

    // Within each hole, calculate strokes gained from last stroke backwards
    let nextStroke;
    let priorStats = [];
    for (let strokeIndex = hole.strokes.length - 1; strokeIndex >= 0; strokeIndex--) {
        let stroke = hole.strokes[strokeIndex];
        let stats = calcStrokeStats(stroke, hole, courseParams, nextStroke, priorStats.at(-1), cache);

        // Calculate hole stats
        if (stroke.index == 0) {
            hstats.strokesRemaining = stats.strokesRemaining;
        }
        if ((stroke.index == 0) && (hstats.par === undefined)) {
            hstats.par = Math.round(stats.strokesRemaining);
        }

        // Update iterators/references
        nextStroke = stroke;
        priorStats.push(stats);
    }

    // Calculate the rest of the hole stats
    let hsummary = summarizeStrokes(priorStats);
    hstats = { ...hstats, ...hsummary };

    // Add hole to cache
    setHoleStats(cache, hstats);
    return hstats;
}

function calcStrokeStats(stroke: Stroke, hole: Hole, courseParams: Course,
    nextStroke: Stroke, nextStats: StrokeStats, cache: RoundStatsCache): StrokeStats {
    const pin = hole.pin;
    let srnext = 0;
    if (nextStats) srnext = nextStats.strokesRemaining;
    let strokeEnd = pin;
    if (nextStroke) strokeEnd = nextStroke.start;

    const grid = sgGrid(
        [stroke.start.y, stroke.start.x],
        [stroke.aim.y, stroke.aim.x],
        [pin.y, pin.x],
        stroke.dispersion,
        courseParams,
        stroke.terrain
    );
    const index = stroke.index;
    const holeIndex = stroke.holeIndex;
    const terrain = grid.properties.terrain;
    const distanceToAim = getDistance(stroke.start, stroke.aim);
    const distanceToPin = getDistance(stroke.start, pin);
    const distanceToActual = getDistance(stroke.start, strokeEnd);
    const proximityActualToAim = ProximityStatsActualToAim(stroke, strokeEnd);
    const proximityActualToPin = ProximityStatsActualToPin(stroke, strokeEnd, pin, grid);
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
    let category;
    if (stroke.club == "P" || terrain == "green") {
        category = "putts";
    } else if (distanceToAim <= 90) {
        category = "chips";
    } else if (index == 0 && strokesRemaining > 3.4) {
        category = "drives";
    } else {
        category = "approaches";
    }

    const stats = {
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
        updatedAt: new Date().toISOString(),
        category: category
    }
    setStrokeStats(cache, stats);
    return stats
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

function ProximityStatsActualToAim(stroke: Stroke, end: Coordinate): ProximityStats {
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

function ProximityStatsActualToPin(stroke: Stroke, actual: Coordinate, pin: Coordinate, grid: FeatureCollection): ProximityStats {
    const proximity = getDistance(actual, pin);
    const [pX, pA] = xyProximities(stroke.start, pin, actual);
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

/*
 * Summarizations
 */
function groupBy(list: StrokeStats[], propOrFunction: string | Function): GroupedStrokeStats {
    let output = {};
    let sortKeyFunc = (propOrFunction instanceof Function) ? propOrFunction : (el) => el[propOrFunction];
    list.forEach((el) => {
        let key = sortKeyFunc(el) || "";
        if (!output[key]) output[key] = [];
        output[key].push(el);
    });
    return output;
}

function breakdownStrokes(cache: RoundStatsCache): GroupedStrokeStats {
    const grouped = groupBy(cache.strokes, "category");
    return { putts: grouped.putts, chips: grouped.chips, approaches: grouped.approaches, drives: grouped.drives };
}

/**
 * Summarizes a group of stroke breakdowns
 * @param {GroupedStrokeStats} groups an object with string keys and an array of StrokeStats,
 *  Should mimic outpt of breakdownStrokes()
 * @returns {GroupedStrokesSummary} stats summarized by keys
 */
function summarizeStrokeGroups(groups: object): GroupedStrokesSummary {
    let out = {}
    for (let [key, value] of Object.entries(groups)) {
        out[key] = summarizeStrokes(value);
    }
    return out as GroupedStrokesSummary;
}

// Create some summarization functions
const sum = (list: number[]) => list.reduce((acc, el) => acc + el);
const average = (list: number[]) => sum(list) / list.length;
const count = (list: any[]) => list.length.toString();
const countUnique = (list: any[]) => {
    let counts = {};
    list.forEach(el => counts[el] = 1 + (counts[el] || 0));
    return counts;
}

const summaryMetrics = {
    'category': {
        header: 'Type',
        mapFunc: (stats: StrokeStats): any => stats.category,
        reduceFunc: countUnique,
        formatter: BaseFormatter
    }, 'strokes': {
        header: 'Strokes',
        mapFunc: (stats: StrokeStats) => 1,
        reduceFunc: count,
        formatter: InvertedColorScaleFormatter
    }, 'strokesGained': {
        header: 'SG',
        mapFunc: (stats: StrokeStats) => stats.strokesGained,
        reduceFunc: sum,
        formatter: ColorScaleFormatter
    }, 'strokesGainedAvg': {
        header: 'SG (avg)',
        mapFunc: (stats: StrokeStats) => stats.strokesGained,
        reduceFunc: average,
        formatter: ColorScaleFormatter
    }, 'strokesGainedPredicted': {
        header: 'SG Predicted',
        mapFunc: (stats: StrokeStats) => stats.strokesGainedPredicted,
        reduceFunc: sum,
        formatter: ColorScaleFormatter
    }, 'strokesGainedPredictedAvg': {
        header: 'SG Predicted (avg)',
        mapFunc: (stats: StrokeStats) => stats.strokesGainedPredicted,
        reduceFunc: average,
        formatter: ColorScaleFormatter
    }, 'strokesGainedPercentile': {
        header: 'SG Percentile',
        mapFunc: (stats: StrokeStats) => stats.strokesGainedPercentile,
        reduceFunc: average,
        formatter: PercentileScaleFormatter
    }, 'proximity': {
        header: 'Proximity',
        mapFunc: (stats: StrokeStats) => stats.proximityActualToAim.proximity,
        reduceFunc: average,
        formatter: InvertedDistanceFormatter
    }, 'proximityCrossTrack': {
        header: 'Proximity Offline',
        mapFunc: (stats: StrokeStats) => stats.proximityActualToAim.proximityCrossTrack,
        reduceFunc: average,
        formatter: ColorScaleFormatter
    }, 'proximityPercentile': {
        header: 'Proximity Percentile',
        mapFunc: (stats: StrokeStats) => stats.proximityActualToAim.proximityPercentile,
        reduceFunc: average,
        formatter: PercentileScaleFormatter
    }, 'distanceToAim': {
        header: 'To Aim',
        mapFunc: (stats: StrokeStats) => stats.distanceToAim,
        reduceFunc: average,
        formatter: DistanceFormatter
    }, 'distanceToActual': {
        header: 'To Actual',
        mapFunc: (stats: StrokeStats) => stats.distanceToActual,
        reduceFunc: average,
        formatter: DistanceFormatter
    }, 'terrain': {
        header: 'terrain',
        mapFunc: (stats: StrokeStats) => stats.terrain,
        reduceFunc: countUnique,
        formatter: BaseFormatter
    }, 'club': {
        header: 'Club',
        mapFunc: (stats: StrokeStats) => stats.club,
        reduceFunc: countUnique,
        formatter: BaseFormatter
    }, 'hole': {
        header: 'Hole',
        mapFunc: (stats: StrokeStats) => (stats.holeIndex + 1).toString(),
        reduceFunc: countUnique,
        formatter: BaseFormatter
    }, 'index': {
        header: 'Stroke',
        mapFunc: (stats: StrokeStats) => (stats.index + 1).toString(),
        reduceFunc: countUnique,
        formatter: BaseFormatter
    },
}

/**
 * Create summaries for an array of StrokeStats
 * @param strokes an array of StrokeStats to summarize
 * @returns {StrokesSummary} a summary cache of stats
 */
function summarizeStrokes(strokes: StrokeStats[]): StrokesSummary {
    if (strokes.length == 0) return
    let summary = defaultStrokesSummary();
    for (let [name, opts] of Object.entries(summaryMetrics)) {
        let mapped = strokes.map(opts.mapFunc);
        let reduced = opts.reduceFunc(mapped);
        summary[name] = reduced;
    }
    return summary;
}

function columnizeStrokes(strokes: StrokeStats[], metrics: string[]): any[][] {
    return metrics.map((colID) => strokes.map(summaryMetrics[colID].mapFunc));
}

function reduceStrokeColumns(dataFrame: any[][], metrics: string[]) {
    let output = [];
    for (let colIx = 0; colIx < dataFrame.length; colIx++) {
        let colID = metrics[colIx];
        output.push(summaryMetrics[colID].reduceFunc(dataFrame));
    }
    return output;
}


/**
 * Views
 */
const defaultStrokeStatsMetrics = ['hole', 'index', 'club', 'terrain', 'distanceToAim', 'distanceToActual', 'strokesGained', 'strokesGainedPredicted', 'strokesGainedPercentile', 'proximity', 'proximityCrossTrack', 'proximityPercentile'];
const defaultSummaryStatsMetrics = ['strokes', 'strokesGained', 'strokesGainedAvg', 'strokesGainedPredicted', 'strokesGainedPredictedAvg', 'strokesGainedPercentile', 'proximity', 'proximityCrossTrack', 'proximityPercentile'];

function createColumnTable(headers: string[], columns: HTMLTableCellElement[][]): HTMLTableElement {
    // Create the table and table head
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');

    // Add table headers
    const headerRow = document.createElement('tr');
    for (let header of headers) {
        const th = document.createElement('th');
        th.textContent = header;
        headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Pivot columns into rows and add to tbody
    for (let rowIx = 0; rowIx < columns[0].length; rowIx++) {
        const row = document.createElement('tr');
        for (let dataCol of columns) {
            row.append(dataCol[rowIx]);
        }
        tbody.appendChild(row);
    }
    table.appendChild(tbody);
    return table;
}

function createStatsTable(input: StrokeStats[], metrics = defaultStrokeStatsMetrics, includeTotals = true): HTMLTableElement {
    const headers = metrics.map((col) => summaryMetrics[col]['header']);
    let dataFrame = [];
    for (let colID of metrics) {
        const column = input.map(summaryMetrics[colID]['mapFunc']);
        const formatter = new summaryMetrics[colID]['formatter'](column);
        let tds = formatter.toTDs();
        if (includeTotals) {
            let total = summaryMetrics[colID]['reduceFunc'](column);
            let td = formatter.rowToTD(total);
            tds.push(td);
        }
        dataFrame.push(tds);
    }
    let table = createColumnTable(headers, dataFrame);
    table.classList.add("statsTable");
    return table;
}

function createStrokeStatsTable(strokes: StrokeStats[]): HTMLTableElement {
    const sortedStrokes = [...strokes].sort((a, b) => a.holeIndex * 100 + a.index - b.holeIndex * 100 - b.index);
    const table = createStatsTable(sortedStrokes, defaultStrokeStatsMetrics, true);
    table.id = "strokeStatsTable";
    return table;
}

function createStatsTotalRow(input: StrokeStats[], metrics = defaultSummaryStatsMetrics): HTMLTableRowElement {
    const summary = summarizeStrokes(input);
    const column = ["Total", ...metrics.map((colID) => summary[colID])];
    const formatter = new BaseFormatter(column);
    const row = document.createElement('tr');
    const tds = formatter.toTDs();
    row.append(...tds);
    return row;
}

export function createGroupedPivotTable(groups: GroupedStrokeStats,
    metrics = defaultSummaryStatsMetrics) {
    // Group and summarize input
    let groupSummaries = summarizeStrokeGroups(groups);

    let headers = ["Group", ...metrics.map((col) => summaryMetrics[col]['header'])];

    // Create TD's per column
    const groupKeys = Object.keys(groups);
    const groupFormatter = new BaseFormatter(groupKeys);
    let dataFrame = [groupFormatter.toTDs()];
    for (let colID of metrics) {
        let column = Object.values(groupSummaries).map((summary) => summary[colID]);
        let formatter = new summaryMetrics[colID]['formatter'](column);
        let tds = formatter.toTDs();
        dataFrame.push(tds);
    }
    let table = createColumnTable(headers, dataFrame);
    table.classList.add("statsPivotTable");

    return table;
}

function createBreakdownTable(cache: RoundStatsCache): HTMLElement {
    const breakdowns = breakdownStrokes(cache);
    const strokes = cache.strokes;
    const table = createGroupedPivotTable(breakdowns);
    const totalRow = createStatsTotalRow(strokes);
    table.querySelector('tbody').append(totalRow);

    // If a user clicks a row, show only those strokes in the breakdowns
    let trs = table.querySelectorAll('tbody tr');
    for (let rowIx = 0; rowIx < trs.length; rowIx++) {
        let row = trs[rowIx] as HTMLTableRowElement;
        const strokeList = createStrokeStatsTable(Object.values(breakdowns)[rowIx] || strokes);
        row.onclick = () => document.getElementById("strokeStatsTable").replaceWith(strokeList);
    }
    table.id = "statsViewTable";
    return table;
}

function explodeCounts(obj: object): string {
    let out = "";
    let counts = Object.entries(obj);
    counts.sort((a, b) => a[1] - b[1]);
    for (let [key, count] of counts) {
        out = out.concat(`${key}: ${count},<br/>`)
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
    const table = createBreakdownTable(cache);
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
