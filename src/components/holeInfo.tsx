

function HoleInfo(props: { hole: Hole, round: Round }) {
    const round = props.round;
    const hole = props.hole;
    let stats = [];
    if (hole) {
        stats.push(`${currentHole.strokes.length} Strokes`);
        if (hole.par) stats.push(`Par ${currentHole.par}`);
        if (hole.handicap) stats.push(`Hcp ${currentHole.handicap}`);
    } else {
        stats.push(round.course);
    }
    let text = stats.join(' | ');
    return <div id="holeStats"> | {text}</div>
}

/**
 * Update a given select element with current hole options
 * @param {number} props.currentHoleIndex
 * @param {Hole[]} props.holes
 */
function HoleSelector(props: { currentHoleIndex: number, holes: Hole[] }) {
    const handleSelect = (e) => holeSelect(parseInt(e.target.value));
    const value = Number.isFinite(props.currentHoleIndex) ? props.currentHoleIndex : -1;
    const selector = (<select id="holeSelector" value={value} onInput={handleSelect}>
        <option value="-1">Overview</option>
        {props.holes.map((hole) => <option value={hole.index} key={hole.id}>{`Hole ${hole.index + 1}`}</option>)}
    </select>);
    return selector;
}

function HoleChangeControl() {
    const holeDec = () => handleHoleIncrement(-1);
    const holeInc = () => handleHoleIncrement(1);
    const element = <span className="holeControls">
        <a href="#" id="holeSelectBack" className="holeSelectNudge" onClick={holeDec}>&lt;</a>
        <HoleSelector currentHoleIndex={currentHole?.index} holes={round.holes} />
        <a href="#" id="holeSelectNext" className="holeSelectNudge" onClick={holeInc}>&gt;</a>
    </span>
    return element
}

function HoleControls(props: { hole: Hole, round: Round }) {
    const id = "holeControlsContainer"
    return <div className="buttonRow" id={id}>
        <HoleChangeControl />
        <HoleInfo hole={props.hole} round={props.round} />
    </div>
}
