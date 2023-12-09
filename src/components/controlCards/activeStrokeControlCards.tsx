import { BestAimControl } from "components/controlCards/bestAimControlCard";
import { ClubControl } from "components/controlCards/clubControlCard";
import { DispersionControl } from "components/controlCards/displersionControlCard";
import { AimStatsControls } from "components/controlCards/sgAimControlCard";
import { TerrainControl } from "components/controlCards/terrainControlCard";

export function ActiveStrokeControls(props: { activeStroke: Stroke, round: Round }) {
    if (!props.activeStroke) return;
    return <div id="activeStrokeControls" className="buttonRow">
        <div className="cardContainer hoscro">
            <AimStatsControls stroke={props.activeStroke} round={props.round} />
            <BestAimControl stroke={props.activeStroke} />
            <TerrainControl stroke={props.activeStroke} />
            <ClubControl stroke={props.activeStroke} />
            <DispersionControl stroke={props.activeStroke} />
        </div>
    </div>
}