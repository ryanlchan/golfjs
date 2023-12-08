import {
    roundDelete, roundLoad, roundLoadAll,
    roundSelect, roundNew, roundUpdateWithData, roundSave, roundInitialize
} from "../services/rounds";
import { courseCacheAll, courseCacheDelete } from "../services/courses";
import { GolfClub, getUserClubs, saveUserClubs, resetUserClubs } from "../services/clubs";
import { formatDistance, formatDistanceAsNumber, formatDistanceOptions } from "../common/projections";
import { getUnitsSetting, setSetting } from "../common/utils";

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

async function roundListViewUpdate(): Promise<void> {
    const rounds = await roundLoadAll();
    const listItems = rounds.map(round => {
        let li = document.createElement('li');
        let div = document.createElement('div');
        div.classList.add('listCell', 'listCellClickable');
        div.innerText = `${round.date} - ${round.course} `;
        div.onclick = async () => {
            await roundSelect(round);
            window.location.href = import.meta.env.BASE_URL;
        }

        let controls = document.createElement('div');
        controls.classList.add("listCellControls");

        let del = document.createElement('button');
        del.innerHTML = "&#215;";
        del.classList.add("linkCircleButton", "danger");
        del.onclick = async (e) => {
            if (confirm("Are you sure you want to delete this round?")) {
                e.stopPropagation();
                await roundDelete(round);
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

async function courseListViewUpdate(): Promise<void> {
    const courses = await courseCacheAll();
    const listItems = courses.map((courseFc) => {
        const course = courseFc.course;
        let li = document.createElement('li');
        let div = document.createElement('div');
        div.classList.add('listCell', 'listCellClickable');
        div.innerText = `${course.name} `;
        div.onclick = async () => {
            await roundInitialize(course).then(roundSelect);
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
                courseCacheDelete(course);
                window.location.reload();
            }
        };

        controls.append(del);
        div.append(controls);
        li.appendChild(div);
        return li;
    });

    listItems.sort((a, b) => a.innerText.localeCompare(b.innerText));
    const courseList = document.getElementById("savedCoursesList");
    courseList.replaceChildren(...listItems);
}

function addClubRow(tableBody: HTMLTableSectionElement, data?: GolfClub) {
    if (!data) {
        data = new GolfClub();
    }
    const distOpts: formatDistanceOptions = { to_unit: getUnitsSetting() }
    if (tableBody.rows.length < 14) {
        const index = tableBody.rows.length + 1;
        const row = tableBody.insertRow();
        row.insertCell().innerText = index.toString();
        row.insertCell().innerHTML = `<input type="text" value="${data.name || ""}" placeholder="Club type" /> <input type="hidden" value="${data.id}" />`;
        row.insertCell().innerHTML = `<input type="text" value="${formatDistance(data.dispersion, distOpts) || ""}" placeholder="Dispersion"/>`;
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = "&#215;";
        deleteBtn.classList.add("linkCircleButton", "danger");
        deleteBtn.addEventListener('click', () => deleteRow(tableBody, row.rowIndex - 1));
        row.insertCell().appendChild(deleteBtn);
    }
}

function deleteRow(tableBody: HTMLTableSectionElement, index) {
    tableBody.deleteRow(index);
    reindexRows(tableBody);
}

function reindexRows(tableBody: HTMLTableSectionElement) {
    Array.from(tableBody.rows).forEach((row, index) => {
        row.cells[0].innerText = (index + 1).toString();
    });
}

function persistClubData(tableBody: HTMLTableSectionElement) {
    const distOpts: formatDistanceOptions = { from_unit: getUnitsSetting(), to_unit: "meters", precision: 2 }
    const clubs = Array.from(tableBody.rows).map(row => ({
        id: (row.cells[1].children[1] as HTMLInputElement).value,
        name: (row.cells[1].children[0] as HTMLInputElement).value,
        dispersion: formatDistanceAsNumber((row.cells[2].children[0] as HTMLInputElement).value, distOpts)
    }));
    saveUserClubs(clubs);
}

function resetClubData(tableBody: HTMLTableSectionElement): void {
    if (confirm("Are you sure you want to reset clubs to default?")) {
        resetUserClubs();
        clubTableViewUpdate(tableBody);
    }
}

function clubTableViewUpdate(tableBody: HTMLTableSectionElement) {
    const clubs = getUserClubs();
    tableBody.innerHTML = "";
    clubs.forEach(item => addClubRow(tableBody, item));
}

function createClubTable(el: HTMLElement): void {
    const tableBody = el.getElementsByTagName('tbody')[0];
    const addRowButton = el.parentElement.querySelector('#add-row-btn');
    const saveButton = el.parentElement.querySelector('#save-btn');
    const resetButton = el.parentElement.querySelector('#reset-clubs-btn');
    addRowButton.addEventListener('click', () => addClubRow(tableBody));
    saveButton.addEventListener('click', () => persistClubData(tableBody));
    resetButton.addEventListener('click', () => resetClubData(tableBody));
    clubTableViewUpdate(tableBody);
}

function changeUnit(unit: string): void {
    setSetting('unit', unit);
}

function unitSelectViewUpdate() {
    const el = document.getElementById("unitSelect");
    const unit = getUnitsSetting();
    for (let element of el.querySelectorAll('option')) {
        if (element.value == unit) element.selected = true;
    };
}

function handleUnitChange() {
    changeUnit(this.value);
    createClubTable(document.getElementById('player-clubs'));
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
    unitSelectViewUpdate();
    createClubTable(document.getElementById('player-clubs'));
}

window.onload = handleLoad;
document.getElementById("showRoundInfo").addEventListener('click', handleShowRoundClick);
document.getElementById("copyToClipboard").addEventListener('click', handleCopyToClipboardClick);
document.getElementById("jsonOutput").addEventListener('click', handleCodeClick);
document.getElementById("unitSelect").addEventListener('change', handleUnitChange);