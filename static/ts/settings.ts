import * as utils from "./utils";
import * as cache from "./cache";

/**
 * Updates the round data displayed on the page.
 */
function roundViewUpdate(): void {
    const output = document.getElementById("jsonOutput");
    output.textContent = JSON.stringify(
        { ...round },
        null,
        2
    );
}


/**
 * Search Nominatim when a user is done typing in the course name box
 * Debounces to only search after 500ms of inactivity
 */
let timeoutId;
function handleCourseSearchInput() {
    let query = this.value;

    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
        if (query.length >= 3) {
            return grids.courseSearch(query).then(courseSearchViewUpdate);
        } else {
            document.getElementById("courseSearchResults").innerHTML = "";
        }
    }, 500);
}

document.getElementById("toggleRound").addEventListener("click", handleToggleRoundClick);
document.getElementById("copyToClipboard").addEventListener("click", handleCopyToClipboardClick);