// Control logic with no browser dependencies: modulation lanes, morphing,
// scene diffs and the rate-limited send queue.
import * as P from "./protocol.js";

export const SHAPES = ["sine", "triangle", "ramp up", "ramp down", "square", "random", "drift"];

// Deterministic hash -> [0,1) so random lanes repeat identically per cycle.
function rand01(seed, n) {
  let x = (seed * 0x9e3779b1 + n * 0x85ebca6b) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;       // ^ yields a signed int32; keep it unsigned
  return x / 4294967296;
}

// Value of a shape in [0,1] at position `pos` (cycles since start).
export function shapeAt(shape, pos, seed = 1) {
  const cycle = Math.floor(pos);
  const ph = pos - cycle;
  switch (shape) {
    case "sine": return 0.5 - 0.5 * Math.cos(2 * Math.PI * ph);
    case "triangle": return ph < 0.5 ? ph * 2 : 2 - ph * 2;
    case "ramp up": return ph;
    case "ramp down": return 1 - ph;
    case "square": return ph < 0.5 ? 1 : 0;
    case "random": return rand01(seed, cycle);
    case "drift": {
      const a = rand01(seed, cycle), b = rand01(seed, cycle + 1);
      const t = 0.5 - 0.5 * Math.cos(Math.PI * ph);
      return a + (b - a) * t;
    }
    default: return 0;
  }
}

let nextLaneId = 1;

export function makeLane(over = {}) {
  return {
    id: nextLaneId++, block: "rev", slot: 1, shape: "sine",
    min: 20, max: 80, rateHz: 0.25, beats: 0, offset: 0, enabled: true,
    seed: Math.floor(Math.random() * 1e9), ...over,
  };
}

export function laneAddr(lane) {
  return lane.block === "volume" ? P.VOLUME_ADDR : P.knobAddr(P.blockById(lane.block), lane.slot);
}

// Cycles per second: free rate, or tempo-synced when beats > 0.
export function laneHz(lane, bpm) {
  return lane.beats > 0 ? bpm / 60 / lane.beats : lane.rateHz;
}

export function laneValue(lane, t, bpm) {
  const v = shapeAt(lane.shape, t * laneHz(lane, bpm) + lane.offset, lane.seed);
  return Math.round(lane.min + (lane.max - lane.min) * v);
}

// Several lanes on one parameter: the last enabled lane wins.
export function modulate(lanes, t, bpm) {
  const out = new Map();
  for (const l of lanes) if (l.enabled) out.set(laneAddr(l), laneValue(l, t, bpm));
  return out;
}

// ---- state helpers -----------------------------------------------------

export const clone = (s) => JSON.parse(JSON.stringify(s));

export function defaultState() {
  return {
    volume: 70, routing: [0, 1, 2, 3, 4, 5],
    blocks: Object.fromEntries(P.BLOCKS.map((b) => [b.id, { on: true, model: 0, knobs: [50, 50, 50, 50, 50, 0] }])),
  };
}

// Every continuous value as address -> value.
export function knobMap(s) {
  const m = new Map([[P.VOLUME_ADDR, s.volume]]);
  for (const b of P.BLOCKS) s.blocks[b.id].knobs.forEach((v, i) => m.set(P.knobAddr(b, i), v));
  return m;
}

export function setKnob(s, addr, v) {
  if (addr === P.VOLUME_ADDR) { s.volume = v; return; }
  for (const b of P.BLOCKS) {
    const slot = (addr - b.knobs) / 2;
    if (Number.isInteger(slot) && slot >= 0 && slot < 6) { s.blocks[b.id].knobs[slot] = v; return; }
  }
}

// Morph: knobs glide; switches (models, on/off, routing) flip at the midpoint.
export function morph(a, b, t) {
  const s = clone(t < 0.5 ? a : b);
  const ka = knobMap(a), kb = knobMap(b);
  for (const [addr, va] of ka) setKnob(s, addr, Math.round(va + (kb.get(addr) - va) * t));
  return s;
}

// Packets that turn state `from` into `to`, switches before knobs so knob
// values land on the right model.
export function diffPackets(from, to) {
  const out = [];
  if (from.routing.join() !== to.routing.join()) out.push({ key: "routing", pkt: P.routing(to.routing) });
  for (const b of P.BLOCKS) {
    const f = from.blocks[b.id], g = to.blocks[b.id];
    if (f.model !== g.model) out.push({ key: `m${b.model}`, pkt: P.model(b, g.model) });
    if (f.on !== g.on) out.push({ key: `t${b.toggle}`, pkt: P.toggle(b, g.on) });
  }
  const kf = knobMap(from);
  for (const [addr, v] of knobMap(to)) {
    if (kf.get(addr) !== v) out.push({ key: `k${addr}`, pkt: P.knob(addr, v) });
  }
  return out;
}

// ---- send queue -------------------------------------------------------

// Keyed updates replace any pending value for the same key, so a fast LFO
// or a dragged slider never builds a backlog; at most `perTick` packets go
// out per tick.
export class SendQueue {
  constructor(send, { perTick = 3 } = {}) {
    this.send = send;
    this.perTick = perTick;
    this.pending = new Map();
    this.sent = 0;
  }

  set(key, pkt) {
    this.pending.delete(key);       // re-insert so the newest goes last
    this.pending.set(key, pkt);
  }

  get size() { return this.pending.size; }

  async tick() {
    let n = 0;
    for (const [key, pkt] of this.pending) {
      if (n++ >= this.perTick) break;
      this.pending.delete(key);
      await this.send(pkt);
      this.sent++;
    }
  }

  clear() { this.pending.clear(); }
}
