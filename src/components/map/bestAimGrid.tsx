import { batch } from "@preact/signals";
import chroma from "chroma-js";
import { ratelimit } from "common/utils";
import { useCourseContext } from "hooks/useCourseContext";
import { useRoundContext } from "hooks/useRoundContext";
import { useStatsContext, useStrokeStatsContext } from "hooks/useStatsContext";
import { useUpdateableGrid } from "hooks/useUpdateableGrid";
import { useEffect, useRef } from "preact/hooks";
import { GeoJSON } from "react-leaflet";
import { calculateStrokeStats, saveStrokeStats, updateCachedStrokeStats } from "services/stats";
/**
 * Create a Strokes Gained probability grid around the current aim point
 */
export const BestAimGrid = ({ stroke }: { stroke: Stroke }) => {
    const grid = useGrid(stroke);
    if (!grid) return;
    // Create alpha/colorscale
    const colorscale: chroma.Scale = chroma.scale('RdYlGn').domain([-.25, .25]);
    const bestCell = grid.properties.idealStrokesGained;
    const options = {
        style: function (feature) {
            const ideal = feature.properties.weightedStrokesGained == bestCell;
            if (ideal) {
                return {
                    stroke: true,
                    fillColor: "#FFD700",
                    fillOpacity: 0.8
                }
            }
            return {
                stroke: false,
                fillColor: colorscale(feature.properties.relativeStrokesGained).hex(),
                fillOpacity: 0.5
            }
        },
        grid: grid,
        onEachFeature: addPopupCallback(stroke)
    }
    // Prevent flashing on rerender by just adding/removing data and reusing layer
    const layer = useUpdateableGrid(grid);
    useEffect(() => {
        if (layer.current) layer.current.setStyle(options.style);
    }, [grid])

    return <GeoJSON ref={layer} key={stroke.id} data={grid} {...options}></GeoJSON>
}

const useGrid = (stroke: Stroke) => {
    const stats = useStrokeStatsContext(stroke);
    if (stats?.grid && stats.grid.properties.idealStrokesGained) return stats.grid
    const calcStats = ratelimit(() => {
        const courseData = useCourseContext();
        const roundStore = useRoundContext();
        const statsStore = useStatsContext();
        const context = {
            round: roundStore.data.value,
            courseData: courseData.data.value,
            stats: statsStore.data.value
        }
        const newStats = calculateStrokeStats(stroke, context);
        batch(() => {
            const cache = statsStore.data.value;
            updateCachedStrokeStats(newStats, cache);
            statsStore.data.value = { ...statsStore.data.value };
            saveStrokeStats(newStats);
        })
        return newStats.grid;
    }, 750)
    return calcStats();
}

const addPopupCallback = (stroke) => {
    return (feature, layer) => {
        layer.bindPopup(() => {
            const props = feature.properties;
            const wsg = props.weightedStrokesGained;
            const rwsg = props.relativeStrokesGained;
            return `SG: ${wsg.toFixed(2)}
                        | vs Aim: ${rwsg.toFixed(2)}`
        });
    }
}
