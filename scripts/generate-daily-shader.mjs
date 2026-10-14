// Generates one original Shadertoy-format GLSL shader and appends it to
// shaders/manifest.json. Exits non-zero rather than committing a bad drop.
//
//   ANTHROPIC_API_KEY=...  node scripts/generate-daily-shader.mjs
//
// Options:
//   --force          generate even if today already has an entry
//   --date=<ISO>     write under a specific date instead of today (UTC)
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import fs from 'node:fs';
import path from 'node:path';
import {
  staticChecks, compileCheck, desktopCompileCheck, readManifest, writeManifest,
} from './shader-validate.mjs';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
const MAX_ATTEMPTS = 3;

const args = process.argv.slice(2);
const force = args.includes('--force');
const dateArg = (args.find(a => a.startsWith('--date=')) || '').slice(7);
const today = dateArg || new Date().toISOString().slice(0, 10);

const ShaderSchema = z.object({
  name: z.string(),
  description: z.string(),
  useCase: z.string(),
  glsl: z.string(),
});

// Mandelbulber formula ports, handed to the model as reference so 3D fractal
// drops use correct distance estimators instead of improvised ones. Stable
// content, and it sits at the front of the system prompt, so it caches.
const FORMULA_REFERENCE = fs.readFileSync(
  path.join('shaders', 'formulas', 'mandelbulber.glsl'), 'utf8');

const SYSTEM = `You are a GLSL shader artist working in the house style of LucidSoup,
a projection-mapping and live-visuals practice. You write original, technically
correct fragment shaders and nothing else.

OUTPUT CONTRACT — the shader must compile as WebGL1 / GLSL ES 1.0:
- Define exactly one entry point: void mainImage(out vec4 fragColor, in vec2 fragCoord).
- The only uniforms available are iResolution (vec3), iTime (float) and iMouse (vec4).
  Do not rely on iMouse; the previews never move it.
- No #version directive, no layout() qualifiers, no top-level "out" variables,
  no iChannel textures, no texture lookups of any kind.
- No dFdx/dFdy/fwidth: derivatives need an extension that is not guaranteed.
- Loops must have constant bounds (for (int i = 0; i < 8; i++)). No dynamic array
  indexing. Declare every function before it is used.
- Integer and float types do not mix implicitly: write 1.0, not 1, for floats.
- It must ALSO compile as desktop GLSL 4.60 (TouchDesigner) and 3.30 (Synesthesia),
  where the shader is wrapped with #define iTime / iResolution / iMouse. So: do not
  name anything PI (Synesthesia defines it), and do not use identifiers that are
  reserved in desktop GLSL, such as sample, input, output, filter, common, patch,
  buffer, shared, active, resource or partition.
- Keep it cheap enough to run several previews at once at 480x360.

HOUSE STYLE:
- Near-black background with vivid neon accents. The palette is magenta #ff10f0,
  cyan #00ffff and acid green #39ff14. Bright detail should be sparse and glowing,
  never a full-frame wash of colour.
- Sacred geometry and psychedelic motifs: mandalas, flower of life, Metatron's cube,
  yantras, spirals, tunnels, kaleidoscopic folds, moire interference, metaballs,
  raymarched lattices, particle fields, and the 3D escape-time and folding
  fractals in the reference below.
- Animation driven by iTime, smooth and ideally seamless; nothing strobing or
  epilepsy-inducing.
- Tone-map at the end (col = col / (1.0 + col) or similar) so highlights roll off
  instead of clipping to white.

Comment the shader briefly: a header line naming the piece and its technique, plus
short comments on any non-obvious maths.

IF YOU RAYMARCH A 3D FRACTAL, take the distance estimator from the reference
below rather than writing one from memory — these are ports of Mandelbulber v2
formulas and the estimators are correct. Copy what you need into the shader so it
stays self-contained. Four things decide whether the result is watchable:
- Keep the camera outside the structure. A Mandelbulb needs roughly 2.4 units of
  distance, a Mandelbox at negative scale roughly 6, a Menger sponge roughly 2.5.
  Too close and the fractal fills the frame as an undifferentiated wash.
- Match the subdivision depth to what a 480x360 preview resolves. Detail finer
  than a pixel does not read as detail, it reads as aliasing speckle. Three
  levels of Menger, eight bulb iterations.
- Vary hue *smoothly* across the surface — drive it from radius, surface normal
  or depth. Driving it hard from orbit traps varies it per pixel instead, and
  shading averages that straight back to grey.
- Keep the key, fill and rim hues within about 0.2 of each other on the ramp.
  Spread them a third apart and the three sum to white and wash the colour out.

=== MANDELBULBER FORMULA REFERENCE (shaders/formulas/mandelbulber.glsl) ===
${FORMULA_REFERENCE}
=== END REFERENCE ===`;

function buildPrompt(recent) {
  const seen = recent.length
    ? `Recent drops, newest first — pick a clearly different technique and colour mood:\n` +
      recent.map(s => `- ${s.name}: ${s.description}`).join('\n')
    : 'This is the first shader in the library.';

  return `Write today's shader for the LucidSoup daily shader library.

${seen}

Vary the technique day to day across raymarched sacred geometry, feedback and
trail effects, kaleidoscopic tunnels, plasma and moire interference, particle
fields, metaballs, and the Mandelbulber 3D fractals in the reference — and vary
which of the three neon accents leads. Do not run two 3D fractals in a row.

Return:
- name: a short evocative title, two or three words.
- description: two or three sentences on what it looks like and the technique
  behind it. Written for a VJ browsing a shader library, not a tutorial.
- useCase: one sentence on where this shader earns its place in a set.
- glsl: the complete shader source.`;
}

async function generate(client, prompt, priorFailure) {
  const messages = [{ role: 'user', content: prompt }];
  if (priorFailure) {
    messages.push(
      { role: 'assistant', content: priorFailure.glsl },
      { role: 'user', content:
        `That shader was rejected: ${priorFailure.reason}\n\n` +
        `Fix it and return the corrected shader in the same format. ` +
        `Re-read the output contract before you answer.` },
    );
  }
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    messages,
    output_config: { format: zodOutputFormat(ShaderSchema), effort: 'high' },
  });
  if (response.stop_reason === 'refusal') {
    throw new Error('the model declined this request: ' +
      (response.stop_details?.explanation || 'no explanation given'));
  }
  if (!response.parsed_output) {
    throw new Error('the model returned no parseable structured output');
  }
  return response.parsed_output;
}

function slugify(name) {
  return String(name).toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'untitled';
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set.');
    process.exit(1);
  }

  const manifest = readManifest();
  const shaders = manifest.shaders;

  if (!force && shaders.some(s => s.date === today)) {
    console.log(`An entry for ${today} already exists — nothing to do. ` +
                `Pass --force to generate another.`);
    return;
  }

  const recent = shaders.slice(-14).reverse()
    .map(s => ({ name: s.name, description: s.description }));
  const takenNames = new Set(shaders.map(s => String(s.name).toLowerCase()));
  const prompt = buildPrompt(recent);

  const client = new Anthropic();
  let priorFailure = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`Attempt ${attempt} of ${MAX_ATTEMPTS} (${MODEL})…`);
    const draft = await generate(client, prompt, priorFailure);

    const entry = {
      id: `${today}-${slugify(draft.name)}`,
      date: today,
      name: draft.name.trim(),
      description: draft.description.trim(),
      useCase: draft.useCase.trim(),
      glsl: draft.glsl.trim(),
    };

    const problems = staticChecks(entry);
    if (takenNames.has(entry.name.toLowerCase())) {
      problems.push(`the name "${entry.name}" is already used in the library`);
    }
    if (shaders.some(s => s.id === entry.id)) {
      problems.push(`the id "${entry.id}" is already used in the library`);
    }

    if (problems.length === 0) {
      const [result] = await compileCheck([entry]);
      if (!result.ok) problems.push(result.error);
      else console.log(`Compiles and renders (lit ${result.litPct}%).`);
    }

    if (problems.length === 0) {
      const [desktop] = desktopCompileCheck([entry]);
      if (!desktop.ok) problems.push(desktop.error);
      else if (!desktop.skipped) console.log('Compiles for TouchDesigner and Synesthesia.');
    }

    if (problems.length === 0) {
      shaders.push(entry);
      writeManifest(manifest);
      console.log(`Added ${entry.id} — "${entry.name}".`);
      return;
    }

    console.warn(`Rejected: ${problems.join('; ')}`);
    priorFailure = { glsl: draft.glsl, reason: problems.join('; ') };
  }

  console.error(`Gave up after ${MAX_ATTEMPTS} attempts. The manifest is unchanged.`);
  process.exit(1);
}

main().catch(err => {
  if (err instanceof Anthropic.AuthenticationError) {
    console.error('Authentication failed — check the ANTHROPIC_API_KEY secret.');
  } else if (err instanceof Anthropic.RateLimitError) {
    console.error('Rate limited by the API; today\'s run is skipped.');
  } else if (err instanceof Anthropic.APIError) {
    console.error(`API error ${err.status}: ${err.message}`);
  } else {
    console.error(err.stack || String(err));
  }
  process.exit(1);
});
