// Validation for library shaders: cheap static checks first, then a real
// compile in headless Chromium using the exact wrapper index.html uses.
//
// Run standalone to check every entry in the manifest:
//   node scripts/shader-validate.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const MANIFEST_PATH = path.join('shaders', 'manifest.json');

// Kept byte-identical to the wrapper in index.html. If one changes, change both.
export const PRELUDE = [
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

export const EPILOGUE = '\nvoid main(){\n' +
  '    vec4 lucidOut = vec4(0.0, 0.0, 0.0, 1.0);\n' +
  '    mainImage(lucidOut, gl_FragCoord.xy);\n' +
  '    gl_FragColor = vec4(lucidOut.rgb, 1.0);\n}\n';

// TouchDesigner's GLSL TOP compiles desktop GLSL 4.60 and has no Shadertoy
// globals, so library sources get wrapped before they are copied out.
// Kept byte-identical to tdSource() in index.html. If one changes, change both.
export function tdSource(name, glsl) {
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

// Synesthesia scenes are a .synScene folder holding main.glsl and scene.json.
// main.glsl returns the pixel colour from renderMain(); Synesthesia provides
// TIME, RENDERSIZE, _xy and _mouse. Kept byte-identical to synMainGlsl() and
// synSceneJson() in index.html. If one changes, change both.
export function synMainGlsl(name, glsl) {
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

export function synSceneJson(entry) {
  return JSON.stringify({
    TITLE: String(entry.name || 'LucidSoup shader'),
    CREDIT: 'LucidSoup',
    DESCRIPTION: String(entry.description || ''),
    IMAGE_PATH: 'thumbnail.png',
    WIDTH: 1280,
    HEIGHT: 720
  }, null, 2) + '\n';
}

// What each host puts around the shader, reduced to the parts the wrappers
// rely on, so glslangValidator can compile them as desktop GLSL.
const HOSTS = [
  {
    label: 'TouchDesigner (desktop GLSL 4.60)',
    build: e => '#version 460\n' +
      'uniform struct TDTexInfo { vec4 res; vec4 depth; } uTDOutputInfo;\n' +
      'vec4 TDOutputSwizzle(vec4 c){ return c; }\n' +
      tdSource(e.name, e.glsl),
  },
  {
    label: 'Synesthesia (desktop GLSL 3.30)',
    build: e => '#version 330\n' +
      'uniform vec2 RENDERSIZE;\nuniform float TIME;\nuniform vec4 _mouse;\n' +
      'const float PI = 3.141592653589793;\nvec2 _xy;\n' +
      synMainGlsl(e.name, e.glsl) +
      'out vec4 synOut;\nvoid main(){ _xy = gl_FragCoord.xy; synOut = renderMain(); }\n',
  },
];

/**
 * Compile each shader the way TouchDesigner and Synesthesia would, via
 * glslangValidator. Returns [{ id, ok, error?, skipped? }].
 */
export function desktopCompileCheck(entries) {
  const probe = spawnSync('glslangValidator', ['--version'], { encoding: 'utf8' });
  if (probe.error) {
    return entries.map(e => ({ id: e.id, ok: true, skipped: true }));
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-glsl-'));
  try {
    return entries.map(entry => {
      const errors = [];
      for (const host of HOSTS) {
        const file = path.join(dir, 'shader.frag');
        fs.writeFileSync(file, host.build(entry));
        const r = spawnSync('glslangValidator', [file], { encoding: 'utf8' });
        if (r.status === 0) continue;
        const lines = (r.stdout + r.stderr).split('\n')
          .filter(l => /ERROR/.test(l) && !/compilation errors|compilation terminated/.test(l))
          .map(l => l.replace(file, '').trim());
        errors.push(host.label + ' compile: ' + lines.slice(0, 5).join(' | '));
      }
      return errors.length ? { id: entry.id, ok: false, error: errors.join('; ') } : { id: entry.id, ok: true };
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const BANNED = [
  [/#version/, 'contains a #version directive (the page compiles as GLSL ES 1.0)'],
  [/(?:\bconst\s+float|#define)\s+PI\b/, 'defines PI, which Synesthesia already provides (use another name)'],
  [/\biChannel\d?\b/, 'references iChannel* textures, which the page does not provide'],
  [/\biAudio|iMicrophone\b/, 'references audio inputs, which the page does not provide'],
  [/\blayout\s*\(/, 'uses layout() qualifiers, which are GLSL ES 3.0 only'],
  [/^\s*out\s+vec4\s/m, 'declares a top-level out variable, which is GLSL ES 3.0 only'],
  [/\btextureLod\s*\(/, 'uses textureLod(), which is not core GLSL ES 1.0'],
  [/\bdFdx\s*\(|\bdFdy\s*\(|\bfwidth\s*\(/,
    'uses derivative functions, which need an extension that is not guaranteed'],
];

/** Cheap checks that need no browser. Returns an array of problem strings. */
export function staticChecks(entry) {
  const problems = [];
  const need = (field, min, max) => {
    const v = entry[field];
    if (typeof v !== 'string' || v.trim().length < min) {
      problems.push(`${field} is missing or shorter than ${min} characters`);
    } else if (v.length > max) {
      problems.push(`${field} is longer than ${max} characters`);
    }
  };
  need('name', 3, 60);
  need('description', 40, 600);
  need('useCase', 10, 300);

  const glsl = entry.glsl;
  if (typeof glsl !== 'string' || glsl.length < 200) {
    problems.push('glsl is missing or implausibly short');
    return problems;
  }
  if (glsl.length > 20000) problems.push('glsl is longer than 20000 characters');
  if (!/void\s+mainImage\s*\(/.test(glsl)) {
    problems.push('glsl has no mainImage(out vec4, in vec2) entry point');
  }
  for (const [re, why] of BANNED) {
    if (re.test(glsl)) problems.push('glsl ' + why);
  }
  return problems;
}

/**
 * Compile and render each shader in a real WebGL context.
 * Returns [{ id, ok, error?, litPct }] in the order given.
 */
export async function compileCheck(entries) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage();
    await page.goto('about:blank');
    return await page.evaluate(({ entries, PRELUDE, EPILOGUE }) => {
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 240;
      const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
      if (!gl) return entries.map(e => ({ id: e.id, ok: false, error: 'no WebGL context' }));

      const vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, 'attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }');
      gl.compileShader(vs);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);

      return entries.map(entry => {
        const frag = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(frag, PRELUDE + entry.glsl + EPILOGUE);
        gl.compileShader(frag);
        if (!gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
          return { id: entry.id, ok: false,
                   error: 'compile: ' + (gl.getShaderInfoLog(frag) || '').trim() };
        }
        const prog = gl.createProgram();
        gl.attachShader(prog, vs); gl.attachShader(prog, frag);
        gl.bindAttribLocation(prog, 0, 'aPos');
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
          return { id: entry.id, ok: false,
                   error: 'link: ' + (gl.getProgramInfoLog(prog) || '').trim() };
        }

        // Render two frames and confirm the shader actually draws something that
        // moves — a shader that compiles but renders black is still a bad drop.
        const sample = (t) => {
          gl.useProgram(prog);
          gl.enableVertexAttribArray(0);
          gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
          gl.uniform3f(gl.getUniformLocation(prog, 'iResolution'), 320, 240, 1);
          gl.uniform1f(gl.getUniformLocation(prog, 'iTime'), t);
          gl.uniform4f(gl.getUniformLocation(prog, 'iMouse'), 0, 0, 0, 0);
          gl.viewport(0, 0, 320, 240);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          const px = new Uint8Array(320 * 240 * 4);
          gl.readPixels(0, 0, 320, 240, gl.RGBA, gl.UNSIGNED_BYTE, px);
          return px;
        };
        const a = sample(4.0), b = sample(11.5);
        let lit = 0, moved = 0;
        for (let i = 0; i < a.length; i += 4) {
          if (Math.max(a[i], a[i+1], a[i+2]) > 12) lit++;
          if (Math.abs(a[i] - b[i]) > 6 || Math.abs(a[i+1] - b[i+1]) > 6) moved++;
        }
        const n = a.length / 4;
        const litPct = 100 * lit / n, movedPct = 100 * moved / n;
        if (litPct < 1.0) {
          return { id: entry.id, ok: false, litPct,
                   error: 'renders an essentially black frame' };
        }
        if (litPct > 99.0) {
          return { id: entry.id, ok: false, litPct,
                   error: 'renders an almost fully lit frame (no dark background)' };
        }
        if (movedPct < 1.0) {
          return { id: entry.id, ok: false, litPct,
                   error: 'does not animate between t=4.0 and t=11.5' };
        }
        return { id: entry.id, ok: true, litPct: +litPct.toFixed(1) };
      });
    }, { entries: entries.map(e => ({ id: e.id, glsl: e.glsl })), PRELUDE, EPILOGUE });
  } finally {
    await browser.close();
  }
}

export function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return { shaders: [] };
  const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  if (!parsed || !Array.isArray(parsed.shaders)) {
    throw new Error(`${MANIFEST_PATH} has no "shaders" array`);
  }
  return parsed;
}

export function writeManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
}

// CLI: validate every entry currently in the manifest.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { shaders } = readManifest();
  let bad = 0;
  for (const entry of shaders) {
    const problems = staticChecks(entry);
    if (problems.length) { bad++; console.error(`✗ ${entry.id}: ${problems.join('; ')}`); }
  }
  const results = await compileCheck(shaders);
  for (const r of results) {
    if (r.ok) console.log(`✓ ${r.id} (lit ${r.litPct}%)`);
    else { bad++; console.error(`✗ ${r.id}: ${r.error}`); }
  }
  const desktop = desktopCompileCheck(shaders);
  if (desktop.some(r => r.skipped)) {
    console.warn('! glslangValidator not found; skipped the TouchDesigner/Synesthesia compile check.');
  } else {
    for (const r of desktop) {
      if (r.ok) console.log(`✓ ${r.id} compiles for TouchDesigner and Synesthesia`);
      else { bad++; console.error(`✗ ${r.id}: ${r.error}`); }
    }
  }
  console.log(`\n${shaders.length} shader(s) checked, ${bad} problem(s).`);
  process.exit(bad ? 1 : 0);
}
