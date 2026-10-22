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
        { id: 'synthsoup',      label: 'SynthSoup',  sub: 'synth · firmware', hash: 'synthsoup', shape: 'eye', d: 92, ring: 0, a: .67 },

        { id: 'drumseek',       label: 'DrumSeek',   sub: 'sequencer',     hash: 'drumseek',       shape: 'grid',   d: 74, ring: 1, a: .09 },
        { id: 'sp404',          label: 'SP-404',     sub: 'converter',     href: 'sp404.html',     shape: 'cube',   d: 74, ring: 1, a: .34 },
        { id: 'blackboxfx',     label: 'BlackboxFX', sub: 'control',       hash: 'blackboxfx',     shape: 'ring',   d: 70, ring: 1, a: .59 },
        { id: 'shop',           label: 'Shop',       sub: 'prints',        hash: 'shop',           shape: 'noodle', d: 70, ring: 1, a: .84 },

        { id: 'gallery',        label: 'The Gallery',sub: 'the long way',  href: 'gallery.html',   shape: 'spiral', d: 74, ring: 2, a: .17 },
        { id: 'play',           label: 'Play',       sub: 'in the browser', href: 'synthsoup/webapp/play/', shape: 'star', d: 58, ring: 2, a: .42 },
        { id: 'about',          label: 'About',      sub: '',              hash: 'about',          shape: 'pea',    d: 56, ring: 2, a: .67 },
        { id: 'contact',        label: 'Contact',    sub: '',              hash: 'contact',        shape: 'leaf',   d: 56, ring: 2, a: .92 }
    ];

    /* ---------------- the pieces themselves ----------------
       Drawn rather than photographed, because a photo of a carrot on this site
       would be the only photograph of a carrot on this site. */
    var V = '0 0 100 100';
    function svg(body, bg) {
        return '<svg viewBox="' + V + '" aria-hidden="true" style="background:' + bg + '">' + body + '</svg>';
    }
    var SHAPES = {
        grid: function () {
            return svg('<g stroke="#0e0820" stroke-width="5" opacity=".75">' +
                '<path d="M26 6v88M50 6v88M74 6v88M6 26h88M6 50h88M6 74h88"/></g>',
                'linear-gradient(145deg,#ffb347,#d4603a)');
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
        pea: function () {
            return svg('<circle cx="35" cy="42" r="19" fill="#6fbd3a"/><circle cx="63" cy="38" r="15" fill="#8ae04b"/>' +
                '<circle cx="52" cy="66" r="17" fill="#5aa832"/>' +
                '<circle cx="30" cy="36" r="5" fill="#d9ffb8" opacity=".75"/>',
                'linear-gradient(145deg,#a7f06a,#3f7a28)');
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

        bowl.appendChild(el('div', 'steam', '<i></i><i></i><i></i>'));

        var bits = el('div', 'bits');
        BITS.forEach(function (b, i) {
            var btn = el('button', 'bit');
            btn.type = 'button';
            btn.id = 'bit-' + b.id;
            btn.setAttribute('aria-label', b.label + (b.sub ? ' — ' + b.sub : ''));

            var float = el('div', 'bit-float');
            float.style.setProperty('--dur', (6.2 + (i % 5) * 1.3).toFixed(1) + 's');
            float.style.setProperty('--delay', (-i * 0.83).toFixed(2) + 's');
            float.style.setProperty('--dx', (3 + (i % 4) * 2) + 'px');

            float.appendChild(el('div', 'bit-label',
                esc(b.label) + (b.sub ? '<small>' + esc(b.sub) + '</small>' : '')));

            var disc = el('div', 'bit-disc');
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

        for (var k = 0; k < RINGS.length; k++) phase[k] += dt * flow / RINGS[k].secs;

        var want = (ptr.on && !still) ? 1 : 0;
        ptr.glow += (want - ptr.glow) * Math.min(1, dt * 4);
        if (Math.abs(want - ptr.glow) < 0.004) ptr.glow = want;
        wakeEnergy = ptr.glow;

        for (var i = 0; i < BITS.length; i++) {
            var e = bitEls[i];
            if (!e || e.classList.contains('chosen')) continue;
            var b = BITS[i], R = RINGS[b.ring];
            var th = (b.a + phase[b.ring]) * Math.PI * 2;
            var x = 0.5 + R.r * Math.cos(th);
            var y = 0.5 + R.r * Math.sin(th);
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
