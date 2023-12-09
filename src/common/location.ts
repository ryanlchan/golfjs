import * as turf from '@turf/turf';
import L from 'leaflet';
import { PositionError } from 'common/errors';
import { showError, hideError } from 'common/utils';

/**
 * =========
 * Utilities
 * =========
 */

let currentPositionEnabled;
let currentPosition;

/**
 * Get the user's location from browser or cache and continue to watch it
 * @param {boolean} force set to true to skip location cache
 * @returns {Promise} resolves with a GeolocationPositionIsh
 */
export async function watchLocation(force?: boolean): Promise<any> {
    // If location is not yet tracked, turn on BG tracking + force refresh
    if (!(currentPositionEnabled)) {
        const updatePosition = (position) => currentPosition = position;
        const logError = (e) => {
            console.error(e);
            console.warn("Geolocation error")
        }
        const options = { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
        currentPositionEnabled = navigator.geolocation.watchPosition(updatePosition, logError, options);
        force = true;
    }
    return getLocationOnce(force);
}

/**
 * Get the user's location from browser or cache
 * @param {boolean} force set to true to skip location cache
 * @returns {Promise} resolves with a GeolocationPositionIsh
 */
export async function getLocationOnce(force?: boolean): Promise<GeolocationPositionIsh> {
    return new Promise((resolve, reject) => {
        const position = currentPositionRead();
        if (position && !(force)) {
            resolve(position);
        } else if (!navigator.geolocation) {
            // Create a custom position error
            throw new PositionError("Geolocation is not supported by this browser.", 2);
        } else {
            const options = { maximumAge: 60000, timeout: 5000, enableHighAccuracy: true }
            navigator.geolocation.getCurrentPosition(resolve, reject, options);
        }
    });
}

/**
 * Get the user's location and compare against a condition
 * The condition function will be called with the GeolocationPositionIsh, should
 * return True to accept the geolocation or False to reject the promise
 * @param {Function} condition
 * @returns {Promise} resolves with a GeolocationPositionIsh-ish
 */
export async function getLocationIf(condition: Function): Promise<any> {
    return watchLocation().then((position) => {
        if (condition(position)) {
            return position;
        } else {
            throw new Error("Failed conditional test");
        }
    });
}

/**
 * Ask the user to click the map to set a location
 * For example, if the user is way out of bounds
 * @returns {Promise<GeolocationPositionIsh>} the click location as a promise
 */
export async function getClickLocation(): Promise<GeolocationPositionIsh> {
    return new Promise((resolve) => {
        const error = new PositionError("Click the map to set location", 0);
        showError(error, -1);
        mapView.on('click', (e) => {
            const clickPosition = {
                coords: {
                    latitude: e.latlng.lat,
                    longitude: e.latlng.lng,
                }
            }
            hideError();
            resolve(clickPosition);
        });
    });
}

/**
 * Get either the user's location in a given bound or ask them to click
 * @param {turf.FeatureCollection} bound
 * @returns {Promise} resolves with a GeolocationPositionIsh-ish
 */
export async function getLocationWithin(bound: turf.FeatureCollection): Promise<GeolocationPositionIsh> {
    return getLocationIf((position) => {
        const point = turf.point([position.coords.longitude, position.coords.latitude])
        return turf.booleanWithin(point, bound)
    }).catch(getClickLocation);
}

/**
 * Get either the user's location in the map or ask them to click
 * Only useful because polygonizing the map for turf is a pain
 * @returns {Promise} resolves with a GeolocationPositionIsh-ish
 */
export async function getLocationOnMap(): Promise<GeolocationPositionIsh> {
    return getLocationIf((position) => {
        const userLatLng = L.latLng(position.coords.latitude, position.coords.longitude);
        return mapView.getBounds().contains(userLatLng)
    }).catch(getClickLocation);
}


/**
 * Shortcut to get current position from cache
 * @param {number} maximumAge the maximum length of time since update to accept
 * @returns {GeolocationPosition}
 */
export function currentPositionRead(maximumAge = 5000): GeolocationPosition {
    // Expire current position if beyond timeout (5s)
    if ((currentPosition?.timestamp < (Date.now() - maximumAge))
        || (currentPosition?.coords.accuracy > 10)) {
        return undefined;
    }
    return currentPosition;
}

/**
 * Shortcut to get current position from cache as a Coordinate
 * @param {number} maximumAge the maximum length of time since update to accept
 * @returns {Coordinate}
 */
export function currentCoordRead(maximumAge = 5000): Coordinate {
    const pos = currentPositionRead(maximumAge);
    if (!pos) return undefined;
    return { x: pos.coords.longitude, y: pos.coords.latitude, crs: "EPSG:4326" };
}