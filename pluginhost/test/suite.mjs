// Proves the host against test/gainplug.clap, which is exactly predictable:
//
//     out = in[n - 64] * gain + offset
//
// and which declares those 64 frames through clap.latency. So a correct host
// gives back the input bit for bit at gain 1 / offset 0. An off-by-one in the
// delay compensation, a planar/interleaved mix-up, or a parameter that never
// reached the plugin all turn that into a visible failure rather than something
// that merely sounds plausible.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOST = join(HERE, "..", "pluginhost");
const PLUG = "com.lucidsoup.gainplug";
const PORT = Number(process.env.PORT || 7791);
const TOKEN = "testtoken00000000000000000000000000000000000000";  // 48 chars, as the host mints
const BASE = `http://127.0.0.1:${PORT}`;
const MAGIC = 0x3148504c;

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
   if (cond) { pass++; console.log(`  ok   ${name}`); }
   else { fail++; console.log(`  FAIL ${name}${extra ? "  — " + extra : ""}`); }
};

// --- the binary render request, as host.c documents it
function buildRender({ id = PLUG, rate = 48000, channels = 2, frames, params = [], notes = [], input = null }) {
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

try {
   if (!(await waitUp())) throw new Error("host never answered\n" + log);

   // --- it found the plugin at all
   const health = await (await api("/api/health")).json();
   ok("health answers", health.ok === true && health.name === "pluginhost");
   ok("health reports the CLAP version it was built against", /^\d+\.\d+\.\d+$/.test(health.clap), health.clap);

   const list = await (await api("/api/plugins")).json();
   const mine = list.plugins.find((p) => p.id === PLUG);
   ok("scan found gainplug", !!mine, `saw ${list.plugins.map((p) => p.id).join(", ") || "nothing"}`);
   ok("descriptor came through", mine && mine.name === "Gainplug" && mine.vendor === "lucidsoup");
   ok("features came through", mine && mine.features.includes("audio-effect"), mine && mine.features);

   // --- parameters, as the plugin declares them
   const info = await (await api(`/api/params?id=${encodeURIComponent(PLUG)}&rate=48000`)).json();
   ok("two parameters", info.params.length === 2, String(info.params.length));
   const gain = info.params.find((p) => p.name === "Gain");
   const offset = info.params.find((p) => p.name === "Offset");
   ok("gain range and default", gain && gain.min === 0 && gain.max === 4 && gain.default === 1);
   ok("offset range and default", offset && offset.min === -1 && offset.max === 1 && offset.default === 0);
   ok("value_to_text is used", gain && gain.text === "1.00 x", gain && gain.text);
   ok("stereo in and out reported", info.inputChannels === 2 && info.outputChannels === 2);
   ok("declared latency reported", info.latency === 64, String(info.latency));

   // --- the one that matters: gain 1, offset 0 must be an identity
   const N = 4096;
   const L = sine(N, 220), R = sine(N, 330);
   let r = await render({ frames: N, channels: 2, input: [L, R],
                          params: [{ id: gain.id, value: 1 }, { id: offset.id, value: 0 }] });
   ok("render returns the right shape", r.channels === 2 && r.frames === N, `${r.channels}x${r.frames}`);
   ok("latency compensated exactly, left", !firstDiff(r.out[0], L), firstDiff(r.out[0], L));
   ok("latency compensated exactly, right", !firstDiff(r.out[1], R), firstDiff(r.out[1], R));
   ok("channels not swapped", firstDiff(r.out[0], R) !== null);

   // --- parameters actually reach the plugin
   const E = exactSignal(N, 1), E2 = exactSignal(N, 5);
   r = await render({ frames: N, channels: 2, input: [E, E2],
                      params: [{ id: gain.id, value: 2 }, { id: offset.id, value: 0 }] });
   const doubled = Float32Array.from(E, (v) => Math.fround(v * 2));
   ok("gain 2 doubles, exactly", !firstDiff(r.out[0], doubled), firstDiff(r.out[0], doubled));

   r = await render({ frames: N, channels: 2, input: [E, E2],
                      params: [{ id: gain.id, value: 1 }, { id: offset.id, value: 0.25 }] });
   const shifted = Float32Array.from(E, (v) => Math.fround(v + 0.25));
   ok("offset adds, exactly", !firstDiff(r.out[0], shifted), firstDiff(r.out[0], shifted));
   ok("the offset settled during the preroll rather than gliding",
      r.out[0][0] === shifted[0], `${r.out[0][0]} vs ${shifted[0]}`);

   r = await render({ frames: N, channels: 2, input: [E, E2],
                      params: [{ id: gain.id, value: 0 }, { id: offset.id, value: 0 }] });
   ok("gain 0 is silence", r.out[0].every((v) => v === 0));

   // --- a second render must not inherit the first one's state
   r = await render({ frames: N, channels: 2, input: [L, R],
                      params: [{ id: gain.id, value: 1 }, { id: offset.id, value: 0 }] });
   ok("reset between renders, so no tail bleeds in", !firstDiff(r.out[0], L), firstDiff(r.out[0], L));

   // --- a mono source feeding a stereo plugin
   r = await render({ frames: N, channels: 1, input: [L],
                      params: [{ id: gain.id, value: 1 }, { id: offset.id, value: 0 }] });
   ok("mono in, stereo out", r.channels === 2);
   ok("mono was duplicated, not left half silent", !firstDiff(r.out[1], L), firstDiff(r.out[1], L));

   // --- a block-boundary-unfriendly length (512 is the host's block)
   const ODD = 1000;
   const O = sine(ODD, 190);
   r = await render({ frames: ODD, channels: 1, input: [O],
                     params: [{ id: gain.id, value: 1 }, { id: offset.id, value: 0 }] });
   ok("a length that is not a whole number of blocks", r.frames === ODD && !firstDiff(r.out[0], O),
      firstDiff(r.out[0], O));

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
   raw = await api(`/api/params?id=${encodeURIComponent("com.nobody.missing")}`);
   ok("an unknown plugin id is refused", raw.status === 400, String(raw.status));
   raw = await api("/api/nope");
   ok("an unknown path is 404", raw.status === 404, String(raw.status));

   // A body that claims more audio than it carries must not be read through.
   const short = buildRender({ frames: 64, channels: 2, input: [new Float32Array(64), new Float32Array(64)],
                               params: [] });
   const lying = Buffer.from(short.subarray(0, short.length - 100));
   raw = await api("/api/render", { method: "POST", body: lying });
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
