holeViewDelete();

round.holes.forEach(function (hole) {
    holeViewCreate(hole);
});

currentHole = undefined;
mapRecenter("course");