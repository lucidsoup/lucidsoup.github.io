// BlackboxFX Control: UI, connection lifecycle and the modulation clock.
import * as P from "./protocol.js";
import * as E from "./engine.js";
import { UsbTransport, BleTransport, SimTransport } from "./transport.js";

const $ = (id) => document.getElementById(id);
const STORE_KEY = "bfx-control-v1";
const POLL_MS = 2500;
const EDIT_GRACE_MS = 1500;
const NAME_TIMEOUT_MS = 4000;
const SYNC_TIMEOUT_MS = 5000;

const app = {
  transport: null,
  base: E.defaultState(),       // the sound as set by hand, scenes and morph
  lanes: [],
  scenes: Array(8).fill(null),
  morphA: null,
  morphB: null,
  bpm: 120,
  preset: 0,
  queue: null,
  lastSent: new Map(),          // addr -> value most recently sent for knobs
  lastEdit: 0,
  synced: false,                // nothing is sent until the pedal's state has been read
  stats: { sent: 0, recv: 0 },
  names: { amp: null, cab: null },
  nameWait: null,
  timers: [],
};
window.bfx = app;               // handy in the console, and for tests

// ---- persistence ----------------------------------------------------

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      lanes: app.lanes, scenes: app.scenes, morphA: app.morphA, morphB: app.morphB, bpm: app.bpm,
    }));
  } catch { /* private mode: settings just won't persist */ }
}

function load(obj) {
  if (!obj) return;
  if (Array.isArray(obj.lanes)) app.lanes = obj.lanes.map((l) => E.makeLane(l));
  if (Array.isArray(obj.scenes)) app.scenes = Array.from({ length: 8 }, (_, i) => obj.scenes[i] || null);
  app.morphA = obj.morphA || null;
  app.morphB = obj.morphB || null;
  if (obj.bpm) app.bpm = obj.bpm;
}

try { load(JSON.parse(localStorage.getItem(STORE_KEY) || "null")); } catch { /* ignore */ }

// ---- logging ----------------------------------------------------------

function log(msg) {
  const el = $("log");
  const line = `${new Date().toLocaleTimeString()}  ${msg}\n`;
  el.textContent = (line + el.textContent).slice(0, 8000);
}

function status(text, state) {
  const el = $("status");
  el.textContent = text;
  el.dataset.state = state;
}

function updateCounts() {
  $("counts").textContent = `(${app.stats.sent} sent, ${app.stats.recv} received)`;
}

// ---- connection -------------------------------------------------------

async function connect(kind, portName) {
  await disconnect();
  const t = kind === "usb" ? new UsbTransport() : kind === "ble" ? new BleTransport() : new SimTransport(E.clone(app.base),
    { silent: new URLSearchParams(location.search).get("sim") === "silent" });
  status("Connecting…", "off");
  try {
    await t.connect(portName);
  } catch (err) {
    if (err.code === "NO_PORT") return offerPorts(err);
    status(err.message, "err");
    log(`connect failed: ${err.message}`);
    return;
  }
  $("portSelect").hidden = true;
  app.transport = t;
  t.onPacket = onPacket;
  t.onClose = () => { log("pedal disconnected"); disconnect(); };
  app.queue = new E.SendQueue(async (pkt) => {
    await app.transport?.send(pkt);
    app.stats.sent++;
  });
  status(`Connected: ${t.name}`, "on");
  log(`connected via ${kind} (${t.name})`);
  $("main").classList.remove("disabled");
  showConnected(true);

  // the pedal's current sound comes first: nothing works until it arrives,
  // and the clocks keep re-asking for it
  await sendNow(P.requestPresetId());
  await sendNow(P.requestState());
  startClocks();
  watchSync(t);
}

// If the pedal never sends its state, say so instead of sitting silently.
function watchSync(t) {
  const deadline = Date.now() + SYNC_TIMEOUT_MS;
  const check = setInterval(async () => {
    if (app.transport !== t) { clearInterval(check); return; }
    if (app.synced) {
      clearInterval(check);
      if (!app.names.amp) await readNames();   // optional, after we're working
      return;
    }
    if (Date.now() < deadline) return;
    clearInterval(check);
    const heard = app.stats.recv;
    status(heard
      ? `Connected to ${t.name}, but its replies weren't recognised. Open Activity below and send me what it shows.`
      : `Connected to ${t.name}, but the pedal isn't answering. Check it's switched on and not in use by the M-EFCS app, then reconnect.`,
      "err");
    log(`no state after ${SYNC_TIMEOUT_MS / 1000}s; received ${heard} packet(s)`);
    document.querySelector("details.log").open = true;
  }, 250);
}

async function offerPorts(err) {
  const sel = $("portSelect");
  const names = await UsbTransport.listPorts();
  if (!names.length) {
    status("No MIDI devices found. Check the pedal is on and the USB cable carries data (some are charge-only).", "err");
    log(err.message);
    return;
  }
  sel.replaceChildren(new Option("Choose the BlackBox MIDI port…", ""), ...names.map((n) => new Option(n, n)));
  sel.hidden = false;
  status("Pick the pedal's MIDI port", "err");
  log(err.message);
}

async function disconnect() {
  app.timers.forEach(clearInterval);
  app.timers = [];
  const t = app.transport;
  app.transport = null;
  app.queue = null;
  app.lastSent.clear();
  app.synced = false;
  if (t) await t.close?.();
  $("main").classList.add("disabled");
  showConnected(false);
  status("Not connected", "off");
}

function showConnected(on) {
  for (const id of ["btnUsb", "btnBle", "btnSim"]) $(id).hidden = on;
  $("btnDisconnect").hidden = !on;
}

async function sendNow(pkt) {
  if (!app.transport) return;
  await app.transport.send(pkt);
  app.stats.sent++;
}

// Amp and cab names live on the pedal and arrive split across packets.
async function readNames() {
  for (const [key, addr] of [["amp", P.AMP_NAMES_ADDR], ["cab", P.CAB_NAMES_ADDR]]) {
    const names = await new Promise((resolve) => {
      const buf = [];
      const timer = setTimeout(() => { app.nameWait = null; resolve(null); }, NAME_TIMEOUT_MS);
      app.nameWait = (raw) => {
        const body = raw[0] === 0x00 && raw[1] === 0x59 && raw.length >= 14 ? raw.slice(14) : raw;
        buf.push(...body);
        const got = P.parseNames(buf);
        if (got.length >= 20) {
          clearTimeout(timer);
          app.nameWait = null;
          resolve(got.slice(0, 20));
        }
      };
      sendNow(P.requestNames(addr));
    });
    if (names) app.names[key] = names;
    log(names ? `read ${key} names` : `${key} names not received; using numbers`);
  }
  render();
}

function onPacket(raw) {
  app.stats.recv++;
  const c = P.classify(raw);
  if (app.nameWait && c.kind !== "state" && c.kind !== "preset" && c.kind !== "ack") return app.nameWait(raw);
  if (c.kind === "state") {
    if (!app.synced) {
      // first read after connecting or changing preset: adopt it wholesale
      app.base = c.state;
      app.lastSent = new Map(E.knobMap(c.state));
      app.synced = true;
      log("read pedal state");
      render();
      return;
    }
    if (Date.now() - app.lastEdit < EDIT_GRACE_MS) return;
    // modulated knobs report their moving value; keep our base for those
    const moving = new Set(app.lanes.filter((l) => l.enabled).map(E.laneAddr));
    const next = c.state;
    for (const [addr, v] of E.knobMap(app.base)) if (moving.has(addr)) E.setKnob(next, addr, v);
    if (JSON.stringify(next) !== JSON.stringify(app.base)) {
      app.base = next;
      render();
    }
  } else if (c.kind === "preset") {
    if (c.id !== app.preset) {
      // changed on the pedal itself: stop sending until the new sound is read
      app.preset = c.id;
      resync();
      renderPreset();
    }
  } else if (c.kind === "unknown" || c.kind === "other") {
    log(`rx ${P.hex(raw).slice(0, 60)}`);
  }
  updateCounts();
}

// ---- clocks: modulation, send queue, polling ----------------------------

function startClocks() {
  const t0 = performance.now();
  const rate = Number($("sendRate").value);
  app.timers.push(setInterval(() => {
    if (!app.queue || !app.synced) return;
    const t = (performance.now() - t0) / 1000;
    const mods = E.modulate(app.lanes, t, app.bpm);
    for (const [addr, v] of E.knobMap(app.base)) {
      const want = mods.has(addr) ? mods.get(addr) : v;
      if (app.lastSent.get(addr) !== want) {
        app.lastSent.set(addr, want);
        app.queue.set(`k${addr}`, P.knob(addr, want));
      }
    }
    showMeters(mods);
    app.queue.tick();
    updateCounts();
  }, 1000 / rate));
  app.timers.push(setInterval(() => {
    sendNow(P.requestPresetId());
    setTimeout(() => sendNow(P.requestState()), 250);
  }, POLL_MS));
}

function restartClocks() {
  if (!app.transport) return;
  app.timers.forEach(clearInterval);
  app.timers = [];
  startClocks();
}

// Hand edits, scenes and morph all go through here.
function resync() {
  app.synced = false;
  app.queue?.clear();
  setTimeout(() => sendNow(P.requestState()), 300);
}

function applyBase(next) {
  if (!app.synced) return;
  for (const { key, pkt } of E.diffPackets(app.base, next)) {
    if (key.startsWith("k")) continue;      // knobs are sent by the clock
    app.queue?.set(key, pkt);
  }
  app.base = next;
  app.lastEdit = Date.now();
}

// ---- rendering ---------------------------------------------------------

function modelNames(b) {
  return app.names[b.id] || b.models;
}

function render() {
  renderChain();
  renderLanes();
  renderScenes();
  renderPreset();
  $("volume").value = app.base.volume;
  $("volumeOut").textContent = app.base.volume;
  $("bpm").value = app.bpm;
  $("morphInfo").textContent = `A: ${app.morphA ? "captured" : "empty"} · B: ${app.morphB ? "captured" : "empty"}`;
}

function renderPreset() {
  $("presetLabel").textContent = `P${String(app.preset + 1).padStart(2, "0")}`;
}

function el(tag, { dataset, ...props } = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  if (dataset) Object.assign(e.dataset, dataset);
  e.append(...kids);
  return e;
}

function renderChain() {
  const chain = $("chain");
  chain.replaceChildren();
  app.base.routing.forEach((blockIdx, pos) => {
    const b = P.BLOCKS[blockIdx];
    const st = app.base.blocks[b.id];
    const power = el("button", { className: `power ${st.on ? "on" : ""}`, textContent: st.on ? "On" : "Off" });
    power.onclick = () => {
      const n = E.clone(app.base); n.blocks[b.id].on = !st.on; applyBase(n); renderChain();
    };
    const left = el("button", { textContent: "◀", title: "Move earlier", disabled: pos === 0 });
    const right = el("button", { textContent: "▶", title: "Move later", disabled: pos === 5 });
    const move = (d) => {
      const n = E.clone(app.base);
      [n.routing[pos], n.routing[pos + d]] = [n.routing[pos + d], n.routing[pos]];
      applyBase(n); renderChain();
    };
    left.onclick = () => move(-1);
    right.onclick = () => move(1);

    const sel = el("select", { "ariaLabel": `${b.name} model` });
    modelNames(b).forEach((name, i) => sel.append(new Option(name, i)));
    sel.value = st.model;
    sel.onchange = () => {
      const n = E.clone(app.base); n.blocks[b.id].model = Number(sel.value); applyBase(n); renderChain(); renderLanes();
    };

    const knobs = P.knobNames(b, st.model).map((label, slot) => {
      const addr = P.knobAddr(b, slot);
      const input = el("input", { type: "range", min: 0, max: 100, value: st.knobs[slot] });
      const out = el("output", { textContent: st.knobs[slot] });
      input.oninput = () => {
        if (!app.synced) return;
        E.setKnob(app.base, addr, Number(input.value));
        out.textContent = input.value;
        app.lastEdit = Date.now();
      };
      return el("label", { className: "knob", dataset: { addr } }, el("span", { textContent: label }), out, input);
    });

    chain.append(el("div", { className: `block ${st.on ? "" : "off"}` },
      el("header", {}, el("strong", { textContent: b.name }), el("div", { className: "move" }, left, right), power),
      sel, ...knobs));
  });
}

function targetOptions() {
  const opts = [new Option("Volume", "volume:0")];
  for (const b of P.BLOCKS) {
    P.knobNames(b, app.base.blocks[b.id].model).forEach((label, slot) => {
      opts.push(new Option(`${b.name} · ${label}`, `${b.id}:${slot}`));
    });
  }
  return opts;
}

const SYNC = [["free", 0], ["1/4 beat", 0.25], ["1/2 beat", 0.5], ["1 beat", 1], ["2 beats", 2],
              ["1 bar", 4], ["2 bars", 8], ["4 bars", 16], ["8 bars", 32]];

function renderLanes() {
  const box = $("lanes");
  box.replaceChildren();
  for (const lane of app.lanes) {
    const changed = () => { save(); };
    const on = el("button", { className: lane.enabled ? "on" : "", textContent: lane.enabled ? "On" : "Off" });
    on.onclick = () => { lane.enabled = !lane.enabled; changed(); renderLanes(); };

    const target = el("select", { ariaLabel: "Target" });
    target.append(...targetOptions());
    target.value = `${lane.block}:${lane.slot}`;
    if (target.value === "") target.value = "volume:0";
    target.onchange = () => {
      const [blk, slot] = target.value.split(":");
      lane.block = blk; lane.slot = Number(slot); changed();
    };

    const shape = el("select", { ariaLabel: "Shape" });
    E.SHAPES.forEach((s) => shape.append(new Option(s, s)));
    shape.value = lane.shape;
    shape.onchange = () => { lane.shape = shape.value; changed(); };

    const sync = el("select", { ariaLabel: "Sync" });
    SYNC.forEach(([label, beats]) => sync.append(new Option(label, beats)));
    sync.value = lane.beats;
    const hz = el("input", { type: "number", min: 0.01, max: 20, step: 0.01, value: lane.rateHz, title: "Hz", hidden: lane.beats > 0 });
    sync.onchange = () => { lane.beats = Number(sync.value); hz.hidden = lane.beats > 0; changed(); };
    hz.onchange = () => { lane.rateHz = Math.max(0.01, Number(hz.value) || 0.25); changed(); };

    const min = el("input", { type: "range", min: 0, max: 100, value: lane.min, ariaLabel: "Minimum" });
    const max = el("input", { type: "range", min: 0, max: 100, value: lane.max, ariaLabel: "Maximum" });
    const minOut = el("output", { textContent: `min ${lane.min}` });
    const maxOut = el("output", { textContent: `max ${lane.max}` });
    min.oninput = () => { lane.min = Number(min.value); minOut.textContent = `min ${min.value}`; changed(); };
    max.oninput = () => { lane.max = Number(max.value); maxOut.textContent = `max ${max.value}`; changed(); };
    const meter = el("div", { className: "meter" }, el("i", { dataset: { lane: lane.id } }));

    const remove = el("button", { className: "x", textContent: "✕", title: "Remove lane" });
    remove.onclick = () => { app.lanes = app.lanes.filter((l) => l !== lane); save(); renderLanes(); };

    box.append(el("div", { className: "lane" }, on, target, shape,
      el("div", { className: "ratebox" }, sync, hz),
      el("div", { className: "range" }, minOut, min, maxOut, max, meter),
      remove));
  }
}

function showMeters(mods) {
  for (const lane of app.lanes) {
    const bar = document.querySelector(`i[data-lane="${lane.id}"]`);
    if (bar) bar.style.width = lane.enabled ? `${mods.get(E.laneAddr(lane)) ?? 0}%` : "0";
  }
  document.querySelectorAll(".knob").forEach((k) => {
    const addr = Number(k.dataset.addr);
    const moving = mods.has(addr);
    k.classList.toggle("moving", moving);
    if (moving) k.querySelector("output").textContent = mods.get(addr);
  });
}

function renderScenes() {
  const box = $("scenes");
  box.replaceChildren();
  app.scenes.forEach((s, i) => {
    const b = el("button", { className: s ? "" : "empty", textContent: s ? `Scene ${i + 1}` : `${i + 1} · empty` });
    b.onclick = () => {
      if ($("storeMode").checked) {
        app.scenes[i] = E.clone(app.base);
        $("storeMode").checked = false;
        save(); renderScenes();
        log(`stored scene ${i + 1}`);
      } else if (s) {
        applyBase(E.clone(s));
        render();
        log(`recalled scene ${i + 1}`);
      }
    };
    box.append(b);
  });
}

// ---- controls ----------------------------------------------------------

$("btnUsb").onclick = () => connect("usb");
$("btnBle").onclick = () => connect("ble");
$("btnSim").onclick = () => connect("sim");
$("btnDisconnect").onclick = () => disconnect();
$("portSelect").onchange = (e) => e.target.value && connect("usb", e.target.value);

$("presetPrev").onclick = () => loadPreset(app.preset - 1);
$("presetNext").onclick = () => loadPreset(app.preset + 1);

async function loadPreset(id) {
  app.preset = (id + 80) % 80;
  renderPreset();
  app.synced = false;
  app.queue?.clear();
  await sendNow(P.loadPreset(app.preset));
  app.lastEdit = 0;
  setTimeout(() => sendNow(P.requestState()), 400);
}

$("volume").oninput = (e) => {
  if (!app.synced) return;
  app.base.volume = Number(e.target.value);
  $("volumeOut").textContent = e.target.value;
  app.lastEdit = Date.now();
};

$("bpm").onchange = (e) => { app.bpm = Math.min(300, Math.max(30, Number(e.target.value) || 120)); save(); };
let taps = [];
$("tap").onclick = () => {
  const now = performance.now();
  taps = taps.filter((t) => now - t < 2500);
  taps.push(now);
  if (taps.length >= 2) {
    const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
    app.bpm = Math.round(60000 / avg);
    $("bpm").value = app.bpm;
    save();
  }
};

$("sendRate").onchange = () => restartClocks();

$("addLane").onclick = () => {
  app.lanes.push(E.makeLane({ block: "rev", slot: 1, shape: "drift", min: 15, max: 70, rateHz: 0.2 }));
  save(); renderLanes();
};

$("captureA").onclick = () => { app.morphA = E.clone(app.base); save(); render(); };
$("captureB").onclick = () => { app.morphB = E.clone(app.base); save(); render(); };
$("morph").oninput = (e) => {
  if (!app.morphA || !app.morphB) return;
  applyBase(E.morph(app.morphA, app.morphB, Number(e.target.value) / 1000));
  renderChain();
  $("volume").value = app.base.volume;
  $("volumeOut").textContent = app.base.volume;
};

$("exportBtn").onclick = () => {
  const blob = new Blob([JSON.stringify({
    format: "blackboxfx-control", version: 1,
    lanes: app.lanes, scenes: app.scenes, morphA: app.morphA, morphB: app.morphB, bpm: app.bpm,
  }, null, 2)], { type: "application/json" });
  const a = el("a", { href: URL.createObjectURL(blob), download: "blackboxfx-control.json" });
  a.click();
  URL.revokeObjectURL(a.href);
};

$("importFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const obj = JSON.parse(await file.text());
    if (obj.format !== "blackboxfx-control") throw new Error("not a BlackboxFX Control file");
    load(obj);
    save();
    render();
    log(`imported ${file.name}`);
  } catch (err) {
    log(`import failed: ${err.message}`);
  }
  e.target.value = "";
};

if (!UsbTransport.supported()) $("btnUsb").title = "Needs Chrome or Edge (Web MIDI)";
if (!BleTransport.supported()) $("btnBle").title = "Needs Chrome or Edge (Web Bluetooth)";
if (!UsbTransport.supported() && !BleTransport.supported()) {
  status("This browser can't reach the pedal. Use Chrome or Edge on a computer or Android phone (iPhone browsers can't). The simulator still works here.", "err");
}

render();
