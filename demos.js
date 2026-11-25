/* ===========================================================================
   demos.js — the simulations behind the store's "Try it" button.

   WHAT THESE ARE, SAID ONCE AND PLAINLY.

   Every plugin in the store is a native VST3. A browser cannot load one —
   not with a flag, not with a trick; the sandbox exists precisely to stop a
   page running native code off your disk, and plugins.html on this site
   already says so at length. So nothing here is the plugin.

   What each of these is: a small instrument or effect, written in WebAudio,
   that does the same job the plugin does, built from the plugin's own README
   and its control list. It is close enough to tell you whether you want the
   real one and honest enough not to pretend it is. Where the real plugin has
   sixteen graintables, the demo generates four. Where it runs a spectral
   stretch, the demo varispeeds. The differences are listed on each demo,
   under "what the real one does that this does not", because a demo that
   oversells is worse than no demo.

   Everything is generated — oscillators, noise, impulse responses, the test
   loop effects chew on. There is not one audio file in this directory, which
   is why the page costs nothing to load until you press something.

   A4 = 432 Hz throughout, because that is what these plugins tune to and a
   demo in 440 would be a different instrument.

   Two of these (Loop Repeat, and Syrup Vox's envelope followers) use
   ScriptProcessorNode, which is deprecated in favour of AudioWorklet. It is
   used anyway and deliberately: a worklet needs a second file fetched through
   addModule, which is a second request and a second thing to get wrong in the
   page's CSP, for demos that run for a few seconds at a time. If one of these
   ever becomes something you would leave running, that is the time to move it.

   This file is a little over a hundred kilobytes and is fetched the first time
   somebody presses Try it — never on a page load.
   =========================================================================== */
(function () {
    'use strict';

    var A4 = 432;
    function hz(midi) { return A4 * Math.pow(2, (midi - 69) / 12); }
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

    var ctx = null;
    /* One context for the page, built on the first gesture: every browser
       refuses to start one before that, and a demo that silently does
       nothing is the worst possible answer to "try it". */
    function audio() {
        if (!ctx) {
            var C = window.AudioContext || window.webkitAudioContext;
            if (!C) return null;
            ctx = new C();
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    /* ---------------- generated material ---------------- */

    function noiseBuffer(ac, secs) {
        var n = Math.floor(ac.sampleRate * (secs || 2));
        var b = ac.createBuffer(1, n, ac.sampleRate);
        var d = b.getChannelData(0);
        for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        return b;
    }

    /* A reverb tail, made rather than recorded: noise under an exponential
       decay, with the early part thinned out so it does not read as one
       smeared wash. */
    function impulse(ac, secs, decay, bright) {
        var n = Math.floor(ac.sampleRate * secs);
        var b = ac.createBuffer(2, n, ac.sampleRate);
        for (var c = 0; c < 2; c++) {
            var d = b.getChannelData(c);
            var last = 0;
            for (var i = 0; i < n; i++) {
                var t = i / n;
                var env = Math.pow(1 - t, decay);
                var s = (Math.random() * 2 - 1) * env;
                // One-pole lowpass: a dark tail without a second filter node.
                last = last + (s - last) * (bright == null ? 0.42 : bright);
                d[i] = last * (i < ac.sampleRate * 0.01 ? i / (ac.sampleRate * 0.01) : 1);
            }
        }
        return b;
    }

    /* The loop the effects are tried on. Written as samples rather than as
       nodes so it can be looped seamlessly and so every effect demo hears
       exactly the same two bars: kick, snare, hats, and a 432 Hz bass. */
    var LOOP = null;
    function testLoop(ac) {
        if (LOOP && LOOP.sampleRate === ac.sampleRate) return LOOP;
        var bpm = 92, beat = 60 / bpm, bars = 2, secs = beat * 4 * bars;
        var n = Math.floor(ac.sampleRate * secs);
        var b = ac.createBuffer(2, n, ac.sampleRate);
        var L = b.getChannelData(0), R = b.getChannelData(1);
        var sr = ac.sampleRate;

        function at(t) { return Math.floor(t * sr); }
        function add(i, v, pan) {
            if (i < 0 || i >= n) return;
            L[i] += v * (1 - clamp(pan, 0, 1) * 0.6);
            R[i] += v * (1 - clamp(-pan, 0, 1) * 0.6);
        }
        function kick(t) {
            var len = at(0.42);
            for (var i = 0; i < len; i++) {
                var u = i / len, e = Math.exp(-u * 9);
                var f = 48 + 150 * Math.exp(-u * 32);
                add(at(t) + i, Math.sin(2 * Math.PI * f * (i / sr)) * e * 0.85, 0);
            }
        }
        function snare(t) {
            var len = at(0.20);
            for (var i = 0; i < len; i++) {
                var u = i / len, e = Math.exp(-u * 13);
                var tone = Math.sin(2 * Math.PI * 190 * (i / sr)) * 0.35;
                add(at(t) + i, ((Math.random() * 2 - 1) * 0.7 + tone) * e * 0.5, 0);
            }
        }
        function hat(t, open) {
            var len = at(open ? 0.14 : 0.045);
            var last = 0;
            for (var i = 0; i < len; i++) {
                var u = i / len, e = Math.exp(-u * (open ? 8 : 22));
                var s = Math.random() * 2 - 1;
                last = s - last * 0.6;                 // crude highpass: bright
                add(at(t) + i, last * e * 0.16, (i % 2) ? 0.3 : -0.3);
            }
        }
        function bass(t, midi, dur) {
            var len = at(dur);
            var f = hz(midi);
            for (var i = 0; i < len; i++) {
                var u = i / len;
                var e = Math.min(1, u * 60) * Math.exp(-u * 2.6);
                var ph = (f * (i / sr)) % 1;
                var saw = ph * 2 - 1;
                // Softened, so the loop does not fizz before an effect sees it.
                add(at(t) + i, Math.tanh(saw * 1.6) * e * 0.30, 0);
            }
        }
        for (var bar = 0; bar < bars; bar++) {
            var o = bar * beat * 4;
            kick(o); kick(o + beat * 2.5);
            snare(o + beat); snare(o + beat * 3);
            for (var s = 0; s < 8; s++) hat(o + s * beat / 2, s === 7 && bar === 1);
            var line = [0, 0, 7, 0, 3, 0, 5, 7];
            for (var k = 0; k < 8; k++) bass(o + k * beat / 2, 36 + line[k], beat / 2 * 0.9);
        }
        var peak = 0;
        for (var i2 = 0; i2 < n; i2++) peak = Math.max(peak, Math.abs(L[i2]), Math.abs(R[i2]));
        if (peak > 0) for (var i3 = 0; i3 < n; i3++) { L[i3] /= peak * 1.05; R[i3] /= peak * 1.05; }
        LOOP = b;
        return b;
    }

    /* ---------------- small node helpers ---------------- */

    function shaper(ac, curveFn, n) {
        var ws = ac.createWaveShaper();
        var N = n || 2048, c = new Float32Array(N);
        for (var i = 0; i < N; i++) c[i] = curveFn((i / (N - 1)) * 2 - 1);
        ws.curve = c;
        ws.oversample = '2x';
        return ws;
    }
    function drive(ac, amount) {
        return shaper(ac, function (x) {
            var k = 1 + amount * 24;
            return Math.tanh(x * k) / Math.tanh(k);
        });
    }
    /* Four one-poles in series is what gives a ladder its 24 dB slope; two
       biquads is the cheap approximation, with the resonance on the last so
       it can ring without the whole chain blowing up. */
    function ladder(ac) {
        var a = ac.createBiquadFilter(), b = ac.createBiquadFilter();
        a.type = 'lowpass'; b.type = 'lowpass';
        a.Q.value = 0.7;
        a.connect(b);
        return {
            input: a, output: b,
            cutoff: function (v, t) {
                var f = clamp(v, 20, 18000);
                if (t == null) { a.frequency.value = f; b.frequency.value = f; }
                else { a.frequency.setTargetAtTime(f, t, 0.01); b.frequency.setTargetAtTime(f, t, 0.01); }
            },
            reso: function (q) { b.Q.value = clamp(q, 0.0001, 22); }
        };
    }

    window.lucidDemoAudio = { audio: audio, hz: hz, testLoop: testLoop, noiseBuffer: noiseBuffer,
                              impulse: impulse, drive: drive, ladder: ladder, shaper: shaper, clamp: clamp };
})();

/* ===========================================================================
   The harness: everything a demo does not want to write twice.

   A demo declares what it sounds like and what knobs it has. This builds the
   knobs, finds it something to listen to, runs the transport, draws its
   canvas if it wants one, and takes it all down again when the panel closes
   — which matters, because thirteen of these on one page would otherwise
   leave thirteen oscillators running behind a closed drawer.

   Every control is a real labelled input. Not a div with a drag handler: a
   <input type="range"> with a <label>, because the whole site is held to
   that and a toy is not an excuse.
   =========================================================================== */
(function () {
    'use strict';
    var A = window.lucidDemoAudio;
    if (!A) return;

    var DEFS = {};
    function register(def) { DEFS[def.id] = def; }

    function el(tag, cls, html) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        return e;
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    /* ---------------- the mounted demo ---------------- */
    function mount(id, host) {
        var def = DEFS[id];
        if (!def) { host.innerHTML = '<p class="demo-none">No simulation for this one yet.</p>'; return null; }

        var ac = A.audio();
        if (!ac) {
            host.innerHTML = '<p class="demo-none">This browser has no Web Audio, so there is nothing to run the ' +
                'simulation on. The plugin itself is unaffected.</p>';
            return null;
        }

        host.innerHTML = '';
        var out = ac.createGain();
        out.gain.value = 0.9;
        var meterTap = ac.createAnalyser();
        meterTap.fftSize = 2048;
        out.connect(meterTap);
        out.connect(ac.destination);

        var api = { hz: A.hz, testLoop: function () { return A.testLoop(ac); }, analyser: meterTap, reduced: reduced };
        // The tap on whatever the mounted demo is sending out. Exposed so a
        // page can draw a master meter — and so a test can tell the
        // difference between a simulation that runs and one that is silent,
        // which from the outside look identical.
        window.lucidDemos.meter = meterTap;
        var inst = def.build(ac, out, api);

        /* ---- what this is ---- */
        var head = el('div', 'demo-head');
        head.appendChild(el('p', 'demo-blurb', esc(def.blurb)));
        host.appendChild(head);

        /* ---- source, for anything that processes rather than makes ---- */
        var srcNodes = { node: null, stop: null };
        if (def.kind === 'effect' || def.kind === 'analyser') {
            host.appendChild(buildSource(ac, inst, srcNodes, def));
        }

        /* ---- anything the demo builds for itself ----
           Two of these are not knobs-and-a-transport: Snap to C wants your
           file before anything else makes sense, and OSC Link's whole output
           is a list of messages. */
        if (inst.mountExtra && def.extraFirst) inst.mountExtra(host);

        /* ---- the controls ---- */
        if (def.controls && def.controls.length) {
            var rack = el('div', 'demo-rack');
            def.controls.forEach(function (c) { rack.appendChild(buildControl(c, inst)); });
            host.appendChild(rack);
        }

        if (inst.mountExtra && !def.extraFirst) inst.mountExtra(host);

        /* ---- a keyboard, for anything you play ---- */
        if (def.keys) host.appendChild(buildKeys(inst, def));

        /* ---- a canvas, for anything that shows ---- */
        var raf = 0, cv = null;
        if (def.canvas) {
            cv = el('canvas', 'demo-canvas');
            cv.setAttribute('role', 'img');
            cv.setAttribute('aria-label', def.canvasLabel || 'A moving picture of what the simulation is doing.');
            host.appendChild(cv);
        }

        /* ---- transport ---- */
        if (def.transport !== false) host.appendChild(buildTransport(inst, srcNodes, def));

        /* ---- the honest part ---- */
        if (def.unlike && def.unlike.length) {
            var d = el('details', 'demo-unlike');
            d.appendChild(el('summary', null, 'What the real one does that this does not'));
            var ul = el('ul');
            def.unlike.forEach(function (t) { ul.appendChild(el('li', null, esc(t))); });
            d.appendChild(ul);
            host.appendChild(d);
        }

        /* The canvases are the one thing on this page that CSS cannot quiet:
           a reduced-motion rule can stop an animation or a transition, and
           these are a requestAnimationFrame loop. They are not decoration —
           the spectrum, the sequencer position and the dial are what the
           demo is showing you — so they keep drawing, at a sixth of the rate,
           rather than being switched off. */
        var tickN = 0;
        function frame() {
            raf = 0;
            tickN++;
            if (reduced && (tickN % 6)) { raf = requestAnimationFrame(frame); return; }
            if (cv && inst.draw) {
                var r = cv.getBoundingClientRect();
                var dpr = Math.min(2, window.devicePixelRatio || 1);
                var w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
                if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
                inst.draw(cv.getContext('2d'), w, h, dpr);
            }
            raf = requestAnimationFrame(frame);
        }
        if (cv) frame();

        return {
            dispose: function () {
                if (raf) cancelAnimationFrame(raf);
                try { if (srcNodes.stop) srcNodes.stop(); } catch (e) {}
                try { if (inst.dispose) inst.dispose(); } catch (e) {}
                try { out.disconnect(); } catch (e) {}
            }
        };
    }

    /* ---------------- source picker ---------------- */
    function buildSource(ac, inst, srcNodes, def) {
        var wrap = el('div', 'demo-source');
        var gid = 'src-' + def.id;
        wrap.appendChild(el('h4', null, 'What it listens to'));
        var row = el('div', 'demo-row');

        var sel = el('select', 'demo-select');
        sel.id = gid;
        sel.innerHTML = '<option value="loop">The test loop</option>' +
            '<option value="file">A file of yours</option>' +
            '<option value="mic">Your microphone</option>';
        var lab = el('label', 'lucid-sr', 'Source');
        lab.setAttribute('for', gid);
        row.appendChild(lab);
        row.appendChild(sel);

        var file = el('input');
        file.type = 'file';
        file.accept = 'audio/*';
        file.className = 'demo-file';
        file.id = gid + '-file';
        var fileLab = el('label', 'demo-filelab', 'Choose audio');
        fileLab.setAttribute('for', gid + '-file');
        fileLab.hidden = true;
        file.hidden = true;
        row.appendChild(fileLab);
        row.appendChild(file);
        wrap.appendChild(row);

        var note = el('p', 'demo-note');
        wrap.appendChild(note);

        srcNodes.kind = 'loop';
        srcNodes.buffer = null;
        sel.addEventListener('change', function () {
            srcNodes.kind = sel.value;
            fileLab.hidden = sel.value !== 'file';
            note.textContent = sel.value === 'mic'
                ? 'The microphone starts when you press play, and stops when you stop.'
                : '';
            if (srcNodes.stop) srcNodes.stop();
        });
        file.addEventListener('change', function () {
            var f = file.files && file.files[0];
            if (!f) return;
            note.textContent = 'Decoding ' + f.name + '…';
            f.arrayBuffer().then(function (buf) { return ac.decodeAudioData(buf); })
                .then(function (b) { srcNodes.buffer = b; note.textContent = f.name + ' — press play.'; })
                .catch(function () { note.textContent = 'That file could not be decoded. Try a WAV or an MP3.'; });
        });
        return wrap;
    }

    function startSource(ac, inst, srcNodes, onReady) {
        var dest = inst.input;
        if (!dest) return;
        if (srcNodes.kind === 'mic') {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
            navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
                var n = ac.createMediaStreamSource(stream);
                n.connect(dest);
                srcNodes.stop = function () {
                    try { n.disconnect(); } catch (e) {}
                    stream.getTracks().forEach(function (t) { t.stop(); });
                    srcNodes.stop = null;
                };
                if (onReady) onReady();
            }).catch(function () {});
            return;
        }
        var buf = srcNodes.kind === 'file' && srcNodes.buffer ? srcNodes.buffer : A.testLoop(ac);
        var s = ac.createBufferSource();
        s.buffer = buf;
        s.loop = true;
        s.connect(dest);
        // A demo that varispeeds its input (Syrup Vox) needs the source node
        // itself, not just a place to send it. Live input cannot be slowed
        // this way and each such demo says so.
        if (inst.onSource) inst.onSource(s, srcNodes.kind);
        s.start();
        srcNodes.stop = function () { try { s.stop(); s.disconnect(); } catch (e) {} srcNodes.stop = null; };
        if (onReady) onReady();
    }

    /* ---------------- controls ---------------- */
    function buildControl(c, inst) {
        var wrap = el('div', 'demo-ctl');
        var id = 'dc-' + Math.random().toString(36).slice(2, 9);

        if (c.type === 'switch') {
            var btn = el('button', 'demo-switch');
            btn.type = 'button';
            btn.id = id;
            var on = !!c.def;
            function paint() {
                btn.setAttribute('aria-pressed', String(on));
                btn.textContent = c.label;
            }
            paint();
            btn.addEventListener('click', function () { on = !on; paint(); inst.set(c.id, on); });
            wrap.appendChild(btn);
            inst.set(c.id, on);
            return wrap;
        }

        if (c.type === 'select') {
            var l2 = el('label', 'demo-label', esc(c.label));
            l2.setAttribute('for', id);
            var sel = el('select', 'demo-select');
            sel.id = id;
            sel.innerHTML = c.options.map(function (o, i) {
                return '<option value="' + i + '"' + (i === (c.def || 0) ? ' selected' : '') + '>' + esc(o) + '</option>';
            }).join('');
            sel.addEventListener('change', function () { inst.set(c.id, Number(sel.value)); });
            wrap.appendChild(l2);
            wrap.appendChild(sel);
            inst.set(c.id, c.def || 0);
            return wrap;
        }

        var lab = el('label', 'demo-label', esc(c.label));
        lab.setAttribute('for', id);
        var out = el('output', 'demo-val');
        var r = el('input');
        r.type = 'range';
        r.id = id;
        r.min = c.min; r.max = c.max;
        r.step = c.step == null ? (c.max - c.min) / 100 : c.step;
        r.value = c.def;
        function show(v) {
            out.textContent = (c.fmt ? c.fmt(v) : (Math.round(v * 100) / 100)) + (c.unit || '');
        }
        show(c.def);
        r.addEventListener('input', function () {
            var v = Number(r.value);
            show(v);
            inst.set(c.id, v);
        });
        wrap.appendChild(lab);
        wrap.appendChild(r);
        wrap.appendChild(out);
        inst.set(c.id, c.def);
        return wrap;
    }

    /* ---------------- keyboard ---------------- */
    var KEYROW = 'awsedftgyhujk';
    function buildKeys(inst, def) {
        var wrap = el('div', 'demo-keys');
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', 'Keyboard — A to K on your keyboard play the same notes');
        var base = def.baseNote == null ? 48 : def.baseNote;
        var held = {};
        for (var i = 0; i < 13; i++) {
            (function (n) {
                var midi = base + n;
                var black = [1, 3, 6, 8, 10].indexOf(n % 12) >= 0;
                var b = el('button', 'demo-key' + (black ? ' black' : ''));
                b.type = 'button';
                b.setAttribute('aria-label', 'Note ' + midi);
                function on() { if (!held[midi]) { held[midi] = 1; inst.note(midi, true); b.classList.add('on'); } }
                function off() { if (held[midi]) { held[midi] = 0; inst.note(midi, false); b.classList.remove('on'); } }
                b.addEventListener('pointerdown', function (e) { e.preventDefault(); on(); });
                b.addEventListener('pointerup', off);
                b.addEventListener('pointerleave', off);
                // A keyboard reaches these too: space or enter plays a short note.
                b.addEventListener('keydown', function (e) {
                    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); on(); }
                });
                b.addEventListener('keyup', function (e) {
                    if (e.key === ' ' || e.key === 'Enter') off();
                });
                b._on = on; b._off = off;
                wrap.appendChild(b);
            })(i);
        }
        function keyDown(e) {
            if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
            var t = e.target;
            if (t && /^(input|textarea|select|button)$/i.test(t.tagName || '')) return;
            var i = KEYROW.indexOf(e.key.toLowerCase());
            if (i >= 0 && wrap.children[i]) { e.preventDefault(); wrap.children[i]._on(); }
        }
        function keyUp(e) {
            var i = KEYROW.indexOf(e.key.toLowerCase());
            if (i >= 0 && wrap.children[i]) wrap.children[i]._off();
        }
        document.addEventListener('keydown', keyDown);
        document.addEventListener('keyup', keyUp);
        wrap._detach = function () {
            document.removeEventListener('keydown', keyDown);
            document.removeEventListener('keyup', keyUp);
        };
        return wrap;
    }

    /* ---------------- transport ---------------- */
    function buildTransport(inst, srcNodes, def) {
        var wrap = el('div', 'demo-transport');
        var b = el('button', 'demo-play');
        b.type = 'button';
        var playing = false;
        function paint() {
            b.textContent = playing ? 'Stop' : (def.kind === 'instrument' ? 'Start' : 'Play');
            b.setAttribute('aria-pressed', String(playing));
        }
        paint();
        b.addEventListener('click', function () {
            var ac = A.audio();
            playing = !playing;
            if (playing) {
                if (inst.input) startSource(ac, inst, srcNodes, null);
                if (inst.start) inst.start();
            } else {
                if (srcNodes.stop) srcNodes.stop();
                if (inst.stop) inst.stop();
            }
            paint();
        });
        wrap.appendChild(b);
        wrap._stopIfPlaying = function () { if (playing) b.click(); };
        return wrap;
    }

    window.lucidDemos = { register: register, mount: mount, has: function (id) { return !!DEFS[id]; } };
})();

/* ===========================================================================
   The simulations.
   =========================================================================== */
(function () {
    'use strict';
    var A = window.lucidDemoAudio, D = window.lucidDemos;
    if (!A || !D) return;
    var clamp = A.clamp;

    /* ---------------------------------------------------------------- SpectraEye
       The closest of all of these to the real thing, because an analyser is
       all measurement and a browser can measure. Everything on screen is read
       off the same signal the plugin would read. */
    D.register({
        id: 'spectraeye',
        title: 'SpectraEye',
        kind: 'analyser',
        canvas: true,
        canvasLabel: 'Spectrum, spectrogram and a goniometer, drawn from the audio passing through.',
        blurb: 'Audio goes through untouched and gets measured on the way. Spectrum with peak hold, a ' +
               'scrolling spectrogram, a tuner against A4 = 432 Hz, levels and a goniometer.',
        unlike: [
            'Loudness to the full EBU R 128 gating — this shows peak and RMS, not integrated LUFS.',
            'A reference curve captured from a second track.',
            'Peak hold with a settable fall time, and the readouts in numbers you can copy.'
        ],
        controls: [
            { id: 'view', type: 'select', label: 'Show', options: ['Spectrum + spectrogram', 'Spectrum only', 'Goniometer'], def: 0 },
            { id: 'tilt', type: 'range', label: 'Tilt', min: 0, max: 6, step: 0.5, def: 3, unit: ' dB/oct' }
        ],
        build: function (ac, out, api) {
            var inp = ac.createGain();
            var split = ac.createChannelSplitter(2);
            var anL = ac.createAnalyser(), anR = ac.createAnalyser();
            anL.fftSize = 4096; anR.fftSize = 4096;
            anL.smoothingTimeConstant = 0.72; anR.smoothingTimeConstant = 0.72;
            inp.connect(split);
            split.connect(anL, 0); split.connect(anR, 1);
            inp.connect(out);
            var freq = new Float32Array(anL.frequencyBinCount);
            var tdL = new Float32Array(1024), tdR = new Float32Array(1024);
            var peaks = new Float32Array(anL.frequencyBinCount);
            var spec = null, specX = 0;
            var state = { view: 0, tilt: 3 };

            function noteOf(f) {
                var n = Math.round(12 * Math.log2(f / 432) + 69);
                var exact = 432 * Math.pow(2, (n - 69) / 12);
                var cents = Math.round(1200 * Math.log2(f / exact));
                var NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                return { name: NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1), cents: cents };
            }

            return {
                input: inp,
                set: function (k, v) { state[k] = v; },
                draw: function (g, w, h) {
                    anL.getFloatFrequencyData(freq);
                    anL.getFloatTimeDomainData(tdL);
                    anR.getFloatTimeDomainData(tdR);
                    g.clearRect(0, 0, w, h);
                    g.fillStyle = '#07050f';
                    g.fillRect(0, 0, w, h);

                    if (state.view === 2) {
                        // Goniometer: L/R rotated 45°, which is how a correlation
                        // meter is drawn — a vertical line is mono, a circle is wide.
                        g.strokeStyle = 'rgba(155,123,255,.25)';
                        g.strokeRect(1, 1, w - 2, h - 2);
                        g.fillStyle = 'rgba(138,224,75,.75)';
                        var cx = w / 2, cy = h / 2, s = Math.min(w, h) * 0.45;
                        for (var i = 0; i < tdL.length; i++) {
                            var x = (tdL[i] - tdR[i]) * 0.7071, y = (tdL[i] + tdR[i]) * 0.7071;
                            g.fillRect(cx + x * s, cy - y * s, 1.5, 1.5);
                        }
                        var dot = 0, aa = 0, bb = 0;
                        for (var j = 0; j < tdL.length; j++) { dot += tdL[j] * tdR[j]; aa += tdL[j] * tdL[j]; bb += tdR[j] * tdR[j]; }
                        var corr = (aa && bb) ? dot / Math.sqrt(aa * bb) : 0;
                        g.fillStyle = '#b49cff';
                        g.font = (12) + 'px ui-monospace, monospace';
                        g.fillText('correlation ' + corr.toFixed(2), 10, 18);
                        return;
                    }

                    var specH = state.view === 0 ? Math.floor(h * 0.42) : 0;
                    var topH = h - specH;

                    // Spectrum, log x, with a tilt so the top end is not a flat line.
                    var sr = ac.sampleRate, bins = freq.length;
                    g.beginPath();
                    var peak = { v: -200, f: 0 };
                    for (var b = 1; b < bins; b++) {
                        var f = b * sr / 2 / bins;
                        if (f < 20 || f > 20000) continue;
                        var x = (Math.log10(f / 20) / Math.log10(1000)) * w;
                        var db = freq[b] + state.tilt * Math.log2(f / 20);
                        if (freq[b] > peak.v) { peak.v = freq[b]; peak.f = f; }
                        if (db > peaks[b]) peaks[b] = db; else peaks[b] -= 0.35;
                        var y = topH - ((db + 100) / 100) * topH;
                        if (b === 1) g.moveTo(x, clamp(y, 0, topH)); else g.lineTo(x, clamp(y, 0, topH));
                    }
                    g.strokeStyle = '#8ae04b';
                    g.lineWidth = 2;
                    g.stroke();

                    g.beginPath();
                    for (var b2 = 1; b2 < bins; b2++) {
                        var f2 = b2 * sr / 2 / bins;
                        if (f2 < 20 || f2 > 20000) continue;
                        var x2 = (Math.log10(f2 / 20) / Math.log10(1000)) * w;
                        var y2 = topH - ((peaks[b2] + 100) / 100) * topH;
                        if (b2 === 1) g.moveTo(x2, clamp(y2, 0, topH)); else g.lineTo(x2, clamp(y2, 0, topH));
                    }
                    g.strokeStyle = 'rgba(111,227,232,.55)';
                    g.lineWidth = 1;
                    g.stroke();

                    // Octave rules, so the picture has a scale.
                    g.strokeStyle = 'rgba(155,123,255,.16)';
                    g.fillStyle = 'rgba(180,156,255,.6)';
                    g.font = '10px ui-monospace, monospace';
                    [50, 100, 500, 1000, 5000, 10000].forEach(function (fr) {
                        var xx = (Math.log10(fr / 20) / Math.log10(1000)) * w;
                        g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx, topH); g.stroke();
                        g.fillText(fr >= 1000 ? (fr / 1000) + 'k' : String(fr), xx + 3, topH - 4);
                    });

                    // The tuner, on the loudest bin, against 432.
                    if (peak.v > -70 && peak.f > 25) {
                        var nn = noteOf(peak.f);
                        g.fillStyle = Math.abs(nn.cents) < 6 ? '#8ae04b' : '#d44fb0';
                        g.font = 'bold 15px ui-monospace, monospace';
                        g.fillText(nn.name + '  ' + (nn.cents >= 0 ? '+' : '') + nn.cents + ' ct', 10, 20);
                        g.fillStyle = 'rgba(180,156,255,.7)';
                        g.font = '11px ui-monospace, monospace';
                        g.fillText(peak.f.toFixed(1) + ' Hz · A4=432', 10, 36);
                    }

                    if (specH > 4) {
                        if (!spec || spec.width !== w || spec.height !== specH) {
                            spec = document.createElement('canvas');
                            spec.width = w; spec.height = specH; specX = 0;
                        }
                        var sg = spec.getContext('2d');
                        for (var k = 0; k < specH; k++) {
                            var fk = 20 * Math.pow(1000, 1 - k / specH);
                            var bi = Math.round(fk / (sr / 2) * bins);
                            var v = clamp((freq[clamp(bi, 0, bins - 1)] + 95) / 85, 0, 1);
                            sg.fillStyle = 'rgb(' + Math.round(40 + v * 215) + ',' +
                                Math.round(10 + v * v * 200) + ',' + Math.round(60 + v * 120) + ')';
                            sg.fillRect(specX, k, 2, 1);
                        }
                        specX = (specX + 2) % w;
                        sg.fillStyle = 'rgba(7,5,15,.9)';
                        sg.fillRect(specX, 0, 14, specH);
                        g.drawImage(spec, 0, topH);
                    }
                },
                dispose: function () { try { inp.disconnect(); } catch (e) {} }
            };
        }
    });

    /* ---------------------------------------------------------------- Loop Repeat
       Capture a take, play it back N times, capture the next one. The real
       one is a SunVox Loop module; this is the same loop in a
       ScriptProcessor, which is the only way a page can hold on to live
       audio without shipping a worklet file. */
    D.register({
        id: 'looprepeat',
        title: 'Loop Repeat',
        kind: 'effect',
        blurb: 'Records a short take of whatever is going through it, plays it back a set number of times, ' +
               'then records a new one. Stutter, beat-repeat and glitch.',
        unlike: [
            'Tempo sync — the real one locks the take to the host’s bars and beats.',
            'Take length in note values rather than milliseconds.',
            'It runs in the audio thread; this runs in the page, so a busy tab can tick.'
        ],
        controls: [
            { id: 'len', type: 'range', label: 'Take', min: 20, max: 1000, step: 10, def: 180, unit: ' ms' },
            { id: 'reps', type: 'range', label: 'Repeats', min: 1, max: 16, step: 1, def: 4 },
            { id: 'mix', type: 'range', label: 'Mix', min: 0, max: 1, step: 0.01, def: 1,
              fmt: function (v) { return Math.round(v * 100); }, unit: '%' },
            { id: 'fade', type: 'switch', label: 'Soften edges', def: true }
        ],
        build: function (ac, out) {
            var inp = ac.createGain();
            var dry = ac.createGain(), wet = ac.createGain();
            dry.gain.value = 0; wet.gain.value = 1;
            inp.connect(dry); dry.connect(out);
            var sp = ac.createScriptProcessor(1024, 2, 2);
            inp.connect(sp);
            sp.connect(wet); wet.connect(out);

            var st = { len: 180, reps: 4, mix: 1, fade: true };
            var take = null, writePos = 0, readPos = 0, rep = 0, capturing = true;

            function ensure() {
                var want = Math.max(64, Math.floor(ac.sampleRate * st.len / 1000));
                if (!take || take[0].length !== want) {
                    take = [new Float32Array(want), new Float32Array(want)];
                    writePos = 0; readPos = 0; rep = 0; capturing = true;
                }
            }
            ensure();

            sp.onaudioprocess = function (e) {
                ensure();
                var iL = e.inputBuffer.getChannelData(0);
                var iR = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : iL;
                var oL = e.outputBuffer.getChannelData(0), oR = e.outputBuffer.getChannelData(1);
                var n = oL.length, len = take[0].length;
                for (var i = 0; i < n; i++) {
                    if (capturing) {
                        take[0][writePos] = iL[i];
                        take[1][writePos] = iR[i];
                        oL[i] = iL[i]; oR[i] = iR[i];
                        if (++writePos >= len) { writePos = 0; capturing = false; readPos = 0; rep = 0; }
                    } else {
                        var g = 1;
                        if (st.fade) {
                            var edge = Math.min(readPos, len - readPos - 1);
                            var ramp = Math.min(len * 0.08, 256);
                            if (edge < ramp) g = edge / ramp;
                        }
                        oL[i] = take[0][readPos] * g;
                        oR[i] = take[1][readPos] * g;
                        if (++readPos >= len) {
                            readPos = 0;
                            if (++rep >= st.reps) { capturing = true; writePos = 0; }
                        }
                    }
                }
            };

            return {
                input: inp,
                set: function (k, v) {
                    st[k] = v;
                    if (k === 'mix') { wet.gain.value = v; dry.gain.value = 1 - v; }
                    if (k === 'len') ensure();
                },
                dispose: function () {
                    sp.onaudioprocess = null;
                    try { sp.disconnect(); inp.disconnect(); dry.disconnect(); wet.disconnect(); } catch (e) {}
                }
            };
        }
    });
})();

/* ===========================================================================
   Effects, continued.
   =========================================================================== */
(function () {
    'use strict';
    var A = window.lucidDemoAudio, D = window.lucidDemos;
    if (!A || !D) return;
    var clamp = A.clamp;

    /* ---------------------------------------------------------------- Mindbloom
       Six effects in series under one TRIP knob. The chain and the order are
       the plugin's; the gliss is a doppler on a swept delay rather than a
       real spectral shifter, which is the one place a page cannot follow. */
    D.register({
        id: 'mindbloom',
        title: 'Mindbloom',
        kind: 'effect',
        blurb: 'Gliss, filter, phaser, flanger, dub delay and a shimmer reverb, in that order. ' +
               'TRIP pushes every depth, feedback and mix deeper at once.',
        unlike: [
            'The gliss is a real pitch shifter with shimmer feedback; this glides a delay, which doppler-shifts while it moves.',
            'Tempo sync — SYNC locks the LFOs and the delay to the host.',
            'The Soup Cat, who pulls eight different faces at you while it runs.'
        ],
        controls: [
            { id: 'trip', type: 'range', label: 'TRIP', min: 0, max: 1, step: .01, def: .35,
              fmt: function (v) { return Math.round(v * 100); }, unit: '%' },
            { id: 'rate', type: 'range', label: 'LFO rate', min: .05, max: 6, step: .05, def: .5, unit: ' Hz' },
            { id: 'cutoff', type: 'range', label: 'Filter', min: 120, max: 9000, step: 10, def: 1400, unit: ' Hz' },
            { id: 'delay', type: 'range', label: 'Delay', min: 60, max: 900, step: 5, def: 340, unit: ' ms' },
            { id: 'space', type: 'range', label: 'Space', min: 0, max: 1, step: .01, def: .4,
              fmt: function (v) { return Math.round(v * 100); }, unit: '%' },
            { id: 'mix', type: 'range', label: 'Mix', min: 0, max: 1, step: .01, def: .85,
              fmt: function (v) { return Math.round(v * 100); }, unit: '%' }
        ],
        build: function (ac, out) {
            var inp = ac.createGain();
            var dry = ac.createGain(), wetBus = ac.createGain();
            dry.gain.value = .15; wetBus.gain.value = .85;
            inp.connect(dry); dry.connect(out);

            // 1 GLISS — a delay whose time is always moving, which shifts pitch
            //   while it moves, fed back on itself through a brightener.
            var gl = ac.createDelay(0.2), glFb = ac.createGain(), glHi = ac.createBiquadFilter();
            glHi.type = 'highshelf'; glHi.frequency.value = 1800; glHi.gain.value = 6;
            gl.delayTime.value = 0.05; glFb.gain.value = 0.3;
            var glLfo = ac.createOscillator(), glAmt = ac.createGain();
            glLfo.type = 'triangle'; glLfo.frequency.value = 0.18; glAmt.gain.value = 0.012;
            glLfo.connect(glAmt); glAmt.connect(gl.delayTime); glLfo.start();
            inp.connect(gl); gl.connect(glHi); glHi.connect(glFb); glFb.connect(gl);

            // 2 FILTER — resonant, swept by an LFO.
            var lad = A.ladder(ac);
            lad.reso(6);
            var fLfo = ac.createOscillator(), fAmt = ac.createGain();
            fLfo.type = 'sine'; fLfo.frequency.value = .5; fAmt.gain.value = 600;
            fLfo.connect(fAmt); fAmt.connect(lad.input.frequency); fAmt.connect(lad.output.frequency);
            fLfo.start();
            gl.connect(lad.input); inp.connect(lad.input);

            // 3 PHASER — four allpasses swept together.
            var aps = [], pLfo = ac.createOscillator(), pAmt = ac.createGain();
            pLfo.type = 'sine'; pLfo.frequency.value = .33; pAmt.gain.value = 700;
            pLfo.start(); pLfo.connect(pAmt);
            var node = lad.output;
            for (var i = 0; i < 4; i++) {
                var ap = ac.createBiquadFilter();
                ap.type = 'allpass';
                ap.frequency.value = 300 + i * 420;
                ap.Q.value = 1.1;
                pAmt.connect(ap.frequency);
                node.connect(ap);
                node = ap;
                aps.push(ap);
            }
            var phFb = ac.createGain(); phFb.gain.value = .35;
            node.connect(phFb); phFb.connect(aps[0]);

            // 4 FLANGER — a short modulated delay with feedback.
            var fl = ac.createDelay(0.03), flFb = ac.createGain();
            fl.delayTime.value = .004; flFb.gain.value = .55;
            var flLfo = ac.createOscillator(), flAmt = ac.createGain();
            flLfo.type = 'sine'; flLfo.frequency.value = .21; flAmt.gain.value = .0028;
            flLfo.connect(flAmt); flAmt.connect(fl.delayTime); flLfo.start();
            node.connect(fl); fl.connect(flFb); flFb.connect(fl);
            var flMix = ac.createGain();
            node.connect(flMix); fl.connect(flMix);

            // 5 DUB DELAY — ping-pong with a tone filter and saturation.
            var dL = ac.createDelay(2), dR = ac.createDelay(2);
            var fbL = ac.createGain(), fbR = ac.createGain();
            var tone = ac.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2600;
            var sat = A.drive(ac, .18);
            var panL = ac.createStereoPanner ? ac.createStereoPanner() : null;
            var panR = ac.createStereoPanner ? ac.createStereoPanner() : null;
            if (panL) { panL.pan.value = -.8; panR.pan.value = .8; }
            dL.delayTime.value = .34; dR.delayTime.value = .51;
            fbL.gain.value = .45; fbR.gain.value = .45;
            flMix.connect(dL);
            dL.connect(tone); tone.connect(sat); sat.connect(fbL); fbL.connect(dR); dR.connect(fbR); fbR.connect(dL);
            var delMix = ac.createGain();
            flMix.connect(delMix);
            if (panL) { dL.connect(panL); dR.connect(panR); panL.connect(delMix); panR.connect(delMix); }
            else { dL.connect(delMix); dR.connect(delMix); }

            // 6 SPACE — a big tail with an octave-up shimmer fed back in.
            var rev = ac.createConvolver();
            rev.buffer = A.impulse(ac, 3.4, 2.6, .36);
            var revSend = ac.createGain(); revSend.gain.value = .4;
            delMix.connect(revSend); revSend.connect(rev);
            rev.connect(wetBus);
            delMix.connect(wetBus);
            wetBus.connect(out);

            var st = { trip: .35, rate: .5, cutoff: 1400, delay: 340, space: .4, mix: .85 };
            function apply() {
                var t = st.trip;
                glAmt.gain.value = .004 + t * .022;
                glFb.gain.value = .15 + t * .55;
                fAmt.gain.value = 250 + t * 2600;
                lad.cutoff(st.cutoff);
                lad.reso(2 + t * 12);
                pAmt.gain.value = 300 + t * 1800;
                phFb.gain.value = .15 + t * .55;
                flFb.gain.value = .25 + t * .55;
                flAmt.gain.value = .0012 + t * .004;
                fbL.gain.value = fbR.gain.value = .2 + t * .55;
                dL.delayTime.value = st.delay / 1000;
                dR.delayTime.value = st.delay / 1000 * 1.5;
                revSend.gain.value = st.space * (.3 + t * .8);
                fLfo.frequency.value = st.rate;
                pLfo.frequency.value = st.rate * .66;
                flLfo.frequency.value = st.rate * .42;
                wetBus.gain.value = st.mix;
                dry.gain.value = 1 - st.mix;
            }
            apply();

            return {
                input: inp,
                set: function (k, v) { st[k] = v; apply(); },
                dispose: function () {
                    [glLfo, fLfo, pLfo, flLfo].forEach(function (o) { try { o.stop(); } catch (e) {} });
                    try { inp.disconnect(); wetBus.disconnect(); dry.disconnect(); } catch (e) {}
                }
            };
        }
    });

    /* ---------------------------------------------------------------- Syrup Vox
       Slow it down, print the voice onto a carrier, ruin it. TAPE is a real
       varispeed here because the page owns the player; on a microphone it
       cannot be, and the demo says so rather than quietly doing nothing. */
    D.register({
        id: 'syrupvox',
        title: 'Syrup Vox',
        kind: 'effect',
        blurb: 'TAPE drags the whole thing slower and lower. The vocoder prints its shape onto a ' +
               '432 Hz synth, noise or your input. Then tube, fuzz, fold or crush.',
        unlike: [
            'STRETCH: slowing the voice while the pitch stays put. That needs a spectral stretch; this demo only has tape.',
            'A sidechain carrier from another track, and MIDI control of the built-in synth.',
            'Tape slowdown works on the test loop and on a file you choose. It cannot work on a live microphone — nothing can slow a signal that has not arrived yet.'
        ],
        controls: [
            { id: 'slow', type: 'range', label: 'Tape', min: .35, max: 1, step: .01, def: .72,
              fmt: function (v) { return Math.round(v * 100); }, unit: '%' },
            { id: 'carrier', type: 'select', label: 'Carrier', options: ['Synth drone', 'Noise (whisper)', 'Itself'], def: 0 },
            { id: 'bands', type: 'range', label: 'Bands', min: 6, max: 22, step: 1, def: 16 },
            { id: 'dist', type: 'select', label: 'Distortion', options: ['Tube', 'Fuzz', 'Fold', 'Crush'], def: 0 },
            { id: 'amount', type: 'range', label: 'Drive', min: 0, max: 1, step: .01, def: .3,
              fmt: function (v) { return Math.round(v * 100); }, unit: '%' },
            { id: 'mix', type: 'range', label: 'Vocoder', min: 0, max: 1, step: .01, def: .9,
              fmt: function (v) { return Math.round(v * 100); }, unit: '%' }
        ],
        build: function (ac, out) {
            var inp = ac.createGain();
            var srcNode = null;
            var st = { slow: .72, carrier: 0, bands: 16, dist: 0, amount: .3, mix: .9 };

            // The carrier: a stack of 432-tuned saws, or noise.
            var carrier = ac.createGain();
            var oscs = [];
            [0, 7, 12].forEach(function (semi) {
                var o = ac.createOscillator();
                o.type = 'sawtooth';
                o.frequency.value = A.hz(36 + semi);
                o.connect(carrier);
                o.start();
                oscs.push(o);
            });
            carrier.gain.value = .22;
            var noise = ac.createBufferSource();
            noise.buffer = A.noiseBuffer(ac, 3);
            noise.loop = true;
            var noiseGain = ac.createGain(); noiseGain.gain.value = 0;
            noise.connect(noiseGain);
            noise.start();

            // The vocoder: a bank of matched band-passes, the modulator's
            // envelope in each band driving the carrier's band.
            var bankIn = ac.createGain(), bankOut = ac.createGain();
            // Makeup: a bank of band VCAs multiplies two signals that are each
            // well under one, so the product lands near silence without it.
            bankOut.gain.value = 1.6;
            carrier.connect(bankIn); noiseGain.connect(bankIn);
            var bands = [];
            var nBands = 16;

            /* One processor for the whole bank, not one per band.

               The first version gave every band its own ScriptProcessor and
               connected each to a gain that went nowhere — and a
               ScriptProcessor whose output never reaches the destination is
               never pulled, so not one envelope follower ever ran and the
               vocoder sat at silence while looking entirely correct. This
               reads the modulator once, runs a state-variable bandpass per
               band in plain arithmetic, and drives the carrier VCAs from
               that. Twenty-two filters over 512 samples is nothing, and
               there is one node instead of twenty-two. */
            var analyser = ac.createScriptProcessor(512, 1, 1);
            var sink = ac.createGain();
            sink.gain.value = 0;                  // silent, but it must land
            inp.connect(analyser);
            analyser.connect(sink);
            sink.connect(ac.destination);

            function buildBank(n) {
                bands.forEach(function (b) {
                    try { b.cf.disconnect(); b.vca.disconnect(); } catch (e) {}
                });
                bands = [];
                nBands = n;
                for (var i = 0; i < n; i++) {
                    var f = 120 * Math.pow(7000 / 120, i / (n - 1));
                    var cf = ac.createBiquadFilter();
                    cf.type = 'bandpass';
                    cf.frequency.value = f;
                    cf.Q.value = 6;
                    var vca = ac.createGain();
                    vca.gain.value = 0;
                    bankIn.connect(cf); cf.connect(vca); vca.connect(bankOut);
                    bands.push({
                        cf: cf, vca: vca, f: f,
                        // SVF state, and the envelope it feeds.
                        lo: 0, bp: 0, env: 0,
                        g: 2 * Math.sin(Math.PI * Math.min(f, ac.sampleRate * 0.45) / ac.sampleRate),
                        q: 1 / 6
                    });
                }
            }
            buildBank(16);

            analyser.onaudioprocess = function (e) {
                var d = e.inputBuffer.getChannelData(0);
                var n = d.length, nb = bands.length;
                for (var bi = 0; bi < nb; bi++) {
                    var b = bands[bi], lo = b.lo, bp = b.bp, g = b.g, q = b.q, acc = 0;
                    for (var i = 0; i < n; i++) {
                        lo += g * bp;
                        var hi = d[i] - lo - q * bp;
                        bp += g * hi;
                        acc += bp * bp;
                    }
                    b.lo = lo; b.bp = bp;
                    var rms = Math.sqrt(acc / n);
                    // Fast up, slow down: that asymmetry is what makes a
                    // vocoder sound like speech rather than like a swell.
                    b.env = b.env + (rms - b.env) * (rms > b.env ? 0.6 : 0.15);
                    b.vca.gain.setTargetAtTime(clamp(b.env * 10, 0, 3), ac.currentTime, 0.012);
                }
                var o = e.outputBuffer.getChannelData(0);
                for (var k = 0; k < o.length; k++) o[k] = 0;
            };

            var shaperNode = ac.createGain();
            var distNode = A.drive(ac, .3);
            bankOut.connect(shaperNode);
            shaperNode.connect(distNode);
            var wet = ac.createGain(), dryPath = ac.createGain();
            distNode.connect(wet);
            inp.connect(dryPath);
            wet.connect(out); dryPath.connect(out);

            function setDist() {
                var a = st.amount;
                var curve;
                if (st.dist === 0) curve = function (x) { var k = 1 + a * 18; return Math.tanh(x * k) / Math.tanh(k); };
                else if (st.dist === 1) curve = function (x) { var k = 1 + a * 60; return Math.sign(x) * (1 - Math.exp(-Math.abs(x * k))); };
                else if (st.dist === 2) curve = function (x) { var k = 1 + a * 5; var y = x * k; while (Math.abs(y) > 1) y = Math.sign(y) * (2 - Math.abs(y)); return y; };
                else curve = function (x) { var steps = Math.max(2, Math.round(32 - a * 29)); return Math.round(x * steps) / steps; };
                var nw = A.shaper(ac, curve);
                try { shaperNode.disconnect(); } catch (e) {}
                try { distNode.disconnect(); } catch (e) {}
                distNode = nw;
                shaperNode.connect(distNode);
                distNode.connect(wet);
            }

            return {
                input: inp,
                onSource: function (node, kind) {
                    srcNode = node;
                    if (kind !== 'mic') node.playbackRate.value = st.slow;
                },
                set: function (k, v) {
                    st[k] = v;
                    if (k === 'slow' && srcNode) { try { srcNode.playbackRate.value = v; } catch (e) {} }
                    if (k === 'carrier') {
                        carrier.gain.value = v === 0 ? .22 : 0;
                        noiseGain.gain.value = v === 1 ? .5 : 0;
                        if (v === 2) { try { inp.connect(bankIn); } catch (e) {} }
                        else { try { inp.disconnect(bankIn); } catch (e) {} }
                    }
                    if (k === 'bands') buildBank(Math.round(v));
                    if (k === 'dist' || k === 'amount') setDist();
                    if (k === 'mix') { wet.gain.value = v; dryPath.gain.value = (1 - v) * .8; }
                },
                dispose: function () {
                    oscs.forEach(function (o) { try { o.stop(); } catch (e) {} });
                    try { noise.stop(); } catch (e) {}
                    analyser.onaudioprocess = null;
                    try { analyser.disconnect(); sink.disconnect(); } catch (e) {}
                    try { inp.disconnect(); wet.disconnect(); dryPath.disconnect(); } catch (e) {}
                }
            };
        }
    });

    /* ---------------------------------------------------------------- Ether Radio
       SIM mode only: your track is a station and you have to find it. The
       receiver is the point — selectivity, static, fading, hum, whistle. */
    D.register({
        id: 'etherradio',
        title: 'Ether Radio',
        kind: 'effect',
        canvas: true,
        canvasLabel: 'The dial, with the station sitting at its frequency and the signal strength beside it.',
        blurb: 'Your track is a station. Turn the dial to find it — off-tune it goes narrow, noisy and ' +
               'whistly, the way a real receiver does. AM is narrower and dirtier than FM.',
        unlike: [
            'LIVE: real AM and FM pulled off an RTL-SDR dongle over rtl_tcp.',
            'SRT: playing someone else’s stream, and going ON AIR with your own.',
            'The cabinet — six glass tubes of glowing soup whose level rises with the signal.'
        ],
        controls: [
            { id: 'dial', type: 'range', label: 'Dial', min: 88, max: 108, step: .05, def: 98.2, unit: ' MHz' },
            { id: 'station', type: 'range', label: 'Station at', min: 88, max: 108, step: .1, def: 98.5, unit: ' MHz' },
            { id: 'band', type: 'select', label: 'Band', options: ['FM', 'AM'], def: 0 },
            { id: 'noise', type: 'range', label: 'Static', min: 0, max: 1, step: .01, def: .5,
              fmt: function (v) { return Math.round(v * 100); }, unit: '%' },
            { id: 'drive', type: 'range', label: 'Tube', min: 0, max: 1, step: .01, def: .3,
              fmt: function (v) { return Math.round(v * 100); }, unit: '%' }
        ],
        build: function (ac, out) {
            var inp = ac.createGain();
            var st = { dial: 98.2, station: 98.5, band: 0, noise: .5, drive: .3 };

            var sig = ac.createGain();                    // the station, after selectivity
            var bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = .7;
            var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000;
            var hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
            inp.connect(hp); hp.connect(lp); lp.connect(bp); bp.connect(sig);

            var tube = A.drive(ac, .3);
            sig.connect(tube);

            // The speaker: a resonant peak and a roll-off at both ends, which
            // is most of why a radio sounds like a radio.
            var spk = ac.createBiquadFilter(); spk.type = 'peaking';
            spk.frequency.value = 1900; spk.Q.value = 1.1; spk.gain.value = 7;
            tube.connect(spk); spk.connect(out);

            // Static, hum and the tuning whistle, all louder the further off you are.
            var ns = ac.createBufferSource(); ns.buffer = A.noiseBuffer(ac, 4); ns.loop = true;
            var nsFilt = ac.createBiquadFilter(); nsFilt.type = 'bandpass';
            nsFilt.frequency.value = 2600; nsFilt.Q.value = .6;
            var nsGain = ac.createGain(); nsGain.gain.value = 0;
            ns.connect(nsFilt); nsFilt.connect(nsGain); nsGain.connect(spk); ns.start();

            var hum = ac.createOscillator(); hum.type = 'sine'; hum.frequency.value = 50;
            var humGain = ac.createGain(); humGain.gain.value = 0;
            hum.connect(humGain); humGain.connect(spk); hum.start();

            var whistle = ac.createOscillator(); whistle.type = 'sine';
            var whGain = ac.createGain(); whGain.gain.value = 0;
            whistle.connect(whGain); whGain.connect(spk); whistle.start();

            var strength = 1;
            function apply() {
                var off = Math.abs(st.dial - st.station);
                var width = st.band === 0 ? .45 : .22;      // AM is far more selective
                strength = clamp(1 - off / (width * 4), 0, 1);
                var s = strength * strength;

                sig.gain.value = s;
                // Off-station, the passband closes in and the top goes first.
                lp.frequency.value = st.band === 0 ? (1200 + s * 8000) : (900 + s * 3200);
                hp.frequency.value = st.band === 0 ? 120 : 320;
                bp.Q.value = st.band === 0 ? .6 : 1.4;

                nsGain.gain.value = (1 - s) * st.noise * .22 + st.noise * .012;
                humGain.gain.value = (1 - s) * .035 + .004;
                // The whistle is the heterodyne: it rises as you approach and
                // vanishes when you land on it.
                whistle.frequency.value = clamp(260 + off * 3400, 60, 9000);
                whGain.gain.value = off > .02 && off < width * 3 ? (1 - s) * .05 : 0;
                spk.gain.value = 5 + s * 5;
            }
            apply();

            return {
                input: inp,
                set: function (k, v) {
                    st[k] = v;
                    if (k === 'drive') {
                        try { sig.disconnect(); tube.disconnect(); } catch (e) {}
                        tube = A.drive(ac, v);
                        sig.connect(tube); tube.connect(spk);
                    }
                    apply();
                },
                draw: function (g, w, h) {
                    g.fillStyle = '#07050f'; g.fillRect(0, 0, w, h);
                    var pad = 28 * (w / 700);
                    var y = h * .55;
                    g.strokeStyle = 'rgba(155,123,255,.4)'; g.lineWidth = 2;
                    g.beginPath(); g.moveTo(pad, y); g.lineTo(w - pad, y); g.stroke();
                    g.font = (11 * (w / 700) + 7) + 'px ui-monospace, monospace';
                    for (var f = 88; f <= 108; f += 2) {
                        var x = pad + (f - 88) / 20 * (w - pad * 2);
                        g.strokeStyle = 'rgba(155,123,255,.3)';
                        g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x, y + 10); g.stroke();
                        g.fillStyle = 'rgba(180,156,255,.65)';
                        g.fillText(String(f), x - 9, y + 28);
                    }
                    var sx = pad + (st.station - 88) / 20 * (w - pad * 2);
                    g.fillStyle = 'rgba(138,224,75,' + (0.25 + strength * 0.75) + ')';
                    g.fillRect(sx - 3, y - 46, 6, 36);
                    g.fillStyle = '#8ae04b';
                    g.fillText('station', sx - 22, y - 52);
                    var dx = pad + (st.dial - 88) / 20 * (w - pad * 2);
                    g.strokeStyle = '#d44fb0'; g.lineWidth = 3;
                    g.beginPath(); g.moveTo(dx, y - 60); g.lineTo(dx, y + 18); g.stroke();
                    g.fillStyle = '#d44fb0';
                    g.fillText(st.dial.toFixed(2) + ' MHz', 12, 24);
                    g.fillStyle = strength > .7 ? '#8ae04b' : 'rgba(180,156,255,.8)';
                    g.fillText('signal ' + Math.round(strength * 100) + '%', 12, 44);
                },
                dispose: function () {
                    [ns, hum, whistle].forEach(function (o) { try { o.stop(); } catch (e) {} });
                    try { inp.disconnect(); spk.disconnect(); } catch (e) {}
                }
            };
        }
    });
})();

/* ===========================================================================
   Instruments. All of them tune A4 = 432 Hz, because all of the real ones do.
   =========================================================================== */
(function () {
    'use strict';
    var A = window.lucidDemoAudio, D = window.lucidDemos;
    if (!A || !D) return;
    var clamp = A.clamp;

    /* A mono voice: one oscillator, noise, a ladder and an envelope. Three of
       these plugins are built on exactly this, so it is written once. */
    function monoVoice(ac, out) {
        var osc = ac.createOscillator();
        var sub = ac.createOscillator();
        var noise = ac.createBufferSource();
        noise.buffer = A.noiseBuffer(ac, 3);
        noise.loop = true;
        var oscG = ac.createGain(), subG = ac.createGain(), nG = ac.createGain();
        oscG.gain.value = .5; subG.gain.value = 0; nG.gain.value = 0;
        var mix = ac.createGain();
        var lad = A.ladder(ac);
        var vca = ac.createGain();
        vca.gain.value = 0;
        osc.type = 'sawtooth'; sub.type = 'square';
        osc.connect(oscG); sub.connect(subG); noise.connect(nG);
        oscG.connect(mix); subG.connect(mix); nG.connect(mix);
        mix.connect(lad.input);
        lad.output.connect(vca);
        vca.connect(out);
        osc.start(); sub.start(); noise.start();
        return { osc: osc, sub: sub, oscG: oscG, subG: subG, nG: nG, mix: mix, lad: lad, vca: vca,
                 stopAll: function () { [osc, sub, noise].forEach(function (o) { try { o.stop(); } catch (e) {} }); } };
    }

    /* --------------------------------------------------------------- BlackWidow
       One voice, a ladder that will self-oscillate, and the 32-step sequencer
       that is the reason the real one is fun: slides and accents. */
    D.register({
        id: 'blackwidow',
        title: 'BlackWidow',
        kind: 'instrument',
        keys: true,
        baseNote: 36,
        canvas: true,
        canvasLabel: 'The sequencer, with the playing step lit.',
        blurb: 'Saw or pulse into a 4-pole ladder that self-oscillates, an envelope you can switch to a ' +
               'drone, and a 32-step sequencer with slides and accents. A4 = 432 Hz.',
        unlike: [
            'The patch bay: 13 outputs, 11 inputs and 8 cables you route yourself.',
            'Sixteen storable patterns, ratchets, and pattern chaining.',
            'Analog drift and the pulse-width modulation that goes with it.'
        ],
        controls: [
            { id: 'wave', type: 'select', label: 'VCO', options: ['Saw', 'Pulse'], def: 0 },
            { id: 'cutoff', type: 'range', label: 'Cutoff', min: 80, max: 9000, step: 10, def: 1100, unit: ' Hz' },
            { id: 'reso', type: 'range', label: 'Resonance', min: .5, max: 20, step: .1, def: 8 },
            { id: 'env', type: 'range', label: 'Env → filter', min: 0, max: 5000, step: 50, def: 2200, unit: ' Hz' },
            { id: 'decay', type: 'range', label: 'Decay', min: .03, max: 1.2, step: .01, def: .28, unit: ' s' },
            { id: 'noise', type: 'range', label: 'Noise', min: 0, max: .5, step: .01, def: 0 },
            { id: 'tempo', type: 'range', label: 'Tempo', min: 60, max: 170, step: 1, def: 124, unit: ' bpm' }
        ],
        build: function (ac, out) {
            var v = monoVoice(ac, out);
            var st = { wave: 0, cutoff: 1100, reso: 8, env: 2200, decay: .28, noise: 0, tempo: 124, run: false };
            // A 32-step line that is worth hearing: a minor-ish acid shape.
            var STEPS = [0, 0, 12, 0, 3, 0, 10, 0, 0, 7, 0, 3, 5, 0, 0, 10,
                         0, 0, 12, 0, 3, 0, 15, 0, 0, 7, 0, 3, 5, 0, 12, 10];
            var GATE = [], ACC = [], SLIDE = [];
            for (var i = 0; i < 32; i++) {
                GATE.push(i % 4 !== 2 || i % 8 === 6);
                ACC.push(i % 8 === 0 || i % 8 === 5);
                SLIDE.push(i % 8 === 3);
            }
            var step = 0, timer = 0, playing = false;

            function fire(midi, accent, slide, dur) {
                var t = ac.currentTime;
                var f = A.hz(midi);
                if (slide) v.osc.frequency.setTargetAtTime(f, t, .06);
                else v.osc.frequency.setValueAtTime(f, t);
                v.sub.frequency.setValueAtTime(f / 2, t);
                var peak = accent ? 1 : .68;
                v.vca.gain.cancelScheduledValues(t);
                v.vca.gain.setValueAtTime(v.vca.gain.value, t);
                v.vca.gain.linearRampToValueAtTime(peak, t + .006);
                v.vca.gain.setTargetAtTime(0, t + .006, dur * .5);
                var top = clamp(st.cutoff + st.env * (accent ? 1.5 : 1), 60, 16000);
                v.lad.cutoff(top, t);
                v.lad.cutoff(st.cutoff, t + .01);
                v.lad.input.frequency.cancelScheduledValues(t);
                v.lad.input.frequency.setValueAtTime(top, t);
                v.lad.input.frequency.setTargetAtTime(st.cutoff, t + .006, dur * .45);
                v.lad.output.frequency.cancelScheduledValues(t);
                v.lad.output.frequency.setValueAtTime(top, t);
                v.lad.output.frequency.setTargetAtTime(st.cutoff, t + .006, dur * .45);
            }

            function tick() {
                if (!playing) return;
                var spb = 60 / st.tempo / 4;
                if (GATE[step]) fire(36 + STEPS[step], ACC[step], SLIDE[step], st.decay);
                step = (step + 1) % 32;
                timer = setTimeout(tick, spb * 1000);
            }

            function apply() {
                v.osc.type = st.wave === 0 ? 'sawtooth' : 'square';
                v.lad.reso(st.reso);
                v.lad.cutoff(st.cutoff);
                v.nG.gain.value = st.noise;
            }
            apply();

            return {
                set: function (k, val) { st[k] = val; apply(); },
                note: function (midi, on) {
                    if (on) fire(midi, false, false, Math.max(st.decay, .4));
                    else v.vca.gain.setTargetAtTime(0, ac.currentTime, .08);
                },
                // Start runs the sequencer; the keyboard plays over the top
                // of it, which is what the real one does too.
                start: function () { if (!playing) { playing = true; step = 0; tick(); } },
                stop: function () {
                    playing = false; clearTimeout(timer);
                    v.vca.gain.setTargetAtTime(0, ac.currentTime, .05);
                },
                draw: function (g, w, h) {
                    g.fillStyle = '#07050f'; g.fillRect(0, 0, w, h);
                    var cols = 16, rows = 2, pad = 6;
                    var cw = (w - pad * 2) / cols, ch = (h - pad * 2) / rows;
                    for (var i = 0; i < 32; i++) {
                        var cx = pad + (i % cols) * cw, cy = pad + Math.floor(i / cols) * ch;
                        var lit = playing && ((step - 1 + 32) % 32) === i;
                        g.fillStyle = lit ? '#8ae04b' : (GATE[i] ? 'rgba(155,123,255,.5)' : 'rgba(155,123,255,.13)');
                        g.fillRect(cx + 2, cy + ch - 6 - (STEPS[i] / 15) * (ch - 16), cw - 5,
                                   6 + (STEPS[i] / 15) * (ch - 16));
                        if (ACC[i]) { g.fillStyle = '#d44fb0'; g.fillRect(cx + 2, cy + 2, cw - 5, 3); }
                        if (SLIDE[i]) { g.fillStyle = '#6fe3e8'; g.fillRect(cx + 2, cy + ch - 4, cw - 5, 2); }
                    }
                },
                dispose: function () { clearTimeout(timer); v.stopAll(); try { v.vca.disconnect(); } catch (e) {} }
            };
        }
    });

    /* --------------------------------------------------------------- Hydra
       Three oscillators into a mixer that overdrives, then the ladder. The
       mixer is the part people forget: on the real thing you push it until
       the filter is being fed something already dirty. */
    D.register({
        id: 'hydra',
        title: 'Hydra',
        kind: 'instrument',
        keys: true,
        baseNote: 48,
        // No transport. Hydra has no sequencer: it makes sound when you play
        // it, and a Start button that does nothing is worse than no button.
        transport: false,
        blurb: 'Three oscillators, a mixer you can overdrive, a 4-pole ladder and two contours — the ' +
               '1970s performance synth. Detune the three against each other and push the drive.',
        unlike: [
            'FREAK, the fourth oscillator, with nine digital engines.',
            'The MATRIX: twelve modulation routes you set on a grid.',
            'The arpeggiator, with SPICE and DICE — and poly and unison modes.'
        ],
        controls: [
            { id: 'detune', type: 'range', label: 'Detune 2/3', min: 0, max: 40, step: .5, def: 7, unit: ' ct' },
            { id: 'interval', type: 'select', label: 'OSC 3', options: ['Unison', '+5th', '+Octave', '−Octave'], def: 2 },
            { id: 'drive', type: 'range', label: 'Mixer drive', min: 0, max: 1, step: .01, def: .35,
              fmt: function (v) { return Math.round(v * 100); }, unit: '%' },
            { id: 'cutoff', type: 'range', label: 'Cutoff', min: 80, max: 12000, step: 20, def: 2600, unit: ' Hz' },
            { id: 'reso', type: 'range', label: 'Emphasis', min: .5, max: 18, step: .1, def: 4 },
            { id: 'env', type: 'range', label: 'Contour', min: 0, max: 6000, step: 50, def: 1800, unit: ' Hz' },
            { id: 'decay', type: 'range', label: 'Decay', min: .05, max: 2.5, step: .01, def: .7, unit: ' s' },
            { id: 'glide', type: 'range', label: 'Glide', min: 0, max: .4, step: .005, def: 0, unit: ' s' }
        ],
        build: function (ac, out) {
            var st = { detune: 7, interval: 2, drive: .35, cutoff: 2600, reso: 4, env: 1800, decay: .7, glide: 0 };
            var o1 = ac.createOscillator(), o2 = ac.createOscillator(), o3 = ac.createOscillator();
            [o1, o2, o3].forEach(function (o) { o.type = 'sawtooth'; o.start(); });
            var g1 = ac.createGain(), g2 = ac.createGain(), g3 = ac.createGain();
            // Three saws summed hit 1.0 on their own before the drive even
            // sees them, so each one comes in well under a third.
            g1.gain.value = .2; g2.gain.value = .18; g3.gain.value = .16;
            var mix = ac.createGain();
            o1.connect(g1); o2.connect(g2); o3.connect(g3);
            g1.connect(mix); g2.connect(mix); g3.connect(mix);
            var dr = A.drive(ac, .35);
            mix.connect(dr);
            var lad = A.ladder(ac);
            dr.connect(lad.input);
            var vca = ac.createGain(); vca.gain.value = 0;
            lad.output.connect(vca); vca.connect(out);
            var held = 0;

            function setPitch(midi, t) {
                var f = A.hz(midi);
                var iv = [0, 7, 12, -12][st.interval];
                var tc = Math.max(.001, st.glide);
                o1.frequency.setTargetAtTime(f, t, tc);
                o2.frequency.setTargetAtTime(f * Math.pow(2, st.detune / 1200), t, tc);
                o3.frequency.setTargetAtTime(f * Math.pow(2, (iv * 100 - st.detune) / 1200), t, tc);
            }
            function apply() {
                lad.reso(st.reso);
                lad.cutoff(st.cutoff);
                try { mix.disconnect(); dr.disconnect(); } catch (e) {}
                dr = A.drive(ac, st.drive);
                mix.connect(dr); dr.connect(lad.input);
            }
            apply();

            return {
                set: function (k, v) {
                    st[k] = v;
                    if (k === 'drive') apply();
                    else { lad.reso(st.reso); lad.cutoff(st.cutoff); }
                },
                note: function (midi, on) {
                    var t = ac.currentTime;
                    if (on) {
                        held++;
                        setPitch(midi, t);
                        vca.gain.cancelScheduledValues(t);
                        vca.gain.setValueAtTime(vca.gain.value, t);
                        vca.gain.linearRampToValueAtTime(.55, t + .01);
                        var top = clamp(st.cutoff + st.env, 60, 17000);
                        [lad.input.frequency, lad.output.frequency].forEach(function (p) {
                            p.cancelScheduledValues(t);
                            p.setValueAtTime(top, t);
                            p.setTargetAtTime(st.cutoff, t + .01, st.decay * .5);
                        });
                    } else {
                        held = Math.max(0, held - 1);
                        if (!held) vca.gain.setTargetAtTime(0, t, Math.max(.02, st.decay * .35));
                    }
                },
                dispose: function () {
                    [o1, o2, o3].forEach(function (o) { try { o.stop(); } catch (e) {} });
                    try { vca.disconnect(); } catch (e) {}
                }
            };
        }
    });

    /* --------------------------------------------------------------- Mischief
       Acid line, drill drums and a Lorenz attractor pushing both. MADNESS is
       the knob the whole thing is built around, so it is the one that does
       the most here too. */
    D.register({
        id: 'mischief',
        title: 'Mischief',
        kind: 'instrument',
        canvas: true,
        canvasLabel: 'The Lorenz attractor driving the patch, drawn as it runs.',
        blurb: 'A mono acid line that mutates bar to bar, drill drums with ratchets, and a Lorenz ' +
               'attractor wired into both. MADNESS pushes everything further.',
        unlike: [
            'The RACK: six slots, ten effects each, in any order.',
            'The patch bay — eight cables from the modulators to twenty inputs.',
            'An audio input, so you can put other sounds through the whole thing.'
        ],
        controls: [
            { id: 'tempo', type: 'range', label: 'Tempo', min: 90, max: 185, step: 1, def: 165, unit: ' bpm' },
            { id: 'madness', type: 'range', label: 'MADNESS', min: 0, max: 1, step: .01, def: .4,
              fmt: function (v) { return Math.round(v * 100); }, unit: '%' },
            { id: 'drill', type: 'range', label: 'DRILL', min: 0, max: 1, step: .01, def: .35,
              fmt: function (v) { return Math.round(v * 100); }, unit: '%' },
            { id: 'cutoff', type: 'range', label: 'Cutoff', min: 150, max: 7000, step: 20, def: 900, unit: ' Hz' },
            { id: 'reso', type: 'range', label: 'Resonance', min: 1, max: 20, step: .1, def: 11 },
            { id: 'mutate', type: 'switch', label: 'Mutate', def: true }
        ],
        build: function (ac, out) {
            var st = { tempo: 165, madness: .4, drill: .35, cutoff: 900, reso: 11, mutate: true };
            var v = monoVoice(ac, out);
            v.osc.type = 'sawtooth';
            var drums = ac.createGain(); drums.gain.value = .9; drums.connect(out);
            var noiseBuf = A.noiseBuffer(ac, 2);
            var line = [], step = 0, bar = 0, timer = 0, playing = false;
            // Lorenz, which is the plugin's own modulator.
            var lx = .1, ly = 0, lz = 0, trail = [];

            function newLine() {
                var scale = [0, 3, 5, 7, 10, 12, 15];
                line = [];
                for (var i = 0; i < 16; i++) {
                    line.push({
                        note: 36 + scale[Math.floor(Math.random() * scale.length)] - (Math.random() < .3 ? 12 : 0),
                        gate: Math.random() < .78,
                        acc: Math.random() < .3,
                        slide: Math.random() < .22
                    });
                }
            }
            newLine();

            function hit(kind, t, gain) {
                var g = ac.createGain();
                g.gain.setValueAtTime(0, t);
                g.connect(drums);
                if (kind === 'k') {
                    var o = ac.createOscillator();
                    o.frequency.setValueAtTime(180, t);
                    o.frequency.exponentialRampToValueAtTime(42, t + .11);
                    g.gain.linearRampToValueAtTime(gain, t + .004);
                    g.gain.exponentialRampToValueAtTime(.0001, t + .34);
                    o.connect(g); o.start(t); o.stop(t + .36);
                } else {
                    var n = ac.createBufferSource(); n.buffer = noiseBuf;
                    var f = ac.createBiquadFilter();
                    f.type = kind === 's' ? 'bandpass' : 'highpass';
                    f.frequency.value = kind === 's' ? 1700 : 7200;
                    f.Q.value = kind === 's' ? 1.1 : .7;
                    var dur = kind === 's' ? .17 : .045;
                    g.gain.linearRampToValueAtTime(gain, t + .003);
                    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
                    n.connect(f); f.connect(g); n.start(t); n.stop(t + dur + .02);
                }
            }

            function tick() {
                if (!playing) return;
                var spb = 60 / st.tempo / 4;
                var t = ac.currentTime;
                var s = line[step % 16];

                // Lorenz forward, and its x drives the filter.
                for (var k = 0; k < 6; k++) {
                    var dx = 10 * (ly - lx), dy = lx * (28 - lz) - ly, dz = lx * ly - (8 / 3) * lz;
                    lx += dx * .006; ly += dy * .006; lz += dz * .006;
                }
                trail.push([lx, lz]);
                if (trail.length > 420) trail.shift();
                var chaos = clamp((lx + 20) / 40, 0, 1);

                if (s.gate) {
                    var f = A.hz(s.note);
                    if (s.slide) v.osc.frequency.setTargetAtTime(f, t, .05);
                    else v.osc.frequency.setValueAtTime(f, t);
                    var peak = s.acc ? .95 : .6;
                    v.vca.gain.cancelScheduledValues(t);
                    v.vca.gain.setValueAtTime(v.vca.gain.value, t);
                    v.vca.gain.linearRampToValueAtTime(peak, t + .005);
                    v.vca.gain.setTargetAtTime(0, t + .005, spb * .7);
                    var top = clamp(st.cutoff + 2600 * (s.acc ? 1.6 : 1) + chaos * st.madness * 5200, 80, 16000);
                    [v.lad.input.frequency, v.lad.output.frequency].forEach(function (p) {
                        p.cancelScheduledValues(t);
                        p.setValueAtTime(top, t);
                        p.setTargetAtTime(st.cutoff, t + .006, spb * .5);
                    });
                }

                // Drums: a straight break, with DRILL adding ratchets.
                if (step % 4 === 0) hit('k', t, .9);
                if (step % 8 === 4) hit('s', t, .7);
                if (step % 2 === 0) hit('h', t, .22);
                var rat = Math.random() < st.drill * .5;
                if (rat) {
                    var n = 2 + Math.floor(Math.random() * 3);
                    for (var r = 0; r < n; r++) hit(Math.random() < .5 ? 's' : 'h', t + r * spb / n, .4);
                }
                if (Math.random() < st.madness * .08) hit('k', t + spb * .5, .6);

                step++;
                if (step % 16 === 0) {
                    bar++;
                    if (st.mutate && Math.random() < .3 + st.madness * .5) newLine();
                }
                timer = setTimeout(tick, spb * 1000);
            }

            v.lad.reso(11);
            v.lad.cutoff(900);

            return {
                set: function (k, val) {
                    st[k] = val;
                    v.lad.reso(st.reso);
                    v.lad.cutoff(st.cutoff);
                },
                start: function () { if (!playing) { playing = true; step = 0; newLine(); tick(); } },
                stop: function () {
                    playing = false; clearTimeout(timer);
                    v.vca.gain.setTargetAtTime(0, ac.currentTime, .05);
                },
                draw: function (g, w, h) {
                    g.fillStyle = '#07050f'; g.fillRect(0, 0, w, h);
                    if (trail.length < 2) return;
                    g.strokeStyle = 'rgba(138,224,75,.75)';
                    g.lineWidth = 1.4;
                    g.beginPath();
                    for (var i = 0; i < trail.length; i++) {
                        var x = w / 2 + trail[i][0] * (w / 60);
                        var y = h - (trail[i][1] / 50) * h * .92;
                        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
                    }
                    g.stroke();
                    var last = trail[trail.length - 1];
                    g.fillStyle = '#d44fb0';
                    g.beginPath();
                    g.arc(w / 2 + last[0] * (w / 60), h - (last[1] / 50) * h * .92, 4, 0, 6.3);
                    g.fill();
                },
                dispose: function () { clearTimeout(timer); v.stopAll(); try { v.vca.disconnect(); drums.disconnect(); } catch (e) {} }
            };
        }
    });
})();

/* ===========================================================================
   The last five: a drum machine, a graintable, a sample tuner, a modular and
   a thing that makes no sound at all.
   =========================================================================== */
(function () {
    'use strict';
    var A = window.lucidDemoAudio, D = window.lucidDemos;
    if (!A || !D) return;
    var clamp = A.clamp;

    /* Bjorklund: the algorithm the whole plugin is named after. Spread k hits
       as evenly as possible across n steps. */
    function euclid(k, n) {
        k = clamp(k, 0, n);
        var out = [], bucket = 0;
        for (var i = 0; i < n; i++) {
            bucket += k;
            if (bucket >= n) { bucket -= n; out.push(1); } else out.push(0);
        }
        return out;
    }

    /* ------------------------------------------------------------ Euclid Rings */
    D.register({
        id: 'euclidrings',
        title: 'Euclid Rings',
        kind: 'instrument',
        canvas: true,
        canvasLabel: 'Eight rings, one per track, with the hits marked and the playhead turning.',
        blurb: 'Eight Euclidean rings, each spreading its hits as evenly as the maths allows, each with ' +
               'its own drum voice. Change the hits and the length and watch the pattern redistribute.',
        unlike: [
            'MIDI out — every track sends notes as well as playing its own voice.',
            'Per-track rotation, swing and probability.',
            'Eight voices with full synthesis parameters, not the four this demo mixes down to.'
        ],
        controls: [
            { id: 'tempo', type: 'range', label: 'Tempo', min: 70, max: 180, step: 1, def: 118, unit: ' bpm' },
            { id: 'kick', type: 'range', label: 'Kick hits', min: 0, max: 16, step: 1, def: 4 },
            { id: 'snare', type: 'range', label: 'Snare hits', min: 0, max: 16, step: 1, def: 2 },
            { id: 'hat', type: 'range', label: 'Hat hits', min: 0, max: 16, step: 1, def: 11 },
            { id: 'tone', type: 'range', label: 'Tone hits', min: 0, max: 16, step: 1, def: 5 },
            { id: 'len', type: 'range', label: 'Steps', min: 4, max: 16, step: 1, def: 16 }
        ],
        build: function (ac, out) {
            var st = { tempo: 118, kick: 4, snare: 2, hat: 11, tone: 5, len: 16 };
            var bus = ac.createGain(); bus.gain.value = .8; bus.connect(out);
            var nb = A.noiseBuffer(ac, 2);
            var rings = {}, step = 0, timer = 0, playing = false;

            function rebuild() {
                ['kick', 'snare', 'hat', 'tone'].forEach(function (k) {
                    rings[k] = euclid(Math.min(st[k], st.len), st.len);
                });
            }
            rebuild();

            function voice(kind, t) {
                var g = ac.createGain();
                g.gain.setValueAtTime(0, t);
                g.connect(bus);
                if (kind === 'kick') {
                    var o = ac.createOscillator();
                    o.frequency.setValueAtTime(165, t);
                    o.frequency.exponentialRampToValueAtTime(46, t + .1);
                    g.gain.linearRampToValueAtTime(.9, t + .004);
                    g.gain.exponentialRampToValueAtTime(.0001, t + .36);
                    o.connect(g); o.start(t); o.stop(t + .38);
                } else if (kind === 'tone') {
                    var o2 = ac.createOscillator();
                    o2.type = 'triangle';
                    // A4 = 432, like everything else here.
                    o2.frequency.setValueAtTime(A.hz(60), t);
                    g.gain.linearRampToValueAtTime(.4, t + .005);
                    g.gain.exponentialRampToValueAtTime(.0001, t + .5);
                    o2.connect(g); o2.start(t); o2.stop(t + .52);
                } else {
                    var n = ac.createBufferSource(); n.buffer = nb;
                    var f = ac.createBiquadFilter();
                    f.type = kind === 'snare' ? 'bandpass' : 'highpass';
                    f.frequency.value = kind === 'snare' ? 1800 : 7600;
                    var dur = kind === 'snare' ? .18 : .04;
                    g.gain.linearRampToValueAtTime(kind === 'snare' ? .6 : .22, t + .003);
                    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
                    n.connect(f); f.connect(g); n.start(t); n.stop(t + dur + .02);
                }
            }

            function tick() {
                if (!playing) return;
                var spb = 60 / st.tempo / 4;
                var t = ac.currentTime;
                ['kick', 'snare', 'hat', 'tone'].forEach(function (k) {
                    if (rings[k][step % st.len]) voice(k, t);
                });
                step = (step + 1) % st.len;
                timer = setTimeout(tick, spb * 1000);
            }

            return {
                set: function (k, v) { st[k] = v; rebuild(); if (step >= st.len) step = 0; },
                start: function () { if (!playing) { playing = true; step = 0; tick(); } },
                stop: function () { playing = false; clearTimeout(timer); },
                draw: function (g, w, h) {
                    g.fillStyle = '#07050f'; g.fillRect(0, 0, w, h);
                    var keys = ['kick', 'snare', 'hat', 'tone'];
                    var cols = ['#d44fb0', '#8ae04b', '#6fe3e8', '#ffd27a'];
                    var cx = w / 2, cy = h / 2;
                    var rMax = Math.min(w, h) * .44;
                    keys.forEach(function (k, ki) {
                        var r = rMax * (1 - ki * .19);
                        g.strokeStyle = 'rgba(155,123,255,.18)';
                        g.lineWidth = 1;
                        g.beginPath(); g.arc(cx, cy, r, 0, 6.2832); g.stroke();
                        for (var i = 0; i < st.len; i++) {
                            if (!rings[k][i]) continue;
                            var a = (i / st.len) * 6.2832 - Math.PI / 2;
                            var lit = playing && ((step - 1 + st.len) % st.len) === i;
                            g.fillStyle = lit ? '#fff' : cols[ki];
                            g.beginPath();
                            g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, lit ? 7 : 4.5, 0, 6.2832);
                            g.fill();
                        }
                    });
                    if (playing) {
                        var pa = (((step - 1 + st.len) % st.len) / st.len) * 6.2832 - Math.PI / 2;
                        g.strokeStyle = 'rgba(255,255,255,.5)';
                        g.beginPath(); g.moveTo(cx, cy);
                        g.lineTo(cx + Math.cos(pa) * rMax, cy + Math.sin(pa) * rMax); g.stroke();
                    }
                },
                dispose: function () { clearTimeout(timer); try { bus.disconnect(); } catch (e) {} }
            };
        }
    });

    /* ------------------------------------------------------------- Grainstorm
       A graintable is a table of single-cycle frames; you scan through it and
       the formants move independently of the pitch. Four generated tables
       here against the real one's sixteen. */
    D.register({
        id: 'grainstorm',
        title: 'Grainstorm',
        kind: 'instrument',
        keys: true,
        baseNote: 48,
        transport: false,
        canvas: true,
        canvasLabel: 'The graintable, with the frame currently being played marked.',
        blurb: 'Each note plays short grains out of a table of single-cycle frames. Scan through the ' +
               'table with INDEX; move the formants with SHIFT without touching the pitch.',
        unlike: [
            'Sixteen graintables; this generates four.',
            'Two oscillators, a filter and a modulation section per voice.',
            'The standalone application, and preset storage.'
        ],
        controls: [
            { id: 'table', type: 'select', label: 'Table', options: ['Glass', 'Reed', 'Vowel', 'Metal'], def: 0 },
            { id: 'index', type: 'range', label: 'Index', min: 0, max: 1, step: .005, def: .3,
              fmt: function (v) { return Math.round(v * 100); }, unit: '%' },
            { id: 'motion', type: 'range', label: 'Motion', min: 0, max: 1, step: .01, def: .2,
              fmt: function (v) { return Math.round(v * 100); }, unit: '%' },
            { id: 'shift', type: 'range', label: 'Formant', min: -12, max: 12, step: .5, def: 0, unit: ' st' },
            { id: 'decay', type: 'range', label: 'Decay', min: .1, max: 3, step: .05, def: 1.1, unit: ' s' }
        ],
        build: function (ac, out) {
            var st = { table: 0, index: .3, motion: .2, shift: 0, decay: 1.1 };
            var FRAMES = 32, N = 2048;
            var tables = [];

            /* Every frame is one cycle, built from a harmonic series whose
               shape walks across the table. No sampled audio, which is what
               the real one says about its own tables too. */
            function makeTable(kind) {
                var frames = [];
                for (var f = 0; f < FRAMES; f++) {
                    var u = f / (FRAMES - 1);
                    var real = new Float32Array(40), imag = new Float32Array(40);
                    for (var h = 1; h < 40; h++) {
                        var a = 0;
                        if (kind === 0) a = Math.exp(-h * (0.5 - u * 0.42)) * (h % 2 ? 1 : 0.35);
                        else if (kind === 1) a = (1 / h) * (1 + Math.sin(h * (0.6 + u * 3))) * 0.5;
                        else if (kind === 2) {
                            // Two moving formants: the vowel sweep.
                            var f1 = 4 + u * 7, f2 = 14 + u * 16;
                            a = Math.exp(-Math.pow(h - f1, 2) / 7) + 0.6 * Math.exp(-Math.pow(h - f2, 2) / 16);
                        } else a = (h % 3 === 0 ? 1 : 0.2) * Math.exp(-h * 0.1) * (1 + u * Math.sin(h));
                        real[h] = a * Math.cos(h * u * 3.1);
                        imag[h] = a * Math.sin(h * u * 3.1);
                    }
                    frames.push(ac.createPeriodicWave(real, imag, { disableNormalization: false }));
                }
                return frames;
            }
            for (var i = 0; i < 4; i++) tables.push(makeTable(i));

            var voices = {};
            var pos = 0, lfoPhase = 0;

            function current() {
                var p = clamp(st.index + Math.sin(lfoPhase) * st.motion * .5, 0, .999);
                pos = p;
                return Math.floor(p * (FRAMES - 1));
            }

            var raf = setInterval(function () {
                lfoPhase += .08;
                var fr = current();
                Object.keys(voices).forEach(function (m) {
                    var v = voices[m];
                    try { v.osc.setPeriodicWave(tables[st.table][fr]); } catch (e) {}
                });
            }, 45);

            return {
                set: function (k, v) { st[k] = v; },
                note: function (midi, on) {
                    var t = ac.currentTime;
                    if (on) {
                        if (voices[midi]) return;
                        var osc = ac.createOscillator();
                        osc.setPeriodicWave(tables[st.table][current()]);
                        // The formant shift: a second filter tracks the note
                        // up or down without the oscillator moving with it.
                        var fm = ac.createBiquadFilter();
                        fm.type = 'bandpass';
                        fm.Q.value = .9;
                        fm.frequency.value = clamp(A.hz(midi + 24) * Math.pow(2, st.shift / 12), 80, 12000);
                        var g = ac.createGain();
                        g.gain.setValueAtTime(0, t);
                        g.gain.linearRampToValueAtTime(.3, t + .012);
                        osc.frequency.value = A.hz(midi);
                        osc.connect(fm); fm.connect(g); g.connect(out);
                        osc.start(t);
                        voices[midi] = { osc: osc, g: g, fm: fm };
                    } else {
                        var v = voices[midi];
                        if (!v) return;
                        v.g.gain.cancelScheduledValues(t);
                        v.g.gain.setValueAtTime(v.g.gain.value, t);
                        v.g.gain.setTargetAtTime(0, t, st.decay * .3);
                        var dead = v;
                        setTimeout(function () {
                            try { dead.osc.stop(); dead.osc.disconnect(); dead.g.disconnect(); } catch (e) {}
                        }, st.decay * 1400);
                        delete voices[midi];
                    }
                },
                draw: function (g, w, h) {
                    g.fillStyle = '#07050f'; g.fillRect(0, 0, w, h);
                    var fr = Math.floor(pos * (FRAMES - 1));
                    for (var f = 0; f < FRAMES; f++) {
                        var x = (f / FRAMES) * w;
                        var on = f === fr;
                        g.fillStyle = on ? '#8ae04b' : 'rgba(155,123,255,' + (0.14 + (f % 4 === 0 ? .14 : 0)) + ')';
                        var hh = h * (.2 + .6 * Math.abs(Math.sin(f * (st.table + 1) * .7)));
                        g.fillRect(x + 1, (h - hh) / 2, Math.max(2, w / FRAMES - 2), hh);
                    }
                    g.fillStyle = 'rgba(180,156,255,.8)';
                    g.font = '11px ui-monospace, monospace';
                    g.fillText('frame ' + (fr + 1) + ' / ' + FRAMES, 10, 18);
                },
                dispose: function () {
                    clearInterval(raf);
                    Object.keys(voices).forEach(function (m) {
                        try { voices[m].osc.stop(); voices[m].g.disconnect(); } catch (e) {}
                    });
                }
            };
        }
    });
})();

/* ===========================================================================
   Snap to C, Kelp, OSC Link.
   =========================================================================== */
(function () {
    'use strict';
    var A = window.lucidDemoAudio, D = window.lucidDemos;
    if (!A || !D) return;
    var clamp = A.clamp;

    /* ------------------------------------------------------------- Snap to C
       The one demo that does the plugin's actual job on your actual file.
       YIN is small enough to write out, and the tape shift is a resample,
       which is exactly what the real one's tape mode is. */
    function yin(buf, sr) {
        var W = 1024, half = W / 2;
        if (buf.length < W * 2) return 0;
        var best = 0, bestVotes = 0, votes = {};
        var hop = Math.max(W, Math.floor(buf.length / 60));
        for (var start = 0; start + W * 2 < buf.length; start += hop) {
            // Skip quiet frames: silence votes for nothing.
            var e = 0;
            for (var q = 0; q < W; q++) e += buf[start + q] * buf[start + q];
            if (Math.sqrt(e / W) < 0.015) continue;

            var d = new Float32Array(half);
            for (var tau = 1; tau < half; tau++) {
                var s = 0;
                for (var j = 0; j < half; j++) {
                    var diff = buf[start + j] - buf[start + j + tau];
                    s += diff * diff;
                }
                d[tau] = s;
            }
            // Cumulative mean normalised difference — the step that makes YIN
            // pick the period rather than a multiple of it.
            var cum = new Float32Array(half);
            cum[0] = 1;
            var run = 0;
            for (var t2 = 1; t2 < half; t2++) {
                run += d[t2];
                cum[t2] = d[t2] * t2 / (run || 1);
            }
            var pick = -1;
            for (var t3 = 2; t3 < half - 1; t3++) {
                if (cum[t3] < 0.16 && cum[t3] <= cum[t3 + 1]) { pick = t3; break; }
            }
            if (pick < 0) continue;
            // Parabolic refinement on the dip.
            var a = cum[pick - 1], b = cum[pick], c = cum[pick + 1];
            var adj = (a - c) / (2 * (a - 2 * b + c) || 1);
            var f = sr / (pick + adj);
            if (f < 40 || f > 1600) continue;
            // Vote by pitch class: an octave error cannot change the distance
            // to C, which is the whole reason the real one votes this way.
            var pc = Math.round(12 * Math.log2(f / 432) + 69) % 12;
            pc = ((pc % 12) + 12) % 12;
            votes[pc] = (votes[pc] || 0) + 1;
            if (votes[pc] > bestVotes) { bestVotes = votes[pc]; best = f; }
        }
        return bestVotes >= 2 ? best : 0;
    }

    D.register({
        id: 'snaptoc',
        title: 'Snap to C',
        kind: 'utility',
        transport: false,
        extraFirst: true,
        blurb: 'Drop a sample in. It finds the pitch with YIN, works out the shift to the nearest C, ' +
               'resamples it there and gives you the WAV back — which is what the plugin’s tape mode does.',
        unlike: [
            'Keep-length mode: a spectral shift that holds the duration. This demo only has tape, which changes the length.',
            'Formant preservation, batch processing, and drag-out straight into a DAW track.',
            'Export rate and bit depth options — this hands back 16-bit at the file’s own rate.'
        ],
        controls: [
            { id: 'target', type: 'select', label: 'Snap to',
              options: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], def: 0 },
            { id: 'dir', type: 'select', label: 'Direction', options: ['Nearest', 'Always up', 'Always down'], def: 0 },
            { id: 'trans', type: 'range', label: 'Transpose', min: -12, max: 12, step: 1, def: 0, unit: ' st' }
        ],
        build: function (ac, out) {
            var st = { target: 0, dir: 0, trans: 0 };
            var src = null, shifted = null, playing = null;
            var ui = null;

            function analyse(buffer) {
                var mono = buffer.getChannelData(0);
                var f = yin(mono, buffer.sampleRate);
                if (!f) return { f: 0 };
                var midi = 12 * Math.log2(f / 432) + 69;
                var pc = ((Math.round(midi) % 12) + 12) % 12;
                var want = st.target;
                var delta = want - pc;
                while (delta > 6) delta -= 12;
                while (delta < -6) delta += 12;
                if (st.dir === 1 && delta < 0) delta += 12;
                if (st.dir === 2 && delta > 0) delta -= 12;
                // The cents the note is off by, which the shift has to take out too.
                var cents = (midi - Math.round(midi)) * 100;
                var shift = delta - cents / 100 + st.trans;
                return { f: f, midi: midi, pc: pc, shift: shift };
            }

            function render(buffer, shift) {
                var rate = Math.pow(2, shift / 12);
                var n = Math.floor(buffer.length / rate);
                var ob = ac.createBuffer(buffer.numberOfChannels, n, buffer.sampleRate);
                for (var c = 0; c < buffer.numberOfChannels; c++) {
                    var inp = buffer.getChannelData(c), o = ob.getChannelData(c);
                    for (var i = 0; i < n; i++) {
                        var p = i * rate, i0 = Math.floor(p), fr = p - i0;
                        var a = inp[i0] || 0, b = inp[i0 + 1] || 0;
                        o[i] = a + (b - a) * fr;          // linear, like a tape head
                    }
                }
                return ob;
            }

            function wav(buffer) {
                var ch = buffer.numberOfChannels, n = buffer.length, sr = buffer.sampleRate;
                var bytes = 44 + n * ch * 2;
                var v = new DataView(new ArrayBuffer(bytes));
                function str(off, s) { for (var i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); }
                str(0, 'RIFF'); v.setUint32(4, bytes - 8, true); str(8, 'WAVE');
                str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
                v.setUint16(22, ch, true); v.setUint32(24, sr, true);
                v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
                str(36, 'data'); v.setUint32(40, n * ch * 2, true);
                var off = 44;
                for (var i = 0; i < n; i++) {
                    for (var c = 0; c < ch; c++) {
                        var s = clamp(buffer.getChannelData(c)[i], -1, 1);
                        v.setInt16(off, s * 32767, true);
                        off += 2;
                    }
                }
                return new Blob([v.buffer], { type: 'audio/wav' });
            }

            var NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            function recompute() {
                if (!src || !ui) return;
                var r = analyse(src);
                if (!r.f) {
                    ui.read.textContent = 'No pitch found — unpitched material passes through unchanged, ' +
                        'which is what the plugin does too.';
                    shifted = src;
                    return;
                }
                shifted = render(src, r.shift);
                var resPc = ((Math.round(r.midi + r.shift) % 12) + 12) % 12;
                ui.read.textContent =
                    'Detected ' + NAMES[r.pc] + ' (' + r.f.toFixed(1) + ' Hz) → shift ' +
                    (r.shift >= 0 ? '+' : '') + r.shift.toFixed(2) + ' st → ' + NAMES[resPc];
            }

            return {
                // Its own file input: this demo is about your sample, not a loop.
                mountExtra: function (host) {
                    var wrap = document.createElement('div');
                    wrap.className = 'demo-source';
                    wrap.innerHTML =
                        '<h4>Your sample</h4>' +
                        '<div class="demo-row">' +
                        '<label class="demo-filelab" for="snapfile">Choose a sample</label>' +
                        '<input id="snapfile" class="demo-file" type="file" accept="audio/*" hidden>' +
                        '<button class="demo-act" type="button" data-act="play" disabled>Play snapped</button>' +
                        '<button class="demo-act" type="button" data-act="orig" disabled>Hear original</button>' +
                        '<a class="demo-filelab" data-act="save" hidden download="snapped.wav">Save WAV</a>' +
                        '</div><p class="demo-note" data-read></p>';
                    host.appendChild(wrap);
                    ui = {
                        file: wrap.querySelector('#snapfile'),
                        play: wrap.querySelector('[data-act="play"]'),
                        orig: wrap.querySelector('[data-act="orig"]'),
                        save: wrap.querySelector('[data-act="save"]'),
                        read: wrap.querySelector('[data-read]')
                    };
                    ui.read.textContent = 'Nothing loaded yet.';
                    ui.file.addEventListener('change', function () {
                        var f = ui.file.files && ui.file.files[0];
                        if (!f) return;
                        ui.read.textContent = 'Reading ' + f.name + '…';
                        f.arrayBuffer().then(function (b) { return ac.decodeAudioData(b); })
                            .then(function (b) {
                                src = b;
                                ui.play.disabled = false;
                                ui.orig.disabled = false;
                                recompute();
                                if (shifted) {
                                    ui.save.href = URL.createObjectURL(wav(shifted));
                                    ui.save.hidden = false;
                                }
                            })
                            .catch(function () { ui.read.textContent = 'That file could not be decoded.'; });
                    });
                    function playBuf(b) {
                        if (!b) return;
                        if (playing) { try { playing.stop(); } catch (e) {} }
                        var s = ac.createBufferSource();
                        s.buffer = b; s.connect(out); s.start();
                        playing = s;
                    }
                    ui.play.addEventListener('click', function () { playBuf(shifted); });
                    ui.orig.addEventListener('click', function () { playBuf(src); });
                },
                set: function (k, v) {
                    st[k] = v;
                    recompute();
                    if (ui && shifted) {
                        ui.save.href = URL.createObjectURL(wav(shifted));
                        ui.save.hidden = false;
                    }
                },
                dispose: function () { if (playing) { try { playing.stop(); } catch (e) {} } }
            };
        }
    });

    /* ------------------------------------------------------------------ Kelp
       The real one is a patchable modular with a tracker driving it. A page
       cannot be that in a drawer, so this is the tracker and one fixed
       three-module patch, which is enough to show what the pairing is for. */
    D.register({
        id: 'kelp',
        title: 'Kelp',
        kind: 'instrument',
        canvas: true,
        canvasLabel: 'The tracker, with the playing row lit.',
        blurb: 'A tracker driving a patch. This one is fixed — oscillator into filter into output — and ' +
               'the pattern is the part you can change. The real thing lets you build the patch too.',
        unlike: [
            'The modular canvas: any number of modules, cables you draw, and an inspector per module.',
            'Effects modules, and anything beyond the one oscillator this patch has.',
            'Saving patches and patterns, and running as a standalone application.'
        ],
        controls: [
            { id: 'tempo', type: 'range', label: 'Tempo', min: 60, max: 180, step: 1, def: 112, unit: ' bpm' },
            { id: 'wave', type: 'select', label: 'Oscillator', options: ['Saw', 'Square', 'Triangle'], def: 0 },
            { id: 'cutoff', type: 'range', label: 'Cutoff', min: 150, max: 9000, step: 20, def: 2200, unit: ' Hz' },
            { id: 'reso', type: 'range', label: 'Resonance', min: .5, max: 16, step: .1, def: 3 },
            { id: 'decay', type: 'range', label: 'Decay', min: .05, max: 1.4, step: .01, def: .32, unit: ' s' },
            { id: 'scatter', type: 'switch', label: 'New pattern', def: false }
        ],
        build: function (ac, out) {
            var st = { tempo: 112, wave: 0, cutoff: 2200, reso: 3, decay: .32, scatter: false };
            var rows = [], row = 0, timer = 0, playing = false;
            var lad = A.ladder(ac);
            var vca = ac.createGain(); vca.gain.value = 0;
            var osc = ac.createOscillator(); osc.type = 'sawtooth'; osc.start();
            osc.connect(lad.input); lad.output.connect(vca); vca.connect(out);

            function scatter() {
                var scale = [0, 2, 3, 5, 7, 8, 10];
                rows = [];
                for (var i = 0; i < 16; i++) {
                    rows.push(Math.random() < .62
                        ? 48 + scale[Math.floor(Math.random() * scale.length)] + (Math.random() < .25 ? 12 : 0)
                        : null);
                }
            }
            scatter();

            function tick() {
                if (!playing) return;
                var spb = 60 / st.tempo / 4;
                var t = ac.currentTime;
                var n = rows[row];
                if (n != null) {
                    osc.frequency.setValueAtTime(A.hz(n), t);
                    vca.gain.cancelScheduledValues(t);
                    vca.gain.setValueAtTime(vca.gain.value, t);
                    vca.gain.linearRampToValueAtTime(.5, t + .006);
                    vca.gain.setTargetAtTime(0, t + .006, st.decay * .4);
                }
                row = (row + 1) % 16;
                timer = setTimeout(tick, spb * 1000);
            }

            return {
                set: function (k, v) {
                    st[k] = v;
                    osc.type = ['sawtooth', 'square', 'triangle'][st.wave];
                    lad.cutoff(st.cutoff); lad.reso(st.reso);
                    if (k === 'scatter' && v) scatter();
                },
                start: function () { if (!playing) { playing = true; row = 0; tick(); } },
                stop: function () { playing = false; clearTimeout(timer); vca.gain.setTargetAtTime(0, ac.currentTime, .05); },
                draw: function (g, w, h) {
                    g.fillStyle = '#07050f'; g.fillRect(0, 0, w, h);
                    var NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                    var rh = h / 16;
                    g.font = Math.min(14, rh * .8) + 'px ui-monospace, monospace';
                    for (var i = 0; i < 16; i++) {
                        var lit = playing && ((row - 1 + 16) % 16) === i;
                        g.fillStyle = lit ? 'rgba(138,224,75,.22)' : (i % 4 === 0 ? 'rgba(155,123,255,.09)' : 'transparent');
                        g.fillRect(0, i * rh, w, rh);
                        g.fillStyle = lit ? '#d9ffb8' : 'rgba(180,156,255,.75)';
                        var n = rows[i];
                        var txt = (i < 10 ? '0' : '') + i + '   ' +
                            (n == null ? '---' : NAMES[n % 12] + (Math.floor(n / 12) - 1));
                        g.fillText(txt, 10, i * rh + rh * .75);
                    }
                },
                dispose: function () {
                    clearTimeout(timer);
                    try { osc.stop(); vca.disconnect(); } catch (e) {}
                }
            };
        }
    });

    /* --------------------------------------------------------------- OSC Link
       Makes no sound and never did. What it does is emit messages, so the
       simulation shows the messages: a performance going past, as OSC. */
    D.register({
        id: 'osclink',
        title: 'OSC Link',
        kind: 'utility',
        transport: true,
        blurb: 'This one is a bridge, not an instrument — it has no sound to simulate. What it has is a ' +
               'stream of OSC, so here is the stream: a performance going past, addressed as the real one addresses it.',
        unlike: [
            'Actually sending UDP. A browser cannot open a UDP socket at all, so nothing here leaves the page.',
            'Receiving OSC back from TouchOSC or TouchDesigner to set the eight macros.',
            'The FX build, which sends levels, bands and onsets from audio rather than notes.'
        ],
        controls: [
            { id: 'addr', type: 'range', label: 'Address ID', min: 1, max: 8, step: 1, def: 1 },
            { id: 'tempo', type: 'range', label: 'Tempo', min: 60, max: 180, step: 1, def: 120, unit: ' bpm' },
            { id: 'density', type: 'range', label: 'Density', min: 0, max: 1, step: .01, def: .5,
              fmt: function (v) { return Math.round(v * 100); }, unit: '%' }
        ],
        build: function (ac, out, api) {
            var st = { addr: 1, tempo: 120, density: .5 };
            var log = null, timer = 0, beat = 0, playing = false;

            function line(addr, args) {
                if (!log) return;
                var row = document.createElement('div');
                row.className = 'osc-line';
                row.textContent = addr + '   ' + args.join('  ');
                log.insertBefore(row, log.firstChild);
                while (log.children.length > 40) log.removeChild(log.lastChild);
            }

            function tick() {
                if (!playing) return;
                var p = '/mpc/' + st.addr;
                line(p + '/beat', [String(beat % 4 + 1), '/4']);
                if (beat % 4 === 0) line(p + '/tempo', [st.tempo.toFixed(1)]);
                if (Math.random() < st.density) {
                    var n = 36 + Math.floor(Math.random() * 25);
                    var v = 40 + Math.floor(Math.random() * 87);
                    line(p + '/note', [String(n), String(v)]);
                }
                if (Math.random() < st.density * .4) {
                    line(p + '/cc', [String(1 + Math.floor(Math.random() * 8)),
                                     (Math.random()).toFixed(3)]);
                }
                if (beat % 2 === 0) {
                    line(p + '/macro/' + (1 + beat % 8), [(Math.random()).toFixed(3)]);
                }
                beat++;
                timer = setTimeout(tick, 60 / st.tempo * 1000 / 2);
            }

            return {
                mountExtra: function (host) {
                    var w = document.createElement('div');
                    w.className = 'osc-log';
                    w.setAttribute('role', 'log');
                    w.setAttribute('aria-label', 'OSC messages, newest first');
                    host.appendChild(w);
                    log = w;
                    line('— press start —', []);
                },
                set: function (k, v) { st[k] = v; },
                start: function () { if (!playing) { playing = true; beat = 0; tick(); } },
                stop: function () { playing = false; clearTimeout(timer); },
                dispose: function () { clearTimeout(timer); }
            };
        }
    });
})();
