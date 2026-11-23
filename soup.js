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
        { id: 'portfolio',      label: 'Visuals',    sub: 'reel',          hash: 'portfolio',      kind: 'media',  d: 96, ring: 0, a: .00 , veg: 'mushroom' },
        { id: 'shader-library', label: 'Shaders',    sub: 'live',          hash: 'shader-library', kind: 'shader', d: 92, ring: 0, a: .34 , veg: 'broccoli' },
        { id: 'synthsoup',      label: 'SynthSoup',  sub: 'synth · firmware', hash: 'synthsoup', shape: 'eye', d: 92, ring: 0, a: .67 , veg: 'tomato' },

        { id: 'drumseek',       label: 'DrumSeek',   sub: 'sequencer',     hash: 'drumseek',       shape: 'grid',   d: 74, ring: 1, a: .09 , veg: 'potato' },
        { id: 'sp404',          label: 'SP-404',     sub: 'converter',     href: 'sp404.html',     shape: 'cube',   d: 74, ring: 1, a: .29 , veg: 'garlic' },
        { id: 'plugins',        label: 'Plugins',    sub: 'clap · vst3',   href: 'plugins.html',   shape: 'faders', d: 72, ring: 1, a: .49 , veg: 'carrot' },
        { id: 'blackboxfx',     label: 'BlackboxFX', sub: 'control',       hash: 'blackboxfx',     shape: 'ring',   d: 70, ring: 1, a: .69 , veg: 'pumpkin' },
        { id: 'playground',     label: 'Playground', sub: 'audio \u2192 visuals', href: 'playground.html', shape: 'scope', d: 72, ring: 1, a: .89 , veg: 'pepper' },

        { id: 'watch',          label: 'Watchlist',  sub: 'what to watch', href: 'watch.html',     shape: 'reel',   d: 68, ring: 2, a: .72 , veg: 'radish' },
        { id: 'gallery',        label: 'The Gallery',sub: 'the long way',  href: 'gallery.html',   shape: 'spiral', d: 74, ring: 2, a: .17 , veg: 'cabbage' },
        { id: 'play',           label: 'Play',       sub: 'in the browser', href: 'synthsoup/webapp/play/', shape: 'star', d: 58, ring: 2, a: .42 , veg: 'carrot' },
        { id: 'store',          label: 'Soup Lab',   sub: 'store',         href: 'store/',         shape: 'flask',  d: 66, ring: 2, a: .04 , veg: 'eggplant' },
        { id: 'about',          label: 'About',      sub: '',              hash: 'about',          shape: 'pea',    d: 56, ring: 2, a: .67 , veg: 'pea' },
        { id: 'contact',        label: 'Contact',    sub: '',              hash: 'contact',        shape: 'leaf',   d: 56, ring: 2, a: .92 , veg: 'cabbage' }
    ];

    /* ---------------- the pieces themselves ----------------
       Drawn rather than photographed, because a photo of a carrot on this site
       would be the only photograph of a carrot on this site. */
    var V = '0 0 100 100';
    function svg(body, bg) {
        return '<svg viewBox="' + V + '" aria-hidden="true" style="background:' + bg + '">' + body + '</svg>';
    }
    /* ---------------- vegetables ----------------
       Every piece is cut to a vegetable: `body` is the silhouette, used as a
       mask so the artwork, video or shader inside keeps showing through it;
       `rim` is the vegetable's own colour round the edge, and `art` is drawn
       over the top (a tomato's calyx, a mushroom's gills) at low opacity so the
       image underneath still reads. All in a 100 × 100 box. */
    var VEG = {
        carrot: { rim: '#ff8a1f', body: 'M54.7 6.3Q59.5 8.6 64.7 8.6Q70.0 8.6 73.2 12.7Q76.5 16.8 81.2 19.0Q86.0 21.3 87.1 26.4Q88.3 31.6 91.6 35.7Q94.8 39.8 93.7 44.9Q92.5 50.0 93.7 55.1Q94.8 60.2 91.6 64.3Q88.3 68.4 87.1 73.6Q86.0 78.7 81.2 81.0Q76.5 83.2 73.2 87.3Q70.0 91.4 64.7 91.4Q59.5 91.4 54.7 93.7Q50.0 96.0 45.3 93.7Q40.5 91.4 35.3 91.4Q30.0 91.4 26.8 87.3Q23.5 83.2 18.8 81.0Q14.0 78.7 12.9 73.6Q11.7 68.4 8.4 64.3Q5.2 60.2 6.3 55.1Q7.5 50.0 6.3 44.9Q5.2 39.8 8.4 35.7Q11.7 31.6 12.9 26.4Q14.0 21.3 18.8 19.0Q23.5 16.8 26.8 12.7Q30.0 8.6 35.3 8.6Q40.5 8.6 45.3 6.3Q50.0 4.0 54.7 6.3Z',
            art: '<circle cx="50" cy="50" r="30" fill="none" stroke="#ffb35c" stroke-width="2" opacity=".55"/>' +
                 '<circle cx="50" cy="50" r="12" fill="#ffb35c" opacity=".35"/>' },
        mushroom: { rim: '#e9d8c2',
            body: 'M6 50C6 22 28 6 50 6s44 16 44 44c0 7-6 9-12 8l-16-2 2 28c0 8-7 12-18 12S32 92 32 84l2-28-16 2C12 59 6 57 6 50z',
            art: '<path d="M34 57c10 3 22 3 32 0" fill="none" stroke="#fff3e2" stroke-width="2.5" opacity=".6"/>' +
                 '<path d="M36 58l-2 26c0 7 7 11 16 11s16-4 16-11l-2-26" fill="#f3e6d3" opacity=".42"/>' +
                 '<circle cx="30" cy="28" r="6" fill="#fff3e2" opacity=".35"/><circle cx="64" cy="20" r="4" fill="#fff3e2" opacity=".35"/>' },
        broccoli: { rim: '#4fa83a',
            body: 'M40 62h20l5 32c0 3-3 5-15 5s-15-2-15-5zM28 58a22 22 0 1 1 6-40 24 24 0 0 1 40 6 20 20 0 0 1-2 38 22 22 0 0 1-44-4z',
            art: '<path d="M41 62h18l4 30c0 2-3 4-13 4s-13-2-13-4z" fill="#9ed36b" opacity=".5"/>' +
                 '<g fill="#2f7a2a" opacity=".3"><circle cx="30" cy="38" r="5"/><circle cx="52" cy="24" r="5"/><circle cx="72" cy="40" r="5"/><circle cx="48" cy="46" r="4"/></g>' },
        tomato: { rim: '#ff3b30',
            body: 'M50 16c26 0 44 16 44 40S76 96 50 96 6 80 6 56s18-40 44-40z',
            art: '<path d="M50 24l5-12 3 13 13-5-8 11 13 4-15 2-11 6-11-6-15-2 13-4-8-11 13 5 3-13z" fill="#3fa63a" opacity=".85"/>' },
        potato: { rim: '#c9955a',
            body: 'M18 28C30 6 70 4 86 24c14 18 10 52-10 66C56 102 18 94 8 70 2 54 8 40 18 28z',
            art: '<g fill="#8a5a2b" opacity=".35"><circle cx="30" cy="34" r="3"/><circle cx="66" cy="28" r="2.5"/><circle cx="72" cy="66" r="3"/><circle cx="38" cy="74" r="2.5"/></g>' },
        pepper: { rim: '#ffd21f',
            body: 'M50 10c10 0 14 8 22 8 14 0 24 14 22 32-2 22-14 44-44 44S8 72 6 50C4 32 14 18 28 18c8 0 12-8 22-8z',
            art: '<path d="M50 20c-4 10-4 24 0 34m0-34c10 6 22 14 28 26M50 20C40 26 28 34 22 46" fill="none" stroke="#fff6c2" stroke-width="2.5" opacity=".45"/>' },
        pumpkin: { rim: '#ff7a1a',
            body: 'M50 18c6-8 12-10 14-6-2 2-4 4-4 8 18-2 34 10 36 32 2 26-16 44-46 44S2 78 4 52c2-22 18-34 36-32 2-2 6-2 10-2z',
            art: '<path d="M50 24c-8 20-8 48 0 68M50 24c8 20 8 48 0 68M30 26c-10 18-8 44 4 62M70 26c10 18 8 44-4 62" fill="none" stroke="#ffb36a" stroke-width="2.5" opacity=".45"/>' +
                 '<path d="M48 22c2-6 8-12 14-12" fill="none" stroke="#3f7a2a" stroke-width="5" stroke-linecap="round"/>' },
        radish: { rim: '#ff2d7a',
            body: 'M50 26c24 0 40 16 38 36-2 18-18 30-34 32l-4 6-4-6C30 92 14 80 12 62c-2-20 14-36 38-36zM44 28C38 14 30 6 22 4c10 0 18 6 24 18 2-12 8-20 18-22-6 6-10 16-10 28z',
            art: '<path d="M44 28C38 14 30 6 22 4c10 0 18 6 24 18 2-12 8-20 18-22-6 6-10 16-10 28z" fill="#3fa63a" opacity=".9"/>' },
        cabbage: { rim: '#7ed957',
            body: 'M50 6c14 0 18 8 26 10 10 2 18 12 16 22 6 8 4 22-4 28 0 12-10 22-22 22-6 6-26 6-32 0C22 88 12 78 12 66 4 60 2 46 8 38 6 28 14 18 24 16c8-2 12-10 26-10z',
            art: '<path d="M50 94V30M50 60L28 40M50 48l20-16M50 74l22-14" fill="none" stroke="#e8ffd0" stroke-width="2.5" stroke-linecap="round" opacity=".5"/>' },
        pea: { rim: '#6fbd3a', body: 'M50 6a44 44 0 1 1 0 88 44 44 0 0 1 0-88z', art: '' },
        eggplant: { rim: '#8b3fd6',
            body: 'M60 6c6 0 10 4 10 10 0 4 4 8 8 12 14 14 14 38 0 54-16 18-46 18-62 2C2 70 4 50 18 36c10-10 22-14 30-16 2-8 6-14 12-14z',
            art: '<path d="M48 20c4-6 10-10 18-8 2 6 0 12-4 16-6-2-10-4-14-8z" fill="#3fa63a" opacity=".95"/>' +
                 '<path d="M26 44c-8 10-10 24-4 34" fill="none" stroke="#d9b8ff" stroke-width="3" stroke-linecap="round" opacity=".5"/>' },
        garlic: { rim: '#f3ecdf',
            body: 'M50 4c4 6 6 12 6 18 18 6 36 22 36 44 0 18-18 30-42 30S8 84 8 66c0-22 18-38 36-44 0-6 2-12 6-18z',
            art: '<path d="M50 26c-6 18-6 44 0 66M50 26c6 18 6 44 0 66M32 34c-10 14-10 40 0 56M68 34c10 14 10 40 0 56" fill="none" stroke="#fffaf0" stroke-width="2" opacity=".5"/>' }
    };
    function vegMask(d) {
        return 'url("data:image/svg+xml,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="' + d + '"/></svg>') + '")';
    }
    function dressVeg(shape, name) {
        var v = VEG[name];
        if (!v) return;
        var m = vegMask(v.body);
        shape.classList.add('veg');
        shape.style.webkitMaskImage = m;
        shape.style.maskImage = m;
        var over = document.createElement('div');
        over.className = 'bit-veg';
        over.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true">' + v.art +
            '<path d="' + v.body + '" fill="none" stroke="' + v.rim + '" stroke-width="7" stroke-linejoin="round"/></svg>';
        shape.appendChild(over);
    }
    var SHAPES = {
        grid: function () {
            return svg('<g stroke="#0e0820" stroke-width="5" opacity=".75">' +
                '<path d="M26 6v88M50 6v88M74 6v88M6 26h88M6 50h88M6 74h88"/></g>',
                'linear-gradient(145deg,#ffb347,#d4603a)');
        },
        // A film reel: the watchlist. Sprocket holes rather than a play
        // triangle, because a triangle reads as "press this" and this is a
        // list of things to go and find.
        reel: function () {
            return svg('<circle cx="50" cy="50" r="38" fill="none" stroke="#0e0820" stroke-width="7" opacity=".8"/>' +
                '<circle cx="50" cy="50" r="9" fill="#0e0820" opacity=".8"/>' +
                '<g fill="#0e0820" opacity=".7">' +
                '<circle cx="50" cy="26" r="7"/><circle cx="71" cy="38" r="7"/>' +
                '<circle cx="71" cy="62" r="7"/><circle cx="50" cy="74" r="7"/>' +
                '<circle cx="29" cy="62" r="7"/><circle cx="29" cy="38" r="7"/></g>',
                'linear-gradient(145deg,#ffd27a,#d44fb0)');
        },
        cube: function () {
            return svg('<g fill="none" stroke="#f6ecff" stroke-width="4" stroke-linejoin="round" opacity=".9">' +
                '<path d="M50 14 84 33v34L50 86 16 67V33z"/><path d="M50 14v34l34 19M50 48 16 33M50 48v38"/></g>',
                'linear-gradient(145deg,#f3e6ff,#9b7bff)');
        },
        eye: function () {
            return svg('<ellipse cx="50" cy="50" rx="42" ry="26" fill="#120a22"/>' +
                '<circle cx="50" cy="50" r="20" fill="#6fe3e8"/>' +
                '<circle cx="50" cy="50" r="9" fill="#0b0618"/>' +
                '<circle cx="43" cy="43" r="4" fill="#fff" opacity=".85"/>',
                'linear-gradient(145deg,#ff6fd8,#9dff4f)');
        },
        ring: function () {
            return svg('<circle cx="50" cy="50" r="33" fill="none" stroke="#0d0820" stroke-width="13" opacity=".72"/>' +
                '<circle cx="50" cy="50" r="33" fill="none" stroke="#fff" stroke-width="2" opacity=".35"/>',
                'linear-gradient(145deg,#8ae04b,#2f7a3a)');
        },
        film: function () {
            return svg('<circle cx="50" cy="50" r="40" fill="#1b1030"/>' +
                '<g fill="#cdb6ff">' +
                '<circle cx="50" cy="16" r="6"/><circle cx="50" cy="84" r="6"/>' +
                '<circle cx="16" cy="50" r="6"/><circle cx="84" cy="50" r="6"/>' +
                '<circle cx="26" cy="26" r="5"/><circle cx="74" cy="26" r="5"/>' +
                '<circle cx="26" cy="74" r="5"/><circle cx="74" cy="74" r="5"/></g>' +
                '<circle cx="50" cy="50" r="14" fill="none" stroke="#cdb6ff" stroke-width="4"/>',
                'linear-gradient(145deg,#8f6bff,#3a1d6e)');
        },
        noodle: function () {
            return svg('<g fill="none" stroke="#fff3fb" stroke-width="9" stroke-linecap="round" opacity=".92">' +
                '<path d="M10 30c14-16 26 16 40 0s26-16 40 0"/>' +
                '<path d="M10 54c14-16 26 16 40 0s26-16 40 0"/>' +
                '<path d="M10 78c14-16 26 16 40 0s26-16 40 0"/></g>',
                'linear-gradient(145deg,#ff9ad8,#b3338a)');
        },
        spiral: function () {
            // The labyrinth, which is what it leads to.
            return svg('<path d="M50 14a36 36 0 1 1-25.5 61.4A28 28 0 1 0 50 26a24 24 0 1 0 17 41 16 16 0 1 1-20.6-24.3" ' +
                'fill="none" stroke="#f0e6ff" stroke-width="6" stroke-linecap="round" opacity=".92"/>',
                'linear-gradient(145deg,#b79bff,#4b2f9e)');
        },
        star: function () {
            return svg('<path d="M50 8l10 24 26-6-16 21 16 21-26-6-10 24-10-24-26 6 16-21-16-21 26 6z" ' +
                'fill="#2a0a28" opacity=".8"/>', 'linear-gradient(145deg,#ffe36f,#d44fb0)');
        },
        scope: function () {
            return svg('<circle cx="50" cy="50" r="33" fill="none" stroke="#1a0b2e" stroke-width="6" opacity=".6"/>' +
                '<path d="M20 50c5-18 9-18 14 0s9 18 14 0 9-18 14 0 9 18 14 0" fill="none" ' +
                'stroke="#eafff2" stroke-width="5" stroke-linecap="round"/>' +
                '<circle cx="50" cy="50" r="33" fill="none" stroke="#9dffcf" stroke-width="2.5" opacity=".5"/>',
                'linear-gradient(145deg,#59e0ff,#2a3bb8)');
        },
        faders: function () {
            return svg('<g stroke="#140a24" stroke-width="7" stroke-linecap="round" opacity=".55">' +
                '<path d="M30 20v60M50 20v60M70 20v60"/></g>' +
                '<g fill="#fdf6ff">' +
                '<rect x="20" y="52" width="20" height="9" rx="4.5"/>' +
                '<rect x="40" y="30" width="20" height="9" rx="4.5"/>' +
                '<rect x="60" y="62" width="20" height="9" rx="4.5"/></g>',
                'linear-gradient(145deg,#c0a0ff,#5a32b8)');
        },
        pea: function () {
            return svg('<circle cx="35" cy="42" r="19" fill="#6fbd3a"/><circle cx="63" cy="38" r="15" fill="#8ae04b"/>' +
                '<circle cx="52" cy="66" r="17" fill="#5aa832"/>' +
                '<circle cx="30" cy="36" r="5" fill="#d9ffb8" opacity=".75"/>',
                'linear-gradient(145deg,#a7f06a,#3f7a28)');
        },
        // The Soup Lab store: a glass flask of neon soup that sloshes,
        // bubbles and shifts colour (motion lives in soup.css, .flask-*).
        flask: function () {
            return svg('<defs><clipPath id="flask-in"><path d="M45 16v22L25 76a7 7 0 0 0 6 10h38a7 7 0 0 0 6-10L55 38V16z"/></clipPath></defs>' +
                '<g clip-path="url(#flask-in)">' +
                '<path class="flask-soup" d="M10 60q10-6 20 0t20 0 20 0 20 0 20 0V100H10z" fill="#aaff00"/>' +
                '<path class="flask-soup flask-soup2" d="M0 64q10-6 20 0t20 0 20 0 20 0 20 0V100H0z" fill="#00ffd5" opacity=".55"/>' +
                '<circle class="flask-bub" cx="44" cy="84" r="3.6" fill="#fdf6ff"/>' +
                '<circle class="flask-bub flask-bub2" cx="56" cy="86" r="2.6" fill="#fdf6ff"/>' +
                '<circle class="flask-bub flask-bub3" cx="50" cy="88" r="2" fill="#fdf6ff"/></g>' +
                '<path d="M40 14h20M45 14v24L25 76a7 7 0 0 0 6 10h38a7 7 0 0 0 6-10L55 38V14" fill="none" ' +
                'stroke="#f0e6ff" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>' +
                '<circle class="flask-bub flask-pop" cx="50" cy="12" r="2.4" fill="#ff00e6"/>',
                'linear-gradient(145deg,#ff00e6,#00b8a0)').replace('<svg ', '<svg class="flask-svg" ');
        },
        leaf: function () {
            return svg('<path d="M18 80C18 40 46 16 84 16c0 40-26 64-66 64z" fill="#2f7a3a"/>' +
                '<path d="M18 80C34 58 56 38 84 16" fill="none" stroke="#d9ffb8" stroke-width="4" opacity=".8"/>',
                'linear-gradient(145deg,#8ae04b,#1f5a2a)');
        }
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
        if (!gl) { c.remove(); slot.innerHTML = SHAPES.spiral(); return; }

        fetch('shaders/manifest.json?t=' + Date.now())
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                var list = d && d.shaders;
                if (!list || !list.length) throw new Error('no shaders');
                run(list[Math.floor(Math.random() * list.length)].glsl);
            })
            .catch(function () { c.remove(); slot.innerHTML = SHAPES.spiral(); });

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
            if (!vs || !fs) { c.remove(); slot.innerHTML = SHAPES.spiral(); return; }
            var pr = gl.createProgram();
            gl.attachShader(pr, vs); gl.attachShader(pr, fs);
            gl.bindAttribLocation(pr, 0, 'p');
            gl.linkProgram(pr);
            if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { c.remove(); slot.innerHTML = SHAPES.spiral(); return; }
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
        slot.innerHTML = SHAPES.film();
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
            if (b.kind === 'shader') fillShader(shape);
            else if (b.kind === 'media') fillMedia(shape);
            else shape.innerHTML = (SHAPES[b.shape] || SHAPES.pea)();
            // The waterline goes in after the artwork and before the gloss,
            // which .bit-shape::after paints last.
            shape.appendChild(el('div', 'bit-water'));
            dressVeg(shape, b.veg);
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
