import {
    roundDeleteArchive, roundLoad, roundLoadArchive,
    roundSwap, roundCreate, roundUpdateWithData, roundSave
} from "./rounds";
import { getJSON, remove } from "./cache";
import type { FeatureCollection } from "geojson";
/**
 * Updates the round data displayed on the page.
 */
function jsonViewUpdate(): void {
    const output = document.getElementById("jsonOutput").firstElementChild;
    const round = roundLoad();
    output.textContent = JSON.stringify(
        round,
        null,
        2
    );
}

function roundListViewUpdate(): void {
    const rounds = roundLoadArchive();
    const listItems = rounds.map(round => {
        let li = document.createElement('li');
        let div = document.createElement('div');
        div.classList.add('listCell', 'listCellClickable');
        div.innerText = `${round.date} - ${round.course} `;
        div.onclick = () => {
            roundSwap(round);
            window.location.href = "/";
        }

        let controls = document.createElement('div');
        controls.classList.add("listCellControls");

        let del = document.createElement('button');
        del.innerHTML = "&#215;";
        del.classList.add("linkCircleButton", "danger");
        del.onclick = (e) => {
            if (confirm("Are you sure you want to delete this round?")) {
                e.stopPropagation();
                roundDeleteArchive(round);
                window.location.reload();
            }
        };

        controls.appendChild(del);
        div.appendChild(controls);
        li.appendChild(div);
        return li
    })
    listItems.sort((a, b) => a.innerText.localeCompare(b.innerText));
    const roundList = document.getElementById("savedRoundsList");
    roundList.replaceChildren(...listItems);
}

function courseListViewUpdate(): void {
    const courses = [];
    for (let i = 0; i < localStorage.length; i++) {
        let key = localStorage.key(i);
        if (!key.includes("courseData-")) continue
        const [name, id] = key.slice(11).split("-osm-");

        let li = document.createElement('li');
        let div = document.createElement('div');
        div.classList.add('listCell', 'listCellClickable');
        div.innerText = `${name} `;
        div.onclick = () => {
            const round = roundCreate({ name: name, id: `osm-${id}` });
            roundUpdateWithData(round, getJSON(key) as FeatureCollection);
            roundSwap(round);
            window.location.href = "/"
        }

        let controls = document.createElement('div');
        controls.classList.add("listCellControls");

        let del = document.createElement('button');
        del.innerHTML = "&#215;";
        del.classList.add("linkCircleButton", "danger");
        del.onclick = (e) => {
            if (confirm("Are you sure you want to delete this course?")) {
                e.stopPropagation();
                remove(key);
                window.location.reload();
            }
        };

        controls.append(del);
        div.append(controls);
        li.appendChild(div);
        courses.push(li);
    }

    courses.sort((a, b) => a.innerText.localeCompare(b.innerText));
    const courseList = document.getElementById("savedCoursesList");
    courseList.replaceChildren(...courses);
}

/**
 * Handles the click event for toggling the round information display.
 */
function handleShowRoundClick() {
    const el = document.getElementById("jsonOutput");
    el.classList.toggle("inactive");
}

/**
 * Handles the click event for copying location data to the clipboard.
 */
function handleCopyToClipboardClick() {
    navigator.clipboard.writeText(document.getElementById("jsonOutput").firstElementChild.textContent);
}

function handleLoad() {
    jsonViewUpdate();
    roundListViewUpdate();
    courseListViewUpdate();
}

window.onload = handleLoad;
document.getElementById("showRoundInfo").addEventListener('click', handleShowRoundClick);
document.getElementById("copyToClipboard").addEventListener('click', handleCopyToClipboardClick);