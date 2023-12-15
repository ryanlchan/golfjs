import { FeatureCollection } from 'geojson';
import { bearing, distance, point } from '@turf/turf';

import {
    getHoleFromStrokeRound, getStrokeFollowingFromRound, getStrokesFromRound, roundCourseParams
} from 'services/rounds';
import * as cacheUtils from 'common/cache';
import { getDistance, coordToPoint } from 'common/projections';
import { cdf, sgGrid, targetGrid } from 'services/grids';
import { CourseFeatureCollection, courseLoad } from './courses';
/**
 * *********
 * * Types *
 * *********
 */

export interface RoundStatsCache extends HasUpdateDates {
    round: RoundStats,
    holes: HoleStats[],
    strokes: StrokeStats[]
}

export interface RoundStats extends StrokesSummary, HasUpdateDates {
    id: string,
    par: number,
    filter?: string,
    strokesRemaining: number
}

export interface HoleStats extends StrokesSummary, HasUpdateDates {
    id: string,
    index: number,
    par: number,
    strokesRemaining: number
}

export interface StrokeStats extends HasUpdateDates {
    id: string,
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
    strokesGainedIdeal?: number,
    bearingAim: number,
    bearingPin: number,
    bearingActual: number,
    category: string,
}

export interface StrokesSummary extends HasUpdateDates {
    strokes: number,
    strokesGained: number,
    strokesGainedPredicted: number,
    strokesGainedPercentile: number,
    proximity?: number,
    proximityCrossTrack?: number,
    proximityPercentile: number
}

export interface ProximityStats {
    proximity: number,
    proximityCrossTrack: number,
    proximityAlongTrack: number,
    proximityPercentile: number,
    proximityPercentileCrossTrack: number,
    proximityPercentileAlongTrack: number,
}

export interface GroupedStrokesSummary {
    [index: string]: StrokesSummary
}

export interface GroupedStrokeStats {
    [index: string]: StrokeStats[];
}

interface StatsContext {
    stats: RoundStatsCache,
    round: Round,
    courseData: CourseFeatureCollection
}

function defaultRoundStats(round: Round) {
    return {
        id: round?.id,
        strokes: 0,
        par: 0,
        strokesRemaining: 0,
        strokesGained: 0,
        strokesGainedPredicted: 0,
        strokesGainedPercentile: 0,
        proximityPercentile: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    }
}

function defaultHoleStats(hole: Hole) {
    return {
        id: hole.id,
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

export function defaultStrokesSummary(): StrokesSummary {
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
 * Exported API
 */
export function getStatsCache(r: Round, context: StatsContext) {
    const round = getRoundStats(r, context);
    const holes = getAllHoleStats(r, context);
    const strokes = getAllStrokeStats(r, context);
    return {
        round,
        holes,
        strokes
    }
}

export async function fetchStatsCache(round: Round, courseData: CourseFeatureCollection) {
    try {
        const context = await createStatsContext(round, courseData);
        const cache = getStatsCache(round, context);
        const async = [
            saveRoundStats(cache.round),
            cache.holes.map(hole => saveHoleStats(hole)),
            cache.strokes.map(stroke => saveStrokeStats(stroke))
        ].flat();
        // await Promise.all(async);
        return cache;
    } catch (e) {
        console.error(e);
        throw e;
    }
}

/**
 * Create the context object storing locally cached versions of required info
 */
export async function createStatsContext(r: Round, courseData?: CourseFeatureCollection): Promise<StatsContext> {
    try {

        if (!courseData || Object.keys(courseData).length == 0 || courseData.features.length == 0) {
            const courseParams = roundCourseParams(r);
            courseData = await courseLoad(courseParams);
        }
        const round = await fetchRoundStats(r);
        const strokes = await fetchAllStrokeStats(r);
        const holes = await fetchAllHoleStats(r);
        const stats = { round, holes, strokes }
        return { round: r, courseData, stats }
    } catch (e) {
        console.error(e);
        throw e;
    }
}

/**
 * Sync cache operations
 */
export function getCachedStrokeStats(stroke: Stroke, cache: RoundStatsCache): StrokeStats {
    if (!stroke) return
    const cached = cache.strokes?.find((el) => el.id == stroke.id);
    return (!cached || cached.updatedAt < stroke.updatedAt) ? null : cached;
}

function getCachedHoleStats(hole: Hole, cache: RoundStatsCache): HoleStats {
    if (!hole) return null
    const cached = cache.holes?.find((el) => el.id == hole.id);
    return (!cached || cached.updatedAt < hole.updatedAt) ? null : cached;
}

function getCachedRoundStats(round: Round, cache: RoundStatsCache): RoundStats {
    if (!round) return
    const cached = cache.round;
    return (!cached || cached.updatedAt < round.updatedAt) ? null : cached;
}

function getAllCachedHoleStats(round: Round, cache: RoundStatsCache): HoleStats[] {
    return round?.holes.map(hole => getCachedHoleStats(hole, cache));
}

function getAllCachedStrokeStats(round: Round, cache: RoundStatsCache): StrokeStats[] {
    return cache.strokes;
}

function cacheStrokeStats(stats: StrokeStats, cache: RoundStatsCache): void {
    const filtered = cache.strokes.filter(el => el.id != stats.id);
    cache.strokes = [...filtered, stats];
}

function cacheHoleStats(stats: HoleStats, cache: RoundStatsCache): void {
    const filtered = cache.holes.filter(el => el.id != stats.id);
    cache.holes = [...filtered, stats];
}

function cacheRoundStats(stats: RoundStats, cache: RoundStatsCache): void {
    cache.round = stats;
}

/**
 * Convenience methods for getting from cache or calculating
 */
function getStrokeStats(stroke: Stroke, context: StatsContext): StrokeStats {
    return getCachedStrokeStats(stroke, context.stats) || calculateStrokeStats(stroke, context);
}

function getHoleStats(hole: Hole, context: StatsContext): HoleStats {
    return getCachedHoleStats(hole, context.stats) || calculateHoleStats(hole, context);
}

function getAllStrokeStats(round: Round, context: StatsContext): StrokeStats[] {
    // We calculate stroke stats in reverse hole order as stroke stats are
    // dependent on the following stroke' stats
    const strokes = getStrokesFromRound(round).reverse();
    const stats = strokes.map(stroke => getStrokeStats(stroke, context));
    return stats.reverse();
}

function getAllHoleStats(round: Round, context: StatsContext): HoleStats[] {
    return round.holes.map(hole => getHoleStats(hole, context));
}

function getRoundStats(round: Round, context: StatsContext): RoundStats {
    return getCachedRoundStats(round, context.stats) || calculateRoundStats(round, context);
}

/**
 * Statistics
 */

/**
 * Runs a full recalculation of a round
 * @param round the round to recalculate
 * @returns {RoundStats}
 */
export function calculateRoundStats(round: Round, context: StatsContext): RoundStats {
    if (context.stats?.round?.updatedAt >= round.updatedAt) return context.stats.round
    let rstats: RoundStats = defaultRoundStats(round);

    // Iterate over round holes forward, 1-18
    const holeStats = getAllHoleStats(round, context);

    // Calculate round stats after holes are all done
    holeStats.forEach((el) => {
        rstats.strokes += el.strokes;
        rstats.par += el.par;
        rstats.strokesRemaining += el.strokesRemaining;
    });

    // Calculate the rest of the hole stats
    const strokeStats = getAllCachedStrokeStats(round, context.stats);
    let rsummary = summarizeStrokes(strokeStats);
    rstats = { ...rstats, ...rsummary };
    cacheRoundStats(rstats, context.stats);
    return rstats;
}

function calculateHoleStats(hole: Hole, context: StatsContext): HoleStats {
    const cached = context.stats?.holes?.find(el => el.id == hole.id);
    if (cached?.updatedAt >= hole.updatedAt) {
        return cached;
    } else if (cached) {
        context.stats.holes = context.stats.holes.filter(el => el.id == hole.id);
    }
    let hstats: HoleStats = defaultHoleStats(hole);

    // Within each hole, calculate strokes gained from last stroke backwards
    const strokes = [...hole.strokes]
    strokes.sort((a, b) => b.index - a.index);
    const strokeStats = strokes.map(stroke => (getStrokeStats(stroke, context)));
    hstats.strokesRemaining = strokeStats[0]?.strokesRemaining;
    if (!hstats.par) hstats.par = Math.round(strokeStats[0]?.strokesRemaining);

    // Calculate the rest of the hole stats
    let hsummary = summarizeStrokes(strokeStats);
    hstats = { ...hstats, ...hsummary };
    cacheHoleStats(hstats, context.stats);
    return hstats;
}

function calculateStrokeStats(stroke: Stroke, context: StatsContext): StrokeStats {
    const round = context.round;
    const hole = getHoleFromStrokeRound(stroke, round);
    const nextStroke = getStrokeFollowingFromRound(round, stroke)
    const pin = hole.pin;
    const strokeEnd = nextStroke ? nextStroke.start : pin;
    const nextStats = nextStroke && getStrokeStats(nextStroke, context);
    const srnext = nextStats ? nextStats.strokesRemaining : 0;
    const grid = sgGrid(
        [stroke.start.y, stroke.start.x],
        [stroke.aim.y, stroke.aim.x],
        [pin.y, pin.x],
        stroke.dispersion,
        context.courseData,
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
        id: stroke.id,
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
        category: category,
        grid: grid
    }
    cacheStrokeStats(stats, context.stats);
    return stats
}

export function calculateStrokeStatsIdeal(stroke: Stroke, context: StatsContext): StrokeStats {
    const round = context.round;
    const hole = getHoleFromStrokeRound(stroke, round);
    const nextStroke = getStrokeFollowingFromRound(round, stroke)
    const pin = hole.pin;
    const strokeEnd = nextStroke ? nextStroke.start : pin;
    const nextStats = nextStroke && getStrokeStats(nextStroke, context);
    const srnext = nextStats ? nextStats.strokesRemaining : 0;
    const grid = targetGrid(
        [stroke.start.y, stroke.start.x],
        [stroke.aim.y, stroke.aim.x],
        [pin.y, pin.x],
        stroke.dispersion,
        context.courseData,
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
    const subCell = grid.features.find(cell => cell.properties.containsAim);
    const strokesGainedPercentile = subCell.properties.subGrid.features.reduce(
        (prior, el) => prior + (el.properties.strokesGained <= strokesGained ? el.properties.probability : 0),
        0
    );
    const strokesGainedIdeal = grid.properties.idealStrokesGained;
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
        id: stroke.id,
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
        strokesGainedIdeal: strokesGainedIdeal,
        bearingAim: bearingAim,
        bearingPin: bearingPin,
        bearingActual: bearingActual,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category: category
    }
    cacheStrokeStats(stats, context.stats);
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

/**
 *
 * @param list an array of StrokeStats to group
 * @param propOrFunction either a property of StrokeStats, as a string, or a
 *  function which accepts the StrokeStats as an input and returns a string
 * @returns {GroupedStrokeStats} an object with keys as the result of 
 *  propOrFunction and values as lists of StrokeStats
 */
export function groupBy(list: StrokeStats[], propOrFunction: string | ((stats: StrokeStats) => string)): GroupedStrokeStats {
    let output = {};
    let sortKeyFunc = (propOrFunction instanceof Function) ? propOrFunction : (el) => el[propOrFunction];
    list.forEach((el) => {
        let key = sortKeyFunc(el);
        if (!output[key]) output[key] = [];
        output[key].push(el);
    });
    return output;
}

/**
 * Summarizes a group of strokes into breakdowns
 * @param {GroupedStrokeStats} groups an object with string keys and an array of StrokeStats
 * @returns {GroupedStrokesSummary} stats summarized by keys
 */
export function summarizeStrokeGroups(groups: object): GroupedStrokesSummary {
    let out = {}
    for (let [key, value] of Object.entries(groups)) {
        out[key] = summarizeStrokes(value);
    }
    return out as GroupedStrokesSummary;
}

// Create some summarization functions
export const sum = (list: number[]) => list.reduce((acc, el) => acc + el, 0);
export const average = (list: number[]) => sum(list) / list.length;
export const count = (list: any[]) => list.length.toString();
export const countUnique = (list: any[]) => {
    let counts = {};
    list.forEach(el => counts[el] = 1 + (counts[el] || 0));
    return counts;
}

export const summaryMetrics = {
    'category': {
        mapFunc: (stats: StrokeStats): any => stats.category,
        reduceFunc: countUnique,
    }, 'strokes': {
        mapFunc: (stats: StrokeStats) => 1,
        reduceFunc: sum,
    }, 'strokesGained': {
        mapFunc: (stats: StrokeStats) => stats.strokesGained,
        reduceFunc: sum,
    }, 'strokesGainedAvg': {
        mapFunc: (stats: StrokeStats) => stats.strokesGained,
        reduceFunc: average,
    }, 'strokesGainedPredicted': {
        mapFunc: (stats: StrokeStats) => stats.strokesGainedPredicted,
        reduceFunc: sum,
    }, 'strokesGainedPredictedAvg': {
        mapFunc: (stats: StrokeStats) => stats.strokesGainedPredicted,
        reduceFunc: average,
    }, 'strokesGainedPercentile': {
        mapFunc: (stats: StrokeStats) => stats.strokesGainedPercentile,
        reduceFunc: average,
    }, 'proximity': {
        mapFunc: (stats: StrokeStats) => stats.proximityActualToAim.proximity,
        reduceFunc: average,
    }, 'proximityCrossTrack': {
        mapFunc: (stats: StrokeStats) => stats.proximityActualToAim.proximityCrossTrack,
        reduceFunc: average,
    }, 'proximityPercentile': {
        mapFunc: (stats: StrokeStats) => stats.proximityActualToAim.proximityPercentile,
        reduceFunc: average,
    }, 'distanceToAim': {
        mapFunc: (stats: StrokeStats) => stats.distanceToAim,
        reduceFunc: average,
    }, 'distanceToActual': {
        mapFunc: (stats: StrokeStats) => stats.distanceToActual,
        reduceFunc: average,
    }, 'terrain': {
        mapFunc: (stats: StrokeStats) => stats.terrain,
        reduceFunc: countUnique,
    }, 'club': {
        mapFunc: (stats: StrokeStats) => stats.club,
        reduceFunc: countUnique,
    }, 'hole': {
        mapFunc: (stats: StrokeStats) => (stats.holeIndex + 1).toString(),
        reduceFunc: countUnique,
    }, 'index': {
        mapFunc: (stats: StrokeStats) => (stats.index + 1).toString(),
        reduceFunc: countUnique,
    }, 'strokesRemaining': {
        mapFunc: (stats: StrokeStats) => stats.strokesRemaining,
        reduceFunc: (stats) => Math.max(...stats),
    }
}

/**
 * Create summaries for an array of StrokeStats
 * @param strokes an array of StrokeStats to summarize
 * @returns {StrokesSummary} a summary cache of stats
 */
export function summarizeStrokes(strokes: StrokeStats[]): StrokesSummary {
    if (strokes.length == 0) return
    let summary = defaultStrokesSummary();
    for (let [name, opts] of Object.entries(summaryMetrics)) {
        let mapped = strokes.map(opts.mapFunc);
        let reduced = opts.reduceFunc(mapped);
        summary[name] = reduced;
    }
    return summary;
}

export function columnizeStrokes(strokes: StrokeStats[], metrics: string[]): any[][] {
    return metrics.map((colID) => strokes.map(summaryMetrics[colID].mapFunc));
}

export function reduceStrokeColumns(dataFrame: any[][], metrics: string[]) {
    return dataFrame.map((column, colIx) => {
        let colID = metrics[colIx];
        return summaryMetrics[colID].reduceFunc(column);
    });
}


/**
 * Async operations persisting to backend
 */
const STATS_ROUNDS_NAMESPACE = 'stats-rounds';
const STATS_HOLES_NAMESPACE = 'stats-holes';
const STATS_STROKES_NAMESPACE = 'stats-strokes';
const STATS_CACHE_NAMESPACE = 'stats-cached';

interface UpdateableIdable extends HasUpdateDates { id?: string }
async function fetchValid(obj: UpdateableIdable, namespace: string) {
    if (!obj) return
    const cached = await cacheUtils.get(obj.id, namespace);
    return (cached?.updatedAt >= obj.updatedAt) ? cached : undefined;
}

// TODO: Optimization - LocalForage is pretty slow at object inserts, so use one
// giant object and traverse that in memory instead of many individual records

async function fetchHoleStats(hole: Hole): Promise<HoleStats> {
    return fetchValid(hole, STATS_HOLES_NAMESPACE);
}

async function fetchStrokeStats(stroke: Stroke, round?: Round): Promise<StrokeStats> {
    return fetchValid(stroke, STATS_STROKES_NAMESPACE);
}

async function fetchAllHoleStats(round: Round): Promise<HoleStats[]> {
    const stats = await Promise.all(round.holes.map(hole => fetchHoleStats(hole)))
    return stats.filter(el => el);
}

async function fetchAllStrokeStats(round: Round): Promise<StrokeStats[]> {
    const strokes = getStrokesFromRound(round);
    const stats = await Promise.all(strokes.map(stroke => fetchStrokeStats(stroke, round)));
    return stats.filter(el => el);
}

async function fetchRoundStats(round: Round): Promise<RoundStats> {
    return fetchValid(round, STATS_ROUNDS_NAMESPACE);
}

async function saveHoleStats(stats: HoleStats): Promise<void> {
    return cacheUtils.set(stats.id, stats, STATS_HOLES_NAMESPACE);
}

async function saveStrokeStats(stats: StrokeStats): Promise<void> {
    return cacheUtils.set(stats.id, stats, STATS_STROKES_NAMESPACE);
}

async function saveRoundStats(stats: RoundStats): Promise<void> {
    return cacheUtils.set(stats.id, stats, STATS_ROUNDS_NAMESPACE);
}