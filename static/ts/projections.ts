import { point } from "@turf/helpers";
import distance from "@turf/distance";
import { Point } from "geojson";

// Conversions from Meters
export const unitConversions = {
    meters: 1,
    yards: 1.1,
    kilometers: 0.001,
    miles: 0.000621371,
    feet: 3.3
}
const distanceAbbreviations = {
    meters: "m",
    yards: "yd",
    feet: "ft",
    kilometers: "km",
    miles: "mi"
}

interface formatDistanceOptions {
    to_unit?: string,
    from_unit?: string,
    precision?: number,
    include_unit?: boolean
}
export function formatDistance(distance: number, options?: formatDistanceOptions): string {
    let opt = {
        from_unit: "meters",
        to_unit: "meters",
        precision: 1,
        with_unit: false
    }
    if (options) {
        opt = { ...opt, ...options }
    }
    const converted = distance / unitConversions[opt["from_unit"]] * unitConversions[opt["to_unit"]];
    const trimmed = converted.toFixed(opt["precision"]);
    if (opt["include_unit"]) {
        const unit = distanceAbbreviation(options["to_unit"]);
        return trimmed + unit;
    }
    return trimmed;
}

export function distanceAbbreviation(unit: string) {
    return distanceAbbreviations[unit];
}

/**
 * Calculates the distance between two coordinates in meters.
 * @param {Coordinate} coord1 - The first coordinate object { x, y }.
 * @param {Coordinate} coord2 - The second coordinate object { x, y }.
 * @returns {number} The distance between the coordinates in meters.
 */
export function getDistance(coord1: Coordinate, coord2: Coordinate): number {
    if (!coord1 || !coord2) {
        return 0
    }
    const p1 = point([coord1.x, coord1.y]);
    const p2 = point([coord2.x, coord2.y]);
    const opts = { units: "meters" }
    return distance(p1, p2, opts)
}

export function coordToPoint(coord: Coordinate): Point {
    return point([coord.x, coord.y]);
}

export function pointToCoord(pt: Point): Coordinate {
    return { x: pt.coordinates[0], y: pt.coordinates[1], crs: "EPSG:4326" }
}