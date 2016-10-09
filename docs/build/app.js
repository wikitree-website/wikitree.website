function EditPopover(containerEl, scope, node) {
    var self = this;

    // properties
    self.containerEl = containerEl;
    self.scope = scope;
    self.node = node;
    self.$el = undefined;
    self.$name = undefined;
    self.$body = undefined;
    self.width = undefined;
    self.height = undefined;
    self.halfwidth = undefined;
    self.halfheight = undefined;
    self.hidden = false;

    // contruction
    self.makeElement();
    self.addEventListeners();

}

EditPopover.prototype.makeElement = function () {
    var self = this;
    // create popover
    self.$el = $(
        '<div class="graph-popover edit popover right">' +
            '<div class="arrow"></div>' +
            '<div class="popover-content">' +
                '<div class="upper">' +
                    '<div class="name">' +
                        '<input type="text" class="form-control input-sm" placeholder="Add title...">' +
                    '</div>' +
                    '<div class="controls">' +
                        '<div class="btn-group" role="group" aria-label="Editor controls">' +
                            '<button type="button" class="cancel-button btn btn-danger btn-xs">' +
                                '<i class="fa fa-fw fa-close"></i>' +
                            '</button>' +
                            '<button type="button" class="confirm-button btn btn-success btn-xs">' +
                                '<i class="fa fa-fw fa-check"></i>' +
                            '</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="lower">' +
                    '<textarea rows="5" class="form-control input-sm" placeholder="Add caption..."></textarea>' +
                '</div>' +
            '</div>' +
        '</div>'
    );
    // append to container element
    $(self.containerEl).append(self.$el);
    // grab inputs
    self.$name = self.$el.find('input');
    self.$body = self.$el.find('textarea');
    // measure self
    self.width = self.$el.outerWidth();
    self.height = self.$el.outerHeight();
    self.halfwidth = self.width / 2;
    self.halfheight = self.height / 2;
    // hide self
    self.hide();
};

EditPopover.prototype.addEventListeners = function () {
    var self = this;
    // cancel edit button
    self.$el.find('.cancel-button').on('click', function () {
        self.hide();
    });
    // confirm edit button
    self.$el.find('.confirm-button').on('click', function () {
        self.save();
        self.hide();
    });
    // input enter press
    self.$name.on('keypress', function (e) {
        switch (e.which) {
            case 13:
                // save on enter
                self.save();
                self.hide();
                break;
        }
    });
};

EditPopover.prototype.load = function () {
    var self = this;
    self.$name.val(self.node.name || '');
    self.$body.val(self.node.body || '');
};

EditPopover.prototype.save = function () {
    var self = this;
    var name = self.$name.val() || '';
    var body = self.$body.val() || '';
    self.scope.$apply(function () {
        self.scope.session.updateNoteNodeContent(
            self.node.uuid,
            name,
            body
        );
    });
};

EditPopover.prototype.show = function () {
    var self = this;
    setTimeout(function () {
        if (!self.hidden) return;
        self.hidden = false;
        self.load();
        self.$el.show();
    }, 1);
};

EditPopover.prototype.hide = function () {
    var self = this;
    setTimeout(function () {
        if (self.hidden) return;
        self.hidden = true;
        self.$el.hide();
    }, 1);
};

EditPopover.prototype.toggle = function () {
    var self = this;
    if (self.hidden) {
        self.show();
    } else {
        self.hide();
    }
};

EditPopover.prototype.position = function (x, y) {
    var self = this;
    self.$el.css({
        top: y - 22,
        left: x - 2
    });
};

function ForceGraph(containerEl, scope) {
    var self = this;

    /**
     * Properties
     */

    // angular scope
    self.scope = scope;

    // html container
    self.containerEl = containerEl;

    // dimensions
    var rect = self.containerEl.getBoundingClientRect();
    self.width = rect.width;
    self.height = rect.height;

    // states
    self.mousePosition = {};
    self.keysPressed = {};
    self.justZoomed = false;
    self.isDragging = false;
    self.isLinking = false;

    // linking
    self.linkingCursor = null;
    self.linkingSource = null;

    // data
    self.nodes = [];
    self.links = [];

    // d3 selections
    self.svg;
    self.defs;
    self.rect;
    self.group;
    self.node;
    self.underlink;
    self.link;

    // d3 layouts & behaviors
    self.tick = self.makeTick();
    self.force = self.makeForce();
    self.zoom = self.makeZoom();
    self.drag = self.makeDrag();

    // event handlers
    self.nodeClick = self.makeNodeClick();
    self.nodeMouseover = self.makeNodeMouseover();
    self.nodeMouseout = self.makeNodeMouseout();
    self.linkMouseover = self.makeLinkMouseover();
    self.linkMouseout = self.makeLinkMouseout();

    // popovers
    self.nodePopoversById = {}; // nodePopover & noteNodePopover
    self.linkPopoversById = {}; // linkPopover
    self.editPopoversById = {}; // editPopover

    /**
     * Initialization
     */

    self.init();

    /**
     * Window events
     */

    d3.select(window)
        // resize on window resize
        .on('resize', function () {
            self.updateSize();
        })
        // keep track of key presses
        .on('keydown', function () {
            self.keysPressed[d3.event.keyCode] = true;
            // end linking state? (esc)
            if (self.keysPressed[27] && self.isLinking) {
                self.stopLinkingState();
            }
        })
        .on('keyup', function () {
            self.keysPressed[d3.event.keyCode] = false;
        })
        // track cursor
        .on('mousemove', function () {
            // update mouse position
            var scale = self.zoom.scale();
            var translate = self.zoom.translate();
            var x = (d3.event.x - translate[0]) / scale;
            var y = (d3.event.y - translate[1]) / scale;
            self.mousePosition.x = x;
            self.mousePosition.y = y;
            // update linking cursor position?
            if (!self.isLinking) return;
            self.linkingCursor.px = x;
            self.linkingCursor.py = y;
            self.linkingCursor.x = x;
            self.linkingCursor.y = y;
            self.tick();
            self.force.start();
        })
        // end linking state
        .on('click', function () {
            // let zoom soak a click
            if (self.justZoomed) {
                self.justZoomed = false;
                return;
            }
            // end link state?
            if (!self.isLinking) return;
            self.stopLinkingState();
        });

}

ForceGraph.prototype.init = function () {
    var self = this;

    self.svg = d3.select(self.containerEl)
        .append('svg')
        .attr('width', self.width)
        .attr('height', self.height);

    self.defs = self.svg
        .append('svg:defs');

    self.rect = self.svg
        .append('svg:rect')
        .attr('width', '100%')
        .attr('height', '100%')
        .style('fill', 'none')
        .style('pointer-events', 'all')
        .call(self.zoom)
        .on('dblclick.zoom', null);

    self.group = self.svg
        .append('svg:g');

    self.underlink = self.group
        .append('svg:g')
        .attr('class', 'underlinks')
        .selectAll('line.underlink');

    self.link = self.group
        .append('svg:g')
        .attr('class', 'links')
        .selectAll('line.link');

    self.node = self.group
        .append('svg:g')
        .attr('class', 'nodes')
        .selectAll('g.node');

    self.defs
        .selectAll('marker')
            .data([
                'link-arrow',
                'link-arrow-hover',
                'link-arrow-note',
                'link-arrow-note-hover'])
            .enter()
        .append('svg:marker')
            .attr('id', function(d) { return d; })
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 21)
            .attr('refY', 0)
            .attr('markerWidth', 4)
            .attr('markerHeight', 4)
            .attr('orient', 'auto')
        .append('path')
            .attr('d', 'M0,-5 L10,0 L0,5');

    self.defs
        .selectAll('marker')
        .append('svg:marker')
            .attr('id', 'link-arrow-note-linking')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 7)
            .attr('refY', 0)
            .attr('markerWidth', 4)
            .attr('markerHeight', 4)
            .attr('orient', 'auto')
        .append('path')
            .attr('d', 'M0,-5 L10,0 L0,5');
};

ForceGraph.prototype.getViewCenter = function () {
    var self = this;
    var scale = self.zoom.scale();
    var translate = self.zoom.translate();
    var translateX = translate[0] / scale;
    var translateY = translate[1] / scale;
    var width = self.width / scale;
    var height = self.height / scale;
    var x = width / 2 - translateX;
    var y = height / 2 - translateY;
    return [x, y];
};

ForceGraph.prototype.updateSize = function () {
    var self = this;

    // get container element size
    var rect = self.containerEl.getBoundingClientRect();
    self.width = rect.width;
    self.height = rect.height;

    // protect from bad timing
    if (!(self.width && self.height)) {
        console.error('graph size updating with no container size');
        return;
    }

    // update svg & force
    self.svg
        .attr('width', self.width)
        .attr('height', self.height);
    self.force
        .size([self.width, self.height])
        .start();
};

ForceGraph.prototype.updateCurrentNode = function (node) {
    var self = this;
    self.node.each(function (d) {
        if (node && node.uuid && d.uuid === node.uuid) {
            d3.select(this).classed('active', true);
        } else {
            d3.select(this).classed('active', false);
        }
    });
};

ForceGraph.prototype.updateNoteNodeContent = function (data) {
    var self = this;
    // find node group
    var g = self.node.filter(function (d) { return d.uuid === data.uuid });
    // scrape out children
    g.selectAll('*').remove();
    // rebuild
    self.addNoteNode(data, g);
};

ForceGraph.prototype.updateNodesAndLinks = function (nodes, links) {
    var self = this;

    // protect from bad timing
    if (!(self.width && self.height)) {
        console.error('graph size updating with no container size');
        return;
    }


    /**
     * Prep data
     */

    self.nodes = nodes.slice();
    self.links = links.slice();

    // add linking elements?
    if (self.isLinking) {
        var cursorNode = {
            uuid: 'linking-cursor-node',
            type: 'cursor',
            x: self.mousePosition.x || undefined,
            y: self.mousePosition.y || undefined,
            px: self.mousePosition.x || undefined,
            py: self.mousePosition.y || undefined,
            fixed: true
        }
        var cursorLink = {
            source: self.linkingSource,
            target: cursorNode,
            linking: true
        }
        nodes.push(cursorNode);
        links.push(cursorLink);
        self.linkingCursor = cursorNode;
    }

    // give nodes starting positions
    var viewCenter = self.getViewCenter();
    var centerX = viewCenter[0];
    var centerY = viewCenter[1];
    nodes.forEach(function (node) {
        if (!(node.x || node.y)) {
            node.x = centerX + (Math.random() * 5);
            node.y = centerY + (Math.random() * 5);
        }
    });

    // add graph properties
    self.force.nodes(nodes);
    self.force.links(links);


    /**
     * Update underlinks (needed for hearing mouse hovers)
     */

    // update underlink elements
    self.underlink = self.underlink.data(links, function (d) { return d.uuid; });
    // remove the old
    self.underlink.exit().remove();
    // add the new
    self.underlink
        .enter()
            .append('svg:line')
            .attr('class', 'underlink')
            .classed('linkback', function (d) { return d.linkbackId; })
            .classed('linking', function (d) { return d.linking; })
            .classed('note', function (d) { return d.source.type === 'note'; })
            .on('mouseover', self.linkMouseover)
            .on('mouseout', self.linkMouseout);


    /**
     * Update links
     */

    // update link elements
    self.link = self.link.data(links, function (d) { return d.uuid; });

    // remove the old
    var exitLink = self.link.exit();
    exitLink.each(function (d) {
        // clean out popovers
        if (self.linkPopoversById[d.uuid]) {
            self.linkPopoversById[d.uuid].$el.remove();
            delete self.linkPopoversById[d.uuid];
        }
    });
    exitLink.remove();

    // add the new
    var enterLink = self.link
        .enter()
            .append('svg:line')
            .attr('class', 'link')
            .classed('linkback', function (d) { return d.linkbackId; })
            .classed('linking', function (d) { return d.linking; })
            .classed('note', function (d) { return d.source.type === 'note'; });
    enterLink.each(function (d) {
        // add new popover
        if (d.linkbackId) {
            var popover = self.linkPopoversById[d.linkbackId];
            if (!popover) return;
            popover.addLinkback(d3.select(this));
        } else {
            self.linkPopoversById[d.uuid] = new LinkPopover(
                self.containerEl,
                self.scope,
                d,
                d3.select(this)
            );
        }
    });


    /**
     * Update nodes
     */

    self.node = self.node.data(nodes, function (d) { return d.uuid; });

    // remove the old
    var exitNode = self.node.exit();
    exitNode.each(function (d) {
        // clean out any node or note node popovers
        if (self.nodePopoversById[d.uuid]) {
            self.nodePopoversById[d.uuid].$el.remove();
            delete self.nodePopoversById[d.uuid];
        }
        // clean out any edit popovers
        if (self.editPopoversById[d.uuid]) {
            self.editPopoversById[d.uuid].$el.remove();
            delete self.editPopoversById[d.uuid];
        }
    });
    exitNode.remove();

    // add the new
    var enterNode = self.node.enter()
        .append('svg:g')
            .attr('class', 'node')
            .classed('fixed', function (d) { return d.fixed; })
            .attr('transform', function(d) {
                return 'translate(' + d.x + ',' + d.y + ')';
            });
    enterNode.each(function (d) {
        var g = d3.select(this);
        switch (d.type) {
            case 'article':
            case 'category':
            case 'search':
                self.addNode(d, g);
                break;
            case 'note':
                self.addNoteNode(d, g);
                break;
            case 'cursor':
                self.addCursorNode(d, g);
                break;
        }
    });


    /**
     * Nudge graph
     */

    // keep things moving
    self.force.start();

};

ForceGraph.prototype.addNode = function (d, g) {
    var self = this;

    // disc
    g.append('svg:circle')
        .attr('r', 16)
        .attr('class', 'disc')
        .on('mouseover', self.nodeMouseover)
        .on('mouseout', self.nodeMouseout)
        .on('click', self.nodeClick)
        .call(self.drag);

    // pin
    g.append('svg:circle')
        .attr('r', 3)
        .attr('class', 'pin');

    // name
    g.append('svg:text')
        .attr('class', 'name')
        .attr('dx', 6)
        .attr('dy', -6)
        .text(function (d) { return d.name })
        .on('click', self.nodeClick)
        .call(self.drag);

    // popover
    self.nodePopoversById[d.uuid] = new NodePopover(
        self.containerEl,
        self.scope,
        d,
        g
    );

};

ForceGraph.prototype.addNoteNode = function (d, g) {
    var self = this;

    // font awesome unicodes
    // http://fortawesome.github.io/Font-Awesome/cheatsheet/

    // note background
    g.append('svg:text')
        .attr('class', 'note-icon note-icon-back')
        .attr('dx', 0)
        .attr('dy', -1)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('font-family', 'FontAwesome')
        .text('\uf15b') // fa-file

    // note foreground
    g.append('svg:text')
        .attr('class', 'note-icon note-icon-fore')
        .attr('dx', 0)
        .attr('dy', -1)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('font-family', 'FontAwesome')
        .text('\uf016') // fa-file-o
        .on('mouseover', self.nodeMouseover)
        .on('mouseout', self.nodeMouseout)
        .on('click', self.nodeClick)
        .call(self.drag);

    // pin
    g.append('svg:circle')
        .attr('r', 3)
        .attr('class', 'pin');

    // name
    g.append('svg:text')
        .attr('class', 'note')
        .attr('dx', 18)
        .attr('dy', 4)
        .text(function (d) { return d.name })
        .on('click', self.nodeClick)
        .call(self.drag);

    // body
    g.append('foreignObject')
        .attr('width', 240)
        .attr('height', 120)
        .attr('x', 18)
        .attr('y', function (d) {
            if (d.name && d.name.length) {
                return 8;
            } else {
                return -8;
            }
        })
        .style('overflow', 'visible')
        .on('click', self.nodeClick)
        .call(self.drag)
        .append('xhtml:body')
            .html(function (d) {
                return d.body ? d.body.replace(/\n/g, '<br>') : '';
            })
            .each(function (d) {
                var foreignObject = this.parentNode;
                foreignObject.setAttribute('width', this.clientWidth);
                foreignObject.setAttribute('height', this.clientHeight);
            });

    // note node popover
    self.nodePopoversById[d.uuid] = new NoteNodePopover(
        self.containerEl,
        self.scope,
        d,
        g
    );

    // edit popover
    self.editPopoversById[d.uuid] = new EditPopover(
        self.containerEl,
        self.scope,
        d
    );

};

ForceGraph.prototype.addCursorNode = function (d, g) {
    var self = this;

    // disc
    g.append('svg:circle')
        .attr('r', 1)
        .attr('class', 'cursor');

};

ForceGraph.prototype.updatePopovers = function () {
    var self = this;
    var scale = self.zoom.scale();
    var translate = self.zoom.translate();
    var translateX = translate[0];
    var translateY = translate[1];
    // node popovers
    Object.keys(self.nodePopoversById).forEach(function (id) {
        var popover = self.nodePopoversById[id];
        if (popover.hidden) return;
        var x = popover.node.x * scale + translateX;
        var y = popover.node.y * scale + translateY;
        y += 14 * scale; // shift below center
        popover.position(x, y);
    });
    // edit popovers
    Object.keys(self.editPopoversById).forEach(function (id) {
        var popover = self.editPopoversById[id];
        if (popover.hidden) return;
        var x = popover.node.x * scale + translateX;
        var y = popover.node.y * scale + translateY;
        x += 10 * scale; // shift to the right
        popover.position(x, y);
    });
    // link popovers
    Object.keys(self.linkPopoversById).forEach(function (id) {
        var popover = self.linkPopoversById[id];
        if (popover.hidden) return;
        var node1 = popover.link.source;
        var node2 = popover.link.target;
        var x1 = node1.x * scale + translateX;
        var y1 = node1.y * scale + translateY;
        var x2 = node2.x * scale + translateX;
        var y2 = node2.y * scale + translateY;
        var centerX = (x1 + x2) / 2;
        var centerY = (y1 + y2) / 2;
        popover.position(centerX, centerY);
    });
};

ForceGraph.prototype.updateNodePopover = function (popover) {
    var self = this;
    var scale = self.zoom.scale();
    var translate = self.zoom.translate();
    var translateX = translate[0];
    var translateY = translate[1];
    var x = popover.node.x * scale + translateX;
    var y = popover.node.y * scale + translateY;
    y += 14 * scale; // shift below center
    popover.position(x, y);
};

ForceGraph.prototype.updateEditPopover = function (popover) {
    var self = this;
    var scale = self.zoom.scale();
    var translate = self.zoom.translate();
    var translateX = translate[0];
    var translateY = translate[1];
    var x = popover.node.x * scale + translateX;
    var y = popover.node.y * scale + translateY;
    x += 10 * scale; // shift to the right
    popover.position(x, y);
};

ForceGraph.prototype.updateLinkPopover = function (popover) {
    var self = this;
    var scale = self.zoom.scale();
    var translate = self.zoom.translate();
    var translateX = translate[0];
    var translateY = translate[1];
    var node1 = popover.link.source;
    var node2 = popover.link.target;
    var x1 = node1.x * scale + translateX;
    var y1 = node1.y * scale + translateY;
    var x2 = node2.x * scale + translateX;
    var y2 = node2.y * scale + translateY;
    var centerX = (x1 + x2) / 2;
    var centerY = (y1 + y2) / 2;
    popover.position(centerX, centerY);
};

ForceGraph.prototype.hideAllPopovers = function (exceptId) {
    var self = this;
    Object.keys(self.nodePopoversById).forEach(function (id) {
        if (id == exceptId) return;
        var popover = self.nodePopoversById[id];
        if (popover.hidden) return;
        popover.hide(true);
    });
    Object.keys(self.linkPopoversById).forEach(function (id) {
        if (id == exceptId) return;
        var popover = self.linkPopoversById[id];
        if (popover.hidden) return;
        popover.hide(true);
    });
};

ForceGraph.prototype.makeTick = function () {
    var self = this;
    function x1(d) { return d.source.x; }
    function y1(d) { return d.source.y; }
    function x2(d) { return d.target.x; }
    function y2(d) { return d.target.y; }
    function transform(d) {
        return 'translate(' + d.x + ',' + d.y + ')';
    }
    return function () {
        self.underlink
            .attr('x1', x1)
            .attr('y1', y1)
            .attr('x2', x2)
            .attr('y2', y2);
        self.link
            .attr('x1', x1)
            .attr('y1', y1)
            .attr('x2', x2)
            .attr('y2', y2);
        self.node
            .attr('transform', transform);
        self.updatePopovers();
    };
};

ForceGraph.prototype.makeForce = function () {
    var self = this;
    return d3.layout.force()
        .size([this.width, this.height])
        .linkDistance(100)
        .linkDistance(function (d) {
            switch (d.source.type) {
                case 'article':
                case 'category':
                case 'search':
                    return 100;
                case 'note':
                case 'cursor':
                    return 1;
            }
        })
        .linkStrength(function (d) {
            switch (d.source.type) {
                case 'article':
                case 'category':
                case 'search':
                    return 0.2;
                case 'note':
                case 'cursor':
                    return 0.07;
            }
        })
        .charge(function (d) {
            switch (d.type) {
                case 'article':
                case 'category':
                case 'search':
                    return -400;
                case 'note':
                    return -800;
                case 'cursor':
                    return 0;
            }
        })
        .gravity(0.03)
        .friction(0.8)
        .theta(0.9)
        .alpha(0.1)
        .on('tick', this.tick);

};

ForceGraph.prototype.makeZoom = function () {
    var self = this;
    return d3.behavior.zoom()
        .scaleExtent([0.2, 10])
        .on('zoom', function () {
            self.group.attr(
                'transform',
                'translate(' + d3.event.translate + ')' +
                'scale(' + d3.event.scale + ')'
            );

            self.updatePopovers();

            // prevent greedy click event
            self.justZoomed = true;

        });
};

ForceGraph.prototype.makeDrag = function () {
    var self = this;
    return d3.behavior.drag()
        .on('dragstart', function (d, i) {
            if (self.isLinking) return;
            d3.event.sourceEvent.stopPropagation();
        })
        .on('drag', function (d, i) {
            if (self.isLinking) return;
            if (!self.isDragging) {
                self.isDragging = true;

                // hide popover on drag
                self.nodePopoversById[d.uuid].$el.hide();

                if (!self.keysPressed[16]) {
                    // only fix if user not holding shift
                    d3.select(this.parentNode).classed('fixed', true);
                    d.fixed = true;
                }
            }
            self.force.start();
            d3.event.sourceEvent.stopPropagation();
            d.px += d3.event.x;
            d.py += d3.event.y;
            d.x += d3.event.x;
            d.y += d3.event.y;
            self.tick();
        })
        .on('dragend', function (d, i) {
            if (self.isLinking) return;
            d3.event.sourceEvent.stopPropagation();
            if (self.isDragging) {
                self.tick();

                // show popover when done drag
                var popover = self.nodePopoversById[d.uuid];
                self.updateNodePopover(popover);
                popover.$el.show();

                // also prevents selecting on drag
                setTimeout(function () {
                    self.isDragging = false;
                    popover.show();
                }, 50);

            }
        });
};

ForceGraph.prototype.makeNodeClick = function () {
    var self = this;
    return function (d) {
        d3.event.preventDefault();
        d3.event.stopPropagation();
        if (self.isDragging) return;
        if (self.isLinking) {
            // clicked link source?
            if (d.uuid === self.linkingSource.uuid) {
                // end linking state
                self.stopLinkingState();
            } else {
                // add link to this node
                self.scope.$apply(function () {
                    self.scope.addLink(
                        self.linkingSource.uuid,
                        d.uuid
                    );
                });
            }
        } else if (d3.event.shiftKey) {
            // toggle this node's pin state
            self.toggleNodePin(d, d3.select(this.parentNode));
        } else {
            if (d.type === 'note') {
                // toggle note edit popover
                var editPopover = self.editPopoversById[d.uuid];
                var nodePopover = self.nodePopoversById[d.uuid];
                if (editPopover.hidden) {
                    // update & show edit popover
                    self.updateEditPopover(editPopover);
                    editPopover.show();
                    // hide node popover
                    nodePopover.hide(true);
                } else {
                    // hide edit popover
                    editPopover.hide();
                    // show node popover
                    nodePopover.show();
                }
            } else {
                // set this node as current
                self.scope.$apply(function () {
                    self.scope.setCurrentNode(d.uuid);
                });
            }
        }
    };
};

ForceGraph.prototype.makeNodeMouseover = function () {
    var self = this;
    return function (d) {
        if (self.isDragging) return;
        if (self.isLinking) return;
        d.hovered = true;
        var popover = self.nodePopoversById[d.uuid];
        self.updateNodePopover(popover);
        self.hideAllPopovers(d.uuid);
        popover.show();
    };
};

ForceGraph.prototype.makeNodeMouseout = function () {
    var self = this;
    return function (d) {
        if (self.isDragging) return;
        if (self.isLinking) return;
        d.hovered = false;
        var popover = self.nodePopoversById[d.uuid];
        popover.hide();
    };
};

ForceGraph.prototype.makeLinkMouseover = function () {
    var self = this;
    return function (d) {
        if (self.isDragging) return;
        if (self.isLinking) return;
        d.hovered = true;
        d3.select(this).classed('hovered', true);
        var popover = self.linkPopoversById[d.uuid];
        self.updateLinkPopover(popover);
        self.hideAllPopovers(d.uuid);
        popover.show();
    };
};

ForceGraph.prototype.makeLinkMouseout = function () {
    var self = this;
    return function (d) {
        if (self.isDragging) return;
        if (self.isLinking) return;
        d.hovered = false;
        d3.select(this).classed('hovered', false);
        var popover = self.linkPopoversById[d.uuid];
        popover.hide();
    };
};

ForceGraph.prototype.toggleNodePin = function (nodeData, nodeSelection) {
    var self = this;
    if (!nodeSelection) {
        nodeSelection = self.node
            .filter(function (d) {
                return d.uuid === nodeData.uuid
            });
    }
    nodeData.fixed = !nodeData.fixed;
    nodeSelection.classed('fixed', nodeData.fixed);
    self.force.start();
};

ForceGraph.prototype.centerOnNode = function (node) {
    var self = this;
    if (!node) return;
    var scale = self.zoom.scale();
    var w = self.width;
    var h = self.height;
    var x = node.x * scale;
    var y = node.y * scale;
    var translateX = (w / 2) - x;
    var translateY = (h / 2) - y;
    self.zoom.translate([translateX, translateY]);
    self.zoom.event(self.rect.transition().duration(600));
};

ForceGraph.prototype.startLinkingState = function (node) {
    var self = this;
    self.isLinking = true;
    self.linkingSource = node;
    self.updateNodesAndLinks(
        self.nodes,
        self.links
    );
};

ForceGraph.prototype.stopLinkingState = function () {
    var self = this;
    self.isLinking = false;
    self.linkingSource = null;
    self.linkingCursor = null;
    self.updateNodesAndLinks(
        self.nodes,
        self.links
    );
};

function HomeGraph(containerEl) {

    this.containerEl = containerEl;
    this.width = containerEl.clientWidth;
    this.height = containerEl.clientHeight;

    this.svg;
    this.group;
    this.node;
    this.link;

    this.isDragging = false;

    this.tick = this.makeTick();
    this.force = this.makeForce();
    this.zoom = this.makeZoom();
    this.drag = this.makeDrag();

    this.init();

    var self = this;
    d3.select(window).on('resize', function () {
        self.updateSize();
    });

}

HomeGraph.prototype.init = function () {
    this.svg = d3.select(this.containerEl)
        .append('svg')
        .attr('width', this.width)
        .attr('height', this.height);
    var rect = this.svg
        .append('rect')
        .attr('width', '100%')
        .attr('height', '100%')
        .style('fill', 'none')
        .style('pointer-events', 'all')
        .call(this.zoom)
        .on('dblclick.zoom', null);
    this.group = this.svg
        .append('g');
    this.link = this.group
        .append('svg:g')
        .attr('class', 'links')
        .selectAll('line.link');
    this.node = this.group
        .append('svg:g')
        .attr('class', 'nodes')
        .selectAll('g.node');
};

HomeGraph.prototype.updateSize = function () {
    this.width = this.containerEl.clientWidth;
    this.height = this.containerEl.clientHeight
    this.svg
        .attr('width', this.width)
        .attr('height', this.height);
    this.force
        .size([this.width, this.height])
        .resume();
};

HomeGraph.prototype.updateNodesAndLinks = function (nodes, links) {

    nodes = nodes.slice();
    links = links.slice();

    console.log('home update');

    this.force.nodes(nodes);
    this.force.links(links);

    // update link elements
    this.link = this.link.data(links);
    this.link.exit().remove();
    var newLink = this.link
        .enter()
            .append('svg:line')
            .attr('class', 'link');
            // .style('marker-end', 'url(#arrow)');

    // update node elements
    this.node = this.node.data(nodes);
    this.node.exit().remove();
    var newNode = this.node
        .enter()
            .append('svg:g')
            .attr('class', 'node')
            .attr('transform', function(d) {
                return 'translate(' + d.x + ',' + d.y + ')';
            });
    newNode
        .append('svg:circle')
            .attr('r', 18)
            .attr('class', 'disc')
            .call(this.drag);

    // keep things moving
    this.force.start();

};

HomeGraph.prototype.makeTick = function () {
    var self = this;
    return function () {
        self.link
            .attr('x1', function(d) { return d.source.x; })
            .attr('y1', function(d) { return d.source.y; })
            .attr('x2', function(d) { return d.target.x; })
            .attr('y2', function(d) { return d.target.y; });
        self.node
            .attr('transform', function(d) {
                return 'translate(' + d.x + ',' + d.y + ')';
            });
    };
};

HomeGraph.prototype.makeForce = function () {
    var self = this;
    return d3.layout.force()
        .size([this.width, this.height])
        .linkDistance(60)
        .charge(-1200)
        .gravity(0.2)
        .friction(0.4)
        .theta(0.01)
        .on('tick', this.tick);
};

HomeGraph.prototype.makeZoom = function () {
    var self = this;
    return d3.behavior.zoom()
        .scaleExtent([0.2, 10])
        .on('zoom', function () {
            self.group.attr(
                'transform',
                'translate(' + d3.event.translate + ')' +
                'scale(' + d3.event.scale + ')'
            );
        });
};

HomeGraph.prototype.makeDrag = function () {
    var self = this;
    return d3.behavior.drag()
        .on('dragstart', function (d, i) {
            d3.event.sourceEvent.stopPropagation();
        })
        .on('drag', function (d, i) {
            if (!self.isDragging) {
                self.isDragging = true;
            }
            self.force.start();
            d3.event.sourceEvent.stopPropagation();
            d.px += d3.event.x;
            d.py += d3.event.y;
            d.x += d3.event.x;
            d.y += d3.event.y;
            self.tick();
        })
        .on('dragend', function (d, i) {
            d3.event.sourceEvent.stopPropagation();
            if (self.isDragging) {
                self.tick();
                self.isDragging = false;
            }
        });
};

function LinkPopover(containerEl, scope, link, linkSelect) {
    var self = this;

    // properties
    self.containerEl = containerEl;
    self.scope = scope;
    self.link = link;
    self.linkSelect = linkSelect;
    self.linkbackSelect = undefined;
    self.$el = undefined;
    self.width = undefined;
    self.height = undefined;
    self.halfwidth = undefined;
    self.halfheight = undefined;
    self.hidden = false;
    self.hovered = false;

    // contruction
    self.makeElement();
    self.addEventListeners();

}

LinkPopover.prototype.makeElement = function () {
    var self = this;
    // create popover
    self.$el = $(
        '<div class="graph-popover link popover">' +
            '<div class="popover-content">' +
                '<div class="btn-group" role="group" aria-label="Link controls">' +
                    '<button type="button" class="del-button btn btn-default btn-xs">' +
                        '<i class="fa fa-fw fa-unlink"></i>' +
                    '</button>' +
                '</div>' +
            '</div>' +
        '</div>'
    );
    // append to container element
    $(self.containerEl).append(self.$el);
    // measure self
    self.width = self.$el.outerWidth();
    self.height = self.$el.outerHeight();
    self.halfwidth = self.width / 2;
    self.halfheight = self.height / 2;
    // hide self
    self.hide();
};

LinkPopover.prototype.addEventListeners = function () {
    var self = this;
    // hover on
    self.$el.on('mouseover', function () {
        self.hovered = true;
    });
    // hover off
    self.$el.on('mouseout', function () {
        self.hovered = false;
        setTimeout(function () {
            if (!self.link.hovered) {
                self.hide();
            }
        }, 1);
    });
    // delete button
    self.$el.find('.del-button').on('click', function () {
        self.scope.removeLink(self.link.uuid);
    });
};

LinkPopover.prototype.addLinkback = function (linkbackSelect) {
    var self = this;
    self.linkbackSelect = linkbackSelect;
};

LinkPopover.prototype.show = function () {
    var self = this;
    setTimeout(function () {
        if (!self.hidden) return;
        self.hidden = false;
        self.$el.show();
        self.linkSelect.classed('hovered', true);
        if (self.linkbackSelect) {
            self.linkbackSelect.classed('hovered', true);
        }
    }, 1);
};

LinkPopover.prototype.hide = function (forceful) {
    var self = this;

    if (forceful) {
        self._hide();
        return;
    }

    setTimeout(function () {
        if (self.hovered) return;
        if (self.hidden) return;
        self._hide();
    }, 1);
};

LinkPopover.prototype._hide = function () {
    var self = this;
    self.hidden = true;
    self.$el.hide();
    self.linkSelect.classed('hovered', false);
    if (self.linkbackSelect) {
        self.linkbackSelect.classed('hovered', false);
    }
};

LinkPopover.prototype.position = function (x, y) {
    var self = this;
    self.$el.css({
        top: y - self.halfheight,
        left: x - self.halfwidth
    });
};

function NodePopover(containerEl, scope, node, nodeSelect) {
    var self = this;

    // properties
    self.containerEl = containerEl;
    self.scope = scope;
    self.node = node;
    self.nodeSelect = nodeSelect;
    self.$el = undefined;
    self.width = undefined;
    self.height = undefined;
    self.halfwidth = undefined;
    self.halfheight = undefined;
    self.hidden = false;
    self.hovered = false;

    // contruction
    self.makeElement();
    self.addEventListeners();

}

NodePopover.prototype.makeElement = function () {
    var self = this;
    // create popover
    self.$el = $(
        '<div class="graph-popover node popover bottom">' +
            '<div class="arrow"></div>' +
            '<div class="popover-content">' +
                '<div class="btn-group" role="group" aria-label="Node controls">' +
                    '<button type="button" class="pin-button btn btn-default btn-xs">' +
                        '<i class="fa fa-fw fa-thumb-tack"></i>' +
                    '</button>' +
                    '<button type="button" class="del-button btn btn-default btn-xs">' +
                        '<i class="fa fa-fw fa-trash-o"></i>' +
                    '</button>' +
                '</div>' +
            '</div>' +
        '</div>'
    );
    // append to container element
    $(self.containerEl).append(self.$el);
    // measure self
    self.width = self.$el.outerWidth();
    self.height = self.$el.outerHeight();
    self.halfwidth = self.width / 2;
    self.halfheight = self.height / 2;
    // hide self
    self.hide();
};

NodePopover.prototype.addEventListeners = function () {
    var self = this;
    // hover on
    self.$el.on('mouseenter', function () {
        self.hovered = true;
    });
    // hover off
    self.$el.on('mouseleave', function () {
        self.hovered = false;
        setTimeout(function () {
            self.hide();
        }, 50);
    });
    // pin button
    self.$el.find('.pin-button').on('click', function () {
        self.scope.graph.toggleNodePin(self.node);
        self.hide(true);
    });
    // delete button
    self.$el.find('.del-button').on('click', function () {
        self.scope.removeNode(self.node.uuid);
    });
};

NodePopover.prototype.show = function () {
    var self = this;
    setTimeout(function () {
        if (!self.hidden) return;
        self.hidden = false;
        self.$el.show();
        self.nodeSelect.classed('hovered', true);
    }, 1);
};

NodePopover.prototype.hide = function (forceful) {
    var self = this;

    if (forceful) {
        self._hide();
        return;
    }

    setTimeout(function () {
        if (self.hidden) return;
        if (self.hovered) return;
        if (self.node.hovered) return;
        self._hide();
    }, 100);
};

NodePopover.prototype._hide = function () {
    var self = this;
    self.hidden = true;
    self.hovered = false;
    self.$el.hide();
    self.nodeSelect.classed('hovered', false);
};

NodePopover.prototype.position = function (x, y) {
    var self = this;
    self.$el.css({
        top: y - self.halfheight + 18,
        left: x - self.halfwidth
    });
};

function NoteNodePopover(containerEl, scope, node, nodeSelect) {
    var self = this;

    // properties
    self.containerEl = containerEl;
    self.scope = scope;
    self.node = node;
    self.nodeSelect = nodeSelect;
    self.$el = undefined;
    self.width = undefined;
    self.height = undefined;
    self.halfwidth = undefined;
    self.halfheight = undefined;
    self.hidden = false;
    self.hovered = false;

    // contruction
    self.makeElement();
    self.addEventListeners();

}

NoteNodePopover.prototype.makeElement = function () {
    var self = this;
    // create popover
    self.$el = $(
        '<div class="graph-popover note popover bottom">' +
            '<div class="arrow"></div>' +
            '<div class="popover-content">' +
                '<div class="btn-group" role="group" aria-label="Node controls">' +
                    '<button type="button" class="link-button btn btn-default btn-xs">' +
                        '<i class="fa fa-fw fa-link"></i>' +
                    '</button>' +
                    '<button type="button" class="pin-button btn btn-default btn-xs">' +
                        '<i class="fa fa-fw fa-thumb-tack"></i>' +
                    '</button>' +
                    '<button type="button" class="del-button btn btn-default btn-xs">' +
                        '<i class="fa fa-fw fa-trash-o"></i>' +
                    '</button>' +
                '</div>' +
            '</div>' +
        '</div>'
    );
    // append to container element
    $(self.containerEl).append(self.$el);
    // measure self
    self.width = self.$el.outerWidth();
    self.height = self.$el.outerHeight();
    self.halfwidth = self.width / 2;
    self.halfheight = self.height / 2;
    // hide self
    self.hide();
};

NoteNodePopover.prototype.addEventListeners = function () {
    var self = this;
    // hover on
    self.$el.on('mouseenter', function () {
        self.hovered = true;
    });
    // hover off
    self.$el.on('mouseleave', function () {
        self.hovered = false;
        setTimeout(function () {
            self.hide();
        }, 50);
    });
    // pin button
    self.$el.find('.pin-button').on('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        self.scope.graph.toggleNodePin(self.node);
        self.hide(true);
    });
    // link button
    self.$el.find('.link-button').on('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        self.scope.graph.startLinkingState(self.node, self.nodeSelect);
        self.hide(true);
    });
    // delete button
    self.$el.find('.del-button').on('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        self.scope.removeNode(self.node.uuid);
    });
};

NoteNodePopover.prototype.show = function () {
    var self = this;
    setTimeout(function () {
        if (!self.hidden) return;
        self.hidden = false;
        self.$el.show();
        self.nodeSelect.classed('hovered', true);
    }, 1);
};

NoteNodePopover.prototype.hide = function (forceful) {
    var self = this;

    if (forceful) {
        self._hide();
        return;
    }

    setTimeout(function () {
        if (self.hidden) return;
        if (self.hovered) return;
        if (self.node.hovered) return;
        self._hide();
    }, 100);
};

NoteNodePopover.prototype._hide = function () {
    var self = this;
    self.hidden = true;
    self.hovered = false;
    self.$el.hide();
    self.nodeSelect.classed('hovered', false);
};

NoteNodePopover.prototype.position = function (x, y) {
    var self = this;
    self.$el.css({
        top: y - self.halfheight + 16,
        left: x - self.halfwidth
    });
};

(function() {
    angular.module('wikitree', [
        'ngRoute',
        'LocalStorageModule',
        'ui.bootstrap.alert',
        'wikitree.home',
        'wikitree.session',
        'wikitree.search'
    ]).
    config(['localStorageServiceProvider', function(localStorageServiceProvider) {
        localStorageServiceProvider.setPrefix('Wikitree');
    }]);
})();
(function() {
    angular.module('wikitree').
        config(['$routeProvider', function($routeProvider) {
            $routeProvider.
                when('/', {
                    templateUrl: '/js/angular/home/home.template.html',
                    controller: 'home_controller',
                    resolve: {
                        is_new: ['Sessions', function (Sessions) {
                            return Sessions.is_new();
                        }]
                    }
                }).
                when('/welcome', {
                    templateUrl: '/js/angular/home/home.template.html',
                    controller: 'home_controller'
                }).
                when('/session/:uuid', {
                    templateUrl: '/js/angular/session/session.template.html',
                    controller: 'session_controller',
                    controllerAs: 'session',
                    resolve: {
                        init_session: ['Sessions', '$route', function (Sessions, $route) {
                            return Sessions.restore($route.current.params.uuid);
                        }]
                    }
                }).
                when('/new/:term/:search?', {
                    templateUrl: '/js/angular/session/session.template.html',
                    controller: 'session_controller',
                    controllerAs: 'session',
                    resolve: {
                        init_session: ['Sessions', '$route', function (Sessions, $route) {
                            return Sessions.new($route.current.params.term);
                        }]
                    }
                }).
                otherwise({ redirectTo: '/' });
        }]);
})();
(function() {
    angular.module('wikitree').

        factory('Search', ['$http', 'Articles', 'Categories', 'Searches',
            function($http, Articles, Categories, Searches) {
                var search = {};

                search.get_suggestions = function (term) {

                    console.log('Fetching suggestions...', term);

                    return $http.jsonp('https://en.wikipedia.org/w/api.php', {
                        params: {
                            action: 'opensearch',
                            search: term,
                            callback: 'JSON_CALLBACK'
                        }
                    }).then(function(response) {
                        return response.data[1];
                    });
                };

                search.findOrAddArticle = function (title) {

                    // is this a category?
                    if (title.match(/^Category:/)) {
                        // skip to special handler
                        return search.findOrAddCategory(title);
                    }

                    return Articles.getByUnsafeTitle(title).
                        then(function (article) {
                            return{
                                type: 'article',
                                name: article.title,
                                title: article.title
                            };
                        }).
                        catch(function (err) {
                            console.log('In findOrAddArticle', err);
                            // no result? try searching
                            return search.findOrAddSearch(title);
                        });
                };

                search.findOrAddCategory = function (title) {
                    return Categories.getByUnsafeTitle(title).
                        then(function (category) {
                            return {
                                type: 'category',
                                name: category.title,
                                title: category.title
                            };
                        }).
                        catch(function (err) {
                            console.log('In findOrAddCategory', err);
                            // no result? try searching
                            return findOrAddSearch(title);
                        });
                };

                search.findOrAddSearch = function (query) {
                    return Searches.getByQuery(query).
                        then(function (search) {
                            return {
                                type: 'search',
                                name: 'Search "' + query + '"',
                                query: query
                            };
                        }).
                        catch(function (err) {
                            console.log('In findOrAddSearch', err);
                            // no dice
                            return null;
                        });
                };

                return search;
            }]);

})();

(function() {
    angular.module('wikitree').
        factory('Sessions', [
            '$rootScope',
            '$location',
            '$route',
            'localStorageService',
            'Utilities',
            function($rootScope, $location, $route, localStorageService, Utilities) {

                function Session (term, is_search) {
                    this.new = true;
                    this.term = term;
                    this.search = is_search;
                    this.uuid = Utilities.makeUUID();
                    this.data = {
                        current_node_id:   undefined,
                        prev_stack:        [],
                        next_stack:        [],
                        nodes:             [],
                        links:             []
                    }
                }

                function SessionIndex (session, name) {
                    this.uuid = session.uuid;
                    this.name = name;
                    this.rename = name;
                    this.date = Date.now();
                }

                var Sessions = {};


                Sessions.index  = localStorageService.get('index')  || [];
                Sessions.active = localStorageService.get('active') || 0;

                if (Sessions.index.length > 0) {
                    var test_sesh = localStorageService.get(Sessions.index[0].uuid);
                    if (test_sesh && !test_sesh.hasOwnProperty('search')) {
                        localStorageService.clearAll();
                        Sessions.index  = localStorageService.get('index')  || [];
                        Sessions.active = localStorageService.get('active') || 0;
                    }
                }

                // a sort happened!  gotta know where your active session is...
                // fired in menu.controller.js
                $rootScope.$on('session:sort', function (event, data) {
                    //  moved the active session
                    console.log('Sorted sessions', data);
                    if (data.start == Sessions.active) {
                        console.log('Moved active session, updating...');
                        Sessions.active = data.stop;
                    // moved a session below active above
                    } else if (data.start > Sessions.active && data.stop <= Sessions.active) {
                        console.log('Moved a session over active, updating...');
                        Sessions.active++;
                    // moved a session above active below
                    } else if (data.start < Sessions.active && data.stop >= Sessions.active) {
                        console.log('Moved a session under active, updating...');
                        Sessions.active--;
                    }
                });

                Sessions.is_new = function () {

                    // any existing sessions?
                    if (Sessions.index.length !== 0) {
                        var active_session = Sessions.index[Sessions.active];

                        // pull up the active one
                        if (active_session) {
                            $location.path('/session/' + active_session.uuid);
                        }
                    } else {
                        $location.path('/welcome');
                    }
                };

                Sessions.new = function (name) {
                    //debugger
                    Sessions.active = 0;
                    var is_search = ($route.current.params.search === 'true');
                    console.log('is_search service', is_search);

                    var session = new Session(name, is_search);
                    console.log('session is_search', session.search);
                    Sessions.index.unshift(new SessionIndex(session, name));

                    localStorageService.set(session.uuid, session);
                    localStorageService.set('index', Sessions.index);
                    localStorageService.set('active', Sessions.active);

                    console.log('new session', session.uuid);

                    $location.path('/session/'+session.uuid);
                    return session;
                };

                Sessions.save = function (uuid, data) {
                    var session = localStorageService.get(uuid);
                    if (!session) {
                        return;
                    }

                    session.new = false;
                    session.data = data;

                    Sessions.index[Sessions.active].date = Date.now();
                    localStorageService.set('index', Sessions.index);

                    localStorageService.set(uuid, session);
                };

                Sessions.restore = function (uuid) {
                    var session = localStorageService.get(uuid);

                    console.log('restored session', session);

                    if (!session) $location.path('/');

                    // LOL
                    Sessions.active = Sessions.index.indexOf(Sessions.index.
                        filter(function (session) {
                            return session.uuid === uuid
                        })[0]);

                    console.log('active session', Sessions.active);

                    return session;
                };

                Sessions.delete = function (idx) {
                    var deletedSessionUUID = Sessions.index[idx].uuid;
                    localStorageService.remove(deletedSessionUUID);

                    Sessions.index.splice(idx, 1);
                    localStorageService.set('index', Sessions.index);

                    // if deleted only session:
                    if (Sessions.index.length == 0) {
                        //window.location = '/welcome';
                        $location.path('/');
                    // if deleted active session that was last:
                    } else if (idx == Sessions.active) {
                        var uuid;
                        if (idx == Sessions.index.length) {
                            uuid = Sessions.index[idx-1].uuid;
                        } else {
                            uuid = Sessions.index[idx].uuid;
                        }
                        $location.path('/session/'+uuid);
                    // if deleted session above active
                    } else if (idx < Sessions.active) {
                        Sessions.active--;
                    }
                };

                return Sessions;
        }]);

})();

(function() {
    angular.module('wikitree').

        factory('Utilities', [function() {

            var Utilities = {};

            Utilities.makeUUID = function() {
                // http://stackoverflow.com/a/2117523
                return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
                    return v.toString(16);
                });
            };

            Utilities.makeJitter = function (factor) {
                var jitter = factor * Math.random();
                if (Math.random() < 0.5) jitter = -1 * jitter;
                return jitter;
            };

            Utilities.shuffleArr = function (arr) {
                // copy array
                arr = arr.slice(0);

                //
                // Fisher Yates implementation by mbostock http://bost.ocks.org/mike/shuffle/

                var remaining = arr.length;
                var element;
                var index;

                // While there remain elements to shuffle…
                while (remaining) {

                    // Pick a remaining element…
                    index = Math.floor(Math.random() * remaining--);

                    // And swap it with the current element.
                    element = arr[remaining];
                    arr[remaining] = arr[index];
                    arr[index] = element;
                }

                return arr;
            };

            return Utilities;

        }]);

})();

(function() {
    angular.module('wikitree.search', [
        'ui.bootstrap.typeahead',
        'ui.bootstrap.tpls'
    ]);
})();
(function() {
    angular.module('wikitree.search').

        controller('searchController', ['$scope', '$location', 'Search',
            function($scope, $location, Search) {

                $scope.inputText = '';

                $scope.get_suggestions = function (term) {
                    return Search.get_suggestions(term);
                };

                $scope.tryEnter = function ($event) {
                    if ($event.keyCode === 13) {
                        $event.preventDefault();
                        $scope.start_search(true);
                    }
                };

                $scope.start_search = function (isButton) {
                    var term = $scope.inputText;

                    //if (term) {
                    //    if ($scope.new_session) {
                    //        $location.path('/new/' + term);
                    //    } else {
                    //        $scope.session.do_search(term)
                    //    }
                    //}

                    console.log('is_button', isButton);

                    if (term) {
                        if ($scope.new_session) {
                            if (isButton) {
                                $location.path('/new/' + term + '/true');
                            } else {
                                $location.path('/new/' + term);
                            }
                        } else {
                            if (isButton) {
                                $scope.session.do_search(term, null, null, true);
                            } else {
                                $scope.session.do_search(term);
                            }
                        }
                    }

                    $scope.inputText = '';

                };
            }]);

})();

(function() {
    angular.module('wikitree.search').

        directive('search', [function() {
            return {
                restrict: 'E',
                templateUrl: "/js/angular/search/search.template.html",
                controller: 'searchController',
                link: function($scope, $element, $attributes) {
                    $scope.large = $attributes.large;
                    $scope.new_session = $attributes.newSession;
                }
            }
        }]);

})();

(function() {
    angular.module('wikitree.home', []);
})();
(function() {
    angular.module('wikitree.home').

        controller('home_controller', ['$scope', '$location', 'Utilities',
            function($scope, $location, Utilities) {

                var $graph = $('#home-graph');
                var graph = new HomeGraph($graph[0]);

                function Node(x, y) {
                    this.uuid = Utilities.makeUUID();
                    this.index = undefined; // the zero-based index of the node within the nodes array.
                    this.x = x; // the x-coordinate of the current node position.
                    this.y = y; // the y-coordinate of the current node position.
                    this.px = undefined; // the x-coordinate of the previous node position.
                    this.py = undefined; // the y-coordinate of the previous node position.
                    this.fixed = undefined; // a boolean indicating whether node position is locked.
                    this.weight = undefined; // the node weight; the number of associated links.
                }

                function Link(source, target) {
                    this.uuid = Utilities.makeUUID();
                    this.source = source;
                    this.target = target;
                }

                var nodes = [];
                var links = [];

                var nodesById = {};
                var linksByNodeIds = {};

                var requestID = null;
                var timeoutID = null;

                var limit = 200;
                var count = 0;

                /**
                 * Grow network
                 */

                function addRandomNode() {

                    if (count > limit) {
                        // big crunch-> linkAllNodes();
                        return;
                    }

                    count++;

                    if (!nodes.length) {
                        nodes.push(new Node(
                            window.innerWidth / 2,
                            window.innerHeight / 2
                        ));
                    } else {

                        var sourceIndex = Math.floor(Math.random() * nodes.length);
                        var source = nodes[sourceIndex];

                        var node = new Node(
                            source.x + Utilities.makeJitter(10),
                            source.y + Utilities.makeJitter(10)
                        );

                        var link = new Link(source, node);

                        nodes.push(node);
                        links.push(link);

                        nodesById[node.uuid] = node;
                        linksByNodeIds[source.uuid + ',' + node.uuid] = link;

                    }

                    graph.updateNodesAndLinks(nodes, links);

                    timeoutID = setTimeout(function() {
                        requestID = window.requestAnimationFrame(addRandomNode);
                    }, 200 + (Math.random() * 200));

                }


                /**
                 * Bind network
                 */

                function linkAllNodes() {

                    var pairs = [];
                    var pairsByIds = {};

                    nodes.forEach(function (nodeA) {
                        nodes.forEach(function (nodeB) {
                            if (nodeA.uuid === nodeB.uuid) return;
                            if (pairsByIds[nodeA.uuid + ',' + nodeB.uuid]) return;
                            if (pairsByIds[nodeB.uuid + ',' + nodeA.uuid]) return;
                            if (linksByNodeIds[nodeA.uuid + ',' + nodeB.uuid]) return;
                            if (linksByNodeIds[nodeB.uuid + ',' + nodeA.uuid]) return;
                            var pair = [nodeA, nodeB];
                            pairsByIds[nodeA.uuid + ',' + nodeB.uuid] = pair;
                            pairs.push(pair);
                        });
                    });

                    pairs = Utilities.shuffleArr(pairs);

                    function linkPair() {
                        var pair = pairs.pop();
                        var nodeA = pair[0];
                        var nodeB = pair[1];
                        var link = new Link(nodeA, nodeB);
                        links.push(link);
                        linksByNodeIds[nodeA.uuid + ',' + nodeB.uuid] = link;
                        graph.updateNodesAndLinks(nodes, links);
                    }

                    function timeLoop() {
                        linkPair();
                        timeoutID = setTimeout(function() {
                            requestID = window.requestAnimationFrame(timeLoop);
                        }, 600 + (Math.random() * 600));
                    }

                    timeLoop();
                }


                /**
                 * Beginning
                 */

                timeoutID = setTimeout(function() {
                    requestID = window.requestAnimationFrame(addRandomNode);
                }, 600);


                /**
                 * End
                 */

                $scope.$on('$destroy', function () {
                    clearTimeout(timeoutID);
                    window.cancelAnimationFrame(requestID);
                });



            }]);
})();

(function() {
    angular.module('wikitree.session', [
        'wikitree.session.graph',
        'wikitree.session.menu',
        'wikitree.session.reader',
        'wikitree.session.resizer'
    ]);
})();

(function() {
    angular.module('wikitree.session').

        controller('session_controller',
            [ '$scope'
            , 'Search'
            , 'Sessions'
            , 'Utilities'
            , 'init_session'
            , function ($scope, Search, Sessions, Utilities, init_session) {

            var session = this;

            /**
             * Session state
             */
            var id = init_session.uuid;

            // history
            var current_node_id = init_session.data.current_node_id;
            var prev_stack = init_session.data.prev_stack;
            var next_stack = init_session.data.next_stack;

            // nodes
            var nodes = init_session.data.nodes;
            var nodes_by_id = {};
            var nodes_by_name = {};

            // links
            var links = init_session.data.links;
            var links_by_id = {};
            var links_by_node_ids = {};

            // wait for load to broadcast update events
            setTimeout(function () {
                $scope.$apply(function () {
                    $scope.$broadcast('update:nodes+links');
                    $scope.$broadcast('update:currentnode');
                });
            }, 1);

            // handle scope destroy
            $scope.$on('$destroy', function () {
                save();
            });

            // handle route change
            $scope.$on('$routeChangeEnd', function () {
                save();
            });

            // handle graph update
            //$scope.$on('update:nodes+links', function () {
            //    console.log('saving nodes links');
            //    save();
            //});

            // handle window close
            $(window).on('beforeunload', function () {
                save();
            });


            /**
             * Create a node object
             * @param  {Object}  args        constructor argumentts
             * @param  {String}  args.uuid   unique id.  Default: generate a new one
             * @param  {String}  args.type   node type (article | search | category)
             * @param  {String}  args.title  used if type is article | category
             * @param  {String}  args.query  used if type is search
             * @constructor
             */
            function Node (args) {
                this.uuid = args.uuid || Utilities.makeUUID();
                this.type = args.type; // article, category, search, note
                this.name = args.name;
                this.title = args.title;
                this.query = args.query;
                this.body = args.body;
                // d3 force graph attributes
                // https://github.com/mbostock/d3/wiki/Force-Layout#nodes
                this.index = undefined;  // the zero-based index of the node within the nodes array.
                this.x = undefined;      // the x-coordinate of the current node position.
                this.y = undefined;      // the y-coordinate of the current node position.
                this.px = undefined;     // the x-coordinate of the previous node position.
                this.py = undefined;     // the y-coordinate of the previous node position.
                this.fixed = undefined;  // a boolean indicating whether node position is locked.
                this.weight = undefined; // the node weight; the number of associated links.
            }

            /**
             * Add a node to the session
             * @param {Object} args see Node class for more information
             * @returns {Node} new Node object
             */
            function add_node (args) {
                var node = new Node({
                    type: args.type,
                    name: args.name,
                    title: args.title,
                    query: args.query
                });
                nodes.push(node);
                nodes_by_id[node.uuid] = node;
                if (node.type !== 'note') {
                    nodes_by_name[node.name] = node;
                }
                return node;
            }


            /**
             * Create a link object
             * @param {Object}  args
             * @param {String}  args.uuid      unique id.  Default: generate a new one
             * @param {Number}  args.sourceId  id of source node
             * @param {Number}  args.targetId  id of target node
             * @param {Boolean} args.linkback  if link is cyclical
             * @constructor
             */
            function Link (args) {
                this.uuid = args.uuid || Utilities.makeUUID();
                this.sourceId = args.sourceId;
                this.targetId = args.targetId;
                this.linkbackId = args.linkbackId;
                // d3 force graph attributes
                // https://github.com/mbostock/d3/wiki/Force-Layout#links
                this.source = nodes_by_id[this.sourceId];
                this.target = nodes_by_id[this.targetId];
            }

            /**
             * Create a link between two nodes
             * @param {Number} tgt_node_id id of target node
             * @param {Number} src_node_id id of source node
             */
            function link (src_node_id, tgt_node_id) {
                var tgt_node = nodes_by_id[tgt_node_id];
                var src_node = nodes_by_id[src_node_id];

                // no self-referencing nodes
                if (tgt_node_id === src_node_id) return;

                if ((src_node.x || src_node.y) && !(tgt_node.x || tgt_node.y)) {
                    tgt_node.x = src_node.x + Utilities.makeJitter(10);
                    tgt_node.y = src_node.y + Utilities.makeJitter(10);
                }

                if (links_by_node_ids[src_node_id] &&
                    links_by_node_ids[src_node_id][tgt_node_id]) {
                    // it exists, we're done
                } else if (links_by_node_ids[tgt_node_id] &&
                    links_by_node_ids[tgt_node_id][src_node_id]) {
                    // add node with linkback
                    add_link(
                        src_node_id,
                        tgt_node_id,
                        links_by_node_ids[tgt_node_id][src_node_id].uuid
                    );
                } else {
                    // add node WITHOUT linkback
                    add_link(
                        src_node_id,
                        tgt_node_id,
                        null
                    );
                }
            }

            function removeLink (sourceId, targetId) {
                if (!links_by_node_ids[sourceId]) return null;

                var link = links_by_node_ids[sourceId][targetId];
                if (!link) return null;
                links = links.filter(function (l) {
                    return l.uuid !== link.uuid
                });
                delete links_by_node_ids[sourceId][targetId];
                delete links_by_id[link.uuid];
            }

            /**
             * Add a link to the session
             * @param {Number} source_id ID of source node
             * @param {Number} target_id ID of target node
             * @param linkback
             */
            function add_link (source_id, target_id, linkbackId) {
                var link = new Link({
                    sourceId: source_id,
                    targetId: target_id,
                    linkbackId: linkbackId
                });
                links.push(link);
                if (!links_by_node_ids[source_id]) links_by_node_ids[source_id] = {};
                links_by_node_ids[source_id][target_id] = link;
                links_by_id[link.uuid] = link;
            }

            /**
             * Scope interface
             */

            /**
             * Get the current node
             * @returns {Node}
             */
            session.get_current_node = function () {
                return nodes_by_id[current_node_id];
            };

            /**
             * Set the currently selected graph node
             * @param {String} nodeId
             */
            session.set_current_node_id = function (nodeId) {
                // make sure we're not already here
                if (current_node_id === nodeId) return null;
                // as with browser history,
                // when jumping to new page
                // add current to prev stack
                // and flush out next stack
                if (current_node_id) {
                    prev_stack.push(current_node_id);
                }
                next_stack = [];
                current_node_id = nodeId;
                $scope.$broadcast('update:currentnode');
            };

            /**
             * Update a note node
             */
            session.updateNoteNodeContent = function (nodeId, name, body) {
                var node = nodes_by_id[nodeId];
                if (!node) return;
                node.name = name;
                node.body = body;
                $scope.$broadcast('update:note-node-content', node);
            };

            /**
             * Get session nodes
             * @returns {Array} Copy of nodes array
             */
            session.get_nodes = function () {
                return nodes.slice();
            };

            /**
             * Get session links
             * @returns {Array} Copy of links array
             */
            session.get_links = function () {
                return links.slice();
            };

            session.getNode = function (node_id) {
                return nodes_by_id[node_id];
            };

            session.getLink = function (link_id) {
                return links_by_id[link_id]
            }

            /**
             * Whether session history can be advanced
             * @returns {Boolean}
             */
            session.has_forward = function () {
                return !!next_stack.length;
            };

            /**
             * Whether session history can be moved backwards
             * @returns {boolean}
             */
            session.has_backward = function () {
                return !!prev_stack.length;
            };

            /**
             * Select the session node as current
             * @returns {Number} id of new current node
             */
            session.go_backward = function () {
                if (!prev_stack.length) return null;
                next_stack.push(current_node_id);
                current_node_id = prev_stack.pop();

                $scope.$broadcast('update:currentnode');
            };

            /**
             * Select the next session node as current
             * @returns {Number} id of new current node
             */
            session.go_forward = function () {
                if (!next_stack.length) return null;
                prev_stack.push(current_node_id);
                current_node_id = next_stack.pop();

                $scope.$broadcast('update:currentnode');
            };

            /**
             * Remove a node
             * @param {Number} nodeId
             */
            session.removeNode = function (nodeId) {

                // validate existence
                var node = nodes_by_id[nodeId];
                if (!node) return;

                // remove from history ////////////////////////////////////////

                prev_stack = prev_stack
                    .filter(function (id) {
                        return id !== nodeId
                    });
                next_stack = next_stack
                    .filter(function (id) {
                        return id !== nodeId
                    });

                // find a new current node?
                if (current_node_id === nodeId) {
                    if (prev_stack.length) {
                        // try previous first
                        current_node_id = prev_stack.pop();
                    } else if (next_stack.length) {
                        // how about next
                        current_node_id = next_stack.pop();
                    } else {
                        // uh oh
                        current_node_id = null;
                    }
                }

                // remove from nodes //////////////////////////////////////////

                nodes = nodes.filter(function (n) {
                    return n.uuid !== node.uuid
                });
                delete nodes_by_id[node.uuid];
                if (node.type !== 'note') {
                    delete nodes_by_name[node.name];
                }

                // remove from links //////////////////////////////////////////

                // remove any links with node from array
                links = links.filter(function (link) {
                    return link.sourceId !== nodeId && link.targetId !== nodeId
                });

                // remove any references by node id
                delete links_by_node_ids[nodeId];
                Object.keys(links_by_node_ids).forEach(function (sourceId) {
                    delete links_by_node_ids[sourceId][nodeId];
                });

                // alert the media
                $scope.$broadcast('update:nodes+links');
                $scope.$broadcast('update:currentnode');
            };

            /**
             * Remove a pair of links
             * @param {Number} linkId
             */

            session.removeLinkPair = function (linkId) {
                var link = links_by_id[linkId];
                if (!link) return;
                var nodeA = link.source;
                var nodeB = link.target;
                // remove both directions
                removeLink(nodeA.uuid, nodeB.uuid);
                removeLink(nodeB.uuid, nodeA.uuid);

                $scope.$broadcast('update:nodes+links');
            };

            // the big one

            /**
             * Process a search, adding nodes and links as needed
             * @param {String} term search term
             * @param {Number} src_node_id ID of source node
             * @param {Boolean} no_set_current whether to set new node as current
             * @param {Boolean} isSearch whether this should go straight to search results
             */
            session.do_search = function (term, src_node_id, no_set_current, isSearch) {
                var start_time = Date.now();

                console.log('term', term);

                if (!(term && term.length)) return;

                var search;

                if (isSearch) {
                    console.log('search?');
                    search = Search.findOrAddSearch(term);
                } else {
                    search = Search.findOrAddArticle(term);
                }

                search.then(function (result) {
                        console.log(result);

                        // no result?
                        if (!result) {
                            alert('Sorry, something went wrong for "' + term + '"');
                            return;
                        }

                        // should we make a new node or get an existing one?
                        var node = (nodes_by_name[result.name])
                            ? nodes_by_name[result.name]
                            : add_node(result);

                        console.log(node);

                        // does our node need to be linked?
                        if (src_node_id) {
                            link(src_node_id, node.uuid);
                        }

                        $scope.$broadcast('update:nodes+links');

                        if (!no_set_current) {
                            session.set_current_node_id(node.uuid);
                            $scope.$broadcast('update:currentnode');
                        }

                        var end_time = Date.now();
                        console.log('handleTitle complete: ', end_time - start_time);
                    }).
                    catch(function (err) {
                        console.log('oh fuck', err);
                    });
            };

            session.addNewNoteNode = function () {
                var node = add_node({ type: 'note' });
                $scope.$broadcast('update:nodes+links');
                return node;
            };

            session.addLink = function (sourceId, targetId) {
                link(sourceId, targetId);
                $scope.$broadcast('update:nodes+links');
            };

            /**
             * Begin a session
             */
            (function activate() {
                if (init_session.new) {
                    session.do_search(init_session.term, null, null, init_session.search);
                    session.new = false;
                }

                nodes.forEach(function (node) {
                    nodes_by_id[node.uuid] = node;
                    if (node.type !== 'note') {
                        nodes_by_name[node.name] = node;
                    }
                });

                links.forEach(function (link) {
                    console.log('rebuild lynx');
                    var sourceId = link.sourceId;
                    var targetId = link.targetId;
                    link.source = nodes_by_id[sourceId];
                    link.target = nodes_by_id[targetId];
                    links_by_id[link.uuid] = link;
                    if (!links_by_node_ids[sourceId]) links_by_node_ids[sourceId] = {};
                    links_by_node_ids[sourceId][targetId] = link;
                });
            })()

            /**
             * Save a session
             */
            function save () {
                Sessions.save(id, {
                    current_node_id: current_node_id,
                    prev_stack: prev_stack,
                    next_stack: next_stack,
                    nodes: nodes,
                    links: links
                });
            }

        }]);
})();


(function() {
    angular.module('wikitree.session.menu', [
        'wikitree.session.menu.session_tile'
    ]);
})();
(function() {
    angular.module('wikitree.session.menu').

        controller('menuController', [
            '$rootScope',
            '$scope',
            '$location',
            'Search',
            'Sessions',
            function($rootScope, $scope, $location, Search, Sessions) {

                $scope.sessions = Sessions.index;
                $scope.active = Sessions.active;
                $scope.$watch(function () {
                    return Sessions.active;
                }, function (value) {
                    $scope.active = value;
                });

                $scope.open = false;

                $scope.goHome = function() {
                    $location.path('/welcome');
                };

                $scope.toggleMenu = function () {
                    $scope.open = !$scope.open;
                    if ($scope.open) {
                        $rootScope.$broadcast('menu:open');
                    } else {
                        $rootScope.$broadcast('menu:close');
                    }
                };

                $scope.sortableOptions = {
                    update: function(e, ui) {
                        $scope.$broadcast('session:cancel_edit');
                        $rootScope.$broadcast('session:sort', {
                            start: ui.item.sortable.index,
                            stop:  ui.item.sortable.dropindex
                        });
                        console.log('index', ui.item.sortable.index, 'moved to', ui.item.sortable.dropindex);
                    }
                };

                $scope.addNoteNode = function () {
                    $rootScope.$broadcast('request:graph:add_note_node');
                };

                $scope.locateCurrentNode = function () {
                    $rootScope.$broadcast('request:graph:locate_current_node');
                };

        }]);
})();


(function() {
    angular.module('wikitree.session.menu').

        directive('menu', [function() {
            return {
                restrict: 'E',
                replace: true,
                templateUrl: '/js/angular/session/menu/menu.template.html',
                controller: 'menuController'
            }
        }]);
})();

(function() {
    angular.module('wikitree.session.menu.session_tile', [
        'angularMoment',
        'ui.sortable'
    ]);
})();
(function() {
    angular.module('wikitree.session.menu.session_tile').

        directive('enterpress', function () {
            return {
                link: function (scope, element, attrs) {
                    element.bind("keydown keypress", function (event) {
                        if (event.which === 13) {
                            scope.$apply(function () {
                                scope.$eval(attrs.enterpress);
                            });

                            event.preventDefault();
                        }
                    });
                }
            }


        });

})();
(function() {
    angular.module('wikitree.session.menu.session_tile').

        directive('escpress', [function () {
            return {
                link: function (scope, element, attrs) {
                    element.bind("keydown keypress", function (event) {
                        if (event.which === 27) {
                            scope.$apply(function () {
                                scope.$eval(attrs.escpress);
                            });

                            event.preventDefault();
                        }
                    });
                }
            }
        }]);

})();

(function() {
    angular.module('wikitree.session.menu.session_tile').

        directive('focus', ['$timeout', function($timeout) {
            return {
                scope : {
                    trigger : '@focus'
                },
                link : function(scope, element) {
                    scope.$watch('trigger', function(value) {
                        if (value === "true") {
                            $timeout(function() {
                                element[0].focus();
                            });
                        }
                    });
                }
            };
        }]);

})();














(function() {
    angular.module('wikitree.session.menu.session_tile').

        controller('sessionController', ['$scope', '$location', 'Sessions', function($scope, $location, Sessions) {

            $scope.editing = false;

            $scope.edit = function() {
                console.log('edit');
                if (!$scope.editing) {
                    $scope.$parent.$broadcast('session:cancel_edit');
                }
                $scope.editing = !$scope.editing;
                $scope.$parent.$broadcast('focus');
            };


            $scope.cancel_edit = function () {
                $scope.$parent.$broadcast('session:cancel_edit');
            };

            $scope.$on('session:cancel_edit', function() {
                $scope.session.rename = $scope.session.name;
                $scope.editing = false;
            });

            $scope.select = function(idx) {
                //Sessions.restore(idx);
                $scope.$parent.$broadcast('session:cancel_edit');
                $location.path('/session/'+$scope.session.uuid);
            };

            $scope.delete = function(idx) {
                Sessions.delete(idx);
                $scope.$parent.$broadcast('session:cancel_edit');
            };

            $scope.rename = function() {
                $scope.session.name = $scope.session.rename;
                $scope.session.rename = $scope.session.name;
                $scope.editing = false;
            };

        }]);
})();
(function() {
    angular.module('wikitree.session.menu.session_tile').

        directive('session', [function() {
            return {
                restrict: 'E',
                replace: true,
                templateUrl: "/js/angular/session/menu/session_tile/session_tile.template.html",
                controller: 'sessionController'
            }
        }]);

})();

(function() {
    angular.module('wikitree.session.reader', []);
})();

(function() {
    angular.module('wikitree.session.reader').
        controller('readerController', [
            '$rootScope',
            '$scope',
            'Resizer',
            'Loading',
            'Sessions',
            'Articles',
            'Searches',
            'Categories',
            function($rootScope, $scope, Resizer, Loading, Sessions, Articles, Searches, Categories) {

                // for reader width
                $scope.readerWidth = Resizer.size + 'px';

                // for frame node load
                $scope.currentNodeName = null;
                $scope.missedFrameUpdate = false;
                $scope.hasReferences = false;

                // for loading indicator
                $scope.loadingCount = Loading.count;

                // for prev/next buttons
                $scope.hasBackward = $scope.session.has_backward();
                $scope.hasForward = $scope.session.has_forward();


                // keep history buttons updated
                $scope.$on('update:currentnode', function () {
                    $scope.hasBackward = $scope.session.has_backward();
                    $scope.hasForward = $scope.session.has_forward();
                });

                // keep loading indicator updated
                $scope.$on('mediawikiapi:loadstart', function () {
                    $scope.loadingCount = Loading.count;
                });
                $scope.$on('mediawikiapi:loadend', function () {
                    $scope.loadingCount = Loading.count;
                });

                // keep iframe content updated
                $scope.$on('update:currentnode', function () {
                    $scope.updateFrameNode();
                });

                // keep reader width updated
                $scope.$on('split:resize', function (e, data) {
                    $scope.readerWidth = Resizer.size + 'px';
                });

                /**
                 * Reader controls
                 */

                $scope.historyBackward = function () {
                    $scope.session.go_backward();
                };

                $scope.historyForward = function () {
                    $scope.session.go_forward();
                };

                $scope.openSourceArticle = function () {
                    var node = $scope.session.get_current_node();
                    if (!(node && node.name)) return;
                    var url = '';
                    switch (node.type) {
                        case 'article':
                            url = 'https://en.wikipedia.org/wiki/';
                            url += encodeURIComponent(node.title);
                            break;
                        case 'search':
                            url = 'http://en.wikipedia.org/w/index.php?fulltext=1&search=';
                            url += encodeURIComponent(node.query);
                            break;
                    }
                    var link = document.createElement('a');
                    link.target = '_blank';
                    link.href = url;
                    link.click();
                };

                $scope.scrollToReferences = function () {
                    if (!$scope.frameWindow) return;
                    $scope.frameWindow.scrollToReferences();
                };

                /**
                 * Reader node content
                 */

                $scope.updateFrameNode = function () {

                    // make sure we got iframe
                    if (!$scope.frameWindow) {
                        $scope.missedFrameUpdate = true;
                        return;
                    }

                    // grab current node
                    //var node = CurrentSession.getCurrentNode();
                    var node = $scope.session.get_current_node();

                    // make sure we got node
                    if (!node) {
                        // TEMP TODO FIXME NOTE WARN DANGER
                        // taking this out for capstone presentation
                        // $scope.currentNodeName = null;
                        // $scope.frameWindow.loadError(
                        //     'System error: could not find a current node'
                        // );
                        return;
                    }

                    // check if node already displayed
                    if ($scope.currentNodeName) {
                        if ($scope.currentNodeName === node.name) {
                            return;
                        }
                    }

                    /**
                     * Passed, load content
                     */

                     // update current name
                    $scope.currentNodeName = node.name;

                    // save update
                    //Sessions.save();

                    // on iframe node load
                    function onLoad() {
                        // update reference check
                        $scope.hasReferences = $scope.frameWindow.checkForReferences();
                    }

                    // load node into iframe
                    switch (node.type) {
                        case 'category': loadCategory(node, onLoad); break;
                        case 'article': loadArticle(node, onLoad); break;
                        case 'search': loadSearch(node, onLoad); break;
                    }

                };

                function loadCategory(node, callback) {
                    Categories.getByTitle(node.title).
                        then(function (category) {
                            $scope.frameWindow.loadCategory(
                                category,
                                makeTitleCallback(node)
                            );
                            if (callback) callback(category);
                        }).
                        catch(function () {
                            $scope.frameWindow.loadError(
                                'System error: unable to load "' + node.title + '"'
                            );
                        });
                }

                function loadArticle(node, callback) {
                    Articles.getByTitle(node.title).
                        then(function (article) {
                            $scope.frameWindow.loadArticle(
                                article,
                                makeTitleCallback(node)
                            );
                            if (callback) callback(article);
                        }).
                        catch(function () {
                            $scope.frameWindow.loadError(
                                'System error: unable to load article "' + node.title + '"'
                            );
                        });
                }

                function loadSearch(node, callback) {
                    Searches.getByQuery(node.query).
                        then(function (search) {
                            $scope.frameWindow.loadSearch(
                                search,
                                makeTitleCallback(node)
                            );
                            if (callback) callback(search);
                        }).
                        catch(function () {
                            $scope.frameWindow.loadError(
                                'System error: unable to load search "' + node.query + '"'
                            );
                        });
                }

                function makeTitleCallback(node) {
                    return function (title, noSetCurrent, isSearch) {
                        $scope.$apply(function () {

                            // user clicked an iframe title!
                            title = decodeURIComponent(title);

                            $scope.session.do_search(title, node.uuid, noSetCurrent, isSearch);

                        });
                    };
                }

                /**
                 * Load article if there is one
                 */

                 if ($scope.session.get_current_node()) {
                    $scope.updateFrameNode();
                 }

            }
        ]);
})();

(function() {
    angular.module('wikitree.session.reader').
        directive('reader', [function() {
            return {
                restrict: 'E',
                replace: true,
                templateUrl: "/js/angular/session/reader/reader.template.html",
                controller: 'readerController',
                link: function(scope, element, attrs) {
                    // grab reference to iFrame's window object
                    // (gives us access to its global JS scope)
                    scope.frameWindow = null;
                    // be wary of race conditions...
                    element.find('iframe').
                        // ...add iframe load event
                        on('load', function () {
                            scope.frameWindow = this.contentWindow;
                            // check if frame called before existence
                            if (scope.missedFrameUpdate) {
                                scope.updateFrameNode();
                            }
                        }).
                        // ...THEN give it src url
                        attr('src', '/article-frame.html');
                }
            };
        }]);
})();

(function() {
    angular.module('wikitree.session.graph', []);
})();
(function () {
    angular.module('wikitree.session.graph').
        controller('graphController', [
            '$scope',
            'Resizer',
            function ($scope, Resizer) {

            	// for graph position
                $scope.positionRight = Resizer.size + 'px';


                /**
                 * Global events
                 */

                // handle "locate current node" button
                $scope.$on('request:graph:locate_current_node', function () {
                    var node = $scope.session.get_current_node();
                    $scope.graph.centerOnNode(node);
                });

                // handle "locate node" button
                $scope.$on('request:graph:locate_node', function (e, node) {
                    $scope.graph.centerOnNode(node);
                });

                // handle "add note node" button
                $scope.$on('request:graph:add_note_node', function () {
                    $scope.session.addNewNoteNode();
                });

                // handle map/reader split resize
                $scope.$on('split:resize', function (e, data) {
                    $scope.positionRight = Resizer.size + 'px';
                    setTimeout(function () {
                        $scope.graph.updateSize();
                    }, 1);
                });

                // handle model update (nodes + links)
                $scope.$on('update:nodes+links', function () {
                    var nodes = $scope.session.get_nodes();
                    var links = $scope.session.get_links();
                    $scope.graph.updateNodesAndLinks(nodes, links);
                });

                // handle model update (current node)
                $scope.$on('update:currentnode', function () {
                    var node = $scope.session.get_current_node();
                    $scope.graph.updateCurrentNode(node);
                });

                // handle model update (note node content)
                $scope.$on('update:note-node-content', function (e, node) {
                    $scope.graph.updateNoteNodeContent(node);
                });


                /**
                 * Scope methods
                 */

                $scope.setCurrentNode = function (nodeId) {
                    $scope.session.set_current_node_id(nodeId);
                };

                $scope.setCurrentNoteNode = function (nodeId) {
                    $scope.session.setCurrentNoteNodeId(nodeId);
                };

                $scope.removeNode = function (nodeId) {
                    var node = $scope.session.getNode(nodeId);
                    if (!node) return;
                    if (window.confirm('Remove the node "' + node.name + '" from your session?')) {
                        $scope.session.removeNode(node.uuid);
                    }
                };

                $scope.removeLink = function (linkId) {
                    var link = $scope.session.getLink(linkId);
                    if (!link) return;
                    var nodeA = link.source;
                    var nodeB = link.target;
                    if (window.confirm('Remove the link between "' + nodeA.name + '" and "' + nodeB.name + '" from your session?')) {
                        $scope.session.removeLinkPair(link.uuid);
                    }
                };

                $scope.addLink = function (sourceId, targetId) {
                    $scope.session.addLink(sourceId, targetId);
                };

            }
        ]);
})();

(function() {
    angular.module('wikitree.session.graph').
        directive('graph', [function() {
            return {
                restrict: 'E',
                replace: true,
                templateUrl: '/js/angular/session/graph/graph.template.html',
                controller: 'graphController',
                link: function(scope, element) {
                    scope.graph = new ForceGraph(
                        element[0],
                        scope
                    );
                    scope.$broadcast('update:nodes+links');
                    scope.$broadcast('update:currentnode');
                }
            }
        }]);
})();

(function() {
    angular.module('wikitree.session.resizer', []);
})();

(function() {
    angular.module('wikitree.session.resizer').
        directive('resizer', [
            '$rootScope',
            'Resizer',
            function($rootScope, Resizer) {
                var link = function(scope, element, attrs) {

                    var $window = $(window);
                    var $resizer = $('#resizer');
                    var resizerWidth = $resizer.width();

                    function setRightSize(size) {
                        var winWidth = window.innerWidth;
                        // make sure size is reasonable
                        if (winWidth - size < Resizer.MIN_REMAINDER) return;
                        if (size < Resizer.MIN_SIZE) return;
                        // update measurements
                        Resizer.size = size;
                        Resizer.ratio = size / winWidth;
                        // tell the world
                        $rootScope.$broadcast('split:resize');
                    }

                    function fillElement() {
                        $resizer.css({
                            width: '100%',
                            left: 0,
                            right: 0
                        });
                    }

                    function restoreElement() {
                        $resizer.css({
                            width: '', // reset
                            left: '', // reset
                            right: Resizer.size - resizerWidth + 5
                        });
                    }

                    /**
                     * Initialize
                     */

                    setRightSize(Resizer.ratio * window.innerWidth);
                    restoreElement();

                    /**
                     * Handle dragging
                     */

                    // start drag
                    $resizer.on('mousedown', function (e) {
                        // fill screen to prevent iframe steal
                        scope.$apply(function () {
                            fillElement();
                        });
                        // handle drag on any movement
                        $window.on('mousemove', dragHandler);
                        // release drag handler on next mouseup
                        $window.one('mouseup', function (e) {
                            // put resizer back in place
                            scope.$apply(function () {
                                restoreElement();
                            });
                            // unbind drag event for now
                            $window.unbind('mousemove', dragHandler);
                        });
                    });

                    // during drag
                    function dragHandler(e) {
                        e.preventDefault();
                        scope.$apply(function () {
                            setRightSize(window.innerWidth - e.pageX);
                        });
                    }

                    /**
                     * Handle window resize
                     */

                    $window.on('resize', function () {
                        scope.$apply(function () {
                            setRightSize(Resizer.ratio * window.innerWidth);
                            restoreElement();
                        });
                    });

                };

                return {
                    restrict: 'E',
                    replace: true,
                    templateUrl: '/js/angular/session/resizer/resizer.template.html',
                    link: link
                }
            }
        ]
    );
})();

(function() {
    angular.module('wikitree').
        factory('Resizer', [
            function () {
                var Resizer = {};
                Resizer.MIN_REMAINDER = 120;
                Resizer.MIN_SIZE = 300;
                Resizer.ratio = 3/5;
                Resizer.size = Resizer.ratio * window.innerWidth;
                return Resizer;
            }
        ]
    );
})();

(function() {
    angular.module('wikitree').

        factory('Articles', ['$q', '$http', '$rootScope', function($q, $http, $rootScope) {

            /**
             * Private
             */

            var byTitle = {};
            var byUnsafeTitle = {};

            function Article(args) {
                this.title = args.title;
                this.content = args.content;
                this.categories = args.categories;
            }

            //function getFromAPI(title) {
            //    console.log('Getting article from API...', title);
            //    var timestamp = Date.now();
            //    $rootScope.$broadcast('mediawikiapi:loadstart', timestamp);
            //
            //    return $http.jsonp('https://en.wikipedia.org/w/api.php', {
            //        params: {
            //            action: 'parse',
            //            prop: 'text|categorieshtml|displaytitle',
            //            redirects: 'true',
            //            page: title,
            //            format: 'json',
            //            callback: 'JSON_CALLBACK'
            //        }
            //
            //    }).then(function (data) {
            //        $rootScope.$broadcast('mediawikiapi:loadend', timestamp);
            //        if (data && data.parse && data.parse.title) {
            //            return data.parse;
            //        } else {
            //            throw "Article API error";
            //        }
            //
            //    }).catch(function (err) {
            //        console.error(err);
            //    });
            //
            //
            //}

            function getFromAPI(title) {

                console.log('Getting article from API...', title);

                var timestamp = Date.now();
                return $q(function (resolve, reject) {
                    $rootScope.$broadcast('mediawikiapi:loadstart', timestamp);
                    $http.jsonp('https://en.wikipedia.org/w/api.php', {
                        params: {
                            action: 'parse',
                            prop: 'text|categorieshtml|displaytitle',
                            redirects: 'true',
                            page: title,
                            format: 'json',
                            callback: 'JSON_CALLBACK'
                        }
                    }).
                        success(function (data) {
                            $rootScope.$broadcast('mediawikiapi:loadend', timestamp);
                            if (data && data.parse && data.parse.title) {
                                resolve(data.parse);
                            } else {
                                console.error('Article API error', arguments);
                                reject(null);
                            }
                        }).
                        error(function () {
                            $rootScope.$broadcast('mediawikiapi:loadend', timestamp);
                            console.error('Article API error', arguments);
                            reject(null);
                        });
                });
            }

            /**
             * Public
             */

            var Articles = {};

            Articles.getByTitle = function (title) {
                return $q(function (resolve, reject) {
                    if (byTitle[title]) {
                        resolve(byTitle[title]);
                    } else {
                        getFromAPI(title).
                            then(function (result) {
                                if (result) {
                                    var article = new Article({
                                        title: result.title,
                                        content: result.text['*'],
                                        categories: result.categorieshtml['*'],
                                        displaytitle: result.displaytitle
                                    });
                                    byTitle[article.title] = article;
                                    resolve(article);
                                } else {
                                    // sucks
                                    console.error('Article not found', title);
                                    reject(null);
                                }
                            }).
                            catch(function () {
                                // sucks
                                console.error('Article API error', title, arguments);
                                reject(null);
                            });
                    }
                });
            };

            // JUST for user input
            Articles.getByUnsafeTitle = function (unsafeTitle) {
                return $q(function (resolve, reject) {
                    if (byUnsafeTitle[unsafeTitle]) {
                        resolve(byUnsafeTitle[unsafeTitle]);
                    } else {
                        getFromAPI(unsafeTitle).
                            then(function (result) {
                                if (result) {
                                    var article = new Article({
                                        title: result.title,
                                        content: result.text['*'],
                                        categories: result.categorieshtml['*'],
                                        displaytitle: result.displaytitle
                                    });
                                    byUnsafeTitle[unsafeTitle] = article;
                                    byTitle[article.title] = article;
                                    resolve(article);
                                } else {
                                    // sucks
                                    console.error('Article not found!', unsafeTitle);
                                    reject(null);
                                }
                            }).
                            catch(function () {
                                // sucks
                                console.error('Article API error', unsafeTitle, arguments);
                                reject(null);
                            });
                    }
                });
            };

            return Articles;

        }]);

})();

(function() {
    angular.module('wikitree').

        factory('Categories', ['$q', '$http', '$rootScope', function($q, $http, $rootScope) {

            /**
             * Private
             */

            var byTitle = {};
            var byUnsafeTitle = {};

            function Category(args) {
                this.name = args.name;
                this.title = args.title;
                this.content = args.content;
                this.categories = args.categories;
                this.displaytitle = args.displaytitle;
                this.subcategories = args.subcategories;
                this.memberpages = args.memberpages;
            }

            function getFromAPI(title) {

                console.log('Getting category from API...', title);

                var timestamp = Date.now();
                return $q(function (resolve, reject) {
                    // fetch parsed content
                    var getPageContent = $http.jsonp('https://en.wikipedia.org/w/api.php', {
                        params: {
                            action: 'parse',
                            prop: 'text|categorieshtml|displaytitle',
                            redirects: 'true',
                            page: title,
                            format: 'json',
                            callback: 'JSON_CALLBACK'
                        }
                    });
                    // fetch subcategories
                    var getSubcategories = $http.jsonp('https://en.wikipedia.org/w/api.php', {
                        params: {
                            action: 'query',
                            list: 'categorymembers',
                            cmtype: 'subcat',
                            cmtitle: title,
                            cmlimit: 500,
                            format: 'json',
                            callback: 'JSON_CALLBACK'
                        }
                    });
                    // fetch member pages
                    var getMemberpages = $http.jsonp('https://en.wikipedia.org/w/api.php', {
                        params: {
                            action: 'query',
                            list: 'categorymembers',
                            cmtype: 'page',
                            cmtitle: title,
                            cmlimit: 500,
                            format: 'json',
                            callback: 'JSON_CALLBACK'
                        }
                    });
                    // wait for all calls to complete
                    $q.all([getPageContent, getSubcategories, getMemberpages]).
                        then(function (values) {
                            $rootScope.$broadcast('mediawikiapi:loadend', timestamp);

                            var page = values[0];
                            var subcategories = values[1];
                            var memberpages = values[2];

                            var result = {};

                            if (page &&
                                page.data &&
                                page.data.parse &&
                                page.data.parse.title) {
                                result.title = page.data.parse.title;
                                result.content = page.data.parse.text['*'];
                                result.categories = page.data.parse.categorieshtml['*'];
                                result.displaytitle = page.data.parse.displaytitle;
                            }

                            if (subcategories &&
                                subcategories.data &&
                                subcategories.data.query &&
                                subcategories.data.query.categorymembers &&
                                subcategories.data.query.categorymembers.length) {
                                result.subcategories = subcategories.data.query.categorymembers;
                            }

                            if (memberpages &&
                                memberpages.data &&
                                memberpages.data.query &&
                                memberpages.data.query.categorymembers &&
                                memberpages.data.query.categorymembers.length) {
                                result.memberpages = memberpages.data.query.categorymembers;
                            }

                            if (result.title) {
                                result.name = result.title.slice('Category:'.length);
                                resolve(result);
                            } else {
                                console.error('Category API error', arguments);
                                reject(null);
                            }

                        }).
                        catch(function () {
                            $rootScope.$broadcast('mediawikiapi:loadend', timestamp);
                            console.error('Category API error', arguments);
                            reject(null);
                        });
                });
            }

            /**
             * Public
             */

            var Categories = {};

            Categories.getByTitle = function (title) {
                return $q(function (resolve, reject) {
                    if (byTitle[title]) {
                        resolve(byTitle[title]);
                    } else {
                        getFromAPI(title).
                            then(function (result) {
                                if (result) {
                                    var category = new Category({
                                        name: result.name,
                                        title: result.title,
                                        content: result.content,
                                        categories: result.categories,
                                        displaytitle: result.displaytitle,
                                        subcategories: result.subcategories,
                                        memberpages: result.memberpages
                                    });
                                    byTitle[category.title] = category;
                                    resolve(category);
                                } else {
                                    // sucks
                                    console.error('Category not found', title);
                                    reject(null);
                                }
                            }).
                            catch(function () {
                                // sucks
                                console.error('Category API error', title, arguments);
                                reject(null);
                            });
                    }
                });
            };

            // JUST for user input
            Categories.getByUnsafeTitle = function (unsafeTitle) {
                return $q(function (resolve, reject) {
                    if (byUnsafeTitle[unsafeTitle]) {
                        resolve(byUnsafeTitle[unsafeTitle]);
                    } else {
                        getFromAPI(unsafeTitle).
                            then(function (result) {
                                if (result) {
                                    var category = new Category({
                                        name: result.name,
                                        title: result.title,
                                        content: result.content,
                                        categories: result.categories,
                                        displaytitle: result.displaytitle,
                                        subcategories: result.subcategories,
                                        memberpages: result.memberpages
                                    });
                                    byUnsafeTitle[unsafeTitle] = category;
                                    byTitle[category.title] = category;
                                    resolve(category);
                                } else {
                                    // sucks
                                    console.error('Category not found!', unsafeTitle);
                                    reject(null);
                                }
                            }).
                            catch(function () {
                                // sucks
                                console.error('Category API error', unsafeTitle, arguments);
                                reject(null);
                            });
                    }
                });
            };

            return Categories;

        }]);

})();

(function() {
    angular.module('wikitree').
        factory('Loading', [
        	'$rootScope',
            function ($rootScope) {

                var Loading = {};

                Loading.count = 0;

                $rootScope.$on('mediawikiapi:loadstart', function () {
                    Loading.count++;
                });

                $rootScope.$on('mediawikiapi:loadend', function () {
                    Loading.count--;
                    // protect from bad timing
                    if (Loading.count < 0) {
                        Loading.count = 0;
                    }
                });

                return Loading;
            }
        ]
    );
})();

(function() {
    angular.module('wikitree').

        factory('Searches', ['$q', '$http', '$rootScope', function($q, $http, $rootScope) {

            /**
             * Private
             */

            var byQuery = {};

            function Search(args) {
                this.query = args.query;
                this.suggestion = args.suggestion;
                this.totalhits = args.totalhits;
                this.results = args.results;
            }

            function getFromAPI(query) {

                console.log('Getting search results from API...', query);

                var timestamp = Date.now();
                return $q(function (resolve, reject) {
                    $rootScope.$broadcast('mediawikiapi:loadstart', timestamp);
                    $http.jsonp('https://en.wikipedia.org/w/api.php', {
                        params: {
                            action: 'query',
                            list: 'search',
                            srprop: 'titlesnippet|snippet|size|wordcount|timestamp',
                            srsearch: query,
                            srlimit: 50,
                            format: 'json',
                            callback: 'JSON_CALLBACK'
                        }
                    }).
                        success(function (data) {
                            $rootScope.$broadcast('mediawikiapi:loadend', timestamp);
                            if (data && data.query && data.query.searchinfo) {
                                resolve(data.query);
                            } else {
                                console.error('Search API error', arguments);
                                reject(null);
                            }
                        }).
                        error(function () {
                            $rootScope.$broadcast('mediawikiapi:loadend', timestamp);
                            console.error('Search API error', arguments);
                            reject(null);
                        });
                });
            }

            /**
             * Public
             */

            var Searches = {};

            Searches.getByQuery = function (query) {
                return $q(function (resolve, reject) {
                    if (byQuery[query]) {
                        resolve(byQuery[query]);
                    } else {
                        getFromAPI(query).
                            then(function (result) {
                                if (result) {
                                    var search = new Search({
                                        query: query,
                                        suggestion: {
                                            text: result.searchinfo.suggestion,
                                            html: result.searchinfo.suggestionsnippet
                                        },
                                        totalhits: result.totalhits,
                                        results: result.search
                                    });
                                    byQuery[search.query] = search;
                                    resolve(search);
                                } else {
                                    // sucks
                                    console.error('Search failed', query);
                                    reject(null);
                                }
                            }).
                            catch(function () {
                                // sucks
                                console.error('Search API error', query, arguments);
                                reject(null);
                            });
                    }
                });
            };

            return Searches;

        }]);

})();
