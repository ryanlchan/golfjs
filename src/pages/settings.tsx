import { signal } from "@preact/signals";
import useSWR from "swr";
import { useErrorBoundary, useState } from 'preact/hooks';
import { render } from "preact";

import { roundDelete, roundLoadAll, roundSelect, roundCreate } from "services/rounds";
import { CourseFeatureCollection, courseCacheAll, courseCacheDelete } from "services/courses";
import { RoundStore, initRoundStore } from 'hooks/roundStore';
import { initClubStore } from "hooks/clubStore";
import { initSettingsStore } from "hooks/settingsStore";
import { DISPLAY_UNIT_KEY, useDisplayUnits } from "hooks/useDisplayUnits";
import { SettingsContext } from "contexts/settingsContext";
import { ErrorModal } from "components/errorModal";
import { ClubEditor } from "components/clubEditor";
import { LoadingPlaceholder } from "components/loadingPlaceholder";

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
    const json = JSON.stringify(roundStore.round.value, null, 2);
    const copy = () => navigator.clipboard.writeText(json);
    const show = () => setExpanded(!expanded);
    const save = (parsed) => roundStore.round.value = parsed;
    return <div className="RoundJSON">
        <div className="buttonRow">
            <h2>Export round data</h2>
            <button onClick={copy}>Copy to clipboard</button>
            <button onClick={show}>Toggle round info</button>
        </div>
        {expanded && <RoundEditor value={json} onSave={save} />}
    </div>
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

function SettingsPage({ roundsState, coursesState, roundStore, clubStore, settingsStore }) {
    const [error, _] = useErrorBoundary();
    if (roundsState.isLoading || coursesState.isLoading) return <LoadingPlaceholder />
    const unitChange = (e) => {
        const newUnit = e.target.value;
        settingsStore.set(DISPLAY_UNIT_KEY, newUnit);
    };
    return <SettingsContext.Provider value={settingsStore}>
        <div className="settingsPage">
            {error && <ErrorModal message={error} timeout={10} />}
            <RoundJSONView roundStore={roundStore} />
            <RoundList initialRounds={roundsState.data} />
            <CourseList initialCourses={coursesState.data} />
            <h2>Preferences</h2>
            <UnitSelector onChange={unitChange} />
            <h2>Player Clubs</h2>
            <ClubEditor clubStore={clubStore} />
        </div>
    </SettingsContext.Provider>

}

async function generateAppState() {
    const rounds = signal([])
    const loadRounds = () => roundLoadAll().then(loaded => {
        loaded.sort((a, b) => a.date.localeCompare(b.date))
        rounds.value = loaded;
    });
    const roundsStore = { rounds, load: loadRounds }

    const courses = signal([])
    const loadCourses = () => courseCacheAll().then(loaded => {
        loaded.sort((a, b) => a.course.name.localeCompare(b.course.name));
        courses.value = loaded;
    });
    const coursesStore = { courses, load: loadCourses };
    return { roundsStore, coursesStore }
}

function SettingsStateProvider() {
    const fetchRounds = (_) => roundLoadAll().then(loaded => {
        loaded.sort((a, b) => a.date.localeCompare(b.date))
        return loaded;
    });
    const fetchCourses = (_) => courseCacheAll().then(loaded => {
        loaded.sort((a, b) => a.course.name.localeCompare(b.course.name));
        return loaded;
    });
    const roundStore = initRoundStore();
    const settingsStore = initSettingsStore();
    const clubStore = initClubStore(settingsStore);
    const props = {
        roundsState: useSWR("allRounds", fetchRounds),
        coursesState: useSWR("allCourses", fetchCourses),
        roundStore,
        settingsStore,
        clubStore
    }
    return <SettingsPage {...props} />
}

function handleLoad() {
    render(<SettingsStateProvider />, document.querySelector('body'));
}

window.onload = handleLoad;