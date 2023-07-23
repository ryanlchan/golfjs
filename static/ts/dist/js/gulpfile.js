var gulp = require("gulp");
var browserify = require("browserify");
var source = require("vinyl-source-stream");
var watchify = require("watchify");
var tsify = require("tsify");
var fancy_log = require("fancy-log");
var out = gulp.dest("../js");
var paths = {};
const watchedBrowserify = watchify(browserify({
    basedir: ".",
    debug: true,
    entries: ["tracker.ts"],
    cache: {},
    packageCache: {},
}).plugin(tsify));
const bundle = () => {
    watchedBrowserify
        .bundle()
        .on("error", fancy_log)
        .pipe(source("app.js"))
        .pipe(out);
};
gulp.task("default", bundle);
watchedBrowserify.on("update", bundle);
watchedBrowserify.on("log", fancy_log);
//# sourceMappingURL=gulpfile.js.map