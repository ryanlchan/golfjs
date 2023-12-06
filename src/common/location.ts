import * as turf from '@turf/turf';

/**
 * =========
 * Utilities
 * =========
 */

/**
 * Get the user's location from browser or cache
 * @param {boolean} force set to true to skip location cache
 * @returns {Promise} resolves with a GeolocationPositionIsh
 */
function getLocation(force?: boolean): Promise<any> {
    // If location is not yet tracked, turn on BG tracking + force refresh
    if (!(currentPositionEnabled)) {
        currentPositionUpdate();
        force = true;
    }
    return new Promise((resolve, reject) => {
        const position = currentPositionRead();
        if (position && !(force)) {
            resolve(position);
        } else if (!navigator.geolocation) {
            // Create a custom position error
            let e = new PositionError("Geolocation is not supported by this browser.", 2);
            reject(e);
        } else {
            const options = { maximumAge: 5000, timeout: 5000, enableHighAccuracy: true }
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
function getLocationIf(condition: Function): Promise<any> {
    return getLocation().then((position) => {
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
function getClickLocation(): Promise<GeolocationPositionIsh> {
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
function getLocationWithin(bound: turf.FeatureCollection): Promise<GeolocationPositionIsh> {
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
function getLocationOnMap(): Promise<GeolocationPositionIsh> {
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
function currentPositionRead(maximumAge = 5000): GeolocationPosition {
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
function currentCoordRead(maximumAge = 5000): Coordinate {
    const pos = currentPositionRead(maximumAge);
    if (!pos) return undefined;
    return { x: pos.coords.longitude, y: pos.coords.latitude, crs: "EPSG:4326" };
}