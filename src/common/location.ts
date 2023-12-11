import * as turf from '@turf/turf';
import type L from 'leaflet';
import { MODAL_TYPES, ModalProps } from "./modals";
import { GeolocatedResult } from 'hooks/useLocation';
import { disposableEffect } from 'hooks/core';
import { Signal } from '@preact/signals';

/**
 * =========
 * Utilities
 * =========
 */

/**
 * Get the user's location and compare against a condition
 * The condition function will be called with the GeolocationPositionIsh, should
 * return True to accept the geolocation or False to reject the promise
 * @param {Function} condition
 * @returns {Promise} resolves with a GeolocationPositionIsh-ish
 */
export async function getLocationIf(
    gr: GeolocatedResult,
    condition: (coords: GeolocationPosition) => boolean
): Promise<any> {
    if (gr.isGeolocationAvailable.value && condition(gr.raw.value)) {
        return Promise.resolve(gr.raw.value);
    } else if (!gr.isGeolocationEnabled) {
        gr.getPosition();
        return new Promise((resolve, reject) => {
            const disposeCb = disposableEffect((dispose) => {
                if (condition(gr.raw.value)) {
                    dispose();
                    resolve(gr.raw.value);
                }
            });
            setTimeout(() => {
                disposeCb();
                reject();
            }, 5000);
        });
    } else {
        return null;
    }
}

/**
 * Ask the user to click the map to set a location
 * For example, if the user is way out of bounds
 * @returns {Promise<GeolocationPositionIsh>} the click location as a promise
 */
export async function getClickLocation(map: L.Map, modalSignal: Signal<ModalProps>): Promise<GeolocationPositionIsh> {
    return new Promise((resolve) => {
        modalSignal.value = {
            message: "Click the map to set location",
            type: MODAL_TYPES.WARN,
            timeout: 10000
        };

        map.on('click', (e) => {
            const clickPosition = {
                coords: {
                    latitude: e.latlng.lat,
                    longitude: e.latlng.lng,
                }
            }
            modalSignal.value = null;
            resolve(clickPosition);
        });
    });
}

/**
 * Get either the user's location in a given bound or ask them to click
 * @param {turf.FeatureCollection} bound
 * @returns {Promise} resolves with a GeolocationPositionIsh-ish
 */
export async function getLocationWithin(
    gr: GeolocatedResult,
    bound: turf.FeatureCollection,
    map: L.Map,
    modalSignal: Signal<ModalProps>): Promise<GeolocationPositionIsh> {
    return getLocationIf(gr, (position) => {
        const point = turf.point([position.coords.longitude, position.coords.latitude])
        return turf.booleanWithin(point, bound)
    }).catch(() => getClickLocation(map, modalSignal));
}

/**
 * Get either the user's location in the map or ask them to click
 * Only useful because polygonizing the map for turf is a pain
 * @returns {Promise} resolves with a GeolocationPositionIsh-ish
 */
export async function getLocationOnMap(
    gr: GeolocatedResult,
    map: L.Map,
    modalSignal: Signal<ModalProps>): Promise<GeolocationPositionIsh> {
    return getLocationIf(gr, (position) => {
        const userLatLng = { lat: position.coords.latitude, lng: position.coords.longitude };
        return map.getBounds().contains(userLatLng)
    }).catch(() => getClickLocation(map, modalSignal));
}


/**
 * Shortcut to get current position from cache
 * @param {number} maximumAge the maximum length of time since update to accept
 * @returns {GeolocationPosition}
 */
export function currentPositionRead(gr: GeolocatedResult, maximumAge = 5000): GeolocationPosition {
    // Expire current position if beyond timeout (5s)
    if ((gr.timestamp.value < (Date.now() - maximumAge)) || (gr.coords.value.accuracy > 10)) {
        return undefined;
    }
    return gr.raw.value;
}

/**
 * Shortcut to get current position from cache as a Coordinate
 * @param {number} maximumAge the maximum length of time since update to accept
 * @returns {Coordinate}
 */
export function currentCoordRead(gr: GeolocatedResult, maximumAge = 5000): Coordinate {
    const pos = currentPositionRead(gr, maximumAge);
    if (!pos) return undefined;
    return { x: pos.coords.longitude, y: pos.coords.latitude, crs: "EPSG:4326" };
}