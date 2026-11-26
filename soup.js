/* ===========================================================================
   soup.js — the bowl, and the dive into it.

   The front page is a bowl of soup with every page of the site floating in it.
   You can see all of it from the doorway. Clicking a piece goes under: the
   broth rushes up, the screen fills, and the page surfaces inside the same
   liquid rather than cutting to a flat document.

   Why this replaced what was here: the box asked you to open it before it
   would say what was inside, and what was inside was the labyrinth, which
   asked for patience again before it would give you a drum machine. That is a
   lot to ask of somebody who arrived to look at some visuals. The gallery is
   still here and still strange — it is one of the pieces in the bowl, and it
   says on the label that it is the long way round.

   The pieces are hand-placed rather than scattered by code: eleven things in
   one ellipse is a composition, and a random one is a mess. Positions are in
   bowl coordinates, 0 to 1 across its box, and every one sits inside the
   ellipse (there is a test for that).
   =========================================================================== */
(function () {
    'use strict';

    var host = document.getElementById('soup');
    if (!host) return;

    /* Whether the soup moves.

       The system preference is the default and not the verdict. Someone whose
       machine asks for less motion gets a bowl that holds still, which is
       right — but a bowl that can never be made to turn is a worse answer than
       one that asks, and changing a system-wide accessibility setting to watch
       one front page is not a reasonable thing to expect of anybody. So the
       preference sets the starting state, the spoon under the bowl changes it,
       and the choice is remembered. */
    var prefersStill = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var still = prefersStill;
    try {
        var saved = localStorage.getItem('lucid.stir');
        if (saved === '1') still = false;
        else if (saved === '0') still = true;
    } catch (e) {}

    function markMotion() {
        var r = document.documentElement;
        r.classList.toggle('lucid-still', still);
        // Says the viewer has overruled a system preference for less motion,
        // which is what lets the stylesheet's media query stand down.
        r.classList.toggle('lucid-stirred', !still && prefersStill);
    }
    markMotion();

    /* ---------------- what is in the soup ----------------
       `hash` stays on this page and lets the router show that section; `href`
       leaves for another page. Nothing here is a category — every piece is a
       real destination, which is the whole point. */
    /* Three rings turning at three speeds, which is how liquid in a round
       vessel actually moves and what the broth shader underneath is already
       doing. `ring` picks the orbit, `a` is where on it the piece starts (in
       turns, 0 to 1). The outer ring is the slowest; nothing sits at dead
       centre, because the middle of a bowl wants to be broth. */
    var RINGS = [
        { r: .16, secs: 88 },
        { r: .30, secs: 124 },
        { r: .43, secs: 172 }
    ];

    var BITS = [
        { id: 'portfolio',      label: 'Visuals',    sub: 'reel',          hash: 'portfolio',      kind: 'media',  d: 96, ring: 0, a: .00 },
        { id: 'shader-library', label: 'Shaders',    sub: 'live',          hash: 'shader-library', kind: 'shader', d: 92, ring: 0, a: .34 },
        { id: 'synthsoup',      label: 'SynthSoup',  sub: 'synth \u00b7 firmware', hash: 'synthsoup', shape: 'egg', d: 100, ring: 0, a: .67 },

        { id: 'drumseek',       label: 'DrumSeek',   sub: 'sequencer',     hash: 'drumseek',       shape: 'corn',   d: 84, ring: 1, a: .09 },
        { id: 'sp404',          label: 'SP-404',     sub: 'converter',     href: 'sp404.html',     shape: 'tofu',   d: 82, ring: 1, a: .29 },
        { id: 'plugins',        label: 'Plugins',    sub: 'clap \u00b7 vst3',   href: 'plugins.html',   shape: 'enoki',  d: 82, ring: 1, a: .49 },
        { id: 'blackboxfx',     label: 'BlackboxFX', sub: 'control',       hash: 'blackboxfx',     shape: 'leek',   d: 80, ring: 1, a: .69 },
        { id: 'playground',     label: 'Playground', sub: 'audio \u2192 visuals', href: 'playground.html', shape: 'noodle', d: 82, ring: 1, a: .89 },

        { id: 'store',          label: 'Soup Lab',   sub: 'store',         href: 'store/',         shape: 'garlic', d: 80, ring: 2, a: .04 },
        { id: 'watch',          label: 'Watchlist',  sub: 'what to watch', href: 'watch.html',     shape: 'lotus',  d: 78, ring: 2, a: .72 },
        { id: 'gallery',        label: 'The Gallery',sub: 'the long way',  href: 'gallery.html',   shape: 'fusilli', d: 82, ring: 2, a: .17 },
        { id: 'play',           label: 'Play',       sub: 'in the browser', href: 'synthsoup/webapp/play/', shape: 'anise', d: 68, ring: 2, a: .42 },
        { id: 'about',          label: 'About',      sub: '',              hash: 'about',          shape: 'pea',    d: 66, ring: 2, a: .67 },
        { id: 'contact',        label: 'Contact',    sub: '',              hash: 'contact',        shape: 'bay',    d: 68, ring: 2, a: .92 }
    ];

    /* ---------------- the pieces themselves ----------------
       Every piece is something you could find in a bowl of soup, and every
       piece still says what its page is. That is not a pun stretched over a
       menu: a lotus root slice has a ring of holes in it, which is a film
       reel; enoki stalks are three sliders with knobs on; a leek cut across
       is concentric rings; noodles are a waveform. The ingredient and the
       icon are the same drawing.

       They used to be glyphs on coloured discs, which read as app icons
       sitting on top of the broth rather than as anything floating in it.
       Three things changed that, and all three are about light rather than
       about drawing:

         1. The silhouette is the ingredient. A circle crops everything to the
            same outline, and outline is most of what the eye uses to tell a
            pea from a bay leaf at 60 pixels.
         2. Everything below the waterline is tinted and blurred by the broth.
            This is done with a filter over a clipped copy of the artwork, so
            it works whatever the piece is drawn out of — fills, strokes, a
            gradient — without anyone having to describe its silhouette twice.
         3. Each piece floats at its own depth. A pea sits low in the liquid, a
            bay leaf lies on the film at the top, a tofu cube is waterlogged
            and a star anise barely touches. One shared waterline on thirteen
            pieces looks like a printing error; different ones look like
            buoyancy.

       Drawn rather than photographed, because a photo of a carrot on this site
       would be the only photograph of a carrot on this site. */
    var V = '0 0 100 100';

    /* What the broth does to the part of a piece that is under it: most of the
       light gone, what is left pulled towards the violet the soup actually is.
       Done as a colour matrix rather than a flat overlay so a bright carrot
       still reads as brighter than a dark seed once both are submerged. */
    var SUBMERGED = '.38 .02 .08 0 .030  .04 .34 .07 0 .015  .09 .06 .50 0 .085  0 0 0 .97 0';
    /* And at the line itself, surface tension pulls a bright rim up the side
       of anything floating. It is two pixels of pale lilac and it is the
       single thing that makes a piece look wet. */
    var DEEP = '.22 .01 .06 0 .024  .02 .19 .05 0 .012  .06 .04 .33 0 .070  0 0 0 .97 0';
    var MENISCUS = '.70 .08 .10 0 .20  .62 .72 .10 0 .19  .70 .14 .78 0 .24  0 0 0 .62 0';

    var ingN = 0;
    /* `line` is where the broth cuts this piece, in the same 0-100 space the
       artwork is drawn in: smaller sits deeper. `art` gets a unique prefix
       because thirteen of these share one document and ids are global. */
    function ing(line, art) {
        var k = 'ig' + (++ingN) + '-';
        var a = art(k);
        return '<svg viewBox="' + V + '" class="ing" aria-hidden="true">' +
            '<defs>' +
                (a.defs || '') +
                '<g id="' + k + 'ART">' + a.art + '</g>' +
                '<clipPath id="' + k + 'WET"><rect x="-30" y="' + line + '" width="160" height="160"/></clipPath>' +
                '<clipPath id="' + k + 'LIP"><rect x="-30" y="' + (line - 1.7).toFixed(2) + '" width="160" height="3.2"/></clipPath>' +
                '<filter id="' + k + 'SUB" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">' +
                    '<feColorMatrix type="matrix" values="' + SUBMERGED + '"/>' +
                    '<feGaussianBlur stdDeviation=".75"/></filter>' +
                '<filter id="' + k + 'MEN" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">' +
                    '<feColorMatrix type="matrix" values="' + MENISCUS + '"/></filter>' +
                '<clipPath id="' + k + 'DIP"><rect x="-30" y="' + (line + 15) + '" width="160" height="160"/></clipPath>' +
                '<filter id="' + k + 'DPF" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">' +
                    '<feColorMatrix type="matrix" values="' + DEEP + '"/>' +
                    '<feGaussianBlur stdDeviation="1.15"/></filter>' +
            '</defs>' +
            '<use href="#' + k + 'ART"/>' +
            '<g clip-path="url(#' + k + 'WET)" filter="url(#' + k + 'SUB)"><use href="#' + k + 'ART"/></g>' +
            '<g clip-path="url(#' + k + 'DIP)" filter="url(#' + k + 'DPF)"><use href="#' + k + 'ART"/></g>' +
            '<g clip-path="url(#' + k + 'LIP)" filter="url(#' + k + 'MEN)"><use href="#' + k + 'ART"/></g>' +
            '</svg>';
    }

    /* A linear gradient, written out because thirteen pieces want twenty of
       them and each needs its own id. */
    function grad(id, x1, y1, x2, y2, stops) {
        return '<linearGradient id="' + id + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '">' +
            stops.map(function (s) {
                return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"/>';
            }).join('') + '</linearGradient>';
    }
    function rgrad(id, cx, cy, r, stops) {
        return '<radialGradient id="' + id + '" cx="' + cx + '" cy="' + cy + '" r="' + r + '">' +
            stops.map(function (s) {
                return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' +
                    (s[2] != null ? ' stop-opacity="' + s[2] + '"' : '') + '/>';
            }).join('') + '</radialGradient>';
    }

    var SHAPES = {
        /* SynthSoup — a halved soft-boiled egg. It is the one piece that was
           already an eye, and an egg is the thing in a bowl of ramen that
           looks back at you, so it stays an eye and becomes food. */
        egg: function () {
            return ing(62, function (k) {
                return {
                    defs:
                        rgrad(k + 'w', '.40', '.34', '.72', [['0', '#fffdf6'], ['.62', '#f6ecd9'], ['1', '#ddcdb0']]) +
                        rgrad(k + 'y', '.38', '.33', '.78', [['0', '#ffd978'], ['.45', '#f7b23e'], ['1', '#d4791c']]),
                    art:
                        '<ellipse cx="50" cy="52" rx="43" ry="38" fill="url(#' + k + 'w)"/>' +
                        '<ellipse cx="50" cy="52" rx="43" ry="38" fill="none" stroke="#c9b48f" stroke-width="1.1" opacity=".55"/>' +
                        '<ellipse cx="50" cy="53" rx="21" ry="19" fill="url(#' + k + 'y)"/>' +
                        // The yolk of a jammy egg is darker and wetter at its edge.
                        '<ellipse cx="50" cy="53" rx="21" ry="19" fill="none" stroke="#b45f12" stroke-width="1.6" opacity=".5"/>' +
                        '<ellipse cx="50" cy="60" rx="15" ry="9" fill="#c9780f" opacity=".30"/>' +
                        '<ellipse cx="43" cy="45" rx="6.5" ry="4.6" fill="#fff2c2" opacity=".62"/>' +
                        '<ellipse cx="33" cy="33" rx="9" ry="6" fill="#ffffff" opacity=".52" transform="rotate(-24 33 33)"/>'
                };
            });
        },

        /* DrumSeek — a round of corn on the cob. Kernels in rows is a step
           sequencer, which is what the piece used to draw as a bare grid. */
        corn: function () {
            return ing(65, function (k) {
                var rows = '', c, r2;
                // Five rows of kernels, each row shorter towards the rim, laid
                // out on the circle rather than on a square so the cob reads
                // as round rather than as a grid with the corners cut off.
                for (var ry = -2; ry <= 2; ry++) {
                    var y = 50 + ry * 15.5;
                    var halfw = Math.sqrt(Math.max(0, 1 - (ry / 2.55) * (ry / 2.55))) * 36;
                    var n = Math.max(1, Math.round(halfw / 9.2));
                    for (var rx = -n; rx <= n; rx++) {
                        var x = 50 + rx * (halfw / (n + .5));
                        if (Math.abs(rx) === n && n > 1) continue;
                        c = (ry + rx) % 2 ? '#f6c73e' : '#ffd96b';
                        r2 = 7.4 - Math.abs(ry) * .5;
                        rows += '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="' + r2.toFixed(1) +
                            '" ry="' + (r2 * .86).toFixed(1) + '" fill="' + c + '"/>' +
                            '<ellipse cx="' + (x - 1.6).toFixed(1) + '" cy="' + (y - 2).toFixed(1) +
                            '" rx="2.5" ry="1.8" fill="#fff3bd" opacity=".55"/>';
                    }
                }
                return {
                    defs: rgrad(k + 'c', '.40', '.34', '.74', [['0', '#f5d06a'], ['1', '#b9781b']]) +
                        '<clipPath id="' + k + 'cob"><circle cx="50" cy="50" r="39"/></clipPath>',
                    art:
                        '<circle cx="50" cy="50" r="40" fill="url(#' + k + 'c)"/>' +
                        // Kernels are laid out on a square lattice and the cob
                        // is round, so the ones at the edge have to be cut by
                        // the rim rather than hang over it.
                        '<g clip-path="url(#' + k + 'cob)">' + rows + '</g>' +
                        '<circle cx="50" cy="50" r="40" fill="none" stroke="#9c6316" stroke-width="2" opacity=".5"/>'
                };
            });
        },

        /* SP-404 — a cube of tofu. The old icon was a wireframe cube for a
           converter; this is the same cube with something in it. */
        tofu: function () {
            return ing(57, function (k) {
                return {
                    defs:
                        grad(k + 't', '0', '0', '1', '1', [['0', '#fffaf0'], ['1', '#efe2cb']]) +
                        grad(k + 'l', '0', '0', '0', '1', [['0', '#f2e6d2'], ['1', '#cdbda2']]) +
                        grad(k + 'r', '0', '0', '0', '1', [['0', '#e2d4bd'], ['1', '#b7a68c']]),
                    art:
                        // Three faces: the lit top, and two sides falling away.
                        '<path d="M50 14 84 32 50 50 16 32z" fill="url(#' + k + 't)"/>' +
                        '<path d="M16 32 50 50v36L16 68z" fill="url(#' + k + 'l)"/>' +
                        '<path d="M84 32 50 50v36l34-18z" fill="url(#' + k + 'r)"/>' +
                        '<path d="M50 14 84 32 50 50 16 32zM16 32v36l34 18 34-18V32M50 50v36" fill="none" ' +
                            'stroke="#9e8f74" stroke-width="1.2" stroke-linejoin="round" opacity=".55"/>' +
                        // Tofu is slightly translucent and the broth soaks the
                        // cut faces; a couple of soft blooms is all that takes.
                        '<ellipse cx="38" cy="30" rx="11" ry="5" fill="#ffffff" opacity=".5"/>' +
                        '<ellipse cx="33" cy="60" rx="8" ry="11" fill="#c7b394" opacity=".35"/>'
                };
            });
        },

        /* Plugins — a bundle of enoki. Long pale stalks with a small cap on
           each, at three different heights, which is a bank of faders. */
        enoki: function () {
            return ing(75, function (k) {
                var st = [[30, 34], [50, 22], [70, 44]];
                var s = '';
                st.forEach(function (p) {
                    var x = p[0], top = p[1];
                    s += '<path d="M' + (x - 4.4) + ' 92 C' + (x - 5.6) + ' ' + (top + 26) + ' ' +
                        (x - 3.2) + ' ' + (top + 12) + ' ' + (x - 3.6) + ' ' + (top + 5) +
                        ' L' + (x + 3.6) + ' ' + (top + 5) + ' C' + (x + 3.2) + ' ' + (top + 12) + ' ' +
                        (x + 5.6) + ' ' + (top + 26) + ' ' + (x + 4.4) + ' 92 Z" fill="url(#' + k + 's)"/>';
                    s += '<ellipse cx="' + x + '" cy="' + (top + 3) + '" rx="8.6" ry="6.4" fill="url(#' + k + 'c)"/>';
                    s += '<ellipse cx="' + (x - 2.6) + '" cy="' + (top + .8) + '" rx="3.4" ry="2.1" fill="#fffdf4" opacity=".6"/>';
                    s += '<path d="M' + (x - 8.4) + ' ' + (top + 3.6) + 'a8.6 6.4 0 0 0 16.8 .8" fill="none" ' +
                        'stroke="#bda98a" stroke-width="1.1" opacity=".55"/>';
                });
                return {
                    defs:
                        grad(k + 's', '0', '0', '1', '0', [['0', '#fbf5e8'], ['.5', '#f3ead6'], ['1', '#d9ccb2']]) +
                        rgrad(k + 'c', '.38', '.30', '.80', [['0', '#fffcf2'], ['1', '#d8c8a9']]),
                    art: s
                };
            });
        },

        /* BlackboxFX — a cut leek. Concentric rings, which is what the old
           icon was, and what a leek actually is. */
        leek: function () {
            return ing(73, function (k) {
                var r = '', cols = ['#e9f4d3', '#cfe7a8', '#b4d886', '#9bc96a', '#86b956'];
                // Each sheath is a little off-centre and a little oval, which
                // is the difference between a cut leek and a dartboard.
                var off = [[0, 0, 1, 1], [1.4, -1, .98, 1.02], [-1.2, 1.6, 1.03, .97],
                           [2.2, .8, .96, 1.04], [-1.6, -1.4, 1.01, .99]];
                for (var i = 0; i < 5; i++) {
                    var rr = 38 - i * 7, o = off[i];
                    var a = 'cx="' + (50 + o[0]) + '" cy="' + (50 + o[1]) + '" rx="' +
                        (rr * o[2]).toFixed(1) + '" ry="' + (rr * o[3]).toFixed(1) + '"';
                    r += '<ellipse ' + a + ' fill="' + cols[i] + '"/>';
                    r += '<ellipse ' + a + ' fill="none" stroke="#6f9c43" stroke-width=".9" opacity=".55"/>';
                }
                return {
                    defs: null,
                    art:
                        '<circle cx="50" cy="50" r="40" fill="#7fae4f"/>' + r +
                        '<circle cx="50" cy="50" r="4.4" fill="#f4fbe6"/>' +
                        '<path d="M22 30a40 40 0 0 1 22-13" fill="none" stroke="#ffffff" stroke-width="3" ' +
                            'stroke-linecap="round" opacity=".38"/>'
                };
            });
        },

        /* Playground — noodles. Three strands of a wave, which is the
           oscilloscope the piece used to draw, and the most soup thing there
           is. */
        noodle: function () {
            return ing(69, function (k) {
                var w = function (y, o) {
                    return '<path d="M6 ' + y + 'c11-13 21 13 32 0s21-13 32 0 21 13 24 4" fill="none" ' +
                        'stroke="' + o + '" stroke-width="9" stroke-linecap="round"/>';
                };
                return {
                    defs: grad(k + 'n', '0', '0', '0', '1', [['0', '#fbe9bd'], ['1', '#d9ae63']]),
                    art:
                        w(34, '#c79a4e') + w(34, 'url(#' + k + 'n)') +
                        w(56, '#c79a4e') + w(56, 'url(#' + k + 'n)') +
                        w(78, '#c79a4e') + w(78, 'url(#' + k + 'n)') +
                        // A wet line along the top of each strand.
                        '<path d="M8 31c11-13 21 13 32 0s21-13 32 0" fill="none" stroke="#fff6dd" ' +
                            'stroke-width="2.4" stroke-linecap="round" opacity=".55"/>' +
                        '<path d="M8 53c11-13 21 13 32 0s21-13 32 0" fill="none" stroke="#fff6dd" ' +
                            'stroke-width="2.4" stroke-linecap="round" opacity=".42"/>'
                };
            });
        },

        /* Watchlist — a slice of lotus root. A disc with a ring of holes
           through it: the film reel the piece already was, and a thing that
           is genuinely floating in soup somewhere right now. */
        lotus: function () {
            return ing(67, function (k) {
                var h = '<circle cx="50" cy="50" r="8" fill="#2b1b3f" opacity=".82"/>';
                for (var i = 0; i < 7; i++) {
                    var a = (i / 7) * Math.PI * 2 - Math.PI / 2;
                    var x = 50 + Math.cos(a) * 22, y = 50 + Math.sin(a) * 22;
                    h += '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="7.6" ry="7" ' +
                        'fill="#2b1b3f" opacity=".82"/>';
                    h += '<ellipse cx="' + x.toFixed(1) + '" cy="' + (y - 1.4).toFixed(1) + '" rx="7.6" ry="6.4" ' +
                        'fill="none" stroke="#b9a582" stroke-width="1.2" opacity=".5"/>';
                }
                return {
                    defs: rgrad(k + 'l', '.38', '.32', '.76', [['0', '#fbf4e4'], ['.6', '#eadfc6'], ['1', '#c3b08c']]),
                    art:
                        '<circle cx="50" cy="50" r="40" fill="url(#' + k + 'l)"/>' + h +
                        '<circle cx="50" cy="50" r="40" fill="none" stroke="#a8936d" stroke-width="2" opacity=".6"/>' +
                        '<path d="M20 34a40 40 0 0 1 20-14" fill="none" stroke="#fffdf4" stroke-width="3.4" ' +
                            'stroke-linecap="round" opacity=".45"/>'
                };
            });
        },

        /* The Gallery — fusilli. A spiral that takes the long way round,
           which is what the label under it says. Drawn as an actual helix:
           the points are computed, the half of each turn facing away is
           drawn dark and first, and the half facing you is drawn light over
           it. Stacked arcs were tried and read as a pile of pancakes, which
           is the trouble with faking a twist rather than winding one. */
        fusilli: function () {
            return ing(59, function (k) {
                var R = 20, y0 = 13, y1 = 89, turns = 4;
                var N = 150, pts = [];
                for (var i = 0; i <= N; i++) {
                    var u = i / N, t = u * turns * Math.PI * 2;
                    pts.push({
                        x: 50 + Math.cos(t) * R,
                        y: y0 + u * (y1 - y0),
                        front: Math.sin(t) > 0
                    });
                }
                // Split the helix where it passes behind itself, so the two
                // sides can be painted in the right order.
                var runs = [], cur = [pts[0]];
                for (i = 1; i <= N; i++) {
                    cur.push(pts[i]);
                    if (pts[i].front !== pts[i - 1].front || i === N) {
                        runs.push({ front: pts[i - 1].front, pts: cur });
                        cur = [pts[i]];
                    }
                }
                function d(run) {
                    return 'M' + run.pts.map(function (p) {
                        return p.x.toFixed(1) + ' ' + p.y.toFixed(1);
                    }).join('L');
                }
                var back = '', front = '';
                runs.forEach(function (r) {
                    var path = d(r);
                    if (r.front) {
                        front += '<path d="' + path + '" fill="none" stroke="#b07f34" stroke-width="15" stroke-linecap="round"/>' +
                                 '<path d="' + path + '" fill="none" stroke="url(#' + k + 'f)" stroke-width="12" stroke-linecap="round"/>' +
                                 '<path d="' + path + '" fill="none" stroke="#fff3d4" stroke-width="2.6" stroke-linecap="round" opacity=".45" transform="translate(-2.2 -2.6)"/>';
                    } else {
                        back += '<path d="' + path + '" fill="none" stroke="#7d5520" stroke-width="13" stroke-linecap="round"/>' +
                                '<path d="' + path + '" fill="none" stroke="#a87c3c" stroke-width="9" stroke-linecap="round"/>';
                    }
                });
                return {
                    defs: grad(k + 'f', '0', '0', '1', '0',
                        [['0', '#e3bd77'], ['.42', '#f7e0ae'], ['1', '#cf9f52']]),
                    art: back + front
                };
            });
        },

        /* Play — star anise. The star the piece already was, and a spice that
           is in the pot before anything else. */
        anise: function () {
            return ing(78, function (k) {
                var p = '', seeds = '';
                for (var i = 0; i < 8; i++) {
                    var a = (i / 8) * Math.PI * 2 - Math.PI / 2;
                    var ca = Math.cos(a), sa = Math.sin(a);
                    var tipx = 50 + ca * 44, tipy = 50 + sa * 44;
                    var lx = 50 + Math.cos(a - .34) * 17, ly = 50 + Math.sin(a - .34) * 17;
                    var rx = 50 + Math.cos(a + .34) * 17, ry = 50 + Math.sin(a + .34) * 17;
                    p += '<path d="M' + lx.toFixed(1) + ' ' + ly.toFixed(1) + 'Q' + (50 + ca * 30).toFixed(1) + ' ' +
                        (50 + sa * 30).toFixed(1) + ' ' + tipx.toFixed(1) + ' ' + tipy.toFixed(1) +
                        'Q' + (50 + ca * 30).toFixed(1) + ' ' + (50 + sa * 30).toFixed(1) + ' ' +
                        rx.toFixed(1) + ' ' + ry.toFixed(1) + 'Z" fill="url(#' + k + 'p)"/>';
                    seeds += '<ellipse cx="' + (50 + ca * 27).toFixed(1) + '" cy="' + (50 + sa * 27).toFixed(1) +
                        '" rx="5" ry="3.6" fill="#c08b4a" transform="rotate(' +
                        (a * 180 / Math.PI).toFixed(1) + ' ' + (50 + ca * 27).toFixed(1) + ' ' +
                        (50 + sa * 27).toFixed(1) + ')"/>';
                }
                return {
                    defs: rgrad(k + 'p', '.42', '.36', '.78', [['0', '#8c5330'], ['1', '#4a2514']]),
                    art: p + seeds + '<circle cx="50" cy="50" r="9" fill="#5e3119"/>' +
                        '<circle cx="50" cy="50" r="4.2" fill="#8a5a2e"/>' +
                        '<circle cx="46" cy="46" r="2.4" fill="#d8a86d" opacity=".5"/>'
                };
            });
        },

        /* About — peas. Three of them, sitting low, because peas do. */
        pea: function () {
            return ing(58, function (k) {
                return {
                    defs:
                        rgrad(k + 'a', '.34', '.30', '.80', [['0', '#c6f08a'], ['.55', '#8dd155'], ['1', '#3f7c25']]) +
                        rgrad(k + 'b', '.34', '.30', '.80', [['0', '#d8f6a4'], ['.55', '#9ddc63'], ['1', '#4a8a2c']]),
                    art:
                        '<circle cx="34" cy="44" r="23" fill="url(#' + k + 'a)"/>' +
                        '<circle cx="68" cy="39" r="18" fill="url(#' + k + 'b)"/>' +
                        '<circle cx="55" cy="70" r="20" fill="url(#' + k + 'a)"/>' +
                        '<ellipse cx="27" cy="34" rx="7" ry="4.6" fill="#f2ffd8" opacity=".62" transform="rotate(-28 27 34)"/>' +
                        '<ellipse cx="63" cy="31" rx="5" ry="3.4" fill="#f2ffd8" opacity=".55" transform="rotate(-28 63 31)"/>' +
                        '<ellipse cx="48" cy="62" rx="6" ry="4" fill="#f2ffd8" opacity=".5" transform="rotate(-28 48 62)"/>'
                };
            });
        },

        /* Store — a bulb of garlic. One skin over a dozen separate cloves,
           which is the honest shape for a page that is a collection. */
        garlic: function () {
            return ing(64, function (k) {
                var cloves = '';
                /* Five cloves across the front. They have to overlap and they
                   have to be fat at the bottom, or the bulb comes out as a
                   flower: the first version spaced them out and that is
                   exactly what it looked like. The outer ones are narrower
                   and start lower, which is the foreshortening. */
                for (var i = -2; i <= 2; i++) {
                    var x = 50 + i * 11.5;
                    var w = 13.5 - Math.abs(i) * 2.2;
                    var top = 30 + Math.abs(i) * 8;
                    // Blunt tips, not points: a clove is rounded at the top and
                    // a row of sharp ones reads as a flower, which is what the
                    // first two attempts at this looked like.
                    cloves += '<path d="M' + (x - 2.6) + ' ' + (top + 2) +
                        ' Q' + x + ' ' + (top - 2.4) + ' ' + (x + 2.6) + ' ' + (top + 2) +
                        ' C' + (x + w) + ' ' + (top + 15) + ' ' + (x + w * 1.15) + ' 70 ' + (x + w * 0.35) + ' 84' +
                        ' Q' + x + ' 89 ' + (x - w * 0.35) + ' 84' +
                        ' C' + (x - w * 1.15) + ' 70 ' + (x - w) + ' ' + (top + 15) + ' ' + (x - 2.6) + ' ' + (top + 2) +
                        ' Z" fill="url(#' + k + 'c)" stroke="#c0ad92" stroke-width="1" stroke-opacity=".55"/>';
                }
                return {
                    defs:
                        grad(k + 'c', '0', '0', '1', '1', [['0', '#fffdf7'], ['.55', '#f3e9d6'], ['1', '#d3c3a7']]) +
                        rgrad(k + 'n', '.5', '.5', '.6', [['0', '#b59b76'], ['1', '#8a7352']]),
                    art:
                        // The base the cloves sit in, so the bottom is a bulb
                        // rather than five separate points.
                        '<ellipse cx="50" cy="78" rx="34" ry="13" fill="url(#' + k + 'c)"/>' +
                        cloves +
                        // The neck, where the stem was cut off.
                        '<path d="M45 32 Q50 8 55 32 Z" fill="url(#' + k + 'n)"/>' +
                        '<ellipse cx="50" cy="31" rx="7.5" ry="3" fill="#9c845f" opacity=".85"/>' +
                        '<ellipse cx="36" cy="56" rx="4" ry="11" fill="#ffffff" opacity=".35" transform="rotate(-9 36 56)"/>'
                };
            });
        },

        /* Contact — a bay leaf, lying on the film at the top where a bay leaf
           always is. */
        bay: function () {
            return ing(81, function (k) {
                return {
                    defs: grad(k + 'l', '0', '1', '1', '0', [['0', '#2d5c33'], ['.55', '#467f3c'], ['1', '#6ba055']]),
                    art:
                        '<path d="M14 82C14 44 42 14 86 12c2 42-28 72-72 70z" fill="url(#' + k + 'l)"/>' +
                        '<path d="M14 82C32 60 56 36 86 12" fill="none" stroke="#dcf7bb" stroke-width="2.6" opacity=".8"/>' +
                        '<g stroke="#bce894" stroke-width="1.5" opacity=".55" fill="none">' +
                        '<path d="M30 70q10-14 6-26M44 58q12-14 9-27M58 45q13-13 11-25M22 76q7-12 4-21"/></g>' +
                        '<path d="M14 82C14 44 42 14 86 12" fill="none" stroke="#9fd77a" stroke-width="1.6" opacity=".5"/>'
                };
            });
        }
    };

    /* The two live pieces — the reel and the shader — stay round, because a
       round thing in soup is a slice and a slice is allowed to be a window.
       They get a rind so they belong to the same bowl. */
    /* These two are drawn flat, with no waterline of their own: they sit in
       the live pieces' round slot, which already carries one. */
    function flat(art) {
        var k = 'fl' + (++ingN) + '-';
        var a = art(k);
        return '<svg viewBox="' + V + '" class="ing" aria-hidden="true">' +
            '<defs>' + (a.defs || '') + '</defs>' + a.art + '</svg>';
    }
    SHAPES.tomato = function () {
        return flat(function (k) {
            var seg = '';
            for (var i = 0; i < 6; i++) {
                var a0 = (i / 6) * Math.PI * 2 - Math.PI / 2;
                var x = 50 + Math.cos(a0) * 22, y = 50 + Math.sin(a0) * 22;
                seg += '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="11" ry="8" ' +
                    'fill="#ffd9c0" opacity=".6" transform="rotate(' + (a0 * 180 / Math.PI + 90).toFixed(1) +
                    ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"/>';
            }
            return {
                defs: rgrad(k + 't', '.38', '.32', '.78', [['0', '#ff8d6b'], ['.6', '#e8452f'], ['1', '#a81f1c']]),
                art: '<circle cx="50" cy="50" r="48" fill="url(#' + k + 't)"/>' + seg +
                    '<circle cx="50" cy="50" r="9" fill="#ffe3cd" opacity=".75"/>' +
                    '<circle cx="50" cy="50" r="48" fill="none" stroke="#7d1414" stroke-width="4" opacity=".55"/>'
            };
        });
    };
    SHAPES.carrot = function () {
        return flat(function (k) {
            return {
                defs: rgrad(k + 'c', '.38', '.32', '.80', [['0', '#ffbe63'], ['.55', '#f08a28'], ['1', '#b8540f']]),
                art: '<circle cx="50" cy="50" r="48" fill="url(#' + k + 'c)"/>' +
                    '<circle cx="50" cy="50" r="30" fill="#ffd291" opacity=".55"/>' +
                    '<circle cx="50" cy="50" r="13" fill="#fde6c0" opacity=".7"/>' +
                    '<g stroke="#c96a16" stroke-width="2" opacity=".45" fill="none">' +
                    '<path d="M50 20v12M50 68v12M20 50h12M68 50h12"/></g>' +
                    '<circle cx="50" cy="50" r="48" fill="none" stroke="#9c4a0c" stroke-width="4" opacity=".5"/>'
            };
        });
    };

    function el(tag, cls, html) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        return e;
    }
    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    /* ---------------- the broth ----------------
       A domain-warped swirl in the site's own hues. It is a separate little
       canvas rather than a crop of the page's background shader because the
       bowl wants one specific thing — stirred liquid — and the background is
       whatever the visualiser happens to be running. */
    var BROTH = [
        'precision mediump float;',
        'uniform vec2 iResolution; uniform float iTime;',
        'uniform vec2 iPtr; uniform float iPtrOn;',
        'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
        'float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
        '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),',
        '             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }',
        'float fbm(vec2 p){ float v = 0.0, a = 0.5;',
        '  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }',
        'void main(){',
        '  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution) / min(iResolution.x, iResolution.y);',
        '  float t = iTime * 0.08;',
        // Stirring: the whole field turns, faster near the middle, so it reads
        // as liquid in a round vessel rather than as drifting clouds.
        '  float r = length(uv);',
        // Where the pointer is, the soup is stirred harder and lit a little:
        // a finger drawn through it, falling off fast.
        '  float poke = iPtrOn * exp(-dot(uv - iPtr, uv - iPtr) * 30.0);',
        '  float a = atan(uv.y, uv.x) + t * (1.6 - min(r, 1.0)) + poke * 1.1;',
        '  vec2 p = vec2(cos(a), sin(a)) * r * 2.6;',
        '  vec2 q = vec2(fbm(p + t), fbm(p + vec2(3.1, 1.7) - t));',
        '  vec2 s = vec2(fbm(p + 2.4 * q + vec2(1.7, 9.2) + t * 0.6),',
        '                fbm(p + 2.4 * q + vec2(8.3, 2.8) - t * 0.4));',
        '  float f = fbm(p + 3.0 * s);',
        '  vec3 deep  = vec3(0.09, 0.04, 0.19);',
        '  vec3 wine  = vec3(0.56, 0.18, 0.52);',
        '  vec3 lilac = vec3(0.47, 0.33, 0.86);',
        '  vec3 acid  = vec3(0.47, 0.83, 0.26);',
        '  vec3 col = mix(deep, wine, smoothstep(0.25, 0.80, f));',
        '  col = mix(col, lilac, smoothstep(0.42, 0.95, f * 1.15));',
        // Filaments: a thin band of the warp drawn bright, which is what makes
        // it look like something is dissolved in it.
        '  float fil = smoothstep(0.015, 0.0, abs(length(s - 0.5) - 0.26));',
        '  col += acid * fil * 0.55;',
        '  col += vec3(0.44, 0.89, 0.91) * smoothstep(0.86, 1.0, f) * 0.35;',
        '  col += vec3(0.52, 0.86, 0.95) * poke * 0.16;',
        // Darker at the edge: the broth is deeper where the bowl curves away.
        '  col *= 1.0 - 0.38 * smoothstep(0.55, 0.98, r);',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
    ].join('\n');

    var shaderBits = [], videoBits = [], paused = false;
    var brothStop = null;
    function startBroth(canvas) {
        var gl = null;
        try {
            gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' })
              || canvas.getContext('experimental-webgl');
        } catch (e) { gl = null; }
        // No WebGL: the gradient already painted on .bowl-broth is the soup.
        if (!gl) { canvas.remove(); return; }

        function sh(type, src) {
            var s = gl.createShader(type);
            gl.shaderSource(s, src); gl.compileShader(s);
            return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
        }
        var vs = sh(gl.VERTEX_SHADER, 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }');
        var fs = sh(gl.FRAGMENT_SHADER, BROTH);
        if (!vs || !fs) { canvas.remove(); return; }
        var pr = gl.createProgram();
        gl.attachShader(pr, vs); gl.attachShader(pr, fs);
        gl.bindAttribLocation(pr, 0, 'p');
        gl.linkProgram(pr);
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { canvas.remove(); return; }
        gl.useProgram(pr);
        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        var uR = gl.getUniformLocation(pr, 'iResolution');
        var uT = gl.getUniformLocation(pr, 'iTime');
        var uP = gl.getUniformLocation(pr, 'iPtr');
        var uPO = gl.getUniformLocation(pr, 'iPtrOn');

        var t0 = Date.now(), raf = 0, last = 0, running = false;

        function size() {
            // Half resolution: it is behind a sheen, under eleven objects, and
            // this runs on phones.
            var r = canvas.getBoundingClientRect();
            var w = Math.max(2, Math.round(r.width * 0.5));
            var h = Math.max(2, Math.round(r.height * 0.5));
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w; canvas.height = h;
                gl.viewport(0, 0, w, h);
            }
        }
        function draw() {
            size();
            gl.uniform2f(uR, canvas.width, canvas.height);
            gl.uniform1f(uT, (Date.now() - t0) / 1000);
            // Into the shader's own space: centred, scaled by the short side,
            // and flipped, because gl_FragCoord counts up from the bottom.
            var cr = canvas.getBoundingClientRect();
            var m = Math.min(cr.width, cr.height) || 1;
            gl.uniform2f(uP, (ptr.px - (cr.left + cr.width / 2)) / m,
                             -(ptr.py - (cr.top + cr.height / 2)) / m);
            gl.uniform1f(uPO, ptr.glow);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        function frame(now) {
            raf = 0;
            if (!running) return;
            if (now - last > 40) { last = now; draw(); }   // 24fps is plenty for soup
            raf = requestAnimationFrame(frame);
        }
        brothStop = {
            start: function () {
                if (running || still) return;
                running = true;
                if (!raf) raf = requestAnimationFrame(frame);
            },
            stop: function () {
                running = false;
                if (raf) { cancelAnimationFrame(raf); raf = 0; }
            }
        };
        draw();                       // one frame, so it is soup even stopped
        if (!still) brothStop.start();
    }

    /* ---------------- live pieces ----------------
       Two of them show the real thing rather than a drawing: the shader piece
       runs a shader out of the library, and the visuals piece plays whatever
       is featured in media.json. Both fail back to the drawn shape. */
    function fillShader(slot) {
        var c = document.createElement('canvas');
        c.width = 160; c.height = 160;
        c.setAttribute('aria-hidden', 'true');
        slot.appendChild(c);
        var gl;
        try { gl = c.getContext('webgl', { alpha: false, antialias: false, depth: false }); } catch (e) { gl = null; }
        if (!gl) { c.remove(); slot.innerHTML = SHAPES.tomato(); return; }

        fetch('shaders/manifest.json?t=' + Date.now())
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                var list = d && d.shaders;
                if (!list || !list.length) throw new Error('no shaders');
                run(list[Math.floor(Math.random() * list.length)].glsl);
            })
            .catch(function () { c.remove(); slot.innerHTML = SHAPES.tomato(); });

        function run(src) {
            var PRE = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\n' +
                      'precision mediump float;\n#endif\nuniform vec3 iResolution;\n' +
                      'uniform float iTime;\nuniform vec4 iMouse;\n';
            var POST = '\nvoid main(){ vec4 o = vec4(0.0,0.0,0.0,1.0);' +
                       ' mainImage(o, gl_FragCoord.xy); gl_FragColor = vec4(o.rgb,1.0); }\n';
            function sh(t, s) {
                var x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x);
                return gl.getShaderParameter(x, gl.COMPILE_STATUS) ? x : null;
            }
            var vs = sh(gl.VERTEX_SHADER, 'attribute vec2 p; void main(){ gl_Position = vec4(p,0.0,1.0); }');
            var fs = sh(gl.FRAGMENT_SHADER, PRE + src + POST);
            if (!vs || !fs) { c.remove(); slot.innerHTML = SHAPES.tomato(); return; }
            var pr = gl.createProgram();
            gl.attachShader(pr, vs); gl.attachShader(pr, fs);
            gl.bindAttribLocation(pr, 0, 'p');
            gl.linkProgram(pr);
            if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { c.remove(); slot.innerHTML = SHAPES.tomato(); return; }
            gl.useProgram(pr);
            var b = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, b);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
            var uR = gl.getUniformLocation(pr, 'iResolution');
            var uT = gl.getUniformLocation(pr, 'iTime');
            gl.viewport(0, 0, c.width, c.height);
            var t0 = Date.now(), raf = 0, last = 0;
            function frame(now) {
                raf = 0;
                if (document.hidden || paused) { return; }
                if (now - last > 50) {
                    last = now;
                    gl.uniform3f(uR, c.width, c.height, 1);
                    gl.uniform1f(uT, (Date.now() - t0) / 1000);
                    gl.drawArrays(gl.TRIANGLES, 0, 3);
                }
                raf = requestAnimationFrame(frame);
            }
            shaderBits.push({ go: function () { if (!raf) raf = requestAnimationFrame(frame); },
                              halt: function () { if (raf) { cancelAnimationFrame(raf); raf = 0; } } });
            if (!still) raf = requestAnimationFrame(frame);
            else { gl.uniform3f(uR, c.width, c.height, 1); gl.uniform1f(uT, 1.7); gl.drawArrays(gl.TRIANGLES, 0, 3); }
        }
    }

    function fillMedia(slot) {
        slot.innerHTML = SHAPES.carrot();
        if (!window.lucidMedia) return;
        window.lucidMedia().then(function (data) {
            var works = (data.works || []).filter(function (w) { return w && w.featured && (w.preview || w.poster); });
            if (!works.length) return;
            var pick = works[Math.floor(Math.random() * works.length)];
            if (pick.preview && !still) {
                var v = document.createElement('video');
                v.src = pick.preview; v.muted = true; v.loop = true;
                v.playsInline = true; v.setAttribute('playsinline', '');
                v.setAttribute('aria-hidden', 'true');
                if (pick.poster) v.poster = pick.poster;
                v.addEventListener('error', function () { v.remove(); });
                v.addEventListener('loadeddata', function () {
                    var s = slot.querySelector('svg'); if (s) s.remove();
                });
                slot.appendChild(v);
                videoBits.push(v);
                var q = v.play(); if (q && q.catch) q.catch(function () {});
            } else if (pick.poster) {
                var img = document.createElement('img');
                img.src = pick.poster; img.alt = '';
                img.setAttribute('aria-hidden', 'true');
                img.addEventListener('error', function () { img.remove(); });
                img.addEventListener('load', function () {
                    var s = slot.querySelector('svg'); if (s) s.remove();
                });
                slot.appendChild(img);
            }
        }).catch(function () {});
    }

    /* ---------------- build ---------------- */
    var bowl, veil, stirBtn, bitEls = [];

    function build() {
        bowl = el('div', 'bowl');
        bowl.appendChild(el('div', 'bowl-body'));
        bowl.appendChild(el('div', 'bowl-rim'));

        var broth = el('div', 'bowl-broth');
        var canvas = document.createElement('canvas');
        canvas.setAttribute('aria-hidden', 'true');
        broth.appendChild(canvas);
        broth.appendChild(el('div', 'bowl-sheen'));
        bowl.appendChild(broth);

        bowl.appendChild(el('div', 'steam', '<i></i><i></i><i></i><i></i><i></i>'));

        var bits = el('div', 'bits');
        BITS.forEach(function (b, i) {
            var btn = el('button', 'bit');
            btn.type = 'button';
            btn.id = 'bit-' + b.id;
            btn.setAttribute('aria-label', b.label + (b.sub ? ' — ' + b.sub : ''));

            var float = el('div', 'bit-float');
            // Heave (up and down) and roll (tilt) run on separate clocks whose
            // ratio is never a whole number, so the motion never visibly
            // repeats: that is most of what makes a floating thing look real.
            var heave = 3.3 + ((i * 0.61) % 2.3), roll = 5.2 + ((i * 0.83) % 3.1);
            float.style.setProperty('--heave', heave.toFixed(2) + 's');
            float.style.setProperty('--roll', roll.toFixed(2) + 's');
            float.style.setProperty('--delay', (-i * 0.77).toFixed(2) + 's');
            float.style.setProperty('--dx', (2 + (i % 4) * 1.5) + 'px');

            float.appendChild(el('div', 'bit-label',
                esc(b.label) + (b.sub ? '<small>' + esc(b.sub) + '</small>' : '')));

            var disc = el('div', 'bit-disc');
            // Rings spreading out from the piece as it bobs; under the piece,
            // so only the part beyond its edge shows.
            disc.appendChild(el('div', 'bit-wave', '<i></i><i></i>'));
            var shape = el('div', 'bit-shape');
            // Sized against the bowl rather than the screen: `d` is the piece's
            // diameter when the bowl is at its full 880, and shrinks with it.
            // The floor stops a piece becoming a dot on a small phone.
            shape.style.setProperty('--d', 'max(30px, ' + (b.d / 880 * 100).toFixed(3) + 'cqw)');
            // Two slots are windows onto something live and stay round; the
            // rest are ingredients and keep their own outline, which is the
            // whole reason you can tell them apart at sixty pixels.
            if (b.kind === 'shader') { shape.classList.add('is-live'); fillShader(shape); }
            else if (b.kind === 'media') { shape.classList.add('is-live'); fillMedia(shape); }
            else {
                shape.classList.add('is-drawn');
                shape.innerHTML = (SHAPES[b.shape] || SHAPES.pea)();
            }
            // The waterline goes in after the artwork and before the gloss,
            // which .bit-shape::after paints last.
            shape.appendChild(el('div', 'bit-water'));
            disc.appendChild(shape);
            disc.appendChild(el('div', 'bit-ring'));
            float.appendChild(disc);
            btn.appendChild(float);

            btn.addEventListener('click', function () { dive(b, btn); });
            btn.addEventListener('mouseenter', function () {
                hoverEl = btn;
                if (deliberate()) stir(false);
            });
            btn.addEventListener('mousemove', function () { hoverEl = btn; stir(false); });
            btn.addEventListener('mouseleave', function () {
                if (hoverEl === btn) hoverEl = null;
                stir(true);
            });
            btn.addEventListener('focus', function () { stir(false); });
            btn.addEventListener('blur', function () { stir(true); });
            bits.appendChild(btn);
            bitEls.push(btn);
        });
        bowl.appendChild(bits);

        host.insertBefore(bowl, host.firstChild);
        host.classList.add('built');

        host.addEventListener('mousemove', trackPointer);
        host.addEventListener('mouseleave', dropPointer);

        measure();
        lastT = 0;
        place(performance.now());          // placed before the first frame
        if (!still) swirlRaf = requestAnimationFrame(swirl);

        veil = el('div');
        veil.id = 'soup-veil';
        document.body.appendChild(veil);

        stirBtn = el('button', null, '');
        stirBtn.id = 'soup-stir';
        stirBtn.type = 'button';
        stirBtn.addEventListener('click', function () { setStill(!still); });
        host.appendChild(stirBtn);
        paintStir();

        startBroth(canvas);
    }

    /* ---------------- the swirl ----------------
       The pieces go round the bowl. Each ring carries its own accumulated
       phase rather than reading the clock, so that slowing the flow eases it
       to a stop where it is instead of snapping back to the start.

       And it does stop: pointing at any piece halts the whole bowl, like
       putting a spoon in. Halting only the piece under the pointer would tear
       it out of its orbit, and halting nothing would leave every target
       moving, which is the fastest way to make a playful thing annoying. The
       flow is shared, so what you reach for stays where you reached. */
    /* The pointer, in page coordinates, plus how strongly the soup is currently
       answering it. `glow` eases so that arriving and leaving are a swell and a
       fade rather than a switch. */
    var ptr = { px: -9999, py: -9999, x: 0, y: 0, on: false, glow: 0 };
    var hoverEl = null;
    var WAKE_R = 170, WAKE_PUSH = 26;

    var phase = RINGS.map(function () { return 0; });
    var flow = 1, flowTo = 1, swirlRaf = 0, lastT = 0;
    // Liquid time: advances with the flow, so when the bowl is held still the
    // drift below holds still too and what you reach for stays put.
    var drift = 0;
    var box = { w: 0, h: 0 };

    function measure() {
        if (!bowl) return;
        var r = bowl.getBoundingClientRect();
        box.w = r.width; box.h = r.height;
        // Sizes come from the stylesheet (the shapes are in cqw), so they are
        // read back rather than assumed, and re-read whenever the bowl resizes.
        bitEls.forEach(function (e) {
            var sh = e.querySelector('.bit-shape').getBoundingClientRect();
            var lb = e.querySelector('.bit-label').getBoundingClientRect();
            e._r0 = sh.width / 2;
            e._lw = lb.width; e._lh = lb.height;
        });
    }

    function place(now) {
        var dt = lastT ? Math.min((now - lastT) / 1000, 0.1) : 0;
        lastT = now;
        flow += (flowTo - flow) * Math.min(1, dt * 6);
        if (Math.abs(flowTo - flow) < 0.002) flow = flowTo;

        drift += dt * flow;
        // Real liquid in a round vessel never turns at one steady rate: each
        // ring's current swells and slackens over a minute or so, out of step
        // with the others, so the rings slide past each other.
        for (var k = 0; k < RINGS.length; k++) {
            phase[k] += dt * flow / RINGS[k].secs * (1 + 0.24 * Math.sin(drift * 0.091 + k * 2.1) + 0.1 * Math.sin(drift * 0.23 + k));
        }

        var want = (ptr.on && !still) ? 1 : 0;
        ptr.glow += (want - ptr.glow) * Math.min(1, dt * 4);
        if (Math.abs(want - ptr.glow) < 0.004) ptr.glow = want;
        wakeEnergy = ptr.glow;

        for (var i = 0; i < BITS.length; i++) {
            var e = bitEls[i];
            if (!e || e.classList.contains('chosen')) continue;
            var b = BITS[i], R = RINGS[b.ring];
            // Each piece also wanders a little off its ring: it drifts in and
            // out and slips ahead or behind, on two slow waves of its own. The
            // outer ring only ever drifts inward, so nothing rides up the rim.
            var w1 = Math.sin(drift * (0.17 + (i % 5) * 0.031) + i * 1.7);
            var w2 = Math.sin(drift * (0.11 + (i % 3) * 0.043) + i * 2.3);
            var rr = R.r * (b.ring === RINGS.length - 1 ? 1 - 0.045 * (0.5 + 0.5 * w1) : 1 + 0.05 * w1);
            var th = (b.a + phase[b.ring] + 0.009 * w2) * Math.PI * 2;
            var x = 0.5 + rr * Math.cos(th);
            var y = 0.5 + rr * Math.sin(th);
            // Depth. The bowl is squashed hard by the perspective, so two
            // pieces passing are only tens of pixels apart vertically and a
            // subtle size difference read as a collision rather than as one
            // sliding under the other. Size and opacity both carry it now.
            // The wake. Pieces near the pointer give way, as if something were
            // being drawn through the soup — except the one actually under it,
            // which is held still so it stays easy to click. Vertical push is
            // damped, because the surface is seen almost edge on.
            var wx = 0, wy = 0;
            if (ptr.on && !still && e !== hoverEl) {
                var dxp = (x * box.w) - ptr.x, dyp = (y * box.h) - ptr.y;
                var dd = Math.sqrt(dxp * dxp + dyp * dyp);
                if (dd < WAKE_R && dd > 0.001) {
                    // Smoothstep rather than a square: squared falloff meant
                    // only a piece almost under the pointer felt anything, so
                    // the soup looked inert until you were already on top of
                    // something. This gives way across the whole reach.
                    var u = 1 - dd / WAKE_R;
                    var kk = u * u * (3 - 2 * u) * WAKE_PUSH;
                    wx = dxp / dd * kk; wy = dyp / dd * kk * 0.5;
                }
            }
            var ease = Math.min(1, dt * 7);
            e._wx = (e._wx || 0) + (wx - (e._wx || 0)) * ease;
            e._wy = (e._wy || 0) + (wy - (e._wy || 0)) * ease;
            if (Math.abs(e._wx) + Math.abs(e._wy) > 0.25) wakeEnergy = 1;

            var sc = 0.74 + y * 0.50;
            // The button's box is the label stacked on the disc, so centring
            // the box puts the disc half a label below the orbit — which at the
            // bottom of the ring was carrying pieces over the rim. Shift back
            // by half the label's height so what rides the orbit is the disc.
            var off = ((e._lh || 0) + 5) / 2 * (e.classList.contains('under') ? 1 : -1);
            e.style.transform = 'translate3d(' + (x * box.w + e._wx).toFixed(1) + 'px,' +
                (y * box.h + e._wy).toFixed(1) + 'px,0) translate(-50%,-50%) scale(' + sc.toFixed(3) +
                ') translateY(' + off.toFixed(1) + 'px)';
            e.style.opacity = (0.72 + y * 0.28).toFixed(3);
            e.style.zIndex = String(10 + Math.round(y * 80));
            e._at = { x: x + e._wx / box.w, y: y + e._wy / box.h };
            e._px = x * box.w + e._wx; e._py = y * box.h + e._wy; e._sc = sc;
        }

        // A label only steps aside when something actually in front of it
        // would print over it: the other piece's disc, or the other piece's
        // own label. A rough proximity box hid far too many at once; these are
        // the real rectangles, so most passes cost no legibility at all.
        for (i = 0; i < bitEls.length; i++) {
            var la = bitEls[i];
            if (!la || la._px === undefined) { if (la) la._lab = null; continue; }
            var lr = (la._r0 || 0) * la._sc;
            var ly1 = la._py - lr - 5, ly0 = ly1 - (la._lh || 0);
            // Over the rim: put it underneath this piece instead, and test it
            // where it will actually sit.
            var isUnder = ly0 < 2;
            la.classList.toggle('under', isUnder);
            if (isUnder) { ly0 = la._py + lr + 5; ly1 = ly0 + (la._lh || 0); }
            la._lab = { x0: la._px - (la._lw || 0) / 2, x1: la._px + (la._lw || 0) / 2, y0: ly0, y1: ly1 };
        }
        for (i = 0; i < bitEls.length; i++) {
            var a = bitEls[i];
            if (!a || a.classList.contains('chosen') || !a._lab) continue;
            var r = a._lab, hide = false;
            for (var j = 0; j < bitEls.length && !hide; j++) {
                if (j === i) continue;
                var c = bitEls[j];
                if (!c || c._px === undefined || c._py <= a._py) continue;   // not in front
                var qx = Math.max(r.x0, Math.min(c._px, r.x1));
                var qy = Math.max(r.y0, Math.min(c._py, r.y1));
                if (Math.hypot(c._px - qx, c._py - qy) < (c._r0 || 0) * c._sc * 0.94) hide = true;
                // and its label, which is just as opaque as the piece is —
                // but only when they genuinely cover each other. Two pills
                // clipping corners reads as stacked chips, and hiding on any
                // touch at all put a third of the names out at once.
                else if (c._lab) {
                    var ox = Math.min(r.x1, c._lab.x1) - Math.max(r.x0, c._lab.x0);
                    var oy = Math.min(r.y1, c._lab.y1) - Math.max(r.y0, c._lab.y0);
                    if (ox > 0 && oy > 0) {
                        var mine = (r.x1 - r.x0) * (r.y1 - r.y0) || 1;
                        if (ox * oy > mine * 0.3) hide = true;
                    }
                }
            }
            a.classList.toggle('behind', hide);
        }
    }

    var wakeEnergy = 0;
    function swirl(now) {
        swirlRaf = 0;
        if (paused || !bowl) { lastT = 0; return; }
        place(now);
        // Come to rest and there is nothing left to compute until something
        // asks it to move again — but a bowl held still under the pointer is
        // still answering it, so the wake keeps its own claim on the frames.
        if (flow === 0 && flowTo === 0 && wakeEnergy < 0.01) { lastT = 0; return; }
        swirlRaf = requestAnimationFrame(swirl);
    }
    function stir(on) {
        if (still) return;
        flowTo = on ? 1 : 0;
        if (!paused && !swirlRaf) swirlRaf = requestAnimationFrame(swirl);
    }

    /* Pointing at a piece has to mean pointing at it.

       Stopping the bowl on any mouseenter looked right and deadlocked the
       whole thing on every desktop: a pointer left anywhere over the bowl
       eventually has a piece orbit into it, which stops the bowl, which parks
       that piece under the pointer forever — mouseleave never fires, so it
       never starts again. On a phone there is no hover, so the bowl kept
       turning there and only there.

       So an enter only counts if the pointer was moving just before it. A
       piece arriving at a parked pointer passes under it; a pointer arriving
       at a piece stops it. Moving within a piece counts too, which covers
       waking a parked pointer up without leaving the piece it is sitting on. */
    var lastMove = 0;
    document.addEventListener('mousemove', function () { lastMove = Date.now(); }, { passive: true });
    function deliberate() { return Date.now() - lastMove < 1500; }

    function trackPointer(e) {
        var r = bowl.getBoundingClientRect();
        ptr.px = e.clientX; ptr.py = e.clientY;
        ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top;
        ptr.on = true;
        if (!still && !paused && !swirlRaf) { lastT = 0; swirlRaf = requestAnimationFrame(swirl); }
    }
    function dropPointer() {
        ptr.on = false;
        if (!still && !paused && !swirlRaf) { lastT = 0; swirlRaf = requestAnimationFrame(swirl); }
    }

    window.addEventListener('resize', function () {
        measure();
        if (!swirlRaf) { lastT = 0; place(performance.now()); }
    });

    /* The spoon. Turning it on is also the one place that has to restart
       everything the still bowl never started: the broth, the live pieces and
       the orbits are all begun lazily, so flipping the flag alone would leave
       a bowl that is allowed to move and isn't. */
    function paintStir() {
        if (!stirBtn) return;
        stirBtn.textContent = still ? 'stir the soup' : 'let it settle';
        stirBtn.setAttribute('aria-pressed', still ? 'false' : 'true');
        stirBtn.setAttribute('aria-label', still
            ? 'Stir the soup \u2014 start the pieces moving'
            : 'Let it settle \u2014 stop the pieces moving');
    }

    function setStill(next) {
        still = !!next;
        try { localStorage.setItem('lucid.stir', still ? '0' : '1'); } catch (e) {}
        markMotion();
        paintStir();

        if (still) {
            if (swirlRaf) { cancelAnimationFrame(swirlRaf); swirlRaf = 0; }
            lastT = 0; flow = 0; flowTo = 0;
            if (brothStop) brothStop.stop();
            shaderBits.forEach(function (x) { x.halt(); });
            videoBits.forEach(function (v) { v.pause(); });
        } else if (!paused) {
            flow = 1; flowTo = 1; lastT = 0;
            measure();
            if (!swirlRaf) swirlRaf = requestAnimationFrame(swirl);
            if (brothStop) brothStop.start();
            shaderBits.forEach(function (x) { x.go(); });
            videoBits.forEach(function (v) { var q = v.play(); if (q && q.catch) q.catch(function () {}); });
        }
    }

    /* ---------------- going under ---------------- */
    var diving = false;
    function dive(b, btn) {
        if (diving) return;
        diving = true;

        // Plunge in at the piece rather than at the middle of the bowl, so the
        // thing you picked is the thing you go through. It is wherever its
        // orbit had carried it, not where it started.
        var at = btn._at || { x: .5, y: .5 };
        bowl.style.transformOrigin = (at.x * 100) + '% ' + (at.y * 100) + '%';
        btn.style.zIndex = '999';
        var r = btn.getBoundingClientRect();
        veil.style.setProperty('--vx', ((r.left + r.width / 2) / window.innerWidth * 100).toFixed(1) + '%');
        veil.style.setProperty('--vy', ((r.top + r.height / 2) / window.innerHeight * 100).toFixed(1) + '%');

        stir(false);
        btn.classList.add('chosen');
        host.classList.add('diving');
        // Off the ring and past you, from wherever it had drifted to.
        if (!still) {
            btn.style.transition = 'transform .55s cubic-bezier(.6,0,.85,.3), opacity .5s ease .12s';
            btn.style.transform = 'translate3d(' + (at.x * box.w).toFixed(1) + 'px,' +
                (at.y * box.h).toFixed(1) + 'px,0) translate(-50%,-50%) scale(' +
                (0.74 + at.y * 0.50) * 3.4 + ')';
            btn.style.opacity = '0';
        }
        setTimeout(function () { veil.classList.add('on'); }, still ? 0 : 190);

        setTimeout(function () {
            if (b.href) { window.location.href = b.href; return; }
            // Same page: the router shows the section and `lucid:route` brings
            // the page up through the broth on the other side.
            diving = false;
            if (location.hash === '#' + b.hash) route(b.hash);
            else location.hash = b.hash;
        }, still ? 10 : 620);
    }

    function surfaced() {
        host.classList.remove('diving');
        bitEls.forEach(function (x) {
            x.classList.remove('chosen');
            x.style.transition = ''; x.style.opacity = ''; x.style.zIndex = '';
        });
        measure();
        lastT = 0;
        place(performance.now());
        stir(true);
        veil.classList.remove('on');
        diving = false;
    }

    /* ---------------- arriving ---------------- */
    var arriveTimer = 0;
    function route(section) {
        // `focused` is the router's own class; the soup skin hangs off it so
        // there is one source of truth for "a section is showing".
        if (section) {
            pause(true);
            if (!still) {
                document.body.classList.add('soup-arrive');
                clearTimeout(arriveTimer);
                arriveTimer = setTimeout(function () {
                    document.body.classList.remove('soup-arrive');
                }, 900);
            }
            setTimeout(surfaced, still ? 0 : 120);
        } else {
            surfaced();
            pause(false);
        }
    }

    // Nothing in the bowl should be drawing while the bowl is not on screen.
    function pause(on) {
        paused = on;
        if (on) { if (swirlRaf) { cancelAnimationFrame(swirlRaf); swirlRaf = 0; } lastT = 0; }
        else if (!still && !swirlRaf) { measure(); swirlRaf = requestAnimationFrame(swirl); }
        if (brothStop) { if (on) brothStop.stop(); else brothStop.start(); }
        shaderBits.forEach(function (s) { if (on) s.halt(); else s.go(); });
        videoBits.forEach(function (v) {
            if (on) v.pause();
            else { var q = v.play(); if (q && q.catch) q.catch(function () {}); }
        });
    }

    window.addEventListener('lucid:route', function (e) {
        route(e.detail && e.detail.section);
    });
    window.addEventListener('lucid:stack', function (e) {
        pause(!!(e.detail && e.detail.open) || document.body.classList.contains('focused'));
    });
    document.addEventListener('visibilitychange', function () {
        pause(document.hidden || document.body.classList.contains('focused'));
    });

    build();
    // The router runs inline while the page parses, so its first event fired
    // before this file loaded. Catch up from the address bar.
    route((location.hash || '').replace(/^#/, '').split('&')[0] || null);

    window.lucidSoup = {
        bits: function () { return BITS.slice(); },
        still: function () { return still; },
        glow: function () { return ptr.glow; },
        wake: function () {
            var o = {};
            bitEls.forEach(function (e, i) {
                o[BITS[i].id] = Math.round(Math.sqrt((e._wx || 0) * (e._wx || 0) + (e._wy || 0) * (e._wy || 0)) * 10) / 10;
            });
            return o;
        },
        setStill: setStill,
        rings: function () { return RINGS.slice(); },
        flow: function () { return flow; },
        running: function () { return !!swirlRaf; },
        // Exposed for tests: jump the orbits on by N seconds of flow.
        spin: function (secs) {
            for (var k = 0; k < RINGS.length; k++) phase[k] += secs / RINGS[k].secs;
            lastT = 0; place(performance.now());
        },
        dive: function (id) {
            var i = BITS.map(function (b) { return b.id; }).indexOf(id);
            if (i >= 0) dive(BITS[i], bitEls[i]);
        }
    };
})();
