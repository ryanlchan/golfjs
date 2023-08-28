let cache;
let breakdowns;

function handleLoad() {
    new Promise(() => {
        const round = JSON.parse(localStorage.getItem("golfData"));
        const unit = localStorage.getItem("displayUnit") ? localStorage.getItem("displayUnit") : "yards";
        const output = document.getElementById("breakdownTables");
        if (output === null) {
            return
        }
        if (window && window.Worker) {
            const bgStats = new Worker(new URL("./stats", import.meta.url),
                { type: 'module' }
            );
            bgStats.onmessage = (e) => {
                output.replaceChildren(e.data.table);
                cache = e.data.cache;
                breakdowns = e.data.breakdowns;
            }
            bgStats.postMessage({ round, unit });
        }
    });
}
window.onload = handleLoad;