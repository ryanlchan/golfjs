import { BestAimControl } from "./bestAimControlCard";
import { ClubControl } from "./clubControlCard";
import { DispersionControl } from "./displersionControlCard";
import { AimStatsControls } from "./sgAimControlCard";
import { TerrainControl } from "./terrainControlCard";

function ActiveStrokeControls(props: { activeStroke: Stroke, round: Round }) {
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