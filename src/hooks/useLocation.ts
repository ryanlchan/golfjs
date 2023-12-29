import { Signal, batch, effect, useComputed, useSignal } from "@preact/signals";
import { useCallback, useEffect } from "preact/hooks";
/**
 * The configuration options.
 */
export interface GeolocatedConfig {
    /**
     * The Geolocation API's positionOptions configuration object.
     */
    positionOptions?: PositionOptions;
    /**
     * Time we give to the user to allow the use of Geolocation API before presuming they denied it.
     * @default undefined
     */
    userDecisionTimeout?: number;
    /**
     * The implementer of the Geolocation API.
     * @default navigator.geolocation
     */
    geolocationProvider?: Geolocation;
    /**
     * If set to true, the component does not query the Geolocation API on mount. You must use the getLocation method yourself.
     * @default false
     */
    suppressLocationOnMount?: boolean;
    /**
     * If set to true, the component watches for position changes periodically.
     * @default false
     */
    watchPosition?: boolean;
    /**
     * Allows to set the default value of isGeolocationEnabled.
     * @default true
     */
    isOptimisticGeolocationEnabled?: boolean;
    /**
     * If set to true, the component watches for location permission changes.
     * @default false
     */
    watchLocationPermissionChange?: boolean;
    /**
     * Callback to call when geolocation API invocation fails. Called with undefined when the user decision times out.
     */
    onError?: (positionError?: GeolocationPositionError) => void;
    /**
     * Callback to call when geolocation API invocation succeeds.
     */
    onSuccess?: (position: GeolocationPosition) => void;
}
/**
 * Result of the hook.
 */
export interface GeolocatedResult {
    /**
     * The Geolocation API's coords object containing latitude, longitude, and accuracy and also optionally containing altitude, altitudeAccuracy, heading and speed.
     */
    coords: Signal<GeolocationCoordinates | undefined>;
    /**
     * The Geolocation API's timestamp value representing the time at which the location was retrieved.
     */
    timestamp: Signal<EpochTimeStamp | undefined>;
    /**
     * Flag indicating that the browser supports the Geolocation API.
     */
    isGeolocationAvailable: Signal<boolean>;
    /**
     * Flag indicating that the user has allowed the use of the Geolocation API. It optimistically presumes they did until they either explicitly deny it or userDecisionTimeout (if set) has elapsed and they haven't allowed it yet.
     */
    isGeolocationEnabled: Signal<boolean>;
    /**
     * The Geolocation API's PositionError object resulting from an error occurring in the API call.
     */
    positionError: Signal<GeolocationPositionError | undefined>;
    /**
     * Callback you can use to manually trigger the position query.
     */
    getPosition: () => void;
    /**
     * The raw GeolocationPosition object
     */
    raw: Signal<GeolocationPosition>;
}


const GeoPosError = (message, code) => {
    return {
        code: code,
        message: message,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3
    }
}

/**
 * Hook abstracting away the interaction with the Geolocation API.
 * @param config - the configuration to use
 * Adapted from https://www.npmjs.com/package/react-geolocated for preact signals
 */
export function useGeolocated(config = {} as GeolocatedConfig): GeolocatedResult {
    const {
        positionOptions = {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: Infinity,
        },
        isOptimisticGeolocationEnabled = true,
        userDecisionTimeout = undefined,
        suppressLocationOnMount = false,
        watchPosition = false,
        geolocationProvider = typeof navigator !== "undefined"
            ? navigator.geolocation
            : undefined,
        watchLocationPermissionChange = false,
        onError,
        onSuccess,
    } = config;
    const userDecisionTimeoutId = useSignal(0);
    const isCurrentlyMounted = useSignal(true);
    const watchId = useSignal(0);
    const isGeolocationEnabled = useSignal(isOptimisticGeolocationEnabled);
    const coords = useSignal<GeolocationCoordinates>(null);
    const timestamp = useSignal<EpochTimeStamp>(null);
    const positionError = useSignal<GeolocationPositionError>(null);
    const permissionState = useSignal<PermissionState>(null);
    const isGeolocationAvailable = useComputed(() => {
        return !!(Boolean(geolocationProvider) && isGeolocationEnabled.value && coords.value)
    });
    const raw = useSignal(null as GeolocationPosition);
    const cancelUserDecisionTimeout = useCallback(() => {
        if (userDecisionTimeoutId.value) {
            window.clearTimeout(userDecisionTimeoutId.value);
        }
    }, []);
    const handlePositionError = useCallback((error) => {
        cancelUserDecisionTimeout();
        if (isCurrentlyMounted.value) {
            batch(() => {
                coords.value = undefined;
                isGeolocationEnabled.value = false;
                positionError.value = error;
            })
        }
        onError === null || onError === void 0 ? void 0 : onError(error);
    }, [onError, cancelUserDecisionTimeout]);
    const handlePositionSuccess = useCallback((position) => {
        cancelUserDecisionTimeout();
        if (isCurrentlyMounted.value) {
            batch(() => {
                coords.value = position.coords;
                timestamp.value = position.timestamp;
                isGeolocationEnabled.value = true;
                positionError.value = undefined;
                raw.value = position;
            });
        }
        onSuccess === null || onSuccess === void 0 ? void 0 : onSuccess(position);
    }, [onSuccess, cancelUserDecisionTimeout]);
    const getPosition = useCallback(() => {
        if (!geolocationProvider?.getCurrentPosition ||
            !geolocationProvider?.watchPosition) {
            throw new Error("The provided geolocation provider is invalid");
        }
        if (userDecisionTimeout) {
            userDecisionTimeoutId.value = window.setTimeout(() => {
                handlePositionError(GeoPosError("User input timed out", 3));
            }, userDecisionTimeout);
        }
        if (watchPosition) {
            watchId.value = geolocationProvider.watchPosition(handlePositionSuccess, handlePositionError, positionOptions);
        }
        else {
            geolocationProvider.getCurrentPosition(handlePositionSuccess, handlePositionError, positionOptions);
        }
    }, [
        geolocationProvider,
        watchPosition,
        userDecisionTimeout,
        handlePositionError,
        handlePositionSuccess,
        positionOptions,
    ]);
    effect(() => {
        let permission;
        if (watchLocationPermissionChange &&
            geolocationProvider &&
            "permissions" in navigator) {
            navigator.permissions
                .query({ name: "geolocation" })
                .then((result) => {
                    permission = result;
                    permission.onchange = () => {
                        permissionState.value = permission.state;
                    };
                })
                .catch((e) => {
                    console.error("Error updating the permissions", e);
                });
        }
        return () => {
            if (permission) {
                permission.onchange = null;
            }
        };
    }); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!suppressLocationOnMount) {
            getPosition();
        }
        return () => {
            cancelUserDecisionTimeout();
            if (watchPosition && watchId.value) {
                geolocationProvider === null || geolocationProvider === void 0 ? void 0 : geolocationProvider.clearWatch(watchId.value);
            }
        };
    }, [permissionState.value]); // eslint-disable-line react-hooks/exhaustive-deps
    return {
        getPosition,
        coords,
        timestamp,
        isGeolocationEnabled,
        isGeolocationAvailable,
        positionError,
        raw
    };
}