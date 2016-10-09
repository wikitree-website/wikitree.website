Wikitree
===========
A web-based research tool, a visual mapping companion for your Wikipedia wanderings

[![Wikitree screenshot](http://i.imgur.com/16H2cSY.png)](https://wikitree.website/)

## Installation

Prereq: ensure you have `node` installed

Then run:
```
$ npm install
```
(which should also trigger `bower install`)

## Building

This project uses gulp to concat & minify its `.js` and `.css` files

For production, run:
```
$ gulp build
```

Or, for development, run:
```
$ gulp watch
```

## Serving

This version of Wikitree runs on GitHub pages out of the `docs/` directory.

To run the site locally:
```
$ cd docs/
$ http-server
```