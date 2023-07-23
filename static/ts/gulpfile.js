const gulp = require("gulp");
const browserify = require("browserify");
const source = require("vinyl-source-stream");
const watchify = require("watchify");
const tsify = require("tsify");
const fancy_log = require("fancy-log");
const out = gulp.dest("../js");

const watchedBrowserify = watchify(
    browserify({
        basedir: ".",
        debug: true,
        entries: ["tracker.ts"],
        cache: {},
        packageCache: {},
    }).plugin(tsify)
)

const bundle = () => {
    watchedBrowserify
        .bundle()
        .on("error", fancy_log)
        .pipe(source("app.js"))
        .pipe(out);
}

gulp.task("default", bundle);
watchedBrowserify.on("update", bundle);
watchedBrowserify.on("log", fancy_log);