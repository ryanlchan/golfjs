import { BestAimControl } from "components/controlCards/bestAimControlCard";
import { ClubControl } from "components/controlCards/clubControlCard";
import { DispersionControl } from "components/controlCards/displersionControlCard";
import { AimStatsControls } from "components/controlCards/sgAimControlCard";
import { TerrainControl } from "components/controlCards/terrainControlCard";
import { IdStateManager, type StateManager } from "hooks/core";
import { type StrokesStateManager } from "hooks/strokesStore";
import { type RoundStatsCache } from "services/stats";

export function ActiveStrokeControls({ stroke, strokesStateManager, statsStateManager, gridManager }:
    {
        stroke: Stroke,
        strokesStateManager: StrokesStateManager,
        statsStateManager: StateManager<RoundStatsCache>,
        gridManager: IdStateManager
    }
) {
    if (!stroke) return;
    return <div id="activeStrokeControls" className="buttonRow">
        <div className="cardContainer hoscro">
            <AimStatsControls stroke={stroke} statsStateManager={statsStateManager} />
            <BestAimControl stroke={stroke} />
            <TerrainControl stroke={stroke} />
            <ClubControl stroke={stroke} />
            <DispersionControl stroke={stroke} />
        </div>
    </div>
}