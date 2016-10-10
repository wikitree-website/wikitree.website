Wikitree
===========
A web-based research tool, a visual mapping companion for your Wikipedia wanderings

[![Wikitree screenshot](http://i.imgur.com/16H2cSY.png)](https://wikitree.website/)

## Installation

Ensure you have `node` installed

Then run:
```
$ npm install
```
(which also triggers `bower install`)

## Building

This project uses `gulp` to concat & minify its `.js` and `.css` files

#### For production, run:
```
$ gulp build
```
(which empties & refill `docs/build`)

#### For development, run:
```
$ gulp watch
```
(which builds, and rebuilds on any `.js` or `.css` file changes in `docs`)

## Serving

This version of Wikitree is served by GitHub Pages out of the `docs` directory

To serve the site locally, run:
```
$ cd docs
$ http-server
```
