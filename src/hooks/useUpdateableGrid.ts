import { useEffect, useRef } from "preact/hooks";

export const useUpdateableGrid = (dep) => {
    const layer = useRef(null);
    useEffect(() => {
        if (layer.current) layer.current.clearLayers().addData(dep);
    }, [dep])
    return layer
}