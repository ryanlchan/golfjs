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
            window.location.href = import.meta.env.BASE_URL;
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
            window.location.href = import.meta.env.BASE_URL;
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

function handleCodeClick(event: Event) {
    const codeElem = event.target as HTMLElement;
    const preElem = codeElem.parentElement as HTMLElement;
    const textArea = document.createElement('textarea');

    // Copy content from <code> to <textarea>.
    textArea.value = codeElem.textContent || '';

    // Match the width of <textarea> to <pre>.
    const computedStyle = getComputedStyle(preElem);
    textArea.style.width = computedStyle.width;

    // Determine the appropriate height for <textarea>.
    const preHeight = preElem.getBoundingClientRect().height;
    const viewableHeight = window.innerHeight * 0.8;

    textArea.style.height = preHeight <= viewableHeight ?
        `${preHeight}px` :
        `${viewableHeight}px`;

    // Replace <pre> with <textarea>.
    preElem.parentElement?.replaceChild(textArea, preElem);

    // Focus the <textarea> and select all text.
    textArea.focus();
    textArea.select();

    // Add an event listener to handle when the <textarea> loses focus.
    textArea.addEventListener('blur', () => handleTextareaBlur(textArea, preElem, codeElem));
}

function handleTextareaBlur(textArea: HTMLTextAreaElement, preElem: HTMLElement, codeElem: HTMLElement) {
    // Validate round
    try {
        const textInput = JSON.parse(textArea.value);
        roundSave(textInput);
    } catch (e) {
        alert("Invalid round input, disregarding");
        const round = roundLoad();
        textArea.value = JSON.stringify(round, null, 2);
    }

    // Update content from <textarea> to <code>.
    codeElem.textContent = textArea.value;

    // Replace <textarea> with <pre>.
    textArea.parentElement?.replaceChild(preElem, textArea);

    // Optionally, re-add the click event listener to the <code> element.
    codeElem.addEventListener('click', handleCodeClick);
}

function handleLoad() {
    jsonViewUpdate();
    roundListViewUpdate();
    courseListViewUpdate();
}

window.onload = handleLoad;
document.getElementById("showRoundInfo").addEventListener('click', handleShowRoundClick);
document.getElementById("copyToClipboard").addEventListener('click', handleCopyToClipboardClick);
document.getElementById("jsonOutput").addEventListener('click', handleCodeClick)