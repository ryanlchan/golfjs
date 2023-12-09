export function HoleInfo(props: { hole: Hole, round: Round }) {
    const round = props.round;
    const hole = props.hole;
    let stats = [];
    if (hole) {
        stats.push(`${hole.strokes.length} Strokes`);
        if (hole.par) stats.push(`Par ${hole.par}`);
        if (hole.handicap) stats.push(`Hcp ${hole.handicap}`);
    } else {
        stats.push(round.course);
    }
    let text = stats.join(' | ');
    return <div id="holeStats"> | {text}</div>
}
