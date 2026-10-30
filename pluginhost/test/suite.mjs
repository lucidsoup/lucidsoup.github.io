// Proves the host against two plugins written to be measured rather than heard.
// Both compute the same thing —
//
//     out = in[n - 64] * gain + offset
//
// — and both declare those 64 frames of latency, one through CLAP's
// clap.latency and one through VST3's getLatencySamples(). So a correct host
// gives back the input bit for bit at unity gain. An off-by-one in the delay
// compensation, a planar/interleaved mix-up, or a parameter that never reached
// the plugin all turn that into a visible failure rather than something that
// merely sounds plausible.
//
// The same block of checks runs against both formats, because the whole point
// of the backend split is that a plugin's format stops mattering the moment it
// is loaded. VST3 appears twice: once as a single object that is its own edit
// controller, and once as a component that names a SEPARATE controller class,
// which is how most commercial plugins are built and the path a host is
// likelier to get wrong.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOST = join(HERE, "..", "pluginhost");
const PORT = Number(process.env.PORT || 7791);
const TOKEN = "testtoken00000000000000000000000000000000000000";
const BASE = `http://127.0.0.1:${PORT}`;
const MAGIC = 0x3148504c;

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
   if (cond) { pass++; console.log(`  ok   ${name}`); }
   else { fail++; console.log(`  FAIL ${name}${extra ? "  — " + extra : ""}`); }
};

// --- the binary render request, as host.c documents it
function buildRender({ id, rate = 48000, channels = 2, frames, params = [], notes = [], input = null }) {
   const idBytes = Buffer.from(id, "utf8");
   const idPad = (idBytes.length + 3) & ~3;  // keep the tail 4-byte aligned
   const audio = channels * frames * 4;
   const size = 28 + idPad + params.length * 12 + notes.length * 20 + audio;
   const buf = Buffer.alloc(size);
   const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
   dv.setUint32(0, MAGIC, true);
   dv.setUint32(4, rate, true);
   dv.setUint32(8, channels, true);
   dv.setUint32(12, frames, true);
   dv.setUint32(16, params.length, true);
   dv.setUint32(20, notes.length, true);
   dv.setUint32(24, idBytes.length, true);
   let at = 28;
   idBytes.copy(buf, at); at += idPad;
   for (const p of params) { dv.setUint32(at, p.id, true); dv.setFloat64(at + 4, p.value, true); at += 12; }
   for (const n of notes) {
      dv.setUint32(at, n.start, true); dv.setUint32(at + 4, n.length, true);
      dv.setInt16(at + 8, n.key, true); dv.setInt16(at + 10, n.channel ?? 0, true);
      dv.setFloat64(at + 12, n.velocity ?? 0.8, true); at += 20;
   }
   if (input) for (let c = 0; c < channels; c++)
      for (let i = 0; i < frames; i++) dv.setFloat32(at + (c * frames + i) * 4, input[c][i], true);
   return buf;
}

function parseRender(ab) {
   const dv = new DataView(ab);
   if (dv.getUint32(0, true) !== MAGIC) throw new Error("bad reply magic");
   const channels = dv.getUint32(4, true), frames = dv.getUint32(8, true), status = dv.getUint32(12, true);
   const out = [];
   for (let c = 0; c < channels; c++) {
      const ch = new Float32Array(frames);
      for (let i = 0; i < frames; i++) ch[i] = dv.getFloat32(16 + (c * frames + i) * 4, true);
      out.push(ch);
   }
   return { channels, frames, status, out };
}

const api = (path, init = {}) =>
   fetch(BASE + path, { ...init, headers: { "x-pluginhost-token": TOKEN, ...(init.headers || {}) } });

async function render(opts) {
   const r = await api("/api/render", { method: "POST", body: buildRender(opts) });
   if (!r.ok) throw new Error(`render ${r.status}: ${await r.text()}`);
   return parseRender(await r.arrayBuffer());
}

// Values that are exactly representable in float32, so adding 0.25 or doubling
// is lossless and the assertions below can demand equality rather than "close".
const EXACT = [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 0.125, -0.125, 1, -1];
const exactSignal = (n, seed = 1) => {
   const a = new Float32Array(n);
   for (let i = 0; i < n; i++) a[i] = EXACT[(i * 7 + seed * 3) % EXACT.length];
   return a;
};
const sine = (n, hz = 220, rate = 48000) => {
   const a = new Float32Array(n);
   for (let i = 0; i < n; i++) a[i] = Math.fround(0.6 * Math.sin((2 * Math.PI * hz * i) / rate));
   return a;
};
function firstDiff(a, b, tol = 0) {
   if (a.length !== b.length) return `lengths ${a.length} vs ${b.length}`;
   for (let i = 0; i < a.length; i++)
      if (Math.abs(a[i] - b[i]) > tol) return `frame ${i}: ${a[i]} vs ${b[i]}`;
   return null;
}

// ---------------------------------------------------------------------- run

const child = spawn(HOST, ["--scan", join(HERE), "--no-open", "--token", TOKEN, "--port", String(PORT)],
   { stdio: ["ignore", "pipe", "pipe"] });
let log = "";
child.stdout.on("data", (d) => (log += d));
child.stderr.on("data", (d) => (log += d));

async function waitUp(ms = 8000) {
   const until = Date.now() + ms;
   while (Date.now() < until) {
      try { if ((await api("/api/health")).ok) return true; } catch {}
      await new Promise((r) => setTimeout(r, 100));
   }
   return false;
}

// Everything a format has to satisfy once it is loaded. CLAP parameters are
// plain values and VST3 parameters are normalised, so the caller supplies the
// numbers that mean unity, double, zero, no offset and +0.25 in its own terms.
// Nothing else about the two formats may differ by the time it gets here.
async function sharedChecks(label, id, k) {
   const info = await (await api(`/api/params?id=${encodeURIComponent(id)}&rate=48000`)).json();
   ok(`${label}: two parameters`, info.params.length === 2, String(info.params.length));
   const gain = info.params.find((p) => p.name === "Gain");
   const offset = info.params.find((p) => p.name === "Offset");
   ok(`${label}: both parameters are named`, !!gain && !!offset,
      info.params.map((p) => p.name).join(","));
   if (!gain || !offset) return;
   ok(`${label}: stereo in and out reported`, info.inputChannels === 2 && info.outputChannels === 2,
      `${info.inputChannels}/${info.outputChannels}`);
   ok(`${label}: declared latency reported`, info.latency === 64, String(info.latency));
   ok(`${label}: the plugin renders its own value as text`, /\d/.test(gain.text), gain.text);
   ok(`${label}: default gain is unity`, Math.abs(gain.default - k.unity) < 1e-12,
      `${gain.default} vs ${k.unity}`);

   const N = 4096;
   const L = sine(N, 220), R = sine(N, 330);
   const unity = [{ id: gain.id, value: k.unity }, { id: offset.id, value: k.none }];

   let r = await render({ id, frames: N, channels: 2, input: [L, R], params: unity });
   ok(`${label}: render returns the right shape`, r.channels === 2 && r.frames === N,
      `${r.channels}x${r.frames}`);
   ok(`${label}: latency compensated exactly, left`, !firstDiff(r.out[0], L), firstDiff(r.out[0], L));
   ok(`${label}: latency compensated exactly, right`, !firstDiff(r.out[1], R), firstDiff(r.out[1], R));
   ok(`${label}: channels not swapped`, firstDiff(r.out[0], R) !== null);

   const E = exactSignal(N, 1), E2 = exactSignal(N, 5);
   r = await render({ id, frames: N, channels: 2, input: [E, E2],
                      params: [{ id: gain.id, value: k.double }, { id: offset.id, value: k.none }] });
   const doubled = Float32Array.from(E, (v) => Math.fround(v * 2));
   ok(`${label}: gain 2 doubles, exactly`, !firstDiff(r.out[0], doubled), firstDiff(r.out[0], doubled));

   r = await render({ id, frames: N, channels: 2, input: [E, E2],
                      params: [{ id: gain.id, value: k.unity }, { id: offset.id, value: k.quarter }] });
   const shifted = Float32Array.from(E, (v) => Math.fround(v + 0.25));
   ok(`${label}: offset adds, exactly`, !firstDiff(r.out[0], shifted), firstDiff(r.out[0], shifted));
   ok(`${label}: the offset settled during the preroll rather than gliding`,
      r.out[0][0] === shifted[0], `${r.out[0][0]} vs ${shifted[0]}`);

   r = await render({ id, frames: N, channels: 2, input: [E, E2],
                      params: [{ id: gain.id, value: k.zero }, { id: offset.id, value: k.none }] });
   ok(`${label}: gain 0 is silence`, r.out[0].every((v) => v === 0));

   r = await render({ id, frames: N, channels: 2, input: [L, R], params: unity });
   ok(`${label}: reset between renders, so no tail bleeds in`, !firstDiff(r.out[0], L),
      firstDiff(r.out[0], L));

   r = await render({ id, frames: N, channels: 1, input: [L], params: unity });
   ok(`${label}: mono in, stereo out`, r.channels === 2);
   ok(`${label}: mono was duplicated, not left half silent`, !firstDiff(r.out[1], L),
      firstDiff(r.out[1], L));

   const ODD = 1000, O = sine(ODD, 190);
   r = await render({ id, frames: ODD, channels: 1, input: [O], params: unity });
   ok(`${label}: a length that is not a whole number of blocks`,
      r.frames === ODD && !firstDiff(r.out[0], O), firstDiff(r.out[0], O));
}

try {
   if (!(await waitUp())) throw new Error("host never answered\n" + log);

   const health = await (await api("/api/health")).json();
   ok("health answers", health.ok === true && health.name === "pluginhost");
   ok("health counts what it found per format",
      typeof health.clap === "number" && typeof health.vst3 === "number",
      `clap=${health.clap} vst3=${health.vst3}`);

   const list = await (await api("/api/plugins")).json();
   const byName = (n) => list.plugins.find((p) => p.name === n);
   const clap = byName("Gainplug"), vst = byName("Gainvst"), split = byName("Gainvst Split");
   ok("the CLAP plugin was found", !!clap, list.plugins.map((p) => p.name).join(", "));
   ok("the VST3 plugin was found", !!vst);
   ok("the split-controller VST3 was found", !!split);
   ok("each plugin says which format it is",
      clap && clap.format === "clap" && vst && vst.format === "vst3");
   ok("CLAP descriptor came through", clap && clap.vendor === "lucidsoup" && clap.version === "1.0.0");
   ok("VST3 PClassInfo2 came through", vst && vst.vendor === "lucidsoup" && vst.version === "1.0.0",
      vst && `${vst.vendor}/${vst.version}`);
   ok("both formats report a kind the page understands",
      clap && clap.features.includes("audio-effect") && vst && vst.features.includes("audio-effect"),
      vst && vst.features);
   ok("VST3 subcategories are translated, not passed through raw",
      vst && vst.features.includes("Fx") && !vst.features.includes("|"), vst && vst.features);

   // CLAP parameters are plain; VST3 parameters are normalised 0..1.
   if (clap) await sharedChecks("clap", clap.id,
      { unity: 1, double: 2, zero: 0, none: 0, quarter: 0.25 });
   if (vst) await sharedChecks("vst3", vst.id,
      { unity: 0.25, double: 0.5, zero: 0, none: 0.5, quarter: 0.625 });
   if (split) await sharedChecks("vst3 split", split.id,
      { unity: 0.25, double: 0.5, zero: 0, none: 0.5, quarter: 0.625 });

   // --- switching formats must not leave the previous one holding buffers
   if (clap && vst) {
      const N = 2048, S = sine(N, 300);
      const a = await render({ id: vst.id, frames: N, channels: 1, input: [S],
                               params: [{ id: 0, value: 0.25 }, { id: 1, value: 0.5 }] });
      const b = await render({ id: clap.id, frames: N, channels: 1, input: [S],
                               params: [{ id: 0, value: 1 }, { id: 1, value: 0 }] });
      const c = await render({ id: vst.id, frames: N, channels: 1, input: [S],
                               params: [{ id: 0, value: 0.25 }, { id: 1, value: 0.5 }] });
      ok("swapping formats and back still gives the input unchanged",
         !firstDiff(a.out[0], S) && !firstDiff(b.out[0], S) && !firstDiff(c.out[0], S),
         firstDiff(a.out[0], S) || firstDiff(b.out[0], S) || firstDiff(c.out[0], S));
   }

   // --- the refusals
   let raw = await fetch(`${BASE}/api/plugins`);
   ok("no token is refused", raw.status === 401, String(raw.status));
   raw = await fetch(`${BASE}/api/plugins`, { headers: { "x-pluginhost-token": "wrong" } });
   ok("a wrong token is refused", raw.status === 401, String(raw.status));
   raw = await api("/api/plugins", { headers: { origin: "https://evil.example" } });
   ok("another site's origin is refused", raw.status === 403, String(raw.status));
   raw = await api("/api/plugins", { headers: { origin: `http://127.0.0.1:${PORT}` } });
   ok("its own origin is allowed", raw.status === 200, String(raw.status));
   raw = await api("/api/render", { method: "POST", body: Buffer.from("not a render request") });
   ok("a malformed body is refused", raw.status === 400, String(raw.status));
   raw = await api("/api/render", { method: "GET" });
   ok("GET on render is refused", raw.status === 405, String(raw.status));
   raw = await api(`/api/params?id=${encodeURIComponent("clap:com.nobody.missing")}`);
   ok("an unknown plugin id is refused", raw.status === 400, String(raw.status));
   raw = await api(`/api/params?id=${encodeURIComponent("vst3:nothexatall")}`);
   ok("a malformed VST3 class id is refused", raw.status === 400, String(raw.status));
   raw = await api("/api/nope");
   ok("an unknown path is 404", raw.status === 404, String(raw.status));

   // A body that claims more audio than it carries must not be read through.
   const short = buildRender({ id: clap ? clap.id : "x", frames: 64, channels: 2,
                               input: [new Float32Array(64), new Float32Array(64)], params: [] });
   raw = await api("/api/render", { method: "POST", body: Buffer.from(short.subarray(0, short.length - 100)) });
   ok("a body shorter than it claims is refused", raw.status === 400, String(raw.status));

   // --- the page is served, with the token baked in and no placeholder left
   const page = await (await fetch(BASE + "/")).text();
   ok("the page is served", page.includes("<html") || page.includes("<!doctype"), page.slice(0, 60));
   ok("the token was substituted into the page", page.includes(TOKEN));
   ok("no placeholder was left behind", !page.includes("__PLUGINHOST_TOKEN__"));
} catch (e) {
   fail++;
   console.log("  FAIL  " + (e && e.message ? e.message : String(e)));
} finally {
   child.kill("SIGTERM");
}

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail && log.trim()) console.log("\n--- host output ---\n" + log);
process.exit(fail ? 1 : 0);
