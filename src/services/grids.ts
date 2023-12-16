import * as turf from "@turf/turf";
import { HOLE_OUT_COEFFS, SG_SPLINES } from "./coeffs20231205";
import { Feature, FeatureCollection, Point } from "geojson";
import { CourseFeatureCollection, getTerrainAt } from "./courses";
import { bbox, buffer, distance, point } from "@turf/turf";

export const gridTypes = { STROKES_GAINED: "Strokes Gained", BEST_AIM: "Best Aim" };

/**
 * =====
 * Types
 * =====
 */

export interface GridFeatureCollection extends FeatureCollection {
    properties?: GridProperties,
}

interface GridProperties {
    type: string,
    terrain: string,
    distanceToHole: number,
    strokesRemainingStart: number,
    weightedStrokesGained: number,
    idealStrokesGained?: number
}

/**
 * =====
 * Grids
 * =====
 */

function loadSpline(type: string): Spline {
    return new Spline(SG_SPLINES[type]);
}

function splineAt(type: string, at: number): number {
    return loadSpline(type).at(at);
}

/**
 * Create a hex grid around a given feature
 * @param {FeatureCollection} feature the feature or feature collection to bound
 * @param {Object} [options] options to provide
 * @param {Number} options.maximum_cells the maximum number of cells to create
 * @returns {FeatureCollection} a grid of hex cells over the feature
 */
function hexGridCreate(feature: FeatureCollection, options?: { maximum_cells: number }): FeatureCollection {
    // Calculate the hexagon sidelength according to a max cell count
    let maximum_cells = 2000;
    if (options?.maximum_cells) {
        maximum_cells = options.maximum_cells;
    }
    const bbox = turf.bbox(feature);

    // Get sidelength. turf.area calculates in sq meters, we need to convert back to kilometers
    const _x = Math.sqrt((turf.area(feature)) / (maximum_cells * (3 * Math.sqrt(3) / 2))) / 1000;

    // Clamp to at least 0.16m cells and at most 10m cells
    const minX = 0.16 / 1000;
    const maxX = 10 / 1000;
    const x = Math.min(Math.max(minX, _x), maxX);


    let grid_options = { units: 'kilometers' };
    let grid = turf.hexGrid(bbox, x, grid_options);
    // grid = featureWithin(grid, feature);
    return grid;
}

/**
 * Optimization: For ~circular hexagonal grids, we can index and avoid a lot of distance calculations
 */
const HEXAGON_ANGLE: number = Math.PI / 3;
const SIDES: number = 6;

// Precompute cosines and sines for hexagon angles
const cosines: number[] = [];
const sines: number[] = [];
for (let i = 0; i < SIDES; i++) {
    const angle: number = HEXAGON_ANGLE * i;
    cosines.push(Math.cos(angle));
    sines.push(Math.sin(angle));
}

// Converts axial coordinates to cube coordinates
function axialToCube(axial: [number, number]): [number, number, number] {
    const x = axial[0];
    const z = axial[1];
    const y = -x - z;
    return [x, y, z];
}

function axialToCartesian([q, r]: [number, number]) {
    const x = Math.sqrt(3) * (q + r / 2);
    const y = 3 / 2 * r;
    return [x, y]
}

function isWithinCircle(axial: [number, number], radius: number): boolean {
    const [x, y] = axialToCartesian(axial);
    return x ** 2 + y ** 2 <= radius ** 2
}

// Checks if the hexagon is within the grid radius
function isWithinGrid(axial: [number, number], radius: number): boolean {
    const cube = axialToCube(axial);
    return Math.max(Math.abs(cube[0]), Math.abs(cube[1]), Math.abs(cube[2])) <= radius;
}

// Creates a single hexagon feature
function createHexagon(center: [number, number], xsize: number, ysize: number, axialCoordinates: [number, number]): Feature {
    let vertices: [number, number][] = [];
    for (let i = 0; i < SIDES; i++) {
        vertices.push([
            center[0] + xsize * cosines[i],
            center[1] + ysize * sines[i]
        ]);
    }
    vertices.push(vertices[0]); // Closing the hexagon

    return turf.polygon([vertices], { axialCoordinates })
}

// Generates the hexagon grid
function generateHexagonGrid(center: number[], gridRadius: number, hexagonSize: number): FeatureCollection {
    const unitOpts = { units: "degrees" };
    const circle = buffer(point(center), gridRadius * hexagonSize, unitOpts)
    const [west, south, east, north] = bbox(circle);
    const xOverY = distance([west, center[1]], [east, center[1]], unitOpts) / distance([center[0], south], [center[0], north], unitOpts);
    let hexagons: Feature[] = [];
    for (let q = -gridRadius; q <= gridRadius; q++) {
        let r1 = Math.max(-gridRadius, -q - gridRadius);
        let r2 = Math.min(gridRadius, -q + gridRadius);
        for (let r = r1; r <= r2; r++) {
            if (isWithinCircle([q, r], gridRadius)) {
                const [x, y] = axialToCartesian([q, r])
                const hexCenter: [number, number] = [
                    center[0] + hexagonSize * xOverY * 3 / 2 * q,
                    center[1] + hexagonSize * Math.sqrt(3) * (r + q / 2)
                ];
                hexagons.push(createHexagon(hexCenter, hexagonSize * xOverY, hexagonSize, [q, r]));
            }
        }
    }
    return turf.featureCollection(hexagons)
}

/**
 * Create a circular grid of Hexagons around a point
 * @param center the center point to create around in WGS84 coord, lon/lat
 * @param radius the radius of the grid, in meters
 * @param cells the target number of cells to return
 */
function hexCircleCreate(center: number[], radius: number, target_cells = 2000): GridFeatureCollection {
    // Calculate hexagon size length between 0.16m and 10m
    const _r = Math.sqrt((Math.PI * Math.pow(radius, 2) * 2) / (target_cells * (3 * Math.sqrt(3))));
    const minR = 0.16;
    const maxR = 10;
    const r = Math.min(Math.max(minR, _r), maxR);
    const hexSize = turf.lengthToDegrees(r, 'meters');
    const hexRadius = Math.round((radius / r) / 1.5);
    return generateHexagonGrid(center, hexRadius, hexSize);
}

/**
 * Return the probability of a given number being drawn from a normal distribution
 * of a given mean and stddev. Estimates a continuous PDF.
 * @param {Number} stddev the normal's standard deviation
 * @param {Number} x the number to get probabilities for
 * @param {Number} [mean=0] the mean of the normal distribution, optional (default = 0)
 * @returns {Number}
 */
function probability(stddev: number, x: number, mean = 0): number {
    const coefficient = 1 / (stddev * Math.sqrt(2 * Math.PI));
    const exponent = -((x - mean) ** 2) / (2 * stddev ** 2);
    return coefficient * Math.exp(exponent);
};

/**
 * Add probability to a HexGrid, assuming a normal distribution around `aimPoint`
 * with standard deviation of `dispersion`
 * @param {FeatureCollection} grid the hexGrid
 * @param {Point} aimPoint the point to count as the center of aim/normal
 * @param {Number} dispersion the standard deviation of the normal
 * @returns {FeatureCollection} the updated grid
 */
function probabilityGrid(grid: FeatureCollection, aimPoint: Point, dispersion: number): FeatureCollection {
    let total = 0.0;
    grid.features.forEach((feature) => {
        const distance = turf.distance(turf.center(feature), aimPoint, { units: "kilometers" }) * 1000;
        let p = probability(dispersion, distance);
        feature.properties.probability = p;
        feature.properties.distanceToAim = distance
        total += p;
    });
    grid.features.forEach((feature) => {
        feature.properties.probability = feature.properties.probability / total;
    });
    return grid
}

/**
 * Calculates an estimated % chance to hole out from this distance and terrain
 * @param {Number} distanceToHole the distance to the hole, in meters
 * @param {String} terrainType the terrain type
 * @returns {Number} a decimal between 0 and 1 representing the chance of holing out
 */
function holeOutRate(distanceToHole: number, terrainType: string): number {
    if (!(terrainType in HOLE_OUT_COEFFS)) {
        return 0;
    }
    const polys = HOLE_OUT_COEFFS[terrainType];

    // Find which domain the distanceToHole falls within
    let domainIndex;
    for (let i = 0; i < polys.domains.length; i++) {
        if (distanceToHole >= polys.domains[i][0] && distanceToHole <= polys.domains[i][1]) {
            domainIndex = i;
            break;
        }
    }

    if (domainIndex === undefined) {
        console.error("Distance to hole is outside the supported range.");
        return 0;
    }

    // Get the coefficients for the polynomial within the valid domain
    let coeffs = polys.coeffs[domainIndex];

    // Calculate the estimated chance to hole out
    let rate = coeffs.reduce(((acc, coeff, index) => acc + coeff * Math.pow(distanceToHole, index)), 0);

    // Clamp the result between 0 and 1
    rate = Math.max(0, Math.min(1, rate));

    return rate;
}

/**
 * Add a circular feature representing the golf hole with stats that represent holing out
 * @param {FeatureCollection} hexGrid the grid feature
 * @param {Number} distanceToHole the distance to the hole in meters
 * @param {String} terrainType the terrain type
 * @param {Point} holePoint a turf.js point representing the hole
 * @returns FeatureCollection
 */
function addHoleOut(hexGrid, distanceToHole, terrainType, holePoint) {
    // Get holeout rate
    const hor = holeOutRate(distanceToHole, terrainType);
    const baseSr = strokesRemaining(distanceToHole, terrainType);
    const holeFeature = turf.circle(holePoint, 0.0002, { units: 'kilometers' });
    holeFeature.properties = {
        "distanceToHole": 0,
        "terrainType": "hole",
        "probability": hor,
        "strokesRemaining": 0,
        "strokesGained": baseSr - 1
    };

    // Adjust the probability of all other featuers for hole probability
    if (hor > 0) hexGrid.features.forEach(feature => feature.properties.probability *= (1 - hor))
    hexGrid.features.push(holeFeature);
    return hexGrid;
}

/**
 * Calculates an estimated number of strokes remaining from this distance and terrain
 * @param {Number} distanceToHole the distance to the hole, in meters
 * @param {String} terrainType the terrain type
 * @returns {Number} the number of strokes remaining
 */
export function strokesRemaining(distanceToHole: number, terrainType: string): number {
    if (!(terrainType in SG_SPLINES)) {
        console.error("No strokes remaining polynomial for terrainType" + terrainType + ", defaulting to rough");
        terrainType = "rough"
    }

    let totalStrokes = splineAt(terrainType, distanceToHole);

    // Clip results from 1 to 7 strokes remaining to catch really extreme outlier predictions
    let clippedStrokes = Math.min(Math.max(totalStrokes, 1), 7)
    return clippedStrokes;
}

/**
 * Given a geographic feature, calculate strokes remaining from its center
 * @param {Feature} feature the geographic feature to calculate from
 * @param {Array} holeCoordinate an array containing [lat, long] coordinates in WGS84
 * @param {Course} courseData the coursename to get polygons for
 * @returns {Number} estimated strokes remaining
 */
export function strokesRemainingFrom(feature: FeatureCollection, holeCoordinate: number[], courseData: CourseFeatureCollection): number {
    const center = turf.center(feature);
    const distanceToHole = turf.distance(center, holeCoordinate, { units: "kilometers" }) * 1000;
    const terrainType = getTerrainAt(courseData, center);
    return strokesRemaining(distanceToHole, terrainType);
}

/**
 * Calculate strokes gained for each cell in a given grid
 * @param {FeatureCollection} grid
 * @param {number[]} holeCoordinate
 * @param {number} strokesRemainingStart
 * @param {Course} course
 * @returns {FeatureCollection} the updated grid
 */
function strokesGained(grid: FeatureCollection, holeCoordinate: number[], strokesRemainingStart: number, course: CourseFeatureCollection): FeatureCollection {
    grid.features.forEach((feature) => {
        let props = feature.properties;
        if (props.strokesRemaining === undefined) {
            const center = turf.center(feature);
            props.distanceToHole = turf.distance(center, holeCoordinate, { units: "kilometers" }) * 1000;
            props.terrainType = getTerrainAt(course, center);
            props.strokesRemaining = strokesRemaining(props.distanceToHole, props.terrainType);
        }
        props.strokesGained = strokesRemainingStart - props.strokesRemaining - 1;
    });
    return grid;
}

/**
 * Calculate the weighted strokes gained for a gri
 * @param {FeatureCollection} grid a grid with strokes gained and probabilities added
 * @returns {FeatureCollection} the updated grid
 */
function weightStrokesGained(grid: FeatureCollection): FeatureCollection {
    turf.featureEach(grid, (feature) => {
        let props = feature.properties;
        props.weightedStrokesGained = props.strokesGained * props.probability;
    });
    return grid;
}

/**
 * Calculate a Strokes Gained probability-weighted grid
 * @param {number[]} startCoordinate Coordiante in WGS84 LatLong
 * @param {number[]} aimCoordinate Coordiante in WGS84 LatLong
 * @param {number[]} holeCoordinate Coordiante in WGS84 LatLong
 * @param {number} dispersion the std dev of dispersion
 * @param {Course} course the course
 * @param {string} [startTerrain] optional
 * @returns {GridFeatureCollection}
 */

export function sgGrid(startCoordinate: number[], aimCoordinate: number[],
    holeCoordinate: number[], dispersion: number, courseData: CourseFeatureCollection,
    startTerrain?: string): GridFeatureCollection {
    const startPoint = turf.flip(turf.point(startCoordinate));
    const aimPoint = turf.flip(turf.point(aimCoordinate));
    const holePoint = turf.flip(turf.point(holeCoordinate));
    if (dispersion < 0) {
        const distanceToAim = turf.distance(startPoint, aimPoint, { units: "meters" })
        dispersion = -dispersion * distanceToAim;
        dispersion = Math.max(0.5, dispersion);
    }
    const terrainTypeStart = startTerrain ? startTerrain : getTerrainAt(courseData, startPoint);
    const distanceToHole = turf.distance(startPoint, holePoint, { units: "meters" })
    const strokesRemainingStart = strokesRemaining(distanceToHole, terrainTypeStart);
    const hexGrid = hexCircleCreate(aimCoordinate.reverse(), dispersion * 3);

    // Get probabilities
    probabilityGrid(hexGrid, aimPoint, dispersion);
    addHoleOut(hexGrid, distanceToHole, terrainTypeStart, holePoint);
    strokesGained(hexGrid, holePoint, strokesRemainingStart, courseData);
    weightStrokesGained(hexGrid);
    const weightedStrokesGained = hexGrid.features.reduce((sum, feature) => sum + (feature.properties.weightedStrokesGained || 0), 0);

    console.debug(`${(new Date).toISOString()}: From ${startCoordinate} on ${startTerrain} @ ${dispersion}m dispersion: Total Weighted Strokes Gained: ${weightedStrokesGained}`);
    const properties = {
        type: gridTypes.STROKES_GAINED,
        terrain: terrainTypeStart,
        distanceToHole: distanceToHole,
        strokesRemainingStart: strokesRemainingStart,
        weightedStrokesGained: weightedStrokesGained,
    } as GridProperties;
    hexGrid.properties = properties

    return hexGrid;
}

/**
 * Calculate a SG subgrid for an aim cell within a supergrid
 * TODO: Send this out to a WebWorker
 * @param {Feature} cell the cell to calculate strokes gained for
 * @param {number} dispersion the std dev of dispersion, in meters
 * @param {GridFeatureCollection} superGrid the overall grid of Strokes Gained results
 * @param {number} distanceToHole the distance to the hole from start point, in meters
 * @param {Point} holePoint the hole
 * @param {string} terrainTypeStart the terrain to start the stroke from
 * @param {Course} course the course
 * @param {number} [index] optional param for what subgrid cell this is
 * @returns {GridFeatureCollection} the subgrid
 */
function calculateSubGrid(cell: Feature, dispersion: number, superGrid: GridFeatureCollection,
    distanceToHole: number, terrainTypeStart: string, holePoint: Point, index?: number): GridFeatureCollection {
    const subAimPoint = turf.center(cell);
    const subWindow = turf.circle(subAimPoint, 3 * dispersion / 1000, { units: "kilometers" })
    const subGrid = featureWithin(superGrid, subWindow);
    probabilityGrid(subGrid, subAimPoint, dispersion);
    addHoleOut(subGrid, distanceToHole, terrainTypeStart, holePoint);
    weightStrokesGained(subGrid);
    const weightedStrokesGained = subGrid.features.reduce((sum, feature) => sum + feature.properties.weightedStrokesGained, 0);
    subGrid.properties = { ...subGrid.properties, weightedStrokesGained };
    if (index % 10 == 0) {
        console.debug(`Processed subgrid cell${` ${index}`}, wsg = ${weightedStrokesGained}`);
    }
    return subGrid;
}

/**
 * Calculate the relative strokes gained by aiming at each cell in a grid
 * @param {number[]} startCoordinate Coordiante in WGS84 LatLong
 * @param {number[]} aimCoordinate Coordiante in WGS84 LatLong
 * @param {number[]} holeCoordinate Coordiante in WGS84 LatLong
 * @param {number} dispersion the std dev of dispersion
 * @param {Course} course the course
 * @param {string} [startTerrain] optional
 * @returns {GridFeatureCollection}
 */
export function targetGrid(startCoordinate: number[], aimCoordinate: number[],
    holeCoordinate: number[], dispersion: number, courseData: CourseFeatureCollection,
    startTerrain?: string): GridFeatureCollection {
    const startPoint = turf.flip(turf.point(startCoordinate));
    const aimPoint = turf.flip(turf.point(aimCoordinate));
    const holePoint = turf.flip(turf.point(holeCoordinate));
    if (dispersion < 0) {
        const distanceToAim = turf.distance(startPoint, aimPoint, { units: "kilometers" }) * 1000;
        dispersion = -dispersion * distanceToAim;
        dispersion = Math.max(0.5, dispersion);
    }
    const terrainTypeStart = startTerrain ? startTerrain : getTerrainAt(courseData, startPoint);
    const distanceToHole = turf.distance(startPoint, holePoint, { units: "kilometers" }) * 1000;
    const strokesRemainingStart = strokesRemaining(distanceToHole, terrainTypeStart);

    // Create a supergrid 3x the subgrid window size
    const outcomeGrid = hexCircleCreate(aimCoordinate.reverse(), dispersion * 3 * 2, 8000);

    // Add SG info to supergrid
    strokesGained(outcomeGrid, holePoint, strokesRemainingStart, courseData);

    // Get each grid cell within the aim window, and use it as the aim point
    const aimGrid = turf.clone(featureNear(outcomeGrid, aimPoint, dispersion));
    console.log(`Iterating through aim grid of ${aimGrid.features.length} cells`);
    let idealStrokesGained;
    aimGrid.features.forEach((cell, ix) => {
        const subAimPoint = turf.center(cell);
        const subAimCoords = cell.properties.axialCoordinates;
        const subGrid = featureFilter(outcomeGrid, (cell) => {
            const coords = cell.properties.axialCoordinates;
            const relativeCoords = coords.map((coord, ix) => coord - subAimCoords[ix]);
            return isWithinGrid(relativeCoords, 25); // 25 ~ 2000 cells
        })
        probabilityGrid(subGrid, subAimPoint, dispersion);
        addHoleOut(subGrid, distanceToHole, terrainTypeStart, holePoint);
        weightStrokesGained(subGrid);
        const weightedStrokesGained = subGrid.features.reduce((sum, feature) => sum + feature.properties.weightedStrokesGained, 0);
        const containsAim = turf.booleanContains(cell, aimPoint);
        cell.properties = {
            containsAim,
            weightedStrokesGained,
            subGrid: containsAim ? subGrid : null,
            ...cell.properties
        };
        if (!idealStrokesGained || idealStrokesGained < weightedStrokesGained) idealStrokesGained = weightedStrokesGained;
    });

    // baseline against middle aim point
    const aimCells = aimGrid.features.filter((feature) => turf.booleanContains(feature, aimPoint));
    const baseSg = aimCells.reduce(((acc, cell) => acc + cell.properties.weightedStrokesGained), 0) / aimCells.length;
    turf.featureEach(aimGrid, (feature) => {
        let props = feature.properties;
        props.relativeStrokesGained = props.weightedStrokesGained - baseSg;
    });

    // Prep output stats and return
    const properties = {
        type: gridTypes.BEST_AIM,
        terrain: terrainTypeStart,
        distanceToHole: distanceToHole,
        strokesRemainingStart: strokesRemainingStart,
        weightedStrokesGained: baseSg,
        idealStrokesGained
    } as GridProperties;
    aimGrid.properties = properties

    return aimGrid;
}

export function bestTarget(grid: turf.FeatureCollection) {
    return turf.featureCollection(grid.features.reduce((acc, cell) => cell.weightedStrokesGained > acc.weightedStrokesGained ? cell : acc));
}

/**
 * Filter a feature collection, like Array.prototype.filter
 * @param {FeatureCollection} collection the collection to filter
 * @param {Function} filter a function that accepts the feature as argument
 * @returns {FeatureCollection} a collection of all features where `filter` is true
 */
function featureFilter(collection, filter) {
    const _featureFilterReduce = (acc, feature) => {
        if (filter(feature)) acc.push(feature);
        return acc;
    }
    return turf.featureCollection(
        turf.featureReduce(collection, _featureFilterReduce, [])
    );
}

/**
 * Filter a feature collection for intersects with another feature
 * @param {FeatureCollection} collection the collection to filter
 * @param {Feature} intersects another feature that collection must intersect with
 * @returns {FeatureCollection} a collection of all features that intersect `intersects`
 */
export function featureIntersect(collection, intersects) {
    return featureFilter(collection, (feature) => turf.booleanIntersects(intersects, feature))
}

/**
 * Filter a feature collection for such that it is contained by another feature
 * For whatever reason, this is _much_ faster than intersects
 * @param {FeatureCollection} collection the collection to filter
 * @param {Feature} container another feature that collection must be within
 * @returns {FeatureCollection} a collection of all features that intersect `intersects`
 */
function featureWithin(collection, container) {
    return featureFilter(collection, (feature) => turf.booleanWithin(feature, container))
}

function featureNear(collection: FeatureCollection, point: Point, distance: number) {
    return featureFilter(collection, (cell) => {
        const subCellCenter = turf.center(cell);
        const proximity = turf.distance(subCellCenter, point, { units: "kilometers" }) * 1000;
        return !(proximity > distance);
    });
}

/**
 * Filter a feature collection for features containing another feature
 * @param {FeatureCollection} collection the collection to filter
 * @param {Feature} contained another feature that collection must contain
 * @returns {FeatureCollection} a collection of all features that intersect `intersects`
 */
function featureContains(collection, contained) {
    return featureFilter(collection, (feature) => turf.booleanContains(feature, contained))
}


/**
 * Calculate the error remainder function for a normal
 * @param {Number} x
 * @param {Number} mean
 * @param {Number} standardDeviation
 * @returns {Number}
 */
export function erf(x, mean, standardDeviation) {
    const z = (x - mean) / (standardDeviation * Math.sqrt(2));
    const t = 1 / (1 + 0.3275911 * Math.abs(z));
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    return 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
}

/**
 * Calculates the cumulative distribution function for a normal
 * @param {Number} x
 * @param {Number} mean
 * @param {Number} standardDeviation
 * @returns {Number}
 */
export function cdf(x, mean, standardDeviation) {
    const e = erf(x, mean, standardDeviation);
    const z = (x - mean) / (standardDeviation * Math.sqrt(2));
    const cdf = 0.5 * (1 + Math.sign(z) * e);
    return cdf;
}

function csv2array(data: string, delimiter = ',', omitFirstRow = false): any[][] {
    return data
        .slice(omitFirstRow ? data.indexOf('\n') + 1 : 0)
        .split('\n')
        .map(v => v.split(delimiter).map(n => parseFloat(n) > 0 ? parseFloat(n) : n));
}

function transposeMatrix(data: any[][]): any[][] {
    return data[0].map((_, colIndex) => data.map(row => row[colIndex]));
}

// Given an array of knots and an array of values,
// return a function which evaluates a natural cubic spline
// extrapolated by linear functions on either end.
// Adapted from https://talk.observablehq.com/t/obtain-interpolated-y-values-without-drawing-a-line/1796/8
interface SplineOptions { knots: number[] | Float64Array, scales: number[] | Float64Array, coeffs: number[] | Float64Array }
class Spline {
    knots: Float64Array;
    scales: Float64Array;
    coeffs: Float64Array;

    constructor(props: SplineOptions) {
        this.knots = Float64Array.from(props.knots);
        this.scales = Float64Array.from(props.scales);
        this.coeffs = Float64Array.from(props.coeffs);
    }

    at(u: number) {
        // Binary search
        let nn = this.knots.length - 1, low = 0, half;
        while ((half = (nn / 2) | 0) > 0) {
            low += half * (this.knots[low + half] <= u ? 1 : 0);
            nn -= half;
        }
        const i = low, j = 4 * i;
        u = (2 * u - this.knots[i] - this.knots[i + 1]) * this.scales[i]; // scale to [–1, 1]
        // Clenshaw's method.
        let b1 = this.coeffs[j + 3], b2 = this.coeffs[j + 2] + 2 * u * b1;
        b1 = this.coeffs[j + 1] + 2 * u * b2 - b1;
        return this.coeffs[j] + u * b1 - b2;
    }

    static fromValues(knots: number[] | Float64Array, values: number[] | Float64Array): Spline {
        const n = knots.length - 1;
        const t = new Float64Array(n + 3); t.set(knots, 1);
        const y = new Float64Array(n + 3); y.set(values, 1);
        const s = new Float64Array(n + 2); // horizontal scales
        const m = new Float64Array(n + 3); // slope at each knot
        const d = new Float64Array(n + 3); // diagonal matrix

        // Natural cubic spline algorithm
        for (let i = 1; i < n + 1; i++) {
            s[i] = 1 / (t[i + 1] - t[i]);
            m[i] += (m[i + 1] = 3 * s[i] * s[i] * (y[i + 1] - y[i]));
        }
        d[1] = 0.5 / s[1];
        m[1] = d[1] * m[1];
        for (let i = 2; i <= n + 1; i++) {
            d[i] = 1 / (2 * (s[i] + s[i - 1]) - s[i - 1] * s[i - 1] * d[i - 1]);
            m[i] = d[i] * (m[i] - s[i - 1] * m[i - 1]);
        }
        for (let i = n; i >= 1; i--) {
            m[i] -= d[i] * s[i] * m[i + 1];
        }

        // Linear extrapolation
        t[0] = t[1] - 1; t[n + 2] = t[n + 1] + 1;
        y[0] = y[1] - m[1]; y[n + 2] = y[n + 1] + m[n + 1];
        s[0] = s[n + 1] = 1;
        m[0] = m[1]; m[n + 2] = m[n + 1];

        // Set up Chebyshev coefficients
        const coeffs = new Float64Array(4 * (n + 2));
        for (let i = 0; i < n + 2; i++) {
            const h = t[i + 1] - t[i];
            const y0 = y[i], y1 = y[i + 1], m0 = h * m[i], m1 = h * m[i + 1], j = 4 * i;
            coeffs[j] = 0.5 * (y0 + y1 + 0.125 * (m0 - m1));
            coeffs[j + 1] = 0.03125 * (18 * (y1 - y0) - m0 - m1);
            coeffs[j + 2] = 0.0625 * (m1 - m0);
            coeffs[j + 3] = 0.03125 * (2 * (y0 - y1) + m0 + m1);
        }

        return new Spline({ knots: t, scales: s, coeffs: coeffs })
    }
}

function buildSplines(data) {
    const colData = transposeMatrix(csv2array(data));
    const x = colData[0];
    const splines = {};
    colData.slice(1).forEach((col, ix) => {
        const type = col[0];
        const filteredX: number[] = [];
        const filteredY: number[] = [];

        // Single iteration to check the condition and build the filtered arrays
        col.forEach((value, index) => {
            if (index == 0) return
            if (value > 0) {
                filteredX.push(x[index]);
                filteredY.push(value);
            }
        });
        const spline = Spline.fromValues(filteredX, filteredY);
        splines[type] = spline;
    });
    return splines;
}

function dehydrateSplines(splines: { [type: string]: Spline }): { [type: string]: SplineOptions } {
    const outputs = {};
    for (const type in splines) {
        const spline = splines[type];
        outputs[type] = {
            knots: spline.knots,
            scales: spline.scales,
            coeffs: spline.coeffs,
        }
    };
    return outputs;
}

function rehydrateSplines(splines: { [type: string]: SplineOptions }) {
    const outputs = {};
    for (const type in splines) {
        const spline = new Spline(splines[type]);
        outputs[type] = spline;
    };
    return outputs;
}