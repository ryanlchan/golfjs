/**
 * ====
 * Holes
 * ====
 */

/**
 * Select a new hole and update pointers/views to match
 * @param {number} holeIndex
 */
function holeSelect(holeIndex: number) {
    if (holeIndex == -1) {
        holeViewDelete();

        round.holes.forEach(function (hole) {
            holeViewCreate(hole);
        });

        currentHole = undefined;
        mapRecenter("course");
    } else if (!(round.holes[holeIndex])) {
        console.error(`Attempted to select hole i${holeIndex} but does not exist!`);
        return
    } else {
        currentHole = round.holes[holeIndex];

        // Delete all hole-specific layers and active states
        holeViewDelete();

        // Add all the layers of this new hole
        holeViewCreate(currentHole);
        mapRecenter("currentHole");
    }
    rerender("full");

}


function handleHoleIncrement(incr) {
    let curHoleNum = -1;
    if (currentHole) {
        curHoleNum = currentHole.index;
    }
    curHoleNum += incr;

    if (curHoleNum >= round.holes.length) {
        curHoleNum = -1;
    } else if (curHoleNum < -1) {
        curHoleNum = round.holes.length - 1;
    }
    holeSelect(curHoleNum);
}
