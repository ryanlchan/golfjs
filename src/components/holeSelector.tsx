import { HoleInfo } from "components/holeInfo";
import { type RoundStore } from "hooks/roundStore";
import { useActiveHolesContext, useHolesStateManagerContext } from "hooks/useActiveHolesContext";
import { getHoleFromRound } from "services/rounds";
import { Scorecard } from "./scorecard";

/**
 * Update a given select element with current hole options
 * @param {number} currentHoleIndex
 * @param {Hole[]} holes
 */
function HoleSelector({ currentHoleIndex, holes, onSelect }:
    { currentHoleIndex: number, holes: Hole[], onSelect: (hole: number) => void }
) {
    const handleSelect = (e) => onSelect(parseInt(e.target.value));
    const value = Number.isFinite(currentHoleIndex) ? currentHoleIndex : -1;
    const selector = (<select id="holeSelector" value={value} onInput={handleSelect}>
        <option value="-1">Overview</option>
        {holes.map((hole) => <option value={hole.index} key={hole.id}>{`Hole ${hole.index + 1}`}</option>)}
    </select>);
    return selector;
}

function HoleChangeControl({ currentHoleIndex, holes, onSelect }:
    { currentHoleIndex: number, holes: Hole[], onSelect: (hole: number) => void }
) {
    const holeDec = () => onSelect(currentHoleIndex - 1);
    const holeInc = () => onSelect(currentHoleIndex + 1);
    const element = <span className="holeControls">
        <a href="#" id="holeSelectBack" className="holeSelectNudge" onClick={holeDec}>&lt;</a>
        <HoleSelector {...{ currentHoleIndex, holes, onSelect }} />
        <a href="#" id="holeSelectNext" className="holeSelectNudge" onClick={holeInc}>&gt;</a>
    </span>
    return element
}

export function HoleChangeControls({ roundStore }:
    { roundStore: RoundStore }
) {
    const hole = useLastActiveHole(roundStore.data.value);
    const onSelect = useHoleSelector(roundStore);
    const round = roundStore.data.value;
    const index = hole ? hole.index : -1;
    return <div className="buttonRow" id="holeControlsContainer">
        <HoleChangeControl currentHoleIndex={index}
            holes={round.holes} onSelect={onSelect} />
        <HoleInfo hole={hole} round={round} />
    </div>
}

export function ActiveHoleControls({ roundStore }) {
    const hole = useLastActiveHole(roundStore.data.value);
    return <div className="StrokeAndHoleControls">
        <HoleChangeControls roundStore={roundStore} />
        {!hole && <Scorecard round={roundStore.data.value} />}
    </div>
}

/**
 * Logic
 */

const useHoleSelector = (roundStore: RoundStore) => {
    const holeStateManager = useHolesStateManagerContext();
    return (num) => {
        const h = getHoleFromRound(roundStore.data.value, num);
        h ? holeStateManager.activateOnly(h.id) : holeStateManager.deactivateAll();
    }
}

const useLastActiveHole = (round): Hole => {
    return useActiveHolesContext(round).at(-1);
}