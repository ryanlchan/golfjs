import 'preact/debug'
// stats.ts
import * as chroma from "chroma-js";
import { useState } from "preact/hooks";
import { ComponentChildren, JSX, render } from "preact";

import * as cacheUtils from "common/cache";
import { formatDistance, formatDistanceOptions } from 'common/projections';
import { RoundStateManager, roundStateManager } from 'hooks/roundStore';
import { SettingsStore, settingsStateManager } from "hooks/settingsStore";
import { useStats } from "hooks/useStats";
import type { StrokeStats } from 'services/stats';
import { columnizeStrokes, groupBy, reduceStrokeColumns, summarizeStrokeGroups } from "services/stats";
import { useCourse } from "hooks/useCourse";
import { LoadingPlaceholder } from "components/loadingPlaceholder";
import { AppContext } from "contexts/appContext";
import { useDisplayUnits } from 'hooks/useDisplayUnits';
import { roundLoad } from 'services/rounds';

/**
 * **************
 * * Formatters *
 * **************
 */
class BaseFormatter {
    column: any[];
    domain: number[];
    options: Record<string, any>;

    constructor(column: any[], options: Record<string, string> = {}) {
        this.column = column;
        this.options = options;
        this.rowToTD = this.rowToTD.bind(this);
    }

    // Format each row of the StatsColumn as text
    format(value) {
        if (Number.isInteger(value)) {
            return value.toFixed(0);
        } else if (typeof value === 'number') {
            return value.toFixed(3);
        } else if (typeof value === 'string') {
            return value;
        } else if (typeof value === 'object') {
            return explodeCounts(value);
        } else {
            return JSON.stringify(value);
        }
    };

    // Color each row of the StatsColumn, if necessary
    color(row) { return "" };

    // Output row as formatted HTML TD object
    rowToTD(row) {
        return <td style={`color: ${this.color(row)}`} className={this.options?.class}>
            {this.format(row)}
        </td>;
    }

    // Output column as formatted HTML TD objects
    toTDs() { return this.column.map(this.rowToTD) };
}

class StringFormatter extends BaseFormatter {
    format(row) { return row.toString() };
}

class ColorScaleFormatter extends BaseFormatter {
    colorScale: any;

    constructor(column: number[], options: Record<string, string> = {}) {
        super(column, options);
        this.domain = this.calcDomain();
        if (this.domain.some(el => !Number.isFinite(el))) this.domain = [-1, 1]
        this.colorScale = chroma.scale(['red', 'black', 'green']).domain(this.domain);
    }

    // Get the min/max values for this StatsColumn
    calcDomain(): [number, number] { return [Math.min(...this.column), Math.max(...this.column)] };

    color(row) {
        try {
            return this.colorScale(row)
        } catch (e) {
            return "#000";
        }
    };
}

class InvertedColorScaleFormatter extends ColorScaleFormatter {
    constructor(column: number[], options: Record<string, string> = {}) {
        super(column, options);
        this.colorScale = chroma.scale(['green', 'black', 'red']).domain(this.domain);
    }
}

class PercentileScaleFormatter extends ColorScaleFormatter {
    calcDomain(): [number, number] { return [0.2, 0.8] };
    format(row) { return row.toFixed(3); }
}

class DistanceFormatter extends BaseFormatter {
    distOpts: formatDistanceOptions;

    constructor(column: number[], options: Record<string, string> = {}) {
        super(column, options);
    }
    format(row) { return formatDistance(row, this.options['distOpts']) };
}

class InvertedDistanceFormatter extends InvertedColorScaleFormatter {
    distOpts: formatDistanceOptions;

    constructor(column: number[], options: Record<string, string> = {}) {
        super(column, options);
    }
    format(row) { return formatDistance(row, this.options['distOpts']) };
}

class CenteredDistanceFormatter extends DistanceFormatter {
    colorScale: any;

    constructor(column: number[], options: Record<string, string> = {}) {
        super(column, options);
        this.domain = this.calcDomain();
        this.colorScale = chroma.scale(['red', 'black', 'green', 'black', 'red']).domain(this.domain);
    }

    // Get the min/max values for this StatsColumn
    calcDomain(): number[] {
        let max = Math.max(...this.column.map(Math.abs));
        return [-max, 0, max];
    };

    color(row) { return this.colorScale(row) };
}

const summaryMetricFormatters = {
    'category': {
        header: 'Type',
        formatter: BaseFormatter
    }, 'strokes': {
        header: 'Strokes',
        formatter: InvertedColorScaleFormatter
    }, 'strokesGained': {
        header: 'SG',
        formatter: ColorScaleFormatter
    }, 'strokesGainedAvg': {
        header: 'SG (avg)',
        formatter: ColorScaleFormatter
    }, 'strokesGainedPredicted': {
        header: 'SG Predicted',
        formatter: ColorScaleFormatter
    }, 'strokesGainedPredictedAvg': {
        header: 'SG Predicted (avg)',
        formatter: ColorScaleFormatter
    }, 'strokesGainedPercentile': {
        header: 'SG Percentile',
        formatter: PercentileScaleFormatter
    }, 'proximity': {
        header: 'Proximity',
        formatter: InvertedDistanceFormatter
    }, 'proximityCrossTrack': {
        header: 'Proximity Offline',
        formatter: CenteredDistanceFormatter
    }, 'proximityPercentile': {
        header: 'Proximity Percentile',
        formatter: PercentileScaleFormatter
    }, 'distanceToAim': {
        header: 'To Aim',
        formatter: DistanceFormatter
    }, 'distanceToActual': {
        header: 'To Actual',
        formatter: DistanceFormatter
    }, 'terrain': {
        header: 'terrain',
        formatter: BaseFormatter
    }, 'club': {
        header: 'Club',
        formatter: BaseFormatter
    }, 'hole': {
        header: 'Hole',
        formatter: BaseFormatter
    }, 'index': {
        header: 'Stroke',
        formatter: BaseFormatter
    }, 'strokesRemaining': {
        header: 'Strokes predicted',
        formatter: ColorScaleFormatter
    }
}

/**
 * Views
 */
const defaultStrokeStatsMetrics = ['hole', 'index', 'club', 'terrain', 'distanceToAim', 'distanceToActual', 'strokesGained', 'strokesGainedPredicted', 'strokesGainedPercentile', 'proximity', 'proximityCrossTrack', 'proximityPercentile'];
const defaultSummaryStatsMetrics = ['strokes', 'strokesGained', 'strokesGainedPredicted', 'strokesGainedAvg', 'strokesGainedPredictedAvg', 'strokesGainedPercentile', 'proximity', 'proximityCrossTrack', 'proximityPercentile'];

function TableHeaders({ headers }: { headers: string[] }) {
    return <thead><tr>
        {headers.map(header => (<th key={header}>{header}</th>))}
    </tr></thead>
}

function ExpansionRow({ expansion, onClick, children, ...others }: {
    expansion: JSX.Element,
    onClick?: () => void,
    children?: ComponentChildren,
    [others: string]: any
}) {
    return <>
        <tr className={expansion ? "selected" : ""} onClick={onClick} {...others}>
            {children}
        </tr>
        {expansion && (
            <tr className="expanded"><td colSpan={1000}>
                {expansion}
            </td></tr>
        )}
    </>
}
function ColumnTable({ headers, columns, footers, expansions, ...others }: { headers: string[], columns: JSX.Element[][], footers?: JSX.Element[], expansions?: JSX.Element[], [others: string]: any }) {
    const [selected, setSelected] = useState(null);
    const onRowClick = (rowIndex) => {
        if (selected == rowIndex) { setSelected(-1); }
        else { setSelected(rowIndex); }
    }
    expansions = expansions || [];
    return (
        <table {...others}>
            <TableHeaders headers={headers} />
            <tbody>
                {columns[0].map((_, rowIndex) => (
                    <ExpansionRow key={rowIndex} children={columns.map(column => column[rowIndex])}
                        expansion={(rowIndex == selected) && expansions[rowIndex]}
                        onClick={() => onRowClick(rowIndex)} />
                ))}
                {footers && (
                    <ExpansionRow key="totals" children={footers} className="totals"
                        expansion={("totals" == selected) && expansions[columns[0].length]}
                        onClick={() => onRowClick("totals")} />
                )}
            </tbody>
        </table>
    );
};

const strokeStatsTableDefaultOptions = {
    metrics: defaultStrokeStatsMetrics,
    sortBy: (a, b) => a.holeIndex * 100 + a.index - b.holeIndex * 100 - b.index,
    includeTotals: true,
};
function StrokeStatsTable({ input, options = strokeStatsTableDefaultOptions }) {
    options = { ...strokeStatsTableDefaultOptions, ...options };
    const metrics = options.metrics;
    const sortedInput = [...input].sort(options.sortBy);
    const headers = metrics.map(col => summaryMetricFormatters[col]['header']);
    const columns = columnizeStrokes(sortedInput, metrics);
    const displayUnits = useDisplayUnits();
    const distOptions: formatDistanceOptions = { to_unit: displayUnits, include_unit: true };
    const formatters = metrics.map((col, colIx) => {
        const formatterClass = summaryMetricFormatters[col]['formatter'];
        const options = { distOptions, class: col }
        return new formatterClass(columns[colIx], options)
    });
    const dataFrame = formatters.map(formatter => formatter.toTDs());

    let totalsRow = null;
    if (options.includeTotals) {
        const totals = reduceStrokeColumns(columns, metrics);
        totalsRow = formatters.map((formatter, colIx) => formatter.rowToTD(totals[colIx]));
    };
    return (
        <ColumnTable headers={headers} columns={dataFrame} footers={totalsRow} />
    );
}

interface GroupedPivotTableProps {
    input: StrokeStats[],
    groupedBy: string | ((stat: StrokeStats) => string),
    metrics?: string[],
    sortBy?: (a, b) => number,
    includeTotals?: boolean,
    expandable?: boolean,
    groupName?: string,
    [others: string]: any
}
function GroupedPivotTable({ input,
    groupedBy: groupedBy,
    metrics = defaultSummaryStatsMetrics,
    sortBy = (a, b) => a - b,
    includeTotals = true,
    expandable = true,
    groupName = "Group",
    ...others }: GroupedPivotTableProps
) {
    if (!input) return;
    const groups = groupBy(input, groupedBy);
    const groupKeys = Object.keys(groups).sort(sortBy);
    const groupSummaries = summarizeStrokeGroups(groups);
    const groupSummariesArray = groupKeys.map((key) => groupSummaries[key]);
    const groupFormatter = new BaseFormatter(groupKeys, { class: "groupBy" });
    const headers = [groupName, ...metrics.map((col) => summaryMetricFormatters[col]['header'])];
    const columns = metrics.map((colID) => groupSummariesArray.map((summary) => summary[colID]));
    const displayUnits = useDisplayUnits();
    const distOptions: formatDistanceOptions = { to_unit: displayUnits, include_unit: true };
    const formatters = columns.map((col, colIx) => {
        const formatterClass = summaryMetricFormatters[metrics[colIx]]['formatter'];
        const options = { distOptions, class: metrics[colIx] }
        return new formatterClass(col, options)
    });
    const dataFrame = [groupFormatter.toTDs(), ...formatters.map((fmt) => fmt.toTDs())];
    const classes = "statsPivotTable statsTable";
    let footers;
    if (includeTotals) {
        const totalColumns = columnizeStrokes(input, metrics);
        const totals = reduceStrokeColumns(totalColumns, metrics);
        footers = <>
            <td>Totals</td>
            {formatters.map((formatter, colIx) => formatter.rowToTD(totals[colIx]))}
        </>
    }

    let expansions = []
    if (expandable) {
        expansions = groupKeys.map((key) => <StrokeStatsTable input={groups[key]} />);
        if (includeTotals) expansions.push(<StrokeStatsTable input={input} />);
    }
    return <ColumnTable headers={headers} columns={dataFrame}
        footers={footers} className={classes} expansions={expansions} {...others} />;
}

function BreakdownTable({ stats }: { stats: StrokeStats[] }) {
    const summaryOrder = ["putts", "chips", "approaches", "drives"];
    const sortBy = (a, b) => summaryOrder.indexOf(a) - summaryOrder.indexOf(b);
    return <GroupedPivotTable input={stats} groupedBy="category" sortBy={sortBy}
        groupName="type" id="breakdownViewTable" />
}

function HoleTable({ stats }: { stats: StrokeStats[] }) {
    const groupByFunc = (ss) => ss.holeIndex + 1;
    return <GroupedPivotTable input={stats} groupedBy={groupByFunc}
        groupName="Hole" id="holeViewTable" />
}

function explodeCounts(obj: object): JSX.Element {
    let counts = Object.entries(obj);
    counts.sort((a, b) => a[1] - b[1]);
    return <>
        {counts.map(([key, count]) => <span>{key}:&nbsp;{count}, </span>)}
    </>
}

function jsonToCSV(input: any[]): string {
    const replacer = (_: any, value: any) => value === null ? '' : value;
    const csvRows: string[] = [];

    const extractData = (obj: any, parentKey = '', row: any = null) => {
        let rowData = row || {};
        for (const key in obj) {
            if (!obj.hasOwnProperty(key)) {
                continue;
            }
            const fullKey = parentKey ? `${parentKey}.${key}` : key;
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                rowData = extractData(obj[key], fullKey, rowData);
            } else {
                rowData[fullKey] = JSON.stringify(obj[key], replacer);
            }
        }
        return rowData;
    };

    const rowData = input.map((obj) => extractData(obj));
    const headers = Object.keys(rowData[0]);
    csvRows.push(headers.join(','));
    rowData.forEach(rowData => {
        const row = headers.map(header => rowData[header] || '');
        csvRows.push(row.join(','));
    });

    return csvRows.join('\r\n');
}

function downloadCSV(jsonArray: any[], filename: string = 'data.csv'): void {
    const csvData = jsonToCSV(jsonArray);
    const blob = new Blob([csvData], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function StatsTitle({ roundStore, downloadHandler }:
    {
        roundStore: RoundStateManager,
        downloadHandler: () => void,
    }) {
    const roundDate = new Date(roundStore.data.value?.date);
    return <div id="roundTitleContainer">
        <h1>
            <span id="roundTitle">{roundStore.data.value?.course}</span>
            <a id="downloadAsCSV" href="#" className="undecorated" title="Download as CSV">&#10515;</a>
        </h1>
        <p className="subtext">{roundDate.toLocaleString()}</p>
    </div>
}

function StatsPage({ settingsStore, roundStore }: { settingsStore: SettingsStore, roundStore: RoundStateManager }) {
    const courseStore = useCourse(roundStore);
    const statsStore = useStats(roundStore, courseStore);
    const round = roundStore.data?.value;
    const appState = { settingsStore };
    const roundDate = new Date(round?.date);
    const roundDateString = [roundDate.getFullYear(), roundDate.getMonth(), roundDate.getDate(), roundDate.getHours(), roundDate.getMinutes()].join('');
    const filename = `${round?.course}_${roundDateString}.csv`.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const download = () => downloadCSV(statsStore.data.value?.strokes, filename);
    window.secretdebug = () => { debugger };
    return (roundStore.isLoading.value || statsStore.isLoading.value) ?
        (<LoadingPlaceholder />) :
        (< AppContext.Provider value={appState} >
            <div className="statsPage">
                <StatsTitle roundStore={roundStore} downloadHandler={download} />
                <div className="bodyContainer">
                    <h2>Strokes gained by type</h2>
                    <BreakdownTable stats={statsStore.data.value.strokes} />
                    <h2>Strokes gained by hole</h2>
                    <HoleTable stats={statsStore.data.value.strokes} />
                </div>
            </div>
        </AppContext.Provider >
        )
}

function generateStatsState() {
    const settingsStore = settingsStateManager();
    const roundStore = roundStateManager();
    roundStore.load();
    return { settingsStore, roundStore }
}
async function generateView() {
    await cacheUtils.init();
    const state = generateStatsState();
    render(<StatsPage {...state} />, document.querySelector('body'))
}

async function regenerateView() {
    generateView();
}

function handleLoad() {
    generateView();
}
window.onload = handleLoad;
