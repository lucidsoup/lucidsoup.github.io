        (function shaderLibrary(){
            const grid = document.getElementById('shader-lib-grid');
            const section = document.getElementById('shader-library');
            if (!grid || !section) return;

            // Every preview renders at this backing size and is stretched by CSS.
            // Keeping one fixed size means the shared drawing buffer is never
            // reallocated between cards.
            const PREVIEW_W = 480, PREVIEW_H = 360;
            const REDUCED = window.matchMedia
                && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

            const VERT = 'attribute vec2 aPos;' +
                'void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }';

            // Shadertoy compatibility shim. mainImage() writes to a local, which is
            // then copied to gl_FragColor — GLSL ES 1.0 will not take a built-in as
            // an out parameter.
            const PRELUDE = [
                '#ifdef GL_FRAGMENT_PRECISION_HIGH',
                'precision highp float;',
                '#else',
                'precision mediump float;',
                '#endif',
                'uniform vec3 iResolution;',
                'uniform float iTime;',
                'uniform vec4 iMouse;',
                ''
            ].join('\n');
            const EPILOGUE = '\nvoid main(){\n' +
                '    vec4 lucidOut = vec4(0.0, 0.0, 0.0, 1.0);\n' +
                '    mainImage(lucidOut, gl_FragCoord.xy);\n' +
                '    gl_FragColor = vec4(lucidOut.rgb, 1.0);\n}\n';

            function escapeHtml(str){
                return String(str == null ? '' : str).replace(/[&<>"']/g, c =>
                    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
            }

            // ---- exports for other hosts ----
            // Checked with glslangValidator as desktop GLSL 4.60 (TouchDesigner) and
            // 3.30 (Synesthesia) against all library shaders. A compile check for
            // the daily drop is parked on the shader-desktop-validation branch.
            function tdSource(name, glsl) {
              return '// ' + String(name || 'LucidSoup shader').replace(/[\r\n]+/g, ' ') +
                ' \u2014 TouchDesigner GLSL TOP version (lucidsoup.com)\n' +
                '//\n' +
                '// 1. Paste this into the GLSL TOP\'s pixel shader DAT.\n' +
                '// 2. On the GLSL TOP\'s Vectors page, add a uniform named  iTime\n' +
                '//    with the value  absTime.seconds  (otherwise the shader is frozen).\n' +
                '// Resolution follows the TOP\'s own size; there is nothing else to set.\n' +
                'uniform float iTime;\n' +
                '#define iResolution vec3(uTDOutputInfo.res.zw, 1.0)\n' +
                '#define iMouse vec4(0.0)\n' +
                'layout(location = 0) out vec4 lucidFragColor;\n\n' +
                glsl +
                '\n\nvoid main(){\n' +
                '    vec4 c = vec4(0.0, 0.0, 0.0, 1.0);\n' +
                '    mainImage(c, gl_FragCoord.xy);\n' +
                '    lucidFragColor = TDOutputSwizzle(vec4(c.rgb, 1.0));\n}\n';
            }

            function synMainGlsl(name, glsl) {
              return '// ' + String(name || 'LucidSoup shader').replace(/[\r\n]+/g, ' ') +
                ' \u2014 Synesthesia scene (lucidsoup.com)\n' +
                '#define iTime TIME\n' +
                '#define iResolution vec3(RENDERSIZE, 1.0)\n' +
                '#define iMouse _mouse\n\n' +
                glsl +
                '\n\nvec4 renderMain(){\n' +
                '    vec4 c = vec4(0.0, 0.0, 0.0, 1.0);\n' +
                '    mainImage(c, _xy);\n' +
                '    return vec4(c.rgb, 1.0);\n}\n';
            }

            function synSceneJson(entry) {
              return JSON.stringify({
                TITLE: String(entry.name || 'LucidSoup shader'),
                CREDIT: 'LucidSoup',
                DESCRIPTION: String(entry.description || ''),
                IMAGE_PATH: 'thumbnail.png',
                WIDTH: 1280,
                HEIGHT: 720
              }, null, 2) + '\n';
            }

            // Minimal zip writer (stored, no compression) for the Synesthesia scene folder.
            const CRC_TABLE = (function(){
                const t = new Uint32Array(256);
                for (let i = 0; i < 256; i++) {
                    let c = i;
                    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
                    t[i] = c >>> 0;
                }
                return t;
            })();
            function crc32(bytes){
                let c = 0xFFFFFFFF;
                for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
                return (c ^ 0xFFFFFFFF) >>> 0;
            }
            function makeZip(files){              // [{ name, data: Uint8Array }]
                const enc = new TextEncoder(), parts = [], central = [];
                let offset = 0;
                files.forEach(function(f){
                    const name = enc.encode(f.name), crc = crc32(f.data), n = f.data.length;
                    const h = new DataView(new ArrayBuffer(30));
                    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
                    h.setUint32(14, crc, true); h.setUint32(18, n, true); h.setUint32(22, n, true);
                    h.setUint16(26, name.length, true);
                    parts.push(h.buffer, name, f.data);
                    const c = new DataView(new ArrayBuffer(46));
                    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
                    c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, n, true);
                    c.setUint32(24, n, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
                    central.push(c.buffer, name);
                    offset += 30 + name.length + n;
                });
                const size = central.reduce(function(s, x){ return s + x.byteLength; }, 0);
                const e = new DataView(new ArrayBuffer(22));
                e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true);
                e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, offset, true);
                return new Blob(parts.concat(central, [e.buffer]), { type: 'application/zip' });
            }

            function copyText(btn, text, label){
                const done = function(ok){
                    btn.textContent = ok ? 'COPIED' : 'COPY FAILED';
                    setTimeout(function(){ btn.textContent = label; }, 1600);
                };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text)
                        .then(function(){ done(true); }, function(){ done(false); });
                } else {
                    // Older browsers and non-secure origins have no async clipboard.
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.setAttribute('readonly', '');
                    ta.style.cssText = 'position:absolute;left:-9999px;top:0;';
                    document.body.appendChild(ta);
                    ta.select();
                    let ok = false;
                    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
                    document.body.removeChild(ta);
                    done(ok);
                }
            }

            // ---- one shared GL context for the whole library ----
            const glCanvas = document.createElement('canvas');
            glCanvas.width = PREVIEW_W;
            glCanvas.height = PREVIEW_H;
            let gl = null, glFailed = false, vertShader = null;

            function getGL(){
                if (gl || glFailed) return gl;
                const opts = { alpha: false, antialias: false, depth: false, stencil: false,
                               preserveDrawingBuffer: true, powerPreference: 'low-power' };
                try {
                    gl = glCanvas.getContext('webgl', opts)
                      || glCanvas.getContext('experimental-webgl', opts);
                } catch (e) { gl = null; }
                if (!gl) { glFailed = true; return null; }

                vertShader = gl.createShader(gl.VERTEX_SHADER);
                gl.shaderSource(vertShader, VERT);
                gl.compileShader(vertShader);

                const buf = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, buf);
                gl.bufferData(gl.ARRAY_BUFFER,
                    new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
                return gl;
            }

            // A lost context invalidates every compiled program; drop them and let
            // the cards rebuild lazily once the context is restored.
            glCanvas.addEventListener('webglcontextlost', function(e){
                e.preventDefault();
                gl = null; vertShader = null;
                cards.forEach(c => { c.program = null; });
            }, false);
            glCanvas.addEventListener('webglcontextrestored', function(){
                getGL();
                if (!running) startLoop();
            }, false);

            function buildProgram(glsl){
                const g = getGL();
                if (!g) return { error: 'WebGL is not available in this browser.' };

                const frag = g.createShader(g.FRAGMENT_SHADER);
                g.shaderSource(frag, PRELUDE + glsl + EPILOGUE);
                g.compileShader(frag);
                if (!g.getShaderParameter(frag, g.COMPILE_STATUS)) {
                    const log = g.getShaderInfoLog(frag) || 'unknown compile error';
                    g.deleteShader(frag);
                    return { error: 'Shader failed to compile: ' + log.split('\n')[0] };
                }

                const prog = g.createProgram();
                g.attachShader(prog, vertShader);
                g.attachShader(prog, frag);
                g.bindAttribLocation(prog, 0, 'aPos');
                g.linkProgram(prog);
                g.deleteShader(frag);
                if (!g.getProgramParameter(prog, g.LINK_STATUS)) {
                    const log = g.getProgramInfoLog(prog) || 'unknown link error';
                    g.deleteProgram(prog);
                    return { error: 'Shader failed to link: ' + log.split('\n')[0] };
                }
                return {
                    program: prog,
                    uRes: g.getUniformLocation(prog, 'iResolution'),
                    uTime: g.getUniformLocation(prog, 'iTime'),
                    uMouse: g.getUniformLocation(prog, 'iMouse')
                };
            }

            function drawCard(card, t){
                const g = getGL();
                if (!g) return;
                if (!card.program) {
                    const built = buildProgram(card.glsl);
                    if (built.error) { card.dead = true; showNote(card, built.error, true); return; }
                    card.program = built.program;
                    card.uRes = built.uRes; card.uTime = built.uTime; card.uMouse = built.uMouse;
                    hideNote(card);
                }
                g.useProgram(card.program);
                g.enableVertexAttribArray(0);
                g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
                if (card.uRes) g.uniform3f(card.uRes, PREVIEW_W, PREVIEW_H, 1.0);
                if (card.uTime) g.uniform1f(card.uTime, t);
                if (card.uMouse) g.uniform4f(card.uMouse, 0.0, 0.0, 0.0, 0.0);
                g.viewport(0, 0, PREVIEW_W, PREVIEW_H);
                g.drawArrays(g.TRIANGLES, 0, 3);
                // Copy this frame out before the next card overwrites the buffer.
                card.ctx.drawImage(glCanvas, 0, 0);
            }

            function showNote(card, text, isError){
                let note = card.stage.querySelector('.shader-card-note');
                if (!note) {
                    note = document.createElement('div');
                    note.className = 'shader-card-note';
                    card.stage.appendChild(note);
                }
                note.textContent = text;
                note.classList.toggle('error', !!isError);
                note.style.display = '';
            }
            function hideNote(card){
                const note = card.stage.querySelector('.shader-card-note');
                if (note) note.style.display = 'none';
            }

            // ---- render loop: only visible, alive cards, only while page is shown ----
            // Previews are ambient thumbnails, not the main event, and a
            // raymarched fractal card costs far more than a flat 2D one. So the
            // loop runs at ~30fps and redraws at most a few cards per frame,
            // round-robin. Total cost per frame is then bounded no matter how
            // many cards the library grows to or how many are on screen.
            const TARGET_FPS = 30;
            const MIN_FRAME_MS = 1000 / TARGET_FPS;
            const MAX_DRAWS_PER_FRAME = 3;

            const cards = [];
            const liveCards = [];          // reused each frame to avoid garbage
            let cursor = 0;                // round-robin position
            let lastDrawMs = -1e9;
            let running = false, rafId = 0;
            const clock0 = (window.performance && performance.now) ? performance.now() : Date.now();

            function now(){
                const ms = (window.performance && performance.now) ? performance.now() : Date.now();
                // Wrapped so a tab left open for days never pushes iTime into a range
                // where float precision starts to visibly quantise the animation.
                return ((ms - clock0) / 1000) % 3600;
            }

            function frame(){
                rafId = 0;

                liveCards.length = 0;
                for (let i = 0; i < cards.length; i++) {
                    const c = cards[i];
                    if (c.visible && !c.dead) liveCards.push(c);
                }
                if (liveCards.length === 0 || document.hidden || REDUCED) {
                    running = false;
                    return;
                }

                const ms = (window.performance && performance.now)
                    ? performance.now() : Date.now();
                if (ms - lastDrawMs >= MIN_FRAME_MS) {
                    lastDrawMs = ms;
                    const t = now();
                    const count = Math.min(liveCards.length, MAX_DRAWS_PER_FRAME);
                    for (let k = 0; k < count; k++) {
                        drawCard(liveCards[(cursor + k) % liveCards.length], t);
                    }
                    cursor = (cursor + count) % liveCards.length;
                }
                rafId = requestAnimationFrame(frame);
            }

            function startLoop(){
                if (running || document.hidden) return;
                running = true;
                rafId = requestAnimationFrame(frame);
            }
            function stopLoop(){
                if (rafId) cancelAnimationFrame(rafId);
                rafId = 0; running = false;
            }

            document.addEventListener('visibilitychange', function(){
                if (document.hidden) stopLoop(); else startLoop();
            });

            const observer = ('IntersectionObserver' in window)
                ? new IntersectionObserver(function(entries){
                    entries.forEach(function(entry){
                        const card = entry.target.__lucidCard;
                        if (!card) return;
                        card.visible = entry.isIntersecting;
                        if (card.visible && REDUCED && !card.dead) drawCard(card, 8.0);
                    });
                    if (cards.some(c => c.visible && !c.dead)) startLoop();
                  }, { rootMargin: '200px 0px' })
                : null;

            // ---- card construction ----
            function buildCard(entry){
                const el = document.createElement('div');
                el.className = 'shader-card';
                el.innerHTML =
                    '<div class="shader-card-stage">' +
                        '<div class="shader-card-date">' + escapeHtml(entry.date || '') + '</div>' +
                        '<canvas width="' + PREVIEW_W + '" height="' + PREVIEW_H + '" ' +
                            'role="img" aria-label="Live preview of the shader ' +
                            escapeHtml(entry.name || 'Untitled') + '"></canvas>' +
                        '<div class="shader-card-note">Loading&hellip;</div>' +
                    '</div>' +
                    '<div class="shader-card-body">' +
                        '<div class="shader-card-title">' + escapeHtml(entry.name || 'Untitled') + '</div>' +
                        (entry.description
                            ? '<div class="shader-card-desc">' + escapeHtml(entry.description) + '</div>' : '') +
                        (entry.useCase
                            ? '<div class="shader-card-use"><span>Use</span> &nbsp;' +
                              escapeHtml(entry.useCase) + '</div>' : '') +
                        '<div class="shader-card-actions">' +
                            '<button class="shader-card-btn" data-act="src">VIEW SOURCE</button>' +
                            '<button class="shader-card-btn" data-act="copy" title="Shadertoy, ISF and anything that takes mainImage()">COPY GLSL</button>' +
                            '<button class="shader-card-btn" data-act="td" title="Paste into a GLSL TOP; set the iTime uniform to absTime.seconds">COPY FOR TOUCHDESIGNER</button>' +
                            '<button class="shader-card-btn" data-act="syn" title="Unzip and drag the .synScene folder into Synesthesia">SYNESTHESIA SCENE</button>' +
                        '</div>' +
                    '</div>' +
                    '<pre class="shader-card-src"><code></code></pre>';

                // Source goes in as text, never as markup.
                el.querySelector('.shader-card-src code').textContent = entry.glsl || '';

                const card = {
                    id: entry.id,
                    glsl: entry.glsl || '',
                    el: el,
                    stage: el.querySelector('.shader-card-stage'),
                    canvas: el.querySelector('canvas'),
                    ctx: null,
                    program: null,
                    visible: false,
                    dead: false
                };
                card.ctx = card.canvas.getContext('2d');
                if (!card.ctx) { card.dead = true; showNote(card, 'Canvas is not available.', true); }

                const srcBtn = el.querySelector('[data-act="src"]');
                srcBtn.addEventListener('click', function(){
                    const open = el.classList.toggle('src-open');
                    srcBtn.textContent = open ? 'HIDE SOURCE' : 'VIEW SOURCE';
                });

                const copyBtn = el.querySelector('[data-act="copy"]');
                copyBtn.addEventListener('click', function(){ copyText(copyBtn, card.glsl, 'COPY GLSL'); });

                const tdBtn = el.querySelector('[data-act="td"]');
                tdBtn.addEventListener('click', function(){
                    copyText(tdBtn, tdSource(entry.name, card.glsl), 'COPY FOR TOUCHDESIGNER');
                });

                const synBtn = el.querySelector('[data-act="syn"]');
                synBtn.addEventListener('click', function(){
                    // Accents folded to plain letters so the folder name survives any OS.
                    const folder = String(entry.name || entry.id || 'LucidSoup')
                        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                        .replace(/[^A-Za-z0-9 _-]+/g, '').trim() || 'LucidSoup';
                    const enc = new TextEncoder();
                    const finish = function(png){
                        const files = [
                            { name: folder + '.synScene/main.glsl', data: enc.encode(synMainGlsl(entry.name, card.glsl)) },
                            { name: folder + '.synScene/scene.json', data: enc.encode(synSceneJson(entry)) }
                        ];
                        if (png) files.push({ name: folder + '.synScene/thumbnail.png', data: png });
                        const url = URL.createObjectURL(makeZip(files));
                        const a = document.createElement('a');
                        a.href = url; a.download = folder + '.synScene.zip';
                        document.body.appendChild(a); a.click(); a.remove();
                        setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
                    };
                    // Thumbnail from the live preview, when it has rendered.
                    if (card.canvas.toBlob && !card.dead) {
                        card.canvas.toBlob(function(blob){
                            if (!blob) { finish(null); return; }
                            blob.arrayBuffer().then(function(b){ finish(new Uint8Array(b)); },
                                                    function(){ finish(null); });
                        }, 'image/png');
                    } else finish(null);
                });

                el.__lucidCard = card;
                return card;
            }

            function render(entries){
                if (!entries || entries.length === 0) {
                    grid.innerHTML = '<div class="shader-lib-empty">No shaders published yet. ' +
                        'Check back tomorrow.</div>';
                    return;
                }
                // Newest first, so today's drop is the first thing on screen.
                entries = entries.slice().sort(function(a, b){
                    return String(b.date || '').localeCompare(String(a.date || ''));
                });

                grid.innerHTML = '';
                const frag = document.createDocumentFragment();
                entries.forEach(function(entry){
                    if (!entry || !entry.glsl) return;
                    const card = buildCard(entry);
                    cards.push(card);
                    frag.appendChild(card.el);
                });
                grid.appendChild(frag);

                if (cards.length === 0) {
                    grid.innerHTML = '<div class="shader-lib-empty">No shaders published yet. ' +
                        'Check back tomorrow.</div>';
                    return;
                }

                if (observer) {
                    cards.forEach(function(c){ observer.observe(c.el); });
                } else {
                    // No IntersectionObserver: render everything and rely on the loop.
                    cards.forEach(function(c){ c.visible = true; });
                    startLoop();
                }
            }

            fetch('shaders/manifest.json?t=' + Date.now())
                .then(function(r){
                    if (!r.ok) throw new Error('manifest ' + r.status);
                    return r.json();
                })
                .then(function(data){
                    render(Array.isArray(data) ? data : (data.shaders || []));
                })
                .catch(function(err){
                    console.warn('[ShaderLib] Could not load shaders/manifest.json:', err.message);
                    section.style.display = 'none';
                });
        })();
    
