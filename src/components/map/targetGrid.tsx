import chroma from "chroma-js";
import { useCourseContext } from "hooks/useCourseContext";
import { useRoundContext } from "hooks/useRoundContext";
import { useStatsContext, useStrokeStatsContext } from "hooks/useStatsContext";
import { GeoJSON } from "react-leaflet";
import { erf } from "services/grids";
import { getHoleFromRound } from "services/rounds";
import { calculateStrokeStats, calculateStrokeStatsFast } from "services/stats";
/**
 * Create a Strokes Gained probability grid around the current aim point
 */
export const SGGrid = ({ stroke }: { stroke: Stroke }) => {
    const grid = useGrid(stroke);
    if (!grid) return;
    // Create alpha/colorscale
    const colorscale: chroma.Scale = chroma.scale('RdYlGn').domain([-.25, .25]);
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
        grid: grid
    }

    return <GeoJSON key={stroke.id} data={grid} {...options}></GeoJSON>
}

const useGrid = (stroke: Stroke) => {
    const stats = useStrokeStatsContext(stroke);
    if (stats?.grid) return stats?.grid
    const courseData = useCourseContext();
    const roundStore = useRoundContext();
    const statsStore = useStatsContext();
    const context = {
        round: roundStore.data.value,
        courseData: courseData.data.value,
        stats: statsStore.data.value
    }
    const newStats = calculateStrokeStats(stroke, context);
    statsStore.data.value.strokes.push(newStats);
    return newStats.grid;
}

const addPopupCallback = (stroke) => {
    return (feature, layer) => {
        layer.bindPopup((layer: any) {
            const props = feature.properties;
            const wsg = props.weightedStrokesGained;
            const rwsg = props.relativeStrokesGained;
            return `SG: ${wsg.toFixed(2)}
                        | vs Aim: ${rwsg.toFixed(2)}`
        });
    }
}
