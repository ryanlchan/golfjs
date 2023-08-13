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
    precision?: number
}
export function formatDistance(distance: number, options?: formatDistanceOptions) {
    let opt = {
        from_unit: "meters",
        to_unit: "meters",
        precision: 1
    }
    if (options) {
        opt = { ...opt, ...options }
    }

    const converted = distance / unitConversions[opt["from_unit"]] * unitConversions[opt["to_unit"]];
    const trimmed = converted.toFixed(opt["precision"]);
    return trimmed;
}

export function distanceAbbreviation(options: formatDistanceOptions) {
    return distanceAbbreviations[options["to_unit"]];
}

/**
 * Calculates the distance between two coordinates in meters.
 * @param {Coordinate} coord1 - The first coordinate object { x, y }.
 * @param {Coordinate} coord2 - The second coordinate object { x, y }.
 * @returns {number} The distance between the coordinates in meters.
 */
export function getDistance(coord1: Coordinate, coord2: Coordinate): number {
    const lat1 = coord1.y;
    const lon1 = coord1.x;
    const lat2 = coord2.y;
    const lon2 = coord2.x;
    const R = 6371e3; // meters
    const phi1 = (lat1 * Math.PI) / 180; // phi, lambda in radians
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c; // meters
    return distance;
}