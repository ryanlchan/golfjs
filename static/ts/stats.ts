// stats.ts
import { point, distance, bearing, FeatureCollection } from '@turf/turf';
import * as chroma from "chroma-js";

import { cdf, sgGrid } from './grids';
import { coordToPoint, getDistance, formatDistance, formatDistanceOptions } from './projections';
import { roundID, roundLoad } from './rounds';
import { touch, getUnitsSetting } from './utils';
import * as cacheUtils from "./cache";

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
        filter: filter,
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
    domain: number[];
    options: object;

    constructor(column: any[], options: object = {}) {
        this.column = column;
        this.options = options;
        this.rowToTD = this.rowToTD.bind(this);
    }

    // Format each row of the StatsColumn as text
    format(value) {
        if (Number.isInteger(value)) {
            return value.toFixed(0);
        } else if (typeof value === 'number') {
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
    color(row) { return "" };

    // Output row as formatted HTML TD object
    rowToTD(row): HTMLTableCellElement {
        let td = document.createElement('td');
        td.innerHTML = this.format(row);
        td.style.color = this.color(row);
        if ('class' in this.options) td.classList.add(this.options.class as string);
        return td;
    }

    // Output column as formatted HTML TD objects
    toTDs(): HTMLTableCellElement[] { return this.column.map(this.rowToTD) };
}

class StringFormatter extends BaseFormatter {
    format(row) { return row.toString() };
}

class ColorScaleFormatter extends BaseFormatter {
    colorScale: any;

    constructor(column: number[], options: object = {}) {
        super(column, options);
        this.domain = this.calcDomain();
        this.colorScale = chroma.scale(['red', 'black', 'green']).domain(this.domain);
    }

    // Get the min/max values for this StatsColumn
    calcDomain(): [number, number] { return [Math.min(...this.column), Math.max(...this.column)] };

    color(row) { return this.colorScale(row) };
}

class InvertedColorScaleFormatter extends ColorScaleFormatter {
    constructor(column: number[], options: object = {}) {
        super(column, options);
        this.colorScale = chroma.scale(['green', 'black', 'red']).domain(this.domain);
    }
}

class PercentileScaleFormatter extends ColorScaleFormatter {
    calcDomain(): [number, number] { return [0.2, 0.8] };
    format(row) { return row.toFixed(3); }
}

class DistanceFormatter extends BaseFormatter {
    distOpts: formatDistanceOptions;

    constructor(column: number[], options: object = {}) {
        super(column, options);
        this.distOpts = { to_unit: getUnitsSetting(), include_unit: true }
    }
    format(row) { return formatDistance(row, this.distOpts) };
}

class InvertedDistanceFormatter extends InvertedColorScaleFormatter {
    distOpts: formatDistanceOptions;

    constructor(column: number[], options: object = {}) {
        super(column, options);
        this.distOpts = { to_unit: getUnitsSetting(), include_unit: true }
    }
    format(row) { return formatDistance(row, this.distOpts) };
}

class CenteredDistanceFormatter extends DistanceFormatter {
    colorScale: any;

    constructor(column: number[], options: object = {}) {
        super(column, options);
        this.domain = this.calcDomain();
        this.colorScale = chroma.scale(['red', 'black', 'green', 'black', 'red']).domain(this.domain);
    }

    // Get the min/max values for this StatsColumn
    calcDomain(): number[] {
        let max = Math.max(...this.column.map(Math.abs));
        return [-max, 0, max];
    };

    color(row) { return this.colorScale(row) };
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
        let key = sortKeyFunc(el);
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
        reduceFunc: sum,
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
        formatter: CenteredDistanceFormatter
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
    }, 'strokesRemaining': {
        header: 'Strokes predicted',
        mapFunc: (stats: StrokeStats) => stats.strokesRemaining,
        reduceFunc: (stats) => Math.max(...stats),
        formatter: ColorScaleFormatter
    }
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
    return dataFrame.map((column, colIx) => {
        let colID = metrics[colIx];
        return summaryMetrics[colID].reduceFunc(column);
    });
}


/**
 * Views
 */
const defaultStrokeStatsMetrics = ['hole', 'index', 'club', 'terrain', 'distanceToAim', 'distanceToActual', 'strokesGained', 'strokesGainedPredicted', 'strokesGainedPercentile', 'proximity', 'proximityCrossTrack', 'proximityPercentile'];
const defaultSummaryStatsMetrics = ['strokes', 'strokesGained', 'strokesGainedPredicted', 'strokesGainedAvg', 'strokesGainedPredictedAvg', 'strokesGainedPercentile', 'proximity', 'proximityCrossTrack', 'proximityPercentile'];

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
        row.append(...columns.map((col) => col[rowIx]));
        tbody.appendChild(row);
    }
    table.appendChild(tbody);
    return table;
}

interface StatsTableMetrics { metrics: string[], sortBy: (a, b) => number, includeTotals: boolean }
function createStatsTable(input: StrokeStats[], options?: StatsTableMetrics): HTMLTableElement {
    options = {
        metrics: defaultStrokeStatsMetrics, sortBy: (a, b) => a.holeIndex * 100 + a.index - b.holeIndex * 100 - b.index, includeTotals: true,
        ...options
    }
    const metrics = options.metrics;
    const sortedInput = [...input].sort(options.sortBy);
    const headers = metrics.map((col) => summaryMetrics[col]['header']);
    const columns = columnizeStrokes(sortedInput, metrics);
    const formatters = metrics.map((colId, colIx) => new summaryMetrics[colId]['formatter'](columns[colIx], { class: colId }));
    const dataFrame = formatters.map((formatter) => formatter.toTDs());
    const table = createColumnTable(headers, dataFrame);
    table.classList.add("statsTable");

    if (options.includeTotals) {
        const totals = reduceStrokeColumns(columns, metrics);
        const totalRow = document.createElement('tr');
        totalRow.append(...formatters.map((formatter, colIx) => formatter.rowToTD(totals[colIx])));
        totalRow.classList.add('totals');
        table.querySelector('tbody').append(totalRow);
    }
    return table;
}

function createSortedStatsTable(strokes: StrokeStats[]): HTMLTableElement {
    const table = createStatsTable(strokes);
    table.id = "strokeStatsTable";
    return table;
}

interface GroupedPivotTableOptions {
    metrics?: string[],
    sortBy?: (a, b) => number,
    includeTotals?: boolean,
    expandable?: boolean,
    groupName?: string
}
function createGroupedPivotTable(input: StrokeStats[], groupByPropOrFunction: string | Function, options: GroupedPivotTableOptions = {}) {
    options = {
        metrics: defaultSummaryStatsMetrics, sortBy: (a, b) => a - b, includeTotals: true, expandable: true, groupName: "Group",
        ...options
    }
    const metrics = options.metrics;
    const groups = groupBy(input, groupByPropOrFunction);
    const groupKeys = Object.keys(groups).sort(options.sortBy);
    const groupSummaries = summarizeStrokeGroups(groups);
    const groupSummariesArray = groupKeys.map((key) => groupSummaries[key]);
    const groupFormatter = new BaseFormatter(groupKeys, { class: "groupBy" });
    const headers = [options.groupName, ...metrics.map((col) => summaryMetrics[col]['header'])];
    const columns = metrics.map((colID) => groupSummariesArray.map((summary) => summary[colID]));
    const formatters = columns.map((col, colIx) => new summaryMetrics[metrics[colIx]]['formatter'](col, { class: metrics[colIx] }));
    const dataFrame = [groupFormatter.toTDs(), ...formatters.map((fmt) => fmt.toTDs())];
    const table = createColumnTable(headers, dataFrame);
    table.classList.add("statsPivotTable", "statsTable");

    if (options.includeTotals) {
        const totalColumns = columnizeStrokes(input, metrics);
        const totals = reduceStrokeColumns(totalColumns, metrics);
        const totalRow = document.createElement('tr');
        const rowHeader = document.createElement('td');
        rowHeader.textContent = 'Totals';
        totalRow.append(rowHeader);
        totalRow.append(...formatters.map((formatter, colIx) => formatter.rowToTD(totals[colIx])));
        totalRow.classList.add('totals');
        table.querySelector('tbody').append(totalRow);
    }

    if (options.expandable) {
        const trs = Array.from(table.querySelectorAll('tbody tr'));
        let expansions = groupKeys.map((key) => groups[key]);
        if (options.includeTotals) expansions.push(input);
        trs.forEach((row: HTMLElement, rowIx: number) => {
            row.onclick = () => handleExpansionRowClick(row, createSortedStatsTable(expansions[rowIx]));
        })
    }
    return table;
}

function createBreakdownTable(cache: RoundStatsCache): HTMLElement {
    const strokes = cache.strokes;
    const summaryOrder = ["putts", "chips", "approaches", "drives"];
    const categoryOrder = (el) => summaryOrder.findIndex((ref) => ref === el);
    const sortBy = (a, b) => categoryOrder(a) - categoryOrder(b);
    const options = { sortBy, groupName: "Type" } as GroupedPivotTableOptions;
    const table = createGroupedPivotTable(strokes, "category", options);
    table.id = "breakdownViewTable";
    return table;
}

function createHoleTable(cache: RoundStatsCache): HTMLElement {
    const options = { groupName: "Hole" }
    const groupByFunc = (ss) => ss.holeIndex + 1;
    const holeTable = createGroupedPivotTable(cache.strokes, groupByFunc, options);
    holeTable.id = "holeViewTable";
    return holeTable;
}

function handleExpansionRowClick(row: HTMLElement, table: HTMLElement) {
    hideExpansionTable();
    if (row.classList.contains('selected')) {
        row.classList.remove('selected');
        return
    }
    const rootTable = row.closest('table');
    const trs = rootTable.querySelectorAll('tbody tr');
    trs.forEach((el: HTMLElement) => el.classList.remove('selected'));
    showExpansionTable(table, row);
    row.classList.add('selected');
}

function showExpansionTable(table: HTMLElement, sibling: HTMLElement) {
    const existing = document.getElementById("strokeStatsTable");
    if (existing) existing.remove();
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 1000; // Stub for all rows
    td.append(table);
    tr.append(td);
    tr.id = 'expansionTableRow';
    sibling.insertAdjacentElement('afterend', tr);
}

function hideExpansionTable() {
    const table = document.querySelectorAll("tr#expansionTableRow") || document.querySelectorAll("table#strokeStatsTable");
    return table.forEach((el) => el.remove());
}

function explodeCounts(obj: object): string {
    let out = "";
    let counts = Object.entries(obj);
    counts.sort((a, b) => a[1] - b[1]);
    for (let [key, count] of counts) {
        out = out.concat(`${key}:&nbsp;${count}, `)
    }
    return out
}

function jsonToCSV(input: any[]): string {
    const replacer = (_: any, value: any) => value === null ? '' : value;
    const csvRows: string[] = [];

    const extractData = (obj: any, parentKey = '', row: any = null) => {
        let rowData = row || {};
        for (const key in obj) {
            if (!obj.hasOwnProperty(key)) {
                continue;
            }
            const fullKey = parentKey ? `${parentKey}.${key}` : key;
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                rowData = extractData(obj[key], fullKey, rowData);
            } else {
                rowData[fullKey] = JSON.stringify(obj[key], replacer);
            }
        }
        return rowData;
    };

    const rowData = input.map((obj) => extractData(obj));
    const headers = Object.keys(rowData[0]);
    csvRows.push(headers.join(','));
    rowData.forEach(rowData => {
        const row = headers.map(header => rowData[header] || '');
        csvRows.push(row.join(','));
    });

    return csvRows.join('\r\n');
}

function downloadCSV(jsonArray: any[], filename: string = 'data.csv'): void {
    const csvData = jsonToCSV(jsonArray);
    const blob = new Blob([csvData], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function generateView() {
    const round = roundLoad();

    // Output round metadata
    const header = document.getElementById("roundTitle");
    const roundDate = new Date(round.date);
    header.innerText = `${round.course} - ${roundDate.toLocaleString()}`;

    // Attach refresh handler
    const reloader = document.getElementById('regenerate');
    reloader.addEventListener('click', regenerateView);

    // Create loading bar
    const outputs = document.querySelectorAll(".generatedOutput");
    const prog = document.createElement('progress');
    outputs.forEach((el) => el.replaceChildren(prog));

    // Generate or load cache
    const key = statsCacheKey(round);
    let cache = cacheUtils.getJSON(key) as RoundStatsCache;
    if (!cache || (round.updatedAt && cache.updatedAt && cache.updatedAt < round.updatedAt)) {
        cache = calculateRoundStatsCache(round);
        cacheUtils.setJSON(key, cache);
    }

    // Generate breakdowns data
    const breakdownDiv = document.getElementById("breakdownTables");
    const table = createBreakdownTable(cache);
    breakdownDiv.replaceChildren(table);

    // Create hole tables
    const holeDiv = document.getElementById("holeTables");
    const holeTable = createHoleTable(cache);
    holeDiv.replaceChildren(holeTable);

    // Attach download handler
    const downloader = document.getElementById('downloadAsCSV');
    const roundDateString = [roundDate.getFullYear(), roundDate.getMonth(), roundDate.getDate(), roundDate.getHours(), roundDate.getMinutes()].join('');
    const filename = `${round.course}_${roundDateString}.csv`.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    downloader.addEventListener('click', () => downloadCSV(cache.strokes, filename));
}

function regenerateView() {
    const round = roundLoad();
    const key = statsCacheKey(round);
    cacheUtils.remove(key);
    generateView();
}

function handleLoad() {
    generateView();
}
window.onload = handleLoad;
