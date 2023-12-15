import { useContext } from "preact/hooks";
import { currentCoordRead, currentPositionRead } from "common/location";
import { AppContext } from "contexts/appContext";

export const useLocationContext = () => useContext(AppContext)?.geolocationResult
export const useCoordinateContext = () => currentCoordRead(useLocationContext());
export const usePositionContext = () => currentPositionRead(useLocationContext());