import { BestAimControl } from "components/controlCards/bestAimControlCard";
import { ClubControl } from "components/controlCards/clubControlCard";
import { DispersionControl } from "components/controlCards/displersionControlCard";
import { SGAimControlCard } from "components/controlCards/sgAimControlCard";
import { TerrainControl } from "components/controlCards/terrainControlCard";
import { useStrokesStateManagerContext } from "hooks/useActiveStrokesContext";
import { useStatsContext } from "hooks/useStatsContext";
import { type StrokesStore } from "hooks/strokesStore";
import { useErrorBoundary } from "preact/hooks";

export function ActiveStrokeControls({ stroke, strokesStore }:
    {
        stroke: Stroke,
        strokesStore: StrokesStore,
    }
) {
    const [error, clearError] = useErrorBoundary();
    const strokeManager = useStrokesStateManagerContext();
    const statsStore = useStatsContext();
    return < div id="activeStrokeControls" className="buttonRow" >
        <div className="cardContainer hoscro">
            <SGAimControlCard stroke={stroke} statsStore={statsStore} onGrid={strokeManager.activateOnlyGrid} />
            <BestAimControl stroke={stroke} statsStore={statsStore} onGrid={strokeManager.activateOnlyGrid} />
            <TerrainControl stroke={stroke} strokesStore={strokesStore} />
            <ClubControl stroke={stroke} strokesStore={strokesStore} />
            <DispersionControl stroke={stroke} strokesStore={strokesStore} />
        </div>
    </div >
}