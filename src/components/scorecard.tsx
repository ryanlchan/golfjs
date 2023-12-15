import { scoreClass } from "common/utils";
import { useHolesStateManagerContext } from "hooks/useActiveHolesContext";
import { getParFromRound, getStrokesFromRound } from "services/rounds";

/**
 * Scorecard helpers
 */
interface ScorecardTDProps { hole: Hole }
function HoleTD(props: ScorecardTDProps) {
    const hole = props.hole;
    return <td key={[hole.id, "Hole"].join()}>{(hole.index + 1)}</td>
}

function HdcpTD(props: ScorecardTDProps) {
    const hole = props.hole;
    return <td key={[hole.id, "Hdcp"].join()}>{hole.handicap || ""}</td>
}

function ParTD(props: ScorecardTDProps) {
    const hole = props.hole;
    return <td key={[hole.id, "Par"].join()}>{hole.par || ""}</td>
}

function ScoreTD(props: ScorecardTDProps) {
    const hole = props.hole;
    const strokes = hole.strokes.length;
    const par = hole.par || 0;
    const { text, relative } = formatRelativePar(strokes, par);
    return par ?
        <td key={[hole.id, "Score"].join()} className={scoreClass(relative)}>{text}</td> :
        <td key={[hole.id, "Score"].join()}>{strokes}</td>;
}

function ScorecardRow(props: { hole: Hole, holeCol?: boolean, hdcpCol?: boolean, parCol?: boolean, scoreCol?: boolean }) {
    const opts = {
        holeCol: props.holeCol ?? true,
        hdcpCol: props.hdcpCol ?? true,
        parCol: props.parCol ?? true,
        scoreCol: props.scoreCol ?? true,
    };
    const hole = props.hole;
    const key = ['row', hole.id].join();
    const holeSelect = useHoleSelectCallback(hole);
    return (<tr key={key} onClick={holeSelect}>
        {opts.holeCol && <HoleTD hole={hole} />}
        {opts.parCol && <ParTD hole={hole} />}
        {opts.hdcpCol && <HdcpTD hole={hole} />}
        {opts.scoreCol && <ScoreTD hole={hole} />}
    </tr>);
}

function HoleTotalTD() {
    return <td key="hole-total">Total</td>;
}
function HdcpTotalTD() {
    return <td key="hdcp-total"></td>;
}
function ParTotalTD(props: { round: Round }) {
    const round = props.round;
    return <td key="par-total">{round.holes?.reduce((acc, hole) => acc + hole.par, 0)}</td>
}
function ScoreTotalTD(props: { round: Round }) {
    const round = props.round;
    const strokes = getStrokesFromRound(round).length;
    const par = getParFromRound(round);
    const { text, relative } = formatRelativePar(strokes, par);
    return par ?
        <td key="score-total" className={scoreClass(relative)}>{text}</td> :
        <td key="score-total">{strokes}</td>;
}

function ScorecardTotalRow(props: { round: Round, holeCol?: boolean, hdcpCol?: boolean, parCol?: boolean, scoreCol?: boolean }) {
    const opts = {
        holeCol: props.holeCol ?? true,
        hdcpCol: props.hdcpCol ?? true,
        parCol: props.parCol ?? true,
        scoreCol: props.scoreCol ?? true,
    };
    return <tr className="totals">
        {opts.holeCol && <HoleTotalTD />}
        {opts.parCol && <ParTotalTD round={props.round} />}
        {opts.hdcpCol && <HdcpTotalTD />}
        {opts.scoreCol && <ScoreTotalTD round={props.round} />}
    </tr>
}

/**
 * Create a scorecard as table
 */
export function Scorecard(props: { round: Round }) {
    const scoringRound = props.round;
    const holeCol = true;
    const hdcpCol = !!props.round?.holes?.at(0).handicap;
    const parCol = !!props.round?.holes?.at(0).par
    const scoreCol = true;

    return (<table className="scorecard">
        <thead><tr>
            {holeCol && <td>Hole</td>}
            {hdcpCol && <td>Hdcp</td>}
            {parCol && <td>Par</td>}
            {scoreCol && <td>Score</td>}
        </tr></thead>
        <tbody>
            {scoringRound.holes?.map((hole) =>
                <ScorecardRow key={hole.id} {...{ hole, holeCol, hdcpCol, parCol, scoreCol }} />
            )}
            <ScorecardTotalRow round={scoringRound} {...{ holeCol, hdcpCol, parCol, scoreCol }} />
        </tbody>
    </table>);
}

const useHoleSelectCallback = (hole) => {
    const hsm = useHolesStateManagerContext();
    return () => hsm.activateOnly(hole.id);
}

const formatRelativePar = (strokes, par) => {
    const relative = strokes - par;
    const text = `${strokes} (${relative >= 0 ? "+" : ""}${relative})`;
    return { text, relative }
}