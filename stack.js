/* ===========================================================================
   stack.js — The Stack.

   The site's index, built as the thing it is about rather than as a list of
   links: a column of lit panels hanging in a black void, one ring of them per
   tier, which you turn to choose from and drop through to go deeper. The
   reference is the flythrough in Hackers (1995) — orbiting translucent plates,
   wireframe boxes where nothing has resolved, a ruled floor, and a frame of
   readouts around all of it.

   Two jobs, and it is only worth its weight if it does both:

     1. Every page on the site is on it. The gallery is the only way in, which
        made some pages four rooms deep; this is the one surface that names all
        of them in one place.
     2. It is not a dropdown. Turning the ring and dropping a tier is the same
        verb as walking the gallery, so the menu belongs to the same place as
        the architecture.

   It is also a list. With motion turned down, or with a keyboard and no
   pointer, the same plates lay out flat and every one is a focusable button.
   =========================================================================== */
(function () {
    'use strict';

    try { if (window.top !== window.self) return; } catch (e) { return; }
    if (window.lucidStack) return;

    var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    /* ---------------- what is on it ----------------
       The fixed half: every page the site has. Written out rather than scraped,
       because the entrance keeps its sections hidden and there is nothing in
       the DOM to scrape. */
    var TIERS = [
        { key: 'surface',     name: 'Surface',     note: 'the way in' },
        { key: 'works',       name: 'Works',       note: 'what there is to look at' },
        { key: 'instruments', name: 'Instruments', note: 'things that run' },
        { key: 'trade',       name: 'Trade',       note: 'ask, buy, write' }
    ];

    var NODES = [
        { t: 0, name: 'Entrance',         tag: 'root',  href: '/index.html',    g: 'core' },
        { t: 0, name: 'The Gallery',      tag: 'space', href: '/gallery.html',  g: 'room' },

        { t: 1, name: 'Portfolio',        tag: 'work',  href: '/index.html#portfolio',      g: 'frame' },
        { t: 1, name: 'Shader Library',   tag: 'work',  href: '/index.html#shader-library', g: 'frame' },

        { t: 2, name: 'DrumSeek',         tag: 'tool',  href: '/index.html#drumseek',  g: 'grid' },
        { t: 2, name: 'SP-404 Converter', tag: 'tool',  href: '/sp404.html',           g: 'grid' },
        { t: 2, name: 'SynthSoup',        tag: 'tool',  href: '/index.html#synthsoup', g: 'grid' },
        { t: 2, name: 'SynthSoup — Play', tag: 'live', href: '/synthsoup/webapp/play/', g: 'core' },

        { t: 3, name: 'Shop',             tag: 'trade', href: '/index.html#shop',    g: 'frame' },
        { t: 3, name: 'About',            tag: 'text',  href: '/index.html#about',   g: 'frame' },
        { t: 3, name: 'Contact',          tag: 'text',  href: '/index.html#contact', g: 'frame' }
    ];

    /* The other half is the architecture, read from the same file the gallery
       reads. If it will not load, the pages above are still all here; the
       tower just stops at Trade. */
    function addRooms(data) {
        if (!data || !data.rooms) return;
        var ids = Object.keys(data.rooms);
        var groups = { chamber: [], flight: [], corridor: [] };
        ids.forEach(function (id) {
            var r = data.rooms[id] || {};
            var deep = (r.size && Number(r.size[2])) || 0;
            var kind = /^(stair-|well$|relativity$)/.test(id) ? 'flight'
                     : (/^junction/.test(id) || deep >= 6) ? 'corridor'
                     : 'chamber';
            groups[kind].push({ id: id, name: r.name || id });
        });
        var order = [
            ['chamber',  'Chambers',  'rooms that hold something'],
            ['flight',   'Flights',   'the stairs that do not add up'],
            ['corridor', 'Corridors', 'the long way round']
        ];
        order.forEach(function (o) {
            var list = groups[o[0]];
            if (!list.length) return;
            var t = TIERS.length;
            TIERS.push({ key: o[0], name: o[1], note: o[2] });
            list.forEach(function (r) {
                NODES.push({ t: t, name: r.name, tag: 'space', room: r.id, g: 'room' });
            });
        });
        // The authored rooms run out; the fractal does not. These are addresses,
        // and the tier is the bottom of the tower on purpose.
        var t = TIERS.length;
        TIERS.push({ key: 'descent', name: 'Descent', note: 'addresses, not rooms' });
        ['f0', 'f1', 'f2', 'f00', 'f01', 'f02'].forEach(function (a) {
            NODES.push({ t: t, name: a, tag: 'deeper', room: a, g: 'deep' });
        });
    }

    /* ---------------- glyphs ----------------
       A plan rather than an icon: what the thing is, in four strokes. */
    var GLYPH = {
        core:  '<circle cx="8" cy="8" r="6.2"/><circle cx="8" cy="8" r="2.4"/>',
        room:  '<rect x="1.6" y="1.6" width="12.8" height="12.8"/><path d="M1.6 10.6h4M11 1.6v4"/>',
        frame: '<rect x="1.6" y="2.6" width="12.8" height="10.8"/><path d="M1.6 13.4L14.4 2.6"/>',
        grid:  '<path d="M1.6 1.6h12.8v12.8H1.6z"/><path d="M5.9 1.6v12.8M10.1 1.6v12.8M1.6 5.9h12.8M1.6 10.1h12.8"/>',
        deep:  '<path d="M8 1.6L14.4 13H1.6z"/><path d="M8 6.4l3.2 5.4H4.8z"/>'
    };
    function glyph(k) { return '<svg viewBox="0 0 16 16" aria-hidden="true">' + (GLYPH[k] || GLYPH.room) + '</svg>'; }

    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }
    function hex(n, w) {
        var s = (n >>> 0).toString(16).toUpperCase();
        while (s.length < (w || 2)) s = '0' + s;
        return s;
    }

    /* ---------------- the shell ---------------- */
    var root, vp, cam, amb, world, tierEls = [], slotEls = [], plateEls = [];
    var selTier = 0, selIdx = 0, tierFocus = [], built = false, opener = null;
    var elTop, elSector, elHexs, elScale, elSel, elDots, elFlash;
    var drift = 0, driftRaf = 0, hexTimer = 0;

    function el(tag, cls, html) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        return e;
    }

    /* rooms.json may land after someone has already opened the thing. Rather
       than leave the tower four tiers short, rebuild it around the new tiers
       and put the viewer back where they were standing. */
    function rebuild() {
        var wasOpen = api.isOpen();
        var keepT = selTier, keepI = selIdx;
        if (root && root.parentNode) root.parentNode.removeChild(root);
        root = vp = cam = amb = world = null;
        tierEls = []; slotEls = []; plateEls = []; tierFocus = [];
        built = false;
        build();
        select(Math.min(keepT, TIERS.length - 1), keepI, true);
        if (wasOpen) { root.classList.add('on'); if (!reduced) root.classList.add('live'); focusSel(); }
    }

    function build() {
        if (built) return;
        built = true;

        root = el('div', 'lucid-stack');
        root.id = 'lucid-stack';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', 'The Stack — site index');

        vp = el('div'); vp.id = 'lucid-stack-vp';
        cam = el('div'); cam.id = 'lucid-stack-cam';
        amb = el('div'); amb.id = 'lucid-stack-amb';
        world = el('div'); world.id = 'lucid-stack-world';
        cam.appendChild(amb);
        cam.appendChild(world);
        vp.appendChild(cam);
        root.appendChild(vp);

        // The floor and ceiling ride with the eye, so descending is endless.
        amb.appendChild(el('div', 'ls-grid floor'));
        amb.appendChild(el('div', 'ls-grid ceiling'));

        var spine = el('div', 'ls-spine');
        spine.style.top = 'calc(var(--ls-lvh) * -1.2)';
        spine.style.height = 'calc(var(--ls-lvh) * ' + (TIERS.length + 1.4).toFixed(1) + ')';
        world.appendChild(spine);

        TIERS.forEach(function (tier, ti) {
            var lv = el('div', 'ls-level');
            lv.setAttribute('role', 'group');
            lv.setAttribute('aria-label', tier.name);
            lv.style.transform = 'translateY(calc(' + ti + ' * var(--ls-lvh)))';

            lv.appendChild(el('div', 'ls-tier',
                '<b>' + esc(tier.name) + '</b><i>' + hex(ti) + '</i>'));

            lv.appendChild(el('div', 'ls-floorring'));

            var ring = el('div', 'ls-ring');
            var mine = NODES.filter(function (n) { return n.t === ti; });
            // A fixed spacing rather than a closed ring. Dividing 360 by two
            // nodes put the second one directly behind your head; at 40 apart
            // every tier reads the same and its neighbours stay in view.
            var step = Math.min(40, 360 / Math.max(mine.length, 1));
            var slots = [], plates = [];

            mine.forEach(function (n, i) {
                var slot = el('div', 'ls-slot');
                slot.style.transform = slotT(i, 0, mine.length, step);
                slot.appendChild(el('div', 'ls-strut'));
                slot.appendChild(el('div', 'ls-ghost'));

                var b = el('button', 'ls-plate');
                b.type = 'button';
                b.innerHTML =
                    '<span class="ls-top"><span class="ls-id">' + hex(ti) + ':' + hex(i) +
                        '</span><span class="ls-tag">' + esc(n.tag) + '</span></span>' +
                    '<span class="ls-name">' + esc(n.name) + '</span>' +
                    '<span class="ls-foot">' + glyph(n.g) + '<span>' + esc(where(n)) + '</span></span>';
                b.setAttribute('aria-label', n.name + ' — ' + tier.name);
                b.addEventListener('click', function () {
                    if (selTier === ti && selIdx === i) go(n, b);
                    else { select(ti, i); go(n, b); }
                });
                b.addEventListener('focus', function () {
                    if (selTier !== ti || selIdx !== i) select(ti, i);
                });
                slot.appendChild(b);
                ring.appendChild(slot);
                slots.push(slot); plates.push(b);
            });

            lv.appendChild(ring);
            world.appendChild(lv);
            tierEls.push(lv);
            slotEls.push(slots); plateEls.push(plates);
            tierFocus.push(0);
            tier._n = mine.length;
            tier._step = step;
            tier._nodes = mine;
        });

        // the readouts
        elTop = el('div', 'ls-hud'); elTop.id = 'ls-top';
        elTop.innerHTML = '<span id="ls-title">lucidsoup :: the stack</span>' +
                          '<span id="ls-sector"></span>';
        root.appendChild(elTop);

        elHexs = el('div', 'ls-hud'); elHexs.id = 'ls-hex';
        root.appendChild(elHexs);

        elScale = el('div', 'ls-hud'); elScale.id = 'ls-scale';
        root.appendChild(elScale);

        var bot = el('div', 'ls-hud'); bot.id = 'ls-bottom';
        bot.innerHTML = '<span id="ls-sel"></span>' +
            '<span id="ls-keys">' +
            '<kbd>←</kbd><kbd>→</kbd> turn the ring<br>' +
            '<kbd>↑</kbd><kbd>↓</kbd> change tier<br>' +
            '<kbd>↵</kbd> go · <kbd>esc</kbd> back</span>';
        root.appendChild(bot);

        elDots = el('div'); elDots.id = 'ls-dots';
        root.appendChild(elDots);

        ['left', 'right', 'up', 'down'].forEach(function (d) {
            var b = el('button', 'ls-btn ls-nav');
            b.id = 'ls-' + d; b.type = 'button';
            b.textContent = { left: '←', right: '→', up: '↑', down: '↓' }[d];
            b.setAttribute('aria-label', d === 'left' ? 'Previous node'
                : d === 'right' ? 'Next node'
                : d === 'up' ? 'Tier above' : 'Tier below');
            b.addEventListener('click', function () {
                if (d === 'left') turn(-1); else if (d === 'right') turn(1);
                else if (d === 'up') drop(-1); else drop(1);
            });
            root.appendChild(b);
        });

        var close = el('button', 'ls-btn'); close.id = 'ls-close'; close.type = 'button';
        close.textContent = 'close';
        close.setAttribute('aria-label', 'Close the index');
        close.addEventListener('click', function () { api.close(); });
        root.appendChild(close);

        root.appendChild(el('div', 'ls-haze'));
        root.appendChild(el('div', 'ls-sweep'));
        elFlash = el('div', 'ls-flash');
        root.appendChild(elFlash);

        elSel = bot.querySelector('#ls-sel');
        elSector = elTop.querySelector('#ls-sector');

        wire();
        document.body.appendChild(root);
        select(0, 0, true);
    }

    function where(n) {
        if (n.room) return 'room · ' + n.room;
        return String(n.href || '').replace(/^\//, '');
    }

    /* ---------------- selection ---------------- */
    function norm(a) { a = (a + 180) % 360; if (a < 0) a += 360; return a - 180; }

    // Where slot j sits when slot `focus` is the one at the front: the shorter
    // way round the ring, so no plate ever takes the long route to the centre.
    function slotAngle(j, focus, n, step) {
        var a = ((j - focus) % n + n) % n;
        if (a > n / 2) a -= n;
        return a * step;
    }
    function slotT(j, focus, n, step) {
        return 'rotateY(' + slotAngle(j, focus, n, step) + 'deg) translateZ(var(--ls-ring))';
    }

    function select(ti, i, snap) {
        var tier = TIERS[ti];
        if (!tier || !tier._n) return;
        i = ((i % tier._n) + tier._n) % tier._n;
        selTier = ti; selIdx = i; tierFocus[ti] = i;

        tierEls.forEach(function (lv, k) { lv.classList.toggle('here', k === ti); });

        plateEls.forEach(function (plates, k) {
            var t = TIERS[k], f = tierFocus[k] || 0;
            plates.forEach(function (p, j) {
                var slot = slotEls[k][j];
                var ang = slotAngle(j, f, t._n, t._step);
                if (snap) slot.style.transition = 'none';
                slot.style.transform = 'rotateY(' + ang + 'deg) translateZ(var(--ls-ring))';
                p.classList.toggle('back', Math.abs(ang) > 92);
                p.classList.toggle('sel', k === ti && j === i);
                slot.classList.toggle('sel', k === ti && j === i);
                p.setAttribute('tabindex', (k === ti || reduced) ? '0' : '-1');
            });
        });

        world.style.transition = snap ? 'none' : '';
        world.style.transform = worldT();
        if (snap) {
            void world.offsetWidth;
            world.style.transition = '';
            slotEls.forEach(function (ss) { ss.forEach(function (sl) { sl.style.transition = ''; }); });
        }

        paint();
    }

    function worldT() {
        return 'translate3d(0, calc(' + (-selTier) + ' * var(--ls-lvh)), calc(-1 * var(--ls-dist))) ' +
               'rotateY(' + drift.toFixed(2) + 'deg)';
    }

    function turn(d) { select(selTier, selIdx + d); }
    function drop(d) {
        var t = Math.max(0, Math.min(TIERS.length - 1, selTier + d));
        if (t === selTier) return;
        // Each tier remembers what it was showing, so dropping a floor does not
        // also spin the one you land on back to its first node.
        select(t, tierFocus[t] || 0);
    }

    function paint() {
        var tier = TIERS[selTier];
        var n = tier._nodes[selIdx] || {};
        elSector.innerHTML =
            'sector <b>' + hex(selTier) + '</b> · ' + esc(tier.name) + '<br>' +
            'nodes <b>' + hex(tier._n) + '</b> · depth <b>' +
            hex(selTier * 16 + selIdx, 3) + '</b>';
        elSel.innerHTML = '<span class="n">' + esc(n.name || '') + '</span>' +
                          '<span class="w">' + esc(tier.note) + ' — ' + esc(where(n)) + '</span>';

        elScale.innerHTML = TIERS.map(function (t, i) {
            return '<div' + (i === selTier ? ' class="at"' : '') + '>' +
                   hex(i) + ' ' + esc(t.name.toLowerCase()) + '</div>';
        }).join('');

        elDots.innerHTML = '';
        for (var k = 0; k < tier._n; k++) {
            var s = document.createElement('span');
            if (k === selIdx) s.className = 'at';
            elDots.appendChild(s);
        }
    }

    /* The hex is real: it is the address of where you are standing, re-cut each
       tick so the frame is alive without anything moving in the scene. */
    function hexLines() {
        if (!elHexs) return;
        var out = [], seed = selTier * 977 + selIdx * 31 + ((Date.now() / 120) | 0);
        for (var r = 0; r < 9; r++) {
            var row = hex(0xA0 + r * 16, 4) + '  ';
            for (var c = 0; c < 4; c++) {
                var v = (seed * (r + 3) * (c + 7)) % 251;
                row += hex(v) + ' ';
            }
            out.push(row);
        }
        out[4] = hex(0xE0, 4) + '  ' + hex(selTier) + ' ' + hex(selIdx) + ' ' +
                 hex(TIERS[selTier]._n) + ' ' + hex(NODES.length);
        elHexs.innerHTML = out.map(function (l) { return '<div>' + l + '</div>'; }).join('');
    }

    /* ---------------- going ---------------- */
    var leaving = false;
    function go(n, plate) {
        if (leaving) return;
        leaving = true;
        if (plate) plate.classList.add('go');
        if (elFlash) { elFlash.classList.remove('on'); void elFlash.offsetWidth; elFlash.classList.add('on'); }

        var wait = reduced ? 10 : 260;
        setTimeout(function () {
            leaving = false;
            if (plate) plate.classList.remove('go');
            if (n.room) {
                // On the gallery the rooms are already loaded: travel in place
                // instead of reloading the page out from under the viewer.
                if (window.lucidGallery && window.lucidGallery.go) {
                    api.close();
                    window.lucidGallery.go(n.room);
                    return;
                }
                location.href = '/gallery.html#r=' + encodeURIComponent(n.room);
                return;
            }
            var href = n.href || '/';
            var m = /^\/index\.html(#.*)?$/.exec(href);
            if (m && /(^|\/)index\.html$|\/$/.test(location.pathname)) {
                // Already on the entrance: its router runs off the hash.
                api.close();
                var want = m[1] || '';
                if (want && location.hash !== want) { location.hash = want.slice(1); return; }
                if (!want) history.pushState(null, '', location.pathname);
                rerouted();
                return;
            }
            location.href = href;
        }, wait);
    }

    // The entrance routes off the hash; nudge it when the hash did not change.
    function rerouted() {
        var ev;
        try { ev = new HashChangeEvent('hashchange'); }
        catch (e) { ev = new Event('hashchange'); }
        window.dispatchEvent(ev);
    }

    /* ---------------- input ----------------
       The pointer listeners belong to #lucid-stack-vp, which is replaced on a
       rebuild; the document- and window-level ones are bound once, or arrow
       keys would start firing twice. */
    var dragState = null, globalsWired = false;
    function wire() {
        var drag = null;
        function down(x, y) { drag = { x: x, y: y, sx: x, sy: y, moved: false }; vp.classList.add('dragging'); }
        function move(x, y) {
            if (!drag) return;
            var dx = x - drag.x, dy = y - drag.y;
            if (Math.abs(dx) > 52) { turn(dx < 0 ? 1 : -1); drag.x = x; drag.moved = true; }
            if (Math.abs(dy) > 74) { drop(dy < 0 ? 1 : -1); drag.y = y; drag.moved = true; }
        }
        function up() { drag = null; vp.classList.remove('dragging'); }

        vp.addEventListener('mousedown', function (e) { down(e.clientX, e.clientY); });
        vp.addEventListener('mousemove', function (e) {
            nudge((e.clientX / Math.max(window.innerWidth, 1) - 0.5) * 12);
        });
        dragState = { move: move, up: up, has: function () { return !!drag; } };
        vp.addEventListener('touchstart', function (e) {
            if (e.touches.length === 1) down(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });
        vp.addEventListener('touchmove', function (e) {
            if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });
        vp.addEventListener('touchend', up);
        vp.addEventListener('touchcancel', up);

        var wheelLock = 0;
        vp.addEventListener('wheel', function (e) {
            if (reduced) return;
            e.preventDefault();
            var now = Date.now();
            if (now - wheelLock < 230) return;
            wheelLock = now;
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) turn(e.deltaX > 0 ? 1 : -1);
            else drop(e.deltaY > 0 ? 1 : -1);
        }, { passive: false });

        if (globalsWired) return;
        globalsWired = true;

        window.addEventListener('mousemove', function (e) {
            if (dragState && dragState.has()) dragState.move(e.clientX, e.clientY);
        });
        window.addEventListener('mouseup', function () { if (dragState) dragState.up(); });

        /* Capture, on the window, because the pages underneath bound their own
           keys first and bubbling would reach them: the gallery turns the room
           on the arrows and SynthSoup plays notes on them. While the tower is
           up it owns the keyboard, so every key is stopped here before it gets
           to a page the viewer cannot even see. */
        window.addEventListener('keydown', function (e) {
            if (!api.isOpen()) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key !== 'Tab') e.stopPropagation();
            var k = e.key;
            if (k === 'Escape') { e.preventDefault(); api.close(); return; }
            if (k === 'ArrowLeft')  { e.preventDefault(); turn(-1); focusSel(); return; }
            if (k === 'ArrowRight') { e.preventDefault(); turn(1);  focusSel(); return; }
            if (k === 'ArrowUp')    { e.preventDefault(); drop(-1); focusSel(); return; }
            if (k === 'ArrowDown')  { e.preventDefault(); drop(1);  focusSel(); return; }
            if (k === 'Home')       { e.preventDefault(); select(0, 0); focusSel(); return; }
            if (k === 'End')        { e.preventDefault(); select(TIERS.length - 1, 0); focusSel(); return; }
        }, true);
    }

    function focusSel() {
        var p = plateEls[selTier] && plateEls[selTier][selIdx];
        if (p) try { p.focus({ preventScroll: true }); } catch (e) { p.focus(); }
    }

    /* The yaw follows the pointer instead of drifting on a clock.
       A clock drift looked right and was wrong to use: a plate that never stops
       moving is a target you have to chase, and the whole point of this is to be
       the quick way to a page. Peering is a thing you do; when you stop moving
       the pointer the tower settles and holds still under your click. */
    var driftTarget = 0;
    function loop() {
        if (!root || !root.classList.contains('on')) { driftRaf = 0; return; }
        var d = driftTarget - drift;
        if (Math.abs(d) < 0.04) { drift = driftTarget; world.style.transform = worldT(); driftRaf = 0; return; }
        drift += d * 0.1;
        world.style.transform = worldT();
        driftRaf = requestAnimationFrame(loop);
    }
    function nudge(to) {
        if (reduced) return;
        driftTarget = Math.max(-6, Math.min(6, to));
        if (!driftRaf) driftRaf = requestAnimationFrame(loop);
    }

    /* ---------------- the trigger beside the way back ---------------- */
    function chrome() {
        if (document.querySelector('.lucid-index')) return;
        var ret = document.querySelector('.lucid-return');
        if (!ret) return;
        var wrap = el('div', 'lucid-chrome');
        ret.parentNode.insertBefore(wrap, ret);
        // If stack.css did not load the wrapper is not positioned, the link
        // would come out of its corner and the tower would have no styling to
        // show anyway. Better to leave the page exactly as it was.
        if (getComputedStyle(wrap).position !== 'fixed') {
            wrap.parentNode.removeChild(wrap);
            return;
        }
        wrap.appendChild(ret);
        var b = el('button', 'lucid-index');
        b.type = 'button';
        b.textContent = 'index';
        b.setAttribute('aria-label', 'Open the index');
        b.addEventListener('click', function () { api.toggle(b); });
        wrap.appendChild(b);
    }

    /* The overlay is opaque. Whatever the host page is drawing behind it is
       work nobody can see, and on the gallery that is a WebGL room per frame,
       so it says when it is up and the page can stand down. */
    function announce(open) {
        var ev;
        try { ev = new CustomEvent('lucid:stack', { detail: { open: open } }); }
        catch (e) { ev = document.createEvent('Event'); ev.initEvent('lucid:stack', true, false); ev.detail = { open: open }; }
        window.dispatchEvent(ev);
    }

    /* ---------------- api ---------------- */
    var api = {
        open: function (from) {
            build();
            opener = from || document.activeElement;
            root.classList.add('on');
            document.documentElement.classList.add('lucid-stack-open');
            document.body.classList.add('lucid-stack-open');
            if (!reduced) {
                root.classList.add('live');
                // Swing level: the tower arrives already turning, then holds.
                drift = -11; driftTarget = 0;
                world.style.transform = worldT();
                if (!driftRaf) driftRaf = requestAnimationFrame(loop);
            }
            hexLines();
            if (!hexTimer) hexTimer = setInterval(hexLines, 170);
            focusSel();
            announce(true);
        },
        close: function () {
            if (!root || !root.classList.contains('on')) return;
            root.classList.remove('on', 'live');
            document.documentElement.classList.remove('lucid-stack-open');
            document.body.classList.remove('lucid-stack-open');
            if (hexTimer) { clearInterval(hexTimer); hexTimer = 0; }
            if (driftRaf) { cancelAnimationFrame(driftRaf); driftRaf = 0; }
            if (opener && opener.focus) try { opener.focus(); } catch (e) {}
            opener = null;
            announce(false);
        },
        toggle: function (from) {
            if (root && root.classList.contains('on')) api.close(); else api.open(from);
        },
        isOpen: function () { return !!(root && root.classList.contains('on')); },
        tiers: function () { return TIERS.map(function (t) { return { name: t.name, nodes: t._n }; }); },
        nodes: function () { return NODES.slice(); },
        at: function () { return { tier: selTier, index: selIdx }; },
        select: select
    };
    window.lucidStack = api;

    /* A shortcut that does not collide with the gallery's verbs (which are all
       single letters) or with anything a browser owns. */
    document.addEventListener('keydown', function (e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        var t = e.target;
        if (t && /^(input|textarea|select)$/i.test(t.tagName || '')) return;
        if (t && t.isContentEditable) return;
        if (e.key === '`' || (e.key === '/' && !api.isOpen())) { e.preventDefault(); api.toggle(); }
    });

    function start() {
        chrome();
        // The trigger is injected by lucid.js on the same event; if this ran
        // first, try again once the frame has settled.
        if (!document.querySelector('.lucid-index')) requestAnimationFrame(chrome);
        fetch('/rooms.json').then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; })
            .then(function (d) {
                var before = TIERS.length;
                addRooms(d);
                if (!built) build();
                else if (TIERS.length !== before) rebuild();
            });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
