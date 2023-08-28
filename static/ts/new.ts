import * as utils from "./utils";
import { courseSearch, osmCourseID, clearOSMData } from "./grids";
import { roundCreate, roundInitialize, roundClear, roundSwap } from "./rounds";

function search(query: string): Promise<void> {
    if (query.length >= 3) {
        return courseSearch(query)
            .then(courseSearchViewUpdate)
            .catch((e) => utils.showError(e));
    } else {
        document.getElementById("courseSearchResults").innerHTML = "";
    }
}

/**
 * Render the results from a course search via nominatim
 * @param {any[]} results the results from Nominatim search
 */
function courseSearchViewUpdate(results: any[]) {
    let resultList = document.getElementById("courseSearchResults");

    // Iterate over the results and display each match
    const children = results.map((result) => {
        let listItem = document.createElement("li");
        let link = document.createElement("a");
        let courseParams = { 'name': result.namedetails.name, 'id': osmCourseID(result.osm_type, result.osm_id) }
        link.innerText = result.display_name;
        link.setAttribute("href", `#${result.osm_id}`)
        link.addEventListener('click', handleRoundCreateClickCallback(courseParams))
        listItem.appendChild(link);
        return listItem;
    });
    resultList.replaceChildren(...children);
}


/**
 * Handles the click event for starting a new round.
 * @param {Course} [courseParams] the course to create for. If not provided, then infers from input box.
 */
function handleRoundCreateClickCallback(courseParams?: Course) {
    return (() => {
        if (!courseParams) {
            const el = document.getElementById("courseName") as HTMLInputElement;
            const val = el.value;
            if (!(el instanceof HTMLInputElement)) {
                return
            } else if (!val) {
                alert("Course name cannot be blank!");
                return
            }
            courseParams = { name: el.value };
        }

        if (!confirm("Are you sure you want to start a new round? All current data will be lost.")) {
            return
        }

        let round = roundCreate(courseParams);
        roundInitialize(round)
            .then((round) => {
                roundSwap(round);
                window.location.href = "./"
            }).catch(e => {
                utils.showError(e);
                roundClear();
                clearOSMData(courseParams);
            })
    });
}

/**
 * Search Nominatim when a user is done typing in the course name box
 * Debounces to only search after 500ms of inactivity
 */
let timeoutId;
function handleCourseSearchInput() {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => search(this.value), 500);
}

function handleSearchButtonClick() {
    const el = document.getElementById("courseName") as HTMLInputElement;
    if (el) {
        search(el.value);
    }

}

document.getElementById("courseName").addEventListener("input", handleCourseSearchInput);
document.getElementById("searchButton").addEventListener("click", handleSearchButtonClick);