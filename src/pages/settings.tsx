import { useErrorBoundary, useState } from 'preact/hooks';
import { render } from "preact";

import { roundDelete, roundSelect, roundCreate } from "services/rounds";
import { CourseFeatureCollection, courseCacheDelete } from "services/courses";
import { RoundStore, roundStoreMutator } from 'hooks/roundStore';
import { ClubStore, clubStoreMutator } from "hooks/clubStore";
import { SettingsStore, settingsStoreMutator } from "hooks/settingsStore";
import { DISPLAY_UNIT_KEY, useDisplayUnits } from "hooks/useDisplayUnits";
import { SettingsContext } from "contexts/settingsContext";
import { ErrorModal } from "components/errorModal";
import { ClubEditor } from "components/clubEditor";
import { LoadingPlaceholder } from "components/loadingPlaceholder";
import { RoundsStore, roundsStoreMutator } from "hooks/roundsStore";
import { CoursesStore, coursesStoreMutator } from "hooks/coursesStore";

function RoundEditor({ value, onSave }) {
    const [isEditing, setIsEditing] = useState(false);
    const [code, setCode] = useState(value);

    const onClick = () => { setIsEditing(true); };
    const onChange = (e) => setCode(e.target.value);
    const onBlur = () => {
        try {
            const parsedCode = JSON.parse(code);
            onSave(parsedCode);
            setIsEditing(false);
            setCode(code)
        } catch (e) {
            throw new Error("Invalid round input, disregarding");
        }
    };

    return isEditing ? (
        <textarea className="roundEditor"
            value={code}
            onChange={onChange}
            onBlur={onBlur}
            autoFocus
        />
    ) : (
        <pre onClick={onClick} className="roundEditor">
            <code>{code}</code>
        </pre>
    );
}

function RoundJSONView({ roundStore }: { roundStore: RoundStore }) {
    const [expanded, setExpanded] = useState(false);
    const json = JSON.stringify(roundStore.data.value, null, 2);
    const copy = () => navigator.clipboard.writeText(json);
    const show = () => setExpanded(!expanded);
    const save = (parsed) => roundStore.data.value = parsed;
    return <div className="RoundJSON">
        <div className="buttonRow">
            <h2>Export round data</h2>
            <button onClick={copy}>Copy to clipboard</button>
            <button onClick={show}>Toggle round info</button>
        </div>
        {expanded && <RoundEditor value={json} onSave={save} />}
    </div>
}

function SignaledRoundList({ roundsStore }) {
    return <RoundList initialRounds={roundsStore.data.value} />
}

function RoundList({ initialRounds }: { initialRounds: Round[] }) {
    const [rounds, setRounds] = useState(initialRounds);

    const handleSelectRound = async (round) => {
        await roundSelect(round);
        window.location.href = import.meta.env.BASE_URL;
    };

    const handleDeleteRound = async (round, event) => {
        if (confirm("Are you sure you want to delete this round?")) {
            event.stopPropagation();
            await roundDelete(round);
            setRounds(rounds.filter(el => el.id != round.id));
        }
    };
    return (
        <div className="savedRoundList">
            <h2>Saved Rounds</h2>
            <ul id="savedRoundsList">
                {rounds.map(round => (
                    <RoundListItem key={round.id} round={round} onSelect={() => handleSelectRound(round)}
                        onDelete={(e) => handleDeleteRound(round, e)} />
                ))}
            </ul>
        </div>
    );

}

function RoundListItem({ round, onSelect, onDelete }) {
    return <li key={round.id}>
        <div className="listCell listCellClickable" onClick={onSelect}>
            {`${round.date} - ${round.course} `}
            <div className="listCellControls">
                <button className="linkCircleButton danger" onClick={onDelete}>
                    &#215;
                </button>
            </div>
        </div>
    </li>
}

function SignaledCourseList({ coursesStore }) {
    return <CourseList initialCourses={coursesStore.data.value} />
}

const CourseList = ({ initialCourses }: { initialCourses: CourseFeatureCollection[] }) => {
    const [courseFCs, setCourseFCs] = useState(initialCourses);

    const handleSelectCourse = async (course) => {
        await roundCreate(course).then(roundSelect);
        window.location.href = import.meta.env.BASE_URL;
    };

    const handleDeleteCourse = (course: Course, event: Event) => {
        if (confirm("Are you sure you want to delete this course?")) {
            event.stopPropagation();
            courseCacheDelete(course);
            setCourseFCs(courseFCs.filter(el => el.course?.id != course.id));
        }
    };

    return (
        <div className="savedCoursesList">
            <h2>Saved Courses</h2>
            <ul id="savedCoursesList">
                {courseFCs.map((courseFc, index) => {
                    const course = courseFc.course;
                    return (<CourseListItem course={course} onSelect={() => handleSelectCourse(course)}
                        onDelete={(e) => handleDeleteCourse(course, e)} key={course.id} />)
                })}
            </ul>
        </div>
    );
};

function CourseListItem({ course, onSelect, onDelete }: { course: Course, onSelect: () => void, onDelete: (e: Event) => void }) {
    return <li key={course.id}>
        <div className="listCell listCellClickable" onClick={onSelect}>
            {course.name} {course.id}
            <div className="listCellControls">
                <button className="linkCircleButton danger" onClick={onDelete}>
                    &#215;
                </button>
            </div>
        </div>
    </li >
}

function UnitSelector({ onChange }: { onChange: (e: Event) => void }) {
    const units = useDisplayUnits();
    return <div id="Units">
        <label htmlFor="units">Distance measurement</label>
        <select name="units" id="unitSelect" onChange={onChange} value={units}>
            <option value="yards">Yards</option>
            <option value="meters">Meters</option>
        </select>
    </div>
}

function SettingsPage({ roundsStore, coursesStore, roundStore, clubStore, settingsStore }:
    {
        roundsStore: RoundsStore,
        coursesStore: CoursesStore,
        roundStore: RoundStore,
        clubStore: ClubStore,
        settingsStore: SettingsStore,
    }) {
    const [error, _] = useErrorBoundary();
    const unitChange = (e) => {
        const newUnit = e.target.value;
        settingsStore.set(DISPLAY_UNIT_KEY, newUnit)
    };
    const debug = () => { debugger };
    window.secretdebugfunc = debug;
    return (roundsStore.isLoading.value || coursesStore.isLoading.value || roundStore.isLoading.value) ?
        <LoadingPlaceholder /> :
        (<SettingsContext.Provider value={settingsStore}>
            <div className="settingsPage">
                {error && <ErrorModal message={error} timeout={10} />}
                <RoundJSONView roundStore={roundStore} />
                <SignaledRoundList roundsStore={roundsStore} />
                <SignaledCourseList coursesStore={coursesStore} />
                <h2>Preferences</h2>
                <UnitSelector onChange={unitChange} />
                <h2>Player Clubs</h2>
                <ClubEditor clubStore={clubStore} />
            </div>
        </SettingsContext.Provider>
        )
}

function generateAppState() {
    const roundsStore = roundsStoreMutator();
    const coursesStore = coursesStoreMutator();
    const roundStore = roundStoreMutator();
    const settingsStore = settingsStoreMutator();
    const clubStore = clubStoreMutator(settingsStore);
    roundsStore.load();
    coursesStore.load();
    roundStore.load();
    const props = {
        roundsStore,
        coursesStore,
        roundStore,
        settingsStore,
        clubStore
    }
    return props
}

function handleLoad() {
    const props = generateAppState();
    render(<SettingsPage {...props} />, document.querySelector('body'));
}

window.onload = handleLoad;