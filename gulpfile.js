var del = require('del');
var path = require('path');
var gulp = require('gulp');
var uglify = require('gulp-uglify');
var concat = require('gulp-concat');
var watch = require('gulp-watch');
var mincss = require('gulp-minify-css');
var rename = require('gulp-rename');
var clone = require('gulp-clone');
var order = require('gulp-order');
var debug = require('gulp-debug');
var sourcemaps = require('gulp-sourcemaps');
var es = require('event-stream');

gulp.task('build-client-css', function() {

    var allCSS = gulp.src([
        // all css files
        path.join(
            __dirname,
            'docs',
            'css',
            '**',
            '*.css'
        )
    ])
        .pipe(concat('app.css'));

    var minCSS = allCSS.pipe(clone())
        .pipe(sourcemaps.init())
        .pipe(mincss())
        .pipe(sourcemaps.write())
        .pipe(rename('app.min.css'));

    return es.merge(allCSS, minCSS)
        .pipe(gulp.dest(
            path.join(
                __dirname,
                'docs',
                'build'
            )
        ));
});

gulp.task('build-client-js', function(){

    // write all files, in order to a concat file
    var allJS = gulp.src([
        path.join(
            __dirname,
            'docs',
            'js',
            '**',
            '*.js'
        )
    ]).
        pipe(order([
            'd3/*.js',
            'angular/wikitree.module.js',
            'angular/wikitree.routes.js',
            'angular/services/*.js',
            'angular/search/*.module.js',
            'angular/search/*.js',
            'angular/home/*.module.js',
            'angular/home/*.js',
            'angular/session/*.module.js',
            'angular/session/*.js',
            'angular/session/menu/*.module.js',
            'angular/session/menu/*.js',
            'angular/session/menu/session_tile/*.module.js',
            'angular/session/menu/session_tile/*.js',
            'angular/session/reader/*.module.js',
            'angular/session/reader/*.js',
            'angular/session/reader/editor/*.module.js',
            'angular/session/reader/editor/*.js',
            'angular/session/graph/*.module.js',
            'angular/session/graph/*.js',
            'angular/session/resizer/*.module.js',
            'angular/session/resizer/*.js'
        ]))
        .pipe(concat('app.js'));

    // copy the concat file, uglify and rename
    var minJS = allJS.pipe(clone())
        .pipe(uglify().on('error', console.log))
        .pipe(rename('app.min.js'));

    // merge the two files to one dest
    return es.merge(allJS, minJS)
        .pipe(gulp.dest(
            path.join(
                __dirname,
                'docs',
                'build'
            )
        ));

});

gulp.task('build', ['clean', 'build-client-css', 'build-client-js']);

gulp.task('clean', function () {
    del(['docs/build/**/*']);
});

gulp.task('watch', ['build'], function (cb){

    watch(path.join(
        __dirname,
        'docs',
        'js',
        '**',
        '*.js'
    ), function() {
        gulp.start('build-client-js');
    });

    watch(path.join(
        __dirname,
        'docs',
        'css',
        '**',
        '*.css'
    ), function() {
        gulp.start('build-client-css');
    });

});