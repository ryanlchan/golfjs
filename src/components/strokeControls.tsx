import { strokesStore } from "hooks/strokesStore";
import { useActiveHolesContext } from "hooks/useActiveHolesContext"
import { useActiveStrokesContext } from "hooks/useActiveStrokesContext"
import { useRoundContext } from "hooks/useRoundContext";
import { ActiveStrokeControls } from "components/controlCards/activeStrokeControlCards";
import { StrokeStatsList } from "components/strokeStatsList";

export const StrokeControls = () => {
    const roundStore = useRoundContext();
    const round = roundStore.data.value;
    const activeStrokes = useActiveStrokesContext(round);
    const activeHoles = useActiveHolesContext(round);
    const sstore = strokesStore(roundStore);
    return <div className="StrokeAndHoleControls">
        {activeStrokes.map(stroke =>
            <ActiveStrokeControls key={stroke.id} stroke={stroke} strokesStore={sstore} />
        )}
        <hr />
        {activeHoles.map(hole =>
            <StrokeStatsList strokes={hole.strokes} strokesStore={sstore} />
        )}
    </div>
}