import useSWR from 'swr';
import { useState, useMemo, useEffect } from 'preact/hooks';
import { render } from 'preact';

import { osmCourseID, courseCacheDelete } from "services/courses";
import { roundCreate, roundSave } from "services/rounds";
import { LoadingPlaceholder } from "components/loadingPlaceholder";
import { ErrorModal } from "components/errorModal";
import { currentCoordRead, watchLocation } from 'common/location';
import { formatDistance, formatDistanceAsNumber, getDistance } from 'common/projections';

let loads = 0;
function NewPage({ courseJSON }) {
    // Load course data from JSON file
    const { data, error, isLoading } = useSWR(courseJSON, (url) => fetch(url).then(r => r.json()))
    if (isLoading) return <LoadingPlaceholder />
    if (error) return <ErrorModal message="Error loading courses" />
    const tags = useMemo(() => {
        return data.elements.map(entry => {
            return Object.values(entry.tags).map(tag => {
                return typeof tag == "string" ? tag.toLowerCase() : "";
            }).join(",");
        });
    }, [data]);

    // Set up state for search boxes
    const [searchInput, setSearchInput] = useState("");
    const [results, setResults] = useState([]);

    // Add functions that perform searches
    const onSearch = (e) => { setSearchInput(e.target.value) }
    const search = async (token) => {
        console.log("Loading search #" + loads++);
        const resultIxs = findIndexes(tags, token);
        if (resultIxs.length == 0) return;
        const entries = resultIxs.map(ix => data.elements[ix]);
        let location;
        try {
            location = await watchLocation()
        } catch (e) {
            console.error(e);
            console.warn("Geolocation denied, won't distance-order results")
            setResults(entries);
            return
        }
        const pos = {
            x: location.coords.longitude,
            y: location.coords.latitude,
            crs: "EPSG:4326"
        }
        const opt = { to_unit: "miles", include_unit: false };
        entries.forEach(entry => {
            if (entry["distanceFromUser"] || !entry["center"]) return
            const courseLoc = {
                x: entry.center?.lon,
                y: entry.center?.lat,
                crs: "EPSG:4326"
            }
            const dist = formatDistanceAsNumber(getDistance(pos, courseLoc), opt);
            entry["distanceFromUser"] = dist;
        })
        entries.sort((a, b) => a["distanceFromUser"] - b["distanceFromUser"]);
        setResults(entries);
    }

    // Debounce searchs to <2 per s
    useEffect(() => {
        const delayInputTimeoutId = setTimeout(() => {
            search(searchInput);
        }, 500);
        return () => clearTimeout(delayInputTimeoutId);
    }, [searchInput]);

    return <div id="roundInfo">
        <h2>Start a new round</h2>
        <input type="text" id="courseName" class="buttonInput" placeholder="Course Name"
            value={searchInput} onInput={onSearch} />
        <button id="searchButton">Search</button>
        <SearchResults entries={results} />
    </div>
}

function findIndexes(corpus: string[], token: string) {
    if (token.length < 4) return [];
    return corpus.reduce((results, tags, index) => (tags.includes(token) ? [...results, index] : results), [])

}

function SearchResults({ entries }) {
    return <ol className="courseSearchResults">
        {entries.map(entry => <SearchResult entry={entry} />)}
    </ol>
}

function SearchResult({ entry }) {
    let courseParams = { 'name': entry.tags?.name, 'id': osmCourseID(entry.type, entry.id) };
    if (!courseParams.name || !courseParams.id) return;
    const onClick = () => {
        if (!confirm("Are you sure you want to start a new round? All current data will be lost.")) {
            return;
        }
        roundCreate(courseParams)
            .then((round) => roundSave(round))
            .then(() => window.location.href = "./")
            .catch(e => {
                courseCacheDelete(courseParams);
                console.error(e);
            })

    }
    const address = [entry.tags["addr:street"], entry.tags["addr:city"]].filter(el => el).join(", ")
    const distance = entry["distanceFromUser"];
    return <li><a href={`#${entry.tags.name}`} onClick={onClick}>
        <div className="courseName">{entry.tags.name}</div>
        <div className="courseAddress">{distance && `${distance}mi away | `}{address}</div>
    </a></li>
}

function onload() {
    const courseJSON = `${import.meta.env.BASE_URL}courses.json`
    render(<NewPage courseJSON={courseJSON} />, document.querySelector('body'))
}

window.addEventListener('load', onload)