import { roundDeleteArchive, roundLoad, roundLoadArchive, roundSwap } from "./rounds";

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
        let link = document.createElement('a');
        link.innerText = `${round.date} - ${round.course}`;
        link.href = "#";
        link.onclick = () => {
            roundSwap(round);
            window.location.href = "/";
        }

        let del = document.createElement('a');
        del.innerText = " [Delete]";
        del.href = "#";
        del.onclick = () => {
            if (confirm("Are you sure you want to delete this round?")) {
                roundDeleteArchive(round);
                window.location.reload();
            }
        };

        li.appendChild(link);
        li.appendChild(del);
        return li
    })
    const roundList = document.getElementById("savedRoundsList");
    roundList.replaceChildren(...listItems);
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
}

window.onload = handleLoad;
document.getElementById("showRoundInfo").addEventListener('click', handleShowRoundClick);
document.getElementById("copyToClipboard").addEventListener('click', handleCopyToClipboardClick);