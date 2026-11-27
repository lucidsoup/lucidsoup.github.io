        // ===== VERSION CHECK =====
        // If you see this in the browser console, the new file IS deployed.
        console.log('%c[LucidSoup] v3.0 — 10 shaders + camera + XYZ controls + contained DrumSeek frame', 'background:#00ffff;color:#000;padding:4px 8px;font-weight:bold;');

        // ===== MEDIA MANIFEST =====
        // media.json describes every piece of work on the site. Fetched once and
        // shared, because the portfolio and the puzzle box both read from it.
        window.lucidMedia = (function () {
            var p = null;
            return function () {
                if (!p) {
                    p = fetch('media.json?t=' + Date.now())
                        .then(function (r) {
                            if (!r.ok) throw new Error('media.json ' + r.status);
                            return r.json();
                        });
                }
                return p;
            };
        })();

        // ===== NAVBAR =====
        window.addEventListener('scroll', function() {
            document.getElementById('navbar').style.background =
                window.scrollY > 100 ? 'rgba(0,0,0,.95)' : 'rgba(0,0,0,.9)';
        });

        // ===== ROUTING =====
        // The sections are not a page you scroll any more. Exactly one is shown,
        // and only when the gallery has sent you to it by name; with no hash you
        // get the entrance and nothing else. This is what makes the gallery the
        // site's only index rather than a second way in beside the old one.
        var SECTION_IDS = ['drumseek', 'sp404', 'plugins', 'playground', 'synthsoup', 'blackboxfx',
                           'portfolio', 'shader-library', 'about', 'contact'];

        function routeSections() {
            var want = (location.hash || '').replace(/^#/, '').split('&')[0];
            var focus = SECTION_IDS.indexOf(want) >= 0 ? want : null;
            var heroEl = document.querySelector('.hero');

            SECTION_IDS.forEach(function (id) {
                var el = document.getElementById(id);
                if (el) el.hidden = (id !== focus);
            });
            if (heroEl) heroEl.hidden = !!focus;
            document.body.classList.toggle('focused', !!focus);

            var back = document.getElementById('back-to-gallery');
            if (back) back.hidden = !focus;

            if (focus) {
                window.scrollTo(0, 0);
                var h = document.querySelector('#' + CSS.escape(focus) + ' h2');
                if (h) h.setAttribute('tabindex', '-1');
            }
            // Tell anything that cares (the portfolio hover binding, the shader
            // library) that the visible part of the page changed.
            window.dispatchEvent(new CustomEvent('lucid:route', { detail: { section: focus } }));
        }

        window.addEventListener('hashchange', routeSections);
        routeSections();

        // Both ways out of a section come back up to the bowl. Clearing the
        // hash with location.hash = '' leaves a bare '#' behind and does not
        // reliably fire hashchange, so the route is driven directly.
        ['nav-home', 'back-to-gallery'].forEach(function (id) {
            var t = document.getElementById(id);
            if (!t) return;
            t.addEventListener('click', function (e) {
                e.preventDefault();
                history.pushState(null, '', location.pathname);
                routeSections();
            });
        });

        // ===== PORTFOLIO VIDEO HOVER =====
        // Cards come from media.json and land after this script has run, so binding is
        // a function the renderer calls rather than one pass over the DOM at load.
        var isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

        function portfolioItems() {
            return Array.prototype.slice.call(document.querySelectorAll('.portfolio-item'));
        }

        function pauseAll() {
            portfolioItems().forEach(function(item) {
                var v = item.querySelector('video');
                if (v) v.pause();
                item.classList.remove('playing');
            });
        }

        function bindPortfolioItems() {
            portfolioItems().forEach(function(item) {
                if (item.getAttribute('data-bound')) return;
                item.setAttribute('data-bound', '1');

                var video = item.querySelector('video');
                var src = item.getAttribute('data-src');
                var href = item.getAttribute('data-href');
                if (src || href) item.style.cursor = 'pointer';

                function open() {
                    if (src) openLightbox(src);
                    else if (href) window.open(href, '_blank', 'noopener');
                }

                if (isMobile) {
                    var lastTap = 0;
                    item.addEventListener('click', function() {
                        var now = Date.now();
                        // With a preview loop the first tap plays it in place and the
                        // second opens the full piece; without one, one tap opens.
                        if (!video || now - lastTap < 300) {
                            open();
                        } else if (video.paused) {
                            pauseAll();
                            video.play().catch(function(){});
                            item.classList.add('playing');
                        } else {
                            video.pause();
                            item.classList.remove('playing');
                        }
                        lastTap = now;
                    });
                } else {
                    if (video) {
                        item.addEventListener('mouseenter', function() {
                            video.play().catch(function(){});
                            item.classList.add('playing');
                        });
                        item.addEventListener('mouseleave', function() {
                            video.pause();
                            video.currentTime = 0;
                            item.classList.remove('playing');
                        });
                    }
                    item.addEventListener('click', open);
                }
            });
        }
        window.addEventListener('lucid:portfolio-ready', bindPortfolioItems);
        bindPortfolioItems();

        // ===== LIGHTBOX =====
        var lightbox = document.getElementById('lightbox');
        var lbVideo = document.getElementById('lightbox-video');

        function openLightbox(src) {
            pauseAll();
            lbVideo.src = src;
            lightbox.classList.add('active');
            // Closing before the play promise settles rejects it; that is expected.
            var q = lbVideo.play();
            if (q && q.catch) q.catch(function () {});
        }

        function closeLightbox() {
            lbVideo.pause();
            lbVideo.src = '';
            lightbox.classList.remove('active');
        }

        document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
        lightbox.addEventListener('click', function(e) {
            if (e.target === lightbox) closeLightbox();
        });
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') closeLightbox();
        });

        // ===== DRUMSEEK IFRAME — robust auto-fit =====
        // Strategy:
        //   1. Override DrumSeek's `min-h-screen` (100vh) which causes the
        //      "iframe grows -> body grows -> iframe grows" feedback loop.
        //   2. Force body overflow:hidden so DrumSeek can never scroll inside.
        //   3. Use ResizeObserver on the React root (not body!) to track
        //      ACTUAL content height as DrumSeek opens/closes panels.
        //   4. Match the wrapper div height to the content — NO loop because
        //      the React root has no min-height tied to viewport.
        (function fitDrumSeek() {
            const frame = document.getElementById('drumseek-frame');
            const iframe = document.getElementById('drumseek-embed');
            if (!frame || !iframe) return;

            function setupAfterLoad() {
                try {
                    const doc = iframe.contentDocument;
                    if (!doc || !doc.body) return false;

                    // Inject CSS that overrides DrumSeek's viewport-tied heights.
                    // This is THE fix for the feedback loop: without 100vh,
                    // the body height equals content height, not iframe height.
                    const fixCss = doc.createElement('style');
                    fixCss.textContent = `
                        html, body { 
                            min-height: 0 !important; 
                            height: auto !important;
                            overflow: hidden !important;
                        }
                        /* DrumSeek root uses min-h-screen — override */
                        #root > div { 
                            min-height: 0 !important; 
                            height: auto !important;
                        }
                    `;
                    doc.head.appendChild(fixCss);

                    const root = doc.getElementById('root');
                    if (!root) return false;

                    function syncHeight() {
                        // Measure ACTUAL content height (no longer tied to iframe size)
                        const h = root.scrollHeight;
                        if (h > 100) {
                            frame.style.height = (h + 4) + 'px';
                        }
                    }

                    // Initial measurement
                    syncHeight();
                    setTimeout(syncHeight, 100);
                    setTimeout(syncHeight, 500);

                    // Watch for changes (FX rack open/close, MIDI panel, etc.)
                    if (window.ResizeObserver) {
                        const ro = new ResizeObserver(syncHeight);
                        ro.observe(root);
                    }

                    console.log('[LucidSoup] DrumSeek auto-fit installed');
                    return true;
                } catch (e) {
                    console.warn('[LucidSoup] Could not setup DrumSeek fit:', e.message);
                    return false;
                }
            }

            iframe.addEventListener('load', () => {
                // Try multiple times in case React isn't done rendering
                let attempts = 0;
                const tryFit = () => {
                    if (setupAfterLoad()) return;
                    if (++attempts < 10) setTimeout(tryFit, 200);
                };
                setTimeout(tryFit, 100);
            });
        })();

        // ===== AUDIO-REACTIVE WEBGL VISUAL ENGINE =====
        // Robust WebGL1-compatible implementation with 10 shaders, camera input,
        // and full XYZ feedback transform controls.

        // Detect mobile (used for perf tuning + default panel state)
        const isSmallScreen = window.matchMedia('(max-width: 768px)').matches;

        // ===== Visual control panel toggle =====
        (function initPanelToggle() {
            const panel = document.getElementById('visual-controls');
            const fab = document.getElementById('vfx-fab');
            const closeBtn = document.getElementById('panel-close');
            if (!panel || !fab) return;

            // Collapsed everywhere to start. It used to open itself on desktop,
            // which was fine over a page of text and is not fine over the bowl:
            // it covered a third of the front page, Play and Contact included.
            // The gear is right there for anyone who wants the controls.

            function setOpen(open) {
                if (open) {
                    panel.classList.remove('collapsed');
                    fab.classList.add('panel-open');
                } else {
                    panel.classList.add('collapsed');
                    fab.classList.remove('panel-open');
                }
            }

            fab.addEventListener('click', () => {
                setOpen(panel.classList.contains('collapsed'));
            });

            if (closeBtn) closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                setOpen(false);
            });

            document.addEventListener('click', (e) => {
                if (!isSmallScreen) return;
                if (panel.classList.contains('collapsed')) return;
                if (!panel.contains(e.target) && !fab.contains(e.target)) {
                    setOpen(false);
                }
            });
        })();

        (function initVisualEngine() {
            const canvas = document.getElementById('visual-canvas');
            if (!canvas) { console.warn('[Visuals] No canvas element'); return; }

            const gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: false })
                    || canvas.getContext('experimental-webgl');

            if (!gl) {
                console.error('[Visuals] WebGL not supported');
                canvas.style.display = 'none';
                return;
            }

            console.log('[Visuals] WebGL initialized:', gl.getParameter(gl.VERSION),
                        '| Mobile mode:', isSmallScreen);

            function resizeCanvas() {
                const dprCap = isSmallScreen ? 1.5 : 2;
                const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
                canvas.width = Math.floor(window.innerWidth * dpr);
                canvas.height = Math.floor(window.innerHeight * dpr);
                canvas.style.width = window.innerWidth + 'px';
                canvas.style.height = window.innerHeight + 'px';
                gl.viewport(0, 0, canvas.width, canvas.height);
            }
            resizeCanvas();

            // ===== Shaders =====
            const vertexShaderSrc = `
                attribute vec2 position;
                varying vec2 vUv;
                void main() {
                    gl_Position = vec4(position, 0.0, 1.0);
                    vUv = position * 0.5 + 0.5;
                }
            `;

            const hsv2rgb = `
                vec3 hsv2rgb(vec3 c) {
                    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
                    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
                    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
                }
            `;

            // Common transform: all shaders use this to apply zoom/rotation/offset
            // to the FEEDBACK SAMPLE coordinates (not the output)
            const transformFn = `
                vec2 applyTransform(vec2 uv) {
                    // Center
                    vec2 p = uv - 0.5 - vec2(offsetX, offsetY);
                    // Zoom in on the center (zoom > 1 = zoom in)
                    p /= zoom;
                    // Rotate
                    float ca = cos(rotation), sa = sin(rotation);
                    p = mat2(ca, -sa, sa, ca) * p;
                    return p + 0.5;
                }
            `;

            const commonUniforms = `
                precision mediump float;
                uniform vec2 resolution;
                uniform float time;
                uniform sampler2D prevFrame;
                uniform sampler2D camera;
                uniform float useCamera;     // 0..1, mix amount
                uniform float feedback;
                uniform float zoom;
                uniform float rotation;
                uniform float offsetX;
                uniform float offsetY;
                uniform float hue;
                uniform float audioLevel;
                uniform float bassLevel;
                varying vec2 vUv;
            `;

            // Camera sampling helper — produces a HSV-shifted sample
            const cameraSample = `
                vec3 sampleCamera(vec2 uv) {
                    // Mirror horizontally so it feels natural (selfie style)
                    vec2 cuv = vec2(1.0 - uv.x, uv.y);
                    vec3 c = texture2D(camera, cuv).rgb;
                    // Apply slight saturation boost
                    float lum = dot(c, vec3(0.299, 0.587, 0.114));
                    return mix(vec3(lum), c, 1.4);
                }
            `;

            // === SHADER 1: KALEIDOSCOPE ===
            const fragKaleidoscope = commonUniforms + hsv2rgb + transformFn + cameraSample + `
                void main() {
                    vec2 uv = gl_FragCoord.xy / resolution;
                    vec2 cuv = uv * 2.0 - 1.0;
                    cuv /= zoom;
                    cuv -= vec2(offsetX, offsetY) * 2.0;
                    float ca = cos(rotation), sa = sin(rotation);
                    cuv = mat2(ca, -sa, sa, ca) * cuv;

                    float r = length(cuv);
                    float a = atan(cuv.y, cuv.x);
                    float segments = 6.0 + bassLevel * 4.0;
                    a = mod(a, 6.283185 / segments);

                    vec2 newUv = vec2(r * cos(a), r * sin(a)) * 0.5 + 0.5;
                    vec4 prev = texture2D(prevFrame, newUv);

                    float energy = audioLevel * 0.6 + 0.3;
                    vec3 col = hsv2rgb(vec3((a/6.283185) + time*0.05 + hue/360.0, 1.0, energy));

                    if (useCamera > 0.01) {
                        vec3 cam = sampleCamera(newUv);
                        col = mix(col, cam * (energy + 0.6), useCamera);
                    }

                    gl_FragColor = vec4(mix(col, prev.rgb, feedback * 0.97), 1.0);
                }
            `;

            // === SHADER 2: TUNNEL ===
            const fragTunnel = commonUniforms + hsv2rgb + cameraSample + `
                void main() {
                    vec2 uv = gl_FragCoord.xy / resolution;
                    vec2 cuv = uv * 2.0 - 1.0;
                    cuv -= vec2(offsetX, offsetY) * 2.0;
                    cuv /= zoom;

                    float r = length(cuv);
                    float a = atan(cuv.y, cuv.x) + rotation;
                    r *= 1.0 + audioLevel * 0.5;

                    vec2 tunUv = vec2(a/6.283185 + time*0.05, log(r + 0.1) - time * 0.3);
                    vec4 prev = texture2D(prevFrame, fract(tunUv));

                    float v = sin(tunUv.y * 8.0) * 0.5 + 0.5;
                    vec3 col = hsv2rgb(vec3(tunUv.x + hue/360.0, 0.9, v * (audioLevel + 0.4)));

                    if (useCamera > 0.01) {
                        vec3 cam = sampleCamera(fract(tunUv));
                        col = mix(col, cam, useCamera);
                    }

                    gl_FragColor = vec4(mix(col, prev.rgb, feedback * 0.97), 1.0);
                }
            `;

            // === SHADER 3: PLASMA ===
            const fragPlasma = commonUniforms + hsv2rgb + cameraSample + `
                void main() {
                    vec2 uv = gl_FragCoord.xy / resolution;
                    vec2 cuv = uv * 2.0 - 1.0;
                    cuv /= zoom;
                    cuv -= vec2(offsetX, offsetY) * 2.0;
                    float ca = cos(rotation), sa = sin(rotation);
                    cuv = mat2(ca, -sa, sa, ca) * cuv;

                    float v = sin(cuv.x * 10.0 + time + audioLevel * 8.0) * 0.5 + 0.5;
                    v += sin(cuv.y * 10.0 + time * 0.7) * 0.5;
                    v += sin((cuv.x + cuv.y) * 7.0 + time * 0.3 + bassLevel * 5.0) * 0.5;
                    v *= 0.33;

                    vec4 prev = texture2D(prevFrame, uv);
                    vec3 col = hsv2rgb(vec3(v + hue/360.0, 0.9, audioLevel * 0.6 + 0.4));

                    if (useCamera > 0.01) {
                        vec3 cam = sampleCamera(uv);
                        col = mix(col, cam * (v * 1.5 + 0.5), useCamera);
                    }

                    gl_FragColor = vec4(mix(col, prev.rgb, feedback * 0.97), 1.0);
                }
            `;

            // === SHADER 4: WAVE ===
            const fragWave = commonUniforms + hsv2rgb + cameraSample + `
                void main() {
                    vec2 uv = gl_FragCoord.xy / resolution;
                    vec2 sampleUv = uv;
                    sampleUv.y += sin(sampleUv.x * 20.0 + time * 2.0 + audioLevel * 10.0) * 0.02 * (1.0 + bassLevel);
                    sampleUv.x += cos(sampleUv.y * 15.0 + time + bassLevel * 5.0) * 0.02;
                    sampleUv -= vec2(offsetX, offsetY);

                    vec4 prev = texture2D(prevFrame, sampleUv);
                    vec3 col = hsv2rgb(vec3(uv.x + time * 0.05 + hue/360.0, 0.8, audioLevel * 0.6 + 0.4));

                    if (useCamera > 0.01) {
                        vec3 cam = sampleCamera(sampleUv);
                        col = mix(col, cam, useCamera);
                    }

                    gl_FragColor = vec4(mix(col, prev.rgb, feedback * 0.97), 1.0);
                }
            `;

            // === SHADER 5: FRACTAL (Mandelbrot-flavored) ===
            const fragFractal = commonUniforms + hsv2rgb + cameraSample + `
                void main() {
                    vec2 uv = gl_FragCoord.xy / resolution;
                    vec2 c = (uv - 0.5) * 4.0 / zoom + vec2(offsetX, offsetY) * 4.0;
                    float ca = cos(rotation), sa = sin(rotation);
                    c = mat2(ca, -sa, sa, ca) * c;
                    c += vec2(sin(time*0.13)*0.3, cos(time*0.17)*0.3);

                    vec2 z = vec2(0.0);
                    float iter = 0.0;
                    const float MAX = 50.0;
                    for (float i = 0.0; i < MAX; i++) {
                        if (dot(z, z) > 4.0) break;
                        z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
                        iter = i;
                    }
                    float v = iter / MAX;

                    vec4 prev = texture2D(prevFrame, uv);
                    vec3 col = hsv2rgb(vec3(v + time*0.03 + hue/360.0, 0.9, v * (audioLevel + 0.4)));

                    if (useCamera > 0.01) {
                        vec3 cam = sampleCamera(uv);
                        col = mix(col, cam * (v + 0.5), useCamera);
                    }

                    gl_FragColor = vec4(mix(col, prev.rgb, feedback * 0.96), 1.0);
                }
            `;

            // === SHADER 6: WARP (domain-warped noise) ===
            const fragWarp = commonUniforms + hsv2rgb + cameraSample + transformFn + `
                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
                }
                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f*f*(3.0-2.0*f);
                    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
                               mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
                }
                void main() {
                    vec2 uv = gl_FragCoord.xy / resolution;
                    vec2 q = vec2(noise(uv*3.0 + time*0.2), noise(uv*3.0 + vec2(5.2, 1.3) + time*0.2));
                    vec2 r = vec2(noise(uv*4.0 + 4.0*q + vec2(1.7,9.2) + bassLevel*2.0),
                                  noise(uv*4.0 + 4.0*q + vec2(8.3,2.8) + audioLevel*2.0));
                    float v = noise(uv*4.0 + 4.0*r);

                    vec2 sampleUv = applyTransform(uv);
                    vec4 prev = texture2D(prevFrame, sampleUv);

                    vec3 col = hsv2rgb(vec3(v + time*0.05 + hue/360.0, 0.8, v * (audioLevel + 0.4)));

                    if (useCamera > 0.01) {
                        vec3 cam = sampleCamera(uv + (r - 0.5) * 0.1);
                        col = mix(col, cam, useCamera);
                    }

                    gl_FragColor = vec4(mix(col, prev.rgb, feedback * 0.97), 1.0);
                }
            `;

            // === SHADER 7: LIQUID (smooth flowing displacement) ===
            const fragLiquid = commonUniforms + hsv2rgb + cameraSample + `
                void main() {
                    vec2 uv = gl_FragCoord.xy / resolution;
                    vec2 cuv = (uv - 0.5) / zoom + 0.5;
                    cuv -= vec2(offsetX, offsetY);

                    float t = time * 0.4;
                    vec2 flow = vec2(
                        sin(cuv.y * 6.0 + t + bassLevel * 3.0) * 0.04,
                        cos(cuv.x * 6.0 + t * 1.3 + audioLevel * 3.0) * 0.04
                    );
                    vec2 sampleUv = cuv + flow;
                    float ca = cos(rotation), sa = sin(rotation);
                    sampleUv = (mat2(ca, -sa, sa, ca) * (sampleUv - 0.5)) + 0.5;

                    vec4 prev = texture2D(prevFrame, sampleUv);

                    float ripple = sin(length(cuv - 0.5) * 20.0 - t * 3.0) * 0.5 + 0.5;
                    vec3 col = hsv2rgb(vec3(ripple + hue/360.0, 0.7, audioLevel * 0.7 + 0.3));

                    if (useCamera > 0.01) {
                        vec3 cam = sampleCamera(sampleUv);
                        col = mix(col, cam, useCamera);
                    }

                    gl_FragColor = vec4(mix(col, prev.rgb, feedback * 0.97), 1.0);
                }
            `;

            // === SHADER 8: GRID (pulsing geometric grid) ===
            const fragGrid = commonUniforms + hsv2rgb + cameraSample + transformFn + `
                void main() {
                    vec2 uv = gl_FragCoord.xy / resolution;
                    vec2 cuv = (uv - 0.5) / zoom * 8.0;
                    float ca = cos(rotation), sa = sin(rotation);
                    cuv = mat2(ca, -sa, sa, ca) * cuv;
                    cuv -= vec2(offsetX, offsetY) * 8.0;

                    vec2 cell = floor(cuv);
                    vec2 f = fract(cuv);
                    float d = min(min(f.x, f.y), min(1.0 - f.x, 1.0 - f.y));
                    float grid = smoothstep(0.0, 0.05, d);

                    float pulse = sin(cell.x * 0.5 + cell.y * 0.7 + time * 2.0 + bassLevel * 4.0) * 0.5 + 0.5;
                    pulse *= audioLevel + 0.3;

                    vec2 sampleUv = applyTransform(uv);
                    vec4 prev = texture2D(prevFrame, sampleUv);

                    vec3 col = hsv2rgb(vec3(pulse + hue/360.0, 0.9, (1.0 - grid) * pulse * 1.5));

                    if (useCamera > 0.01) {
                        vec3 cam = sampleCamera(uv);
                        col = mix(col, cam * pulse, useCamera);
                    }

                    gl_FragColor = vec4(mix(col, prev.rgb, feedback * 0.97), 1.0);
                }
            `;

            // === SHADER 9: VORTEX (spiraling pull-in feedback) ===
            const fragVortex = commonUniforms + hsv2rgb + cameraSample + `
                void main() {
                    vec2 uv = gl_FragCoord.xy / resolution;
                    vec2 cuv = uv - 0.5 - vec2(offsetX, offsetY);
                    float r = length(cuv);
                    float a = atan(cuv.y, cuv.x);
                    a += rotation + (1.0 / (r + 0.2)) * 0.05 + bassLevel * 0.3;
                    r *= 0.99 - audioLevel * 0.02;
                    vec2 sampleUv = vec2(cos(a), sin(a)) * r / zoom + 0.5;

                    vec4 prev = texture2D(prevFrame, sampleUv);

                    float energy = audioLevel * 0.5 + 0.3;
                    vec3 col = hsv2rgb(vec3(a/6.283185 + r*2.0 + time*0.1 + hue/360.0, 0.9, energy));

                    if (useCamera > 0.01) {
                        vec3 cam = sampleCamera(sampleUv);
                        col = mix(col, cam * (energy + 0.5), useCamera);
                    }

                    gl_FragColor = vec4(mix(col, prev.rgb, feedback * 0.98), 1.0);
                }
            `;

            // === SHADER 10: BLOOM (radial bloom centered on offset) ===
            const fragBloom = commonUniforms + hsv2rgb + cameraSample + `
                void main() {
                    vec2 uv = gl_FragCoord.xy / resolution;
                    vec2 cuv = (uv - 0.5 - vec2(offsetX, offsetY)) / zoom;
                    float ca = cos(rotation), sa = sin(rotation);
                    cuv = mat2(ca, -sa, sa, ca) * cuv;

                    float r = length(cuv);
                    float petals = 5.0 + floor(bassLevel * 8.0);
                    float a = atan(cuv.y, cuv.x);
                    float bloom = sin(a * petals + time + r * 8.0) * 0.5 + 0.5;
                    bloom *= smoothstep(0.6, 0.0, r);

                    // Sample previous frame slightly inward for inward-rushing feedback
                    vec2 sampleUv = (cuv * 0.97 + 0.5) + vec2(offsetX, offsetY);
                    vec4 prev = texture2D(prevFrame, sampleUv);

                    float energy = audioLevel * 0.7 + 0.3;
                    vec3 col = hsv2rgb(vec3(bloom + time*0.05 + hue/360.0, 0.9, bloom * energy * 1.5));

                    if (useCamera > 0.01) {
                        vec3 cam = sampleCamera(sampleUv);
                        col = mix(col, cam * (bloom + 0.5), useCamera);
                    }

                    gl_FragColor = vec4(mix(col, prev.rgb, feedback * 0.97), 1.0);
                }
            `;

            // ===== COMPOSITOR PASS =====
            // Mixes the visual texture with the page-layer (DOM capture) using
            // selectable blend modes and applies layer effects.
            const displayFrag = `
                precision mediump float;
                uniform sampler2D tex;          // visual texture (shader output)
                uniform sampler2D pageTex;      // DOM capture texture
                uniform float pageMix;          // 0..1 — opacity of page layer
                uniform float blendMode;        // 0..8 — which blend formula
                uniform float displaceAmt;      // 0..1 — displacement amount
                uniform float lumakey;          // 0..1 — luma threshold for cutting darks
                uniform float chromakey;        // 0..1 — chromakey threshold (0=off)
                uniform vec3 chromakeyColor;    // RGB of color to key out
                uniform float layerHue;         // 0..1 — hue rotation
                uniform float layerInvert;      // 0..1 — invert amount
                uniform float audioLevel;       // for audio-driven displacement
                varying vec2 vUv;

                vec3 hsv2rgb(vec3 c) {
                    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
                    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
                    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
                }
                vec3 rgb2hsv(vec3 c) {
                    vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
                    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
                    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
                    float d = q.x - min(q.w, q.y);
                    float e = 1.0e-10;
                    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
                }

                vec3 blend(vec3 base, vec3 layer, float mode) {
                    if (mode < 0.5)      return layer;                                              // 0 normal
                    if (mode < 1.5)      return base + layer;                                       // 1 add
                    if (mode < 2.5)      return base * layer;                                       // 2 multiply
                    if (mode < 3.5)      return 1.0 - (1.0 - base) * (1.0 - layer);                 // 3 screen
                    if (mode < 4.5)      return mix(2.0*base*layer, 1.0 - 2.0*(1.0-base)*(1.0-layer), step(0.5, base));  // 4 overlay
                    if (mode < 5.5)      return abs(base - layer);                                  // 5 difference
                    if (mode < 6.5)      return max(base, layer);                                   // 6 lighten
                    if (mode < 7.5)      return min(base, layer);                                   // 7 darken
                                         return base / max(1.0 - layer, 0.001);                     // 8 color dodge
                }

                void main() {
                    vec2 uv = vUv;

                    // Sample the visual texture (always)
                    vec3 visual = texture2D(tex, uv).rgb;

                    if (pageMix < 0.001) {
                        gl_FragColor = vec4(visual, 1.0);
                        return;
                    }

                    // Sample the page layer with optional displacement driven by visuals
                    vec2 displaceUv = uv;
                    if (displaceAmt > 0.001) {
                        // Use the visual as a displacement map
                        vec2 disp = (visual.rg - 0.5) * displaceAmt * 0.15 * (1.0 + audioLevel);
                        displaceUv += disp;
                    }
                    vec4 pageRaw = texture2D(pageTex, displaceUv);
                    vec3 page = pageRaw.rgb;
                    float pageA = pageRaw.a;

                    // Layer effects (applied to the page color before blending)
                    if (layerInvert > 0.001) {
                        page = mix(page, 1.0 - page, layerInvert);
                    }
                    if (layerHue > 0.001) {
                        vec3 hsv = rgb2hsv(page);
                        hsv.x = fract(hsv.x + layerHue);
                        page = hsv2rgb(hsv);
                    }

                    // Lumakey: remove pixels below a luma threshold (cuts dark backgrounds)
                    float lum = dot(page, vec3(0.299, 0.587, 0.114));
                    float lumaMask = smoothstep(lumakey * 0.5, lumakey * 0.5 + 0.05, lum);

                    // Chromakey: remove pixels close to a target color
                    float chromaMask = 1.0;
                    if (chromakey > 0.001) {
                        float d = distance(page, chromakeyColor);
                        chromaMask = smoothstep(chromakey * 0.3, chromakey * 0.3 + 0.1, d);
                    }

                    float mask = lumaMask * chromaMask * pageA;

                    // Blend
                    vec3 blended = blend(visual, page, blendMode);
                    blended = clamp(blended, 0.0, 1.0);

                    // Final mix using mask × pageMix
                    vec3 outCol = mix(visual, blended, mask * pageMix);

                    // ===== VIBRANCY BOOST =====
                    // Increase saturation: pull each channel away from luminance
                    float vibLum = dot(outCol, vec3(0.299, 0.587, 0.114));
                    outCol = mix(vec3(vibLum), outCol, 1.45);  // sat 145%
                    // Slight contrast boost (S-curve via smoothstep)
                    outCol = mix(outCol, smoothstep(0.0, 1.0, outCol), 0.35);
                    // Brightness lift on highlights for that "neon glow" feel
                    outCol += pow(outCol, vec3(2.0)) * 0.3;
                    // Final clamp
                    outCol = clamp(outCol, 0.0, 1.0);

                    gl_FragColor = vec4(outCol, 1.0);
                }
            `;

            // ===== Compile / link =====
            function compileShader(src, type) {
                const sh = gl.createShader(type);
                gl.shaderSource(sh, src);
                gl.compileShader(sh);
                if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
                    console.error('[Visuals] Shader compile error:', gl.getShaderInfoLog(sh));
                    return null;
                }
                return sh;
            }

            function makeProgram(vsSrc, fsSrc) {
                const vs = compileShader(vsSrc, gl.VERTEX_SHADER);
                const fs = compileShader(fsSrc, gl.FRAGMENT_SHADER);
                if (!vs || !fs) return null;
                const prog = gl.createProgram();
                gl.attachShader(prog, vs);
                gl.attachShader(prog, fs);
                gl.linkProgram(prog);
                if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
                    console.error('[Visuals] Program link error:', gl.getProgramInfoLog(prog));
                    return null;
                }
                return prog;
            }

            const programs = {
                kaleidoscope: makeProgram(vertexShaderSrc, fragKaleidoscope),
                tunnel:       makeProgram(vertexShaderSrc, fragTunnel),
                plasma:       makeProgram(vertexShaderSrc, fragPlasma),
                wave:         makeProgram(vertexShaderSrc, fragWave),
                fractal:      makeProgram(vertexShaderSrc, fragFractal),
                warp:         makeProgram(vertexShaderSrc, fragWarp),
                liquid:       makeProgram(vertexShaderSrc, fragLiquid),
                grid:         makeProgram(vertexShaderSrc, fragGrid),
                vortex:       makeProgram(vertexShaderSrc, fragVortex),
                bloom:        makeProgram(vertexShaderSrc, fragBloom),
            };
            const validShaders = Object.entries(programs).filter(([k,v]) => v != null);
            if (validShaders.length === 0) {
                console.error('[Visuals] No shaders compiled. Disabling visuals.');
                canvas.style.display = 'none';
                return;
            }
            console.log('[Visuals] Shaders compiled:', validShaders.map(([k]) => k).join(', '));

            const displayProgram = makeProgram(vertexShaderSrc, displayFrag);
            if (!displayProgram) { console.error('[Visuals] Display program failed.'); return; }

            // Cache uniforms
            function cacheUniforms(prog) {
                return {
                    posLoc: gl.getAttribLocation(prog, 'position'),
                    resolution: gl.getUniformLocation(prog, 'resolution'),
                    time: gl.getUniformLocation(prog, 'time'),
                    feedback: gl.getUniformLocation(prog, 'feedback'),
                    zoom: gl.getUniformLocation(prog, 'zoom'),
                    rotation: gl.getUniformLocation(prog, 'rotation'),
                    offsetX: gl.getUniformLocation(prog, 'offsetX'),
                    offsetY: gl.getUniformLocation(prog, 'offsetY'),
                    hue: gl.getUniformLocation(prog, 'hue'),
                    audioLevel: gl.getUniformLocation(prog, 'audioLevel'),
                    bassLevel: gl.getUniformLocation(prog, 'bassLevel'),
                    prevFrame: gl.getUniformLocation(prog, 'prevFrame'),
                    camera: gl.getUniformLocation(prog, 'camera'),
                    useCamera: gl.getUniformLocation(prog, 'useCamera'),
                };
            }
            const uniformCache = {};
            for (const [name, prog] of Object.entries(programs)) {
                if (prog) uniformCache[name] = cacheUniforms(prog);
            }
            const displayPosLoc = gl.getAttribLocation(displayProgram, 'position');
            const displayUniforms = {
                tex: gl.getUniformLocation(displayProgram, 'tex'),
                pageTex: gl.getUniformLocation(displayProgram, 'pageTex'),
                pageMix: gl.getUniformLocation(displayProgram, 'pageMix'),
                blendMode: gl.getUniformLocation(displayProgram, 'blendMode'),
                displaceAmt: gl.getUniformLocation(displayProgram, 'displaceAmt'),
                lumakey: gl.getUniformLocation(displayProgram, 'lumakey'),
                chromakey: gl.getUniformLocation(displayProgram, 'chromakey'),
                chromakeyColor: gl.getUniformLocation(displayProgram, 'chromakeyColor'),
                layerHue: gl.getUniformLocation(displayProgram, 'layerHue'),
                layerInvert: gl.getUniformLocation(displayProgram, 'layerInvert'),
                audioLevel: gl.getUniformLocation(displayProgram, 'audioLevel'),
            };

            // Framebuffers
            const fbScale = isSmallScreen ? 0.5 : 0.75;
            let fbWidth = Math.floor(canvas.width * fbScale);
            let fbHeight = Math.floor(canvas.height * fbScale);
            const fb1 = gl.createFramebuffer();
            const fb2 = gl.createFramebuffer();
            const tex1 = gl.createTexture();
            const tex2 = gl.createTexture();

            function setupTextures() {
                fbWidth = Math.floor(canvas.width * fbScale);
                fbHeight = Math.floor(canvas.height * fbScale);
                [tex1, tex2].forEach(tex => {
                    gl.bindTexture(gl.TEXTURE_2D, tex);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fbWidth, fbHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                });
                gl.bindFramebuffer(gl.FRAMEBUFFER, fb1);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex1, 0);
                gl.bindFramebuffer(gl.FRAMEBUFFER, fb2);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex2, 0);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            }
            setupTextures();

            window.addEventListener('resize', () => { resizeCanvas(); setupTextures(); });

            // Camera texture (1px until camera enabled)
            const cameraTex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, cameraTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]));
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

            // Page capture texture (1px transparent until layer enabled)
            const pageTex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, pageTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,0]));
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

            // Fullscreen quad
            const posBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

            // ===== Audio data from DrumSeek =====
            let audioData = {
                freq: new Uint8Array(256),
                wave: new Uint8Array(512),
                lastReceived: 0,
            };
            window.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'DRUMSEEK_AUDIO') {
                    if (event.data.freq) audioData.freq = new Uint8Array(event.data.freq);
                    if (event.data.wave) audioData.wave = new Uint8Array(event.data.wave);
                    audioData.lastReceived = Date.now();
                }
            });

            // ===== Control state =====
            // Random initial state on each page load — keeps the site feeling fresh
            const ALL_SHADERS = ['kaleidoscope', 'tunnel', 'plasma', 'wave', 'fractal', 'warp', 'liquid', 'grid', 'vortex', 'bloom'];
            const randShader = ALL_SHADERS[Math.floor(Math.random() * ALL_SHADERS.length)];
            const randHue = Math.floor(Math.random() * 360);
            const randFeedback = 0.35 + Math.random() * 0.45;          // 0.35-0.80 — meaningful trails
            const randZoom = 0.90 + Math.random() * 0.30;              // 0.90-1.20
            const randSpin = (Math.random() - 0.5) * 0.30;             // -0.15 to +0.15
            const randOffsetX = (Math.random() - 0.5) * 0.20;          // -0.10 to +0.10
            const randOffsetY = (Math.random() - 0.5) * 0.20;
            const randRotation = (Math.random() - 0.5) * Math.PI * 0.5; // -45° to +45°

            const controlState = {
                shader: randShader,
                feedback: randFeedback,
                zoom: randZoom,
                rotation: randRotation,
                offsetX: randOffsetX,
                offsetY: randOffsetY,
                spinRate: randSpin,
                hue: randHue,
                audioReact: 0.5,
                cameraMix: 0.0,
                cameraEnabled: false,
                enabled: true,
            };

            // Sync UI to the random state
            (function syncRandomToUI() {
                // Set the active shader button
                document.querySelectorAll('.shader-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.shader === randShader);
                });
                // Set sliders + their value labels to match the random state
                const setSliderUI = (sliderId, valId, sliderVal, displayText) => {
                    const s = document.getElementById(sliderId);
                    const v = document.getElementById(valId);
                    if (s) s.value = sliderVal;
                    if (v) v.textContent = displayText;
                };
                setSliderUI('feedback-slider', 'feedback-value', Math.round(randFeedback * 100), Math.round(randFeedback * 100) + '%');
                setSliderUI('zoom-slider', 'zoom-value', Math.round(randZoom * 100), randZoom.toFixed(2));
                setSliderUI('rotation-slider', 'rotation-value', Math.round(randRotation * 180 / Math.PI), Math.round(randRotation * 180 / Math.PI) + '°');
                setSliderUI('offsetx-slider', 'offsetx-value', Math.round(randOffsetX * 100), randOffsetX.toFixed(2));
                setSliderUI('offsety-slider', 'offsety-value', Math.round(randOffsetY * 100), randOffsetY.toFixed(2));
                setSliderUI('spin-slider', 'spin-value', Math.round(randSpin * 100), randSpin.toFixed(2));
                setSliderUI('hue-slider', 'hue-value', randHue, randHue + '°');
            })();

            console.log('[Visuals] Random init:', randShader, '| hue', randHue + '°', '| zoom', randZoom.toFixed(2), '| spin', randSpin.toFixed(2));

            // Note: DOM-to-texture capture was removed. The new layer mix system
            // uses pure CSS (filter, mix-blend-mode, transform, opacity) which is
            // far more reliable across browsers and works with iframes/external
            // resources without taint issues.

            // ===== Hook up controls =====
            document.querySelectorAll('.shader-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.shader-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    controlState.shader = btn.dataset.shader;
                });
            });

            const bind = (id, valId, fn, fmt) => {
                const el = document.getElementById(id);
                const valEl = document.getElementById(valId);
                if (!el) return;
                el.addEventListener('input', (e) => {
                    fn(+e.target.value);
                    if (valEl) valEl.textContent = fmt(+e.target.value);
                });
            };
            bind('feedback-slider', 'feedback-value', v => controlState.feedback = v/100, v => v + '%');
            bind('zoom-slider', 'zoom-value', v => controlState.zoom = v/100, v => (v/100).toFixed(2));
            bind('rotation-slider', 'rotation-value', v => controlState.rotation = v * Math.PI / 180, v => v + '°');
            bind('offsetx-slider', 'offsetx-value', v => controlState.offsetX = v/100, v => (v/100).toFixed(2));
            bind('offsety-slider', 'offsety-value', v => controlState.offsetY = v/100, v => (v/100).toFixed(2));
            bind('spin-slider', 'spin-value', v => controlState.spinRate = v/100, v => (v/100).toFixed(2));
            bind('hue-slider', 'hue-value', v => controlState.hue = v, v => v + '°');
            bind('audio-react-slider', 'audio-react-value', v => controlState.audioReact = v/100, v => v + '%');
            bind('camera-mix-slider', 'camera-mix-value', v => controlState.cameraMix = v/100, v => v + '%');

            // ===== LAYER MIX (CSS-based, works reliably without DOM capture) =====
            // Get references to the page wrapper and canvas for direct CSS manipulation
            const pageWrapper = document.getElementById('content-wrapper');
            const visualCanvas = document.getElementById('visual-canvas');

            // Layer state — applied to CSS every frame for smooth audio-reactive effects
            const layerState = {
                pageOpacity: 1.0,
                visualsOpacity: 0.6,
                blendMode: 'screen',
                pageHue: 0,           // degrees
                pageInvert: 0,        // 0..1
                pageSat: 1.0,         // 0..3
                pageContrast: 1.0,    // 0..3
                pageBlur: 0,          // px
                pageDisplace: 0,      // 0..1, audio-reactive translate
                pageScale: 0,         // 0..1, bass-reactive scale
            };

            // Initial canvas blend mode
            if (visualCanvas) visualCanvas.style.mixBlendMode = layerState.blendMode;
            if (visualCanvas) visualCanvas.style.opacity = layerState.visualsOpacity;

            // Apply CSS filter & transform to the page wrapper
            // Audio-reactive effects update every frame via the render loop
            function applyLayerCSS(audioLvl, bassLvl) {
                if (!pageWrapper) return;
                
                // Build CSS filter string
                let filter = '';
                if (layerState.pageHue) filter += `hue-rotate(${layerState.pageHue}deg) `;
                if (layerState.pageInvert > 0.001) filter += `invert(${layerState.pageInvert}) `;
                if (Math.abs(layerState.pageSat - 1.0) > 0.001) filter += `saturate(${layerState.pageSat}) `;
                if (Math.abs(layerState.pageContrast - 1.0) > 0.001) filter += `contrast(${layerState.pageContrast}) `;
                if (layerState.pageBlur > 0) filter += `blur(${layerState.pageBlur}px) `;
                pageWrapper.style.filter = filter || 'none';
                
                // Audio-reactive transform (displace + scale)
                // Even with no audio, provide a baseline oscillation so the slider
                // visibly does something. Audio just adds extra intensity on top.
                let transform = '';
                if (layerState.pageDisplace > 0.001) {
                    const t = performance.now();
                    // Baseline always present — gives 0..1 range continuous wobble
                    const baselineX = Math.sin(t * 0.0021);
                    const baselineY = Math.cos(t * 0.0017);
                    // Audio multiplier: 1.0 base + extra from audio
                    const intensity = 1.0 + audioLvl * 2.0;
                    const range = layerState.pageDisplace * 60; // up to 60px
                    const dx = baselineX * intensity * range;
                    const dy = baselineY * intensity * range;
                    transform += `translate(${dx}px, ${dy}px) `;
                }
                if (layerState.pageScale > 0.001) {
                    // Baseline pulse + bass-driven extra
                    const t = performance.now();
                    const baseline = 1.0 + Math.sin(t * 0.004) * 0.04;
                    const bassExtra = bassLvl * layerState.pageScale * 0.3;
                    const s = baseline + bassExtra * layerState.pageScale;
                    transform += `scale(${s}) `;
                }
                pageWrapper.style.transform = transform || '';
                
                // Page opacity is set directly (not in render loop, so no flicker)
                pageWrapper.style.opacity = layerState.pageOpacity;
            }

            // Wire the layer mix sliders
            const layerBindings = [
                ['page-opacity-slider', 'page-opacity-value', v => { layerState.pageOpacity = v/100; }, v => v + '%'],
                ['visuals-opacity-slider', 'visuals-opacity-value', v => {
                    layerState.visualsOpacity = v/100;
                    if (visualCanvas && controlState.enabled) visualCanvas.style.opacity = v/100;
                }, v => v + '%'],
                ['page-hue-slider', 'page-hue-value', v => { layerState.pageHue = v; }, v => v + '°'],
                ['page-invert-slider', 'page-invert-value', v => { layerState.pageInvert = v/100; }, v => v + '%'],
                ['page-sat-slider', 'page-sat-value', v => { layerState.pageSat = v/100; }, v => v + '%'],
                ['page-contrast-slider', 'page-contrast-value', v => { layerState.pageContrast = v/100; }, v => v + '%'],
                ['page-blur-slider', 'page-blur-value', v => { layerState.pageBlur = v; }, v => v + 'px'],
                ['page-displace-slider', 'page-displace-value', v => { layerState.pageDisplace = v/100; }, v => v + '%'],
                ['page-scale-slider', 'page-scale-value', v => { layerState.pageScale = v/100; }, v => v + '%'],
            ];
            layerBindings.forEach(([id, valId, fn, fmt]) => bind(id, valId, fn, fmt));

            // Blend mode dropdown
            const blendSel = document.getElementById('canvas-blend-mode');
            if (blendSel) {
                blendSel.value = layerState.blendMode;
                blendSel.addEventListener('change', e => {
                    layerState.blendMode = e.target.value;
                    if (visualCanvas) visualCanvas.style.mixBlendMode = e.target.value;
                });
            }

            // Reset button
            const resetBtn = document.getElementById('reset-layer-btn');
            if (resetBtn) resetBtn.addEventListener('click', () => {
                layerState.pageOpacity = 1.0;
                layerState.visualsOpacity = 0.6;
                layerState.blendMode = 'screen';
                layerState.pageHue = 0;
                layerState.pageInvert = 0;
                layerState.pageSat = 1.0;
                layerState.pageContrast = 1.0;
                layerState.pageBlur = 0;
                layerState.pageDisplace = 0;
                layerState.pageScale = 0;
                
                // Reset slider UI
                const setSlider = (id, val, fmt) => {
                    const el = document.getElementById(id);
                    const valEl = document.getElementById(id.replace('-slider', '-value'));
                    if (el) el.value = val;
                    if (valEl) valEl.textContent = fmt;
                };
                setSlider('page-opacity-slider', 100, '100%');
                setSlider('visuals-opacity-slider', 60, '60%');
                setSlider('page-hue-slider', 0, '0°');
                setSlider('page-invert-slider', 0, '0%');
                setSlider('page-sat-slider', 100, '100%');
                setSlider('page-contrast-slider', 100, '100%');
                setSlider('page-blur-slider', 0, '0px');
                setSlider('page-displace-slider', 0, '0%');
                setSlider('page-scale-slider', 0, '0%');
                if (blendSel) blendSel.value = 'screen';
                
                // Apply
                if (visualCanvas) {
                    visualCanvas.style.mixBlendMode = 'screen';
                    visualCanvas.style.opacity = 0.6;
                }
                if (pageWrapper) {
                    pageWrapper.style.filter = 'none';
                    pageWrapper.style.transform = '';
                    pageWrapper.style.opacity = '1';
                }
            });

            // Canvas on/off
            const toggleBtn = document.getElementById('canvas-toggle');
            if (toggleBtn) toggleBtn.addEventListener('click', function() {
                controlState.enabled = !controlState.enabled;
                canvas.style.opacity = controlState.enabled ? '' : '0';
                this.classList.toggle('active');
                this.textContent = controlState.enabled ? 'Disable Visuals' : 'Enable Visuals';
            });

            // ===== Camera =====
            const camVideo = document.getElementById('camera-feed');
            const cameraToggleBtn = document.getElementById('camera-toggle');
            let cameraStream = null;

            async function startCamera() {
                // Check if mediaDevices is available — requires HTTPS or localhost
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    const isInsecure = location.protocol === 'http:' &&
                                       location.hostname !== 'localhost' &&
                                       location.hostname !== '127.0.0.1';
                    if (isInsecure) {
                        alert(
                            'Camera requires a secure connection (HTTPS).\n\n' +
                            'This page is loaded over HTTP, so the browser blocks camera access.\n\n' +
                            'Try opening the site at https://' + location.host + location.pathname + ' instead.'
                        );
                    } else {
                        alert('Camera is not supported in this browser.');
                    }
                    return;
                }
                try {
                    cameraStream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: 'user', width: 640, height: 480 },
                        audio: false
                    });
                    camVideo.srcObject = cameraStream;
                    await camVideo.play();
                    controlState.cameraEnabled = true;
                    cameraToggleBtn.textContent = 'Disable Camera';
                    cameraToggleBtn.classList.add('active');
                    // Auto-set camera mix to 50% if it was 0
                    if (controlState.cameraMix < 0.05) {
                        controlState.cameraMix = 0.5;
                        const sl = document.getElementById('camera-mix-slider');
                        const vl = document.getElementById('camera-mix-value');
                        if (sl) sl.value = 50;
                        if (vl) vl.textContent = '50%';
                    }
                    console.log('[Visuals] Camera started');
                } catch (e) {
                    console.error('[Visuals] Camera failed:', e);
                    let msg = 'Could not start camera.';
                    if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
                        msg = 'Camera permission was denied.\n\nClick the lock/info icon in your browser address bar and allow camera access for this site, then try again.';
                    } else if (e.name === 'NotFoundError') {
                        msg = 'No camera found on this device.';
                    } else if (e.name === 'NotReadableError') {
                        msg = 'The camera is in use by another application.';
                    } else if (e.message) {
                        msg = 'Could not access camera:\n' + e.message;
                    }
                    alert(msg);
                }
            }

            function stopCamera() {
                if (cameraStream) {
                    cameraStream.getTracks().forEach(t => t.stop());
                    cameraStream = null;
                }
                camVideo.srcObject = null;
                controlState.cameraEnabled = false;
                cameraToggleBtn.textContent = 'Enable Camera';
                cameraToggleBtn.classList.remove('active');
            }

            if (cameraToggleBtn) cameraToggleBtn.addEventListener('click', () => {
                if (controlState.cameraEnabled) stopCamera();
                else startCamera();
            });

            // Smoothed audio levels
            let smoothedBass = 0, smoothedAudio = 0;
            function getAudioLevels() {
                let bass = 0, mid = 0, high = 0;
                const fd = audioData.freq;
                for (let i = 0; i < 8; i++) bass += fd[i];
                for (let i = 8; i < 64; i++) mid += fd[i];
                for (let i = 64; i < 128; i++) high += fd[i];
                const bassRaw = (bass / 8 / 255) * controlState.audioReact;
                const audioRaw = ((mid + high) / 112 / 255) * controlState.audioReact;
                smoothedBass = smoothedBass * 0.6 + bassRaw * 0.4;
                smoothedAudio = smoothedAudio * 0.6 + audioRaw * 0.4;
                return { bass: smoothedBass, audio: smoothedAudio };
            }

            // ===== Render loop =====
            let currentTex = 1;
            const startTime = Date.now();
            let frameCount = 0;
            let lastFpsCheck = Date.now();
            let autoSpin = 0;

            function render() {
                requestAnimationFrame(render);
                if (!controlState.enabled) return;
                // The Stack covers the page; nothing behind it needs drawing.
                if (document.body.classList.contains('lucid-stack-open')) return;

                const time = (Date.now() - startTime) / 1000;
                const dt = 1/60;
                autoSpin += controlState.spinRate * dt;

                const { bass, audio } = getAudioLevels();
                const baseLevel = 0.15;
                const audioLevel = Math.max(audio, baseLevel);
                const bassLevel = Math.max(bass, baseLevel * 0.5);

                // Apply CSS-based layer mixing every frame (cheap)
                applyLayerCSS(audioLevel, bassLevel);

                const program = programs[controlState.shader];
                if (!program) return;
                const u = uniformCache[controlState.shader];

                // Update camera texture if enabled
                if (controlState.cameraEnabled && camVideo.readyState >= 2) {
                    gl.bindTexture(gl.TEXTURE_2D, cameraTex);
                    try {
                        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, camVideo);
                    } catch (e) { /* video not ready */ }
                }

                // PASS 1: Render shader to off-screen FB
                const targetFb = currentTex === 1 ? fb1 : fb2;
                const prevTex = currentTex === 1 ? tex2 : tex1;
                gl.bindFramebuffer(gl.FRAMEBUFFER, targetFb);
                gl.viewport(0, 0, fbWidth, fbHeight);

                gl.useProgram(program);
                gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
                gl.enableVertexAttribArray(u.posLoc);
                gl.vertexAttribPointer(u.posLoc, 2, gl.FLOAT, false, 0, 0);

                gl.uniform2f(u.resolution, fbWidth, fbHeight);
                gl.uniform1f(u.time, time);
                gl.uniform1f(u.feedback, controlState.feedback);
                gl.uniform1f(u.zoom, controlState.zoom);
                gl.uniform1f(u.rotation, controlState.rotation + autoSpin);
                gl.uniform1f(u.offsetX, controlState.offsetX);
                gl.uniform1f(u.offsetY, controlState.offsetY);
                gl.uniform1f(u.hue, controlState.hue);
                gl.uniform1f(u.audioLevel, audioLevel);
                gl.uniform1f(u.bassLevel, bassLevel);
                gl.uniform1f(u.useCamera, controlState.cameraEnabled ? controlState.cameraMix : 0);

                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, prevTex);
                gl.uniform1i(u.prevFrame, 0);

                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, cameraTex);
                gl.uniform1i(u.camera, 1);

                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

                // PASS 2: Composite + display to screen
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                gl.viewport(0, 0, canvas.width, canvas.height);
                gl.clearColor(0, 0, 0, 1);
                gl.clear(gl.COLOR_BUFFER_BIT);

                gl.useProgram(displayProgram);
                gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
                gl.enableVertexAttribArray(displayPosLoc);
                gl.vertexAttribPointer(displayPosLoc, 2, gl.FLOAT, false, 0, 0);

                // Visual texture -> unit 0
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, currentTex === 1 ? tex1 : tex2);
                gl.uniform1i(displayUniforms.tex, 0);

                // Page texture -> unit 1
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, pageTex);
                gl.uniform1i(displayUniforms.pageTex, 1);

                // Compositor uniforms — pageMix forced to 0 since DOM capture
                // was replaced by CSS-based mixing (which doesn't go through the shader)
                gl.uniform1f(displayUniforms.pageMix, 0);
                gl.uniform1f(displayUniforms.blendMode, 0);
                gl.uniform1f(displayUniforms.displaceAmt, 0);
                gl.uniform1f(displayUniforms.lumakey, 0);
                gl.uniform1f(displayUniforms.chromakey, 0);
                gl.uniform3f(displayUniforms.chromakeyColor, 0, 0, 0);
                gl.uniform1f(displayUniforms.layerHue, 0);
                gl.uniform1f(displayUniforms.layerInvert, 0);
                gl.uniform1f(displayUniforms.audioLevel, audioLevel);

                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

                currentTex = currentTex === 1 ? 2 : 1;

                frameCount++;
                if (Date.now() - lastFpsCheck > 5000) {
                    const fps = frameCount / 5;
                    const audioActive = (Date.now() - audioData.lastReceived) < 500;
                    console.log(`[Visuals] FPS: ${fps.toFixed(0)} | Audio: ${audioActive ? 'YES' : 'no'} | Shader: ${controlState.shader} | Camera: ${controlState.cameraEnabled ? 'on' : 'off'}`);
                    frameCount = 0;
                    lastFpsCheck = Date.now();
                }
            }

            render();
            console.log('[Visuals] Render loop started');
        })();
    
