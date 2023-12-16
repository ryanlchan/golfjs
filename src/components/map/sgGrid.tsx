import chroma from "chroma-js";
import { ratelimit } from "common/utils";
import { useCourseContext } from "hooks/useCourseContext";
import { useRoundContext } from "hooks/useRoundContext";
import { useStatsContext } from "hooks/useStatsContext";
import { useUpdateableGrid } from "hooks/useUpdateableGrid";
import { useMemo } from "preact/hooks";
import { GeoJSON } from "react-leaflet";
import { erf } from "services/grids";
import { calculateStrokeStatsFast, updateCachedStrokeStats } from "services/stats";
/**
 * Create a Strokes Gained probability grid around the current aim point
 */
export const SGGrid = ({ stroke }: { stroke: Stroke }) => {
    const grid = useMemo(() => useGrid(stroke), [stroke]);
    if (!grid) return;
    const colorscale: chroma.Scale = chroma.scale('RdYlGn').domain([-.25, .15]);
    const alphamid = 1 / grid.features.length;
    const clip = (num, min, max) => Math.min(Math.max(num, min), max)
    const options = {
        style: function (feature) {
            return {
                stroke: false,
                fillColor: colorscale(feature.properties.strokesGained).hex(),
                fillOpacity: clip(feature.properties.probability / alphamid * 0.2, 0.1, 0.7)
            }
        },
        grid: grid,
        zIndex: 2001,
        onEachFeature: addPopupCallback(stroke)
    }
    // Prevent flashing on rerender by just adding/removing data and reusing layer
    const layer = useUpdateableGrid(grid);
    return <GeoJSON ref={layer} key={stroke.id} data={grid} {...options}></GeoJSON>
}

const useGrid = (stroke: Stroke) => {
    const courseData = useCourseContext();
    const roundStore = useRoundContext();
    const statsStore = useStatsContext();
    const calc = ratelimit(() => {
        const context = {
            round: roundStore.data.value,
            courseData: courseData.data.value,
            stats: statsStore.data.value
        }
        const newStats = calculateStrokeStatsFast(stroke, context);
        const oldStats = context.stats.strokes?.find(s => stroke.id == s.id);
        if (!oldStats || oldStats.updatedAt < stroke.updatedAt) {
            updateCachedStrokeStats(newStats, statsStore.data.value)
            statsStore.data.value = { ...statsStore.data.value } // force signal to update
        }
        return newStats.grid;
    }, 100);
    return calc();
}

const addPopupCallback = (stroke) => {
    return (feature, layer) => {
        layer.bindPopup((layer: any) => {
            const props = feature.properties;
            const sg = props.strokesGained;
            const prob = (props.probability * 100);
            const er = erf(props.distanceToAim, 0, stroke.dispersion)
            const ptile = (1 - er) * 100;
            return `SG: ${sg.toFixed(2)}
                    | ${props.terrainType}
                    | Prob: ${prob.toFixed(2)}%
                    | ${ptile.toFixed(1)}%ile`;
        });
    }
}