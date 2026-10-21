// BlackBox control protocol: packet builders, SysEx bit-packing and state
// parsing. Facts come from the community protocol notes at
// https://github.com/jvsobrinho/mvave-blackbox-ble (CC BY-SA 4.0); this file
// is an independent implementation of them.
//
// Deliberately absent: the flash write (preset save) command. Everything this
// app sends changes live RAM only and is undone by reloading the preset.

export const HEAD_WRITE = 0x22;   // 00 59 22 ... live RAM write
export const HEAD_READ = 0x23;    // 00 59 23 ... reads and polling

export const BLOCKS = [
  { id: "fx", name: "FX", toggle: 0x08, model: 0x0e, knobs: 0x14,
    models: ["Noise Gate++", "Boost", "Compress", "AI Gate MS"],
    params: [["Gate"], ["Gate", "Gain"], ["Gate", "Sustain", "Attack", "Level"], ["Gate", "Bias"]] },
  { id: "amp", name: "AMP", toggle: 0x09, model: 0x0f, knobs: 0x20,
    models: Array.from({ length: 20 }, (_, i) => `Amp ${i + 1}`),
    fixed: ["Gain", "Level", "Bass", "Mid", "Treble"] },
  { id: "mod", name: "MOD", toggle: 0x0a, model: 0x10, knobs: 0x2c,
    models: ["Chorus", "Phaser", "Tremolo", "Flanger", "Vibrato", "Univibe", "Autofilter"],
    params: [
      ["Speed", "Depth", "Mix"],
      ["Speed", "Midcut", "Reso", "Feedback"],
      ["Speed", "Depth", "Level"],
      ["Speed", "Depth", "Feedback", "Mix"],
      ["Speed", "Depth"],
      ["Speed", "Depth", "Mix"],
      ["Speed", "Min", "Max", "Mix", "Feedback"],
    ] },
  { id: "dly", name: "DLY", toggle: 0x0b, model: 0x11, knobs: 0x38,
    models: ["Analog", "Duck", "Dtape", "Dual", "Lofi"],
    params: [
      ["Time", "Feedback", "Mix", "Phaser", "Pitch"],
      ["Time", "Feedback", "Mix", "Unpack", "Speed", "Depth"],
      ["Time", "Feedback", "Mix", "Grit", "Speed", "Depth"],
      ["Time", "Feedback", "Mix", "T-Mode", "Speed", "Depth"],
      ["Time", "Feedback", "Mix", "Grit", "Speed", "Depth"],
    ] },
  { id: "rev", name: "REV", toggle: 0x0c, model: 0x12, knobs: 0x44,
    models: ["Room", "Hall", "Swell", "Spring", "Shimmer", "Cloud"],
    params: [
      ["Decay", "Mix", "High Pass", "Low Pass", "Depth"],
      ["Decay", "Mix", "High Pass", "Low Pass", "Depth"],
      ["Decay", "Mix", "High Pass", "Low Pass", "Rise Time"],
      ["Decay", "Mix", "High Pass", "Low Pass", "Combs"],
      ["Decay", "Mix", "Tone", "Pitch", "Amount"],
      ["Decay", "Mix", "High Pass", "Low Pass", "Diffusion"],
    ] },
  { id: "cab", name: "CAB", toggle: 0x0d, model: 0x13, knobs: 0x50,
    models: Array.from({ length: 20 }, (_, i) => `Cab ${i + 1}`),
    fixed: ["Level", "Low Cut", "High Cut"] },
];

export const VOLUME_ADDR = 0x00;
export const ROUTING_ADDR = 0x02;
export const STATE_BYTES = 92;
export const AMP_NAMES_ADDR = 0x00011890;
export const CAB_NAMES_ADDR = 0x00011880;

export function blockById(id) {
  return BLOCKS.find((b) => b.id === id);
}

// Knob labels for a block given its current model; unused slots are omitted.
export function knobNames(block, modelId) {
  if (block.fixed) return block.fixed;
  return block.params[modelId] || block.params[0];
}

export function knobAddr(block, slot) {
  return block.knobs + slot * 2;
}

// Checksum = 0xFF - sum(bytes 4 .. N-2), masked to a byte.
export function checksum(bytes) {
  let sum = 0;
  for (let i = 4; i < bytes.length - 1; i++) sum += bytes[i];
  return (0xff - (sum & 0xff)) & 0xff;
}

// Generic frame:
//   00 59 HEAD LEN | 00 00 ROUTE | TARGET | 00 00 | SPACE COUNT | 00 00 | DATA... | CS
// LEN is the frame length minus 7. COUNT is the data length for writes and
// the requested length for reads.
export function frame({ head = HEAD_WRITE, route = 0x04, target = 0, space = 0x10,
                        count, data = [] }) {
  const n = 15 + data.length;
  const p = new Uint8Array(n);
  p.set([0x00, 0x59, head, n - 7, 0x00, 0x00, route, target & 0xff, 0x00, 0x00,
         space, count ?? data.length, 0x00, 0x00]);
  p.set(data, 14);
  p[n - 1] = checksum(p);
  return p;
}

const clamp100 = (v) => Math.max(0, Math.min(100, Math.round(v)));

export const knob = (addr, value) => {
  const v = clamp100(value);
  return frame({ target: addr, data: [v & 0xff, v >> 8] });
};
export const volume = (value) => knob(VOLUME_ADDR, value);
export const model = (block, modelId) => frame({ target: block.model, data: [modelId] });
export const toggle = (block, on) => frame({ target: block.toggle, data: [on ? 1 : 0] });

// order: six block indices, e.g. [0,1,2,3,4,5] = FX AMP MOD DLY REV CAB
export function routing(order) {
  const sorted = [...order].sort((a, b) => a - b).join();
  if (order.length !== 6 || sorted !== "0,1,2,3,4,5") {
    throw new Error("routing must be a permutation of the six blocks");
  }
  return frame({ target: ROUTING_ADDR, data: order });
}

export const loadPreset = (id) => frame({ target: id, space: 0xe0, data: [1] });
export const commitUi = () => frame({ target: 0, space: 0xf0, count: 0 });
export const requestState = () => frame({ head: HEAD_READ, space: 0x10, count: STATE_BYTES });
export const requestPresetId = () => frame({ head: HEAD_READ, space: 0x20, count: 0x04 });

export function requestNames(addr) {
  const p = new Uint8Array(15);
  p.set([0x00, 0x59, HEAD_READ, 0x08, 0x00, 0x00, 0x05, 0x00, 0x00, 0x00,
         addr & 0xff, (addr >> 8) & 0xff, (addr >> 16) & 0xff, (addr >>> 24) & 0xff]);
  p[14] = checksum(p);
  return p;
}

// ---- USB transport: continuous LSB-first 8-to-7 bit packing in SysEx ----

export function packSysex(raw) {
  const out = [0xf0];
  let acc = 0, bits = 0;
  for (const b of raw) {
    acc |= b << bits;
    bits += 8;
    while (bits >= 7) {
      out.push(acc & 0x7f);
      acc >>= 7;
      bits -= 7;
    }
  }
  out.push(acc & 0x7f);
  out.push(0xf7);
  return new Uint8Array(out);
}

export function unpackSysex(msg) {
  let start = 0, end = msg.length;
  if (msg[0] === 0xf0) start = 1;
  if (msg[end - 1] === 0xf7) end -= 1;
  const out = [];
  let acc = 0, bits = 0;
  for (let i = start; i < end; i++) {
    acc |= (msg[i] & 0x7f) << bits;
    bits += 7;
    if (bits >= 8) {
      out.push(acc & 0xff);
      acc >>= 8;
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

// ---- incoming packets -------------------------------------------------

export function classify(p) {
  if (p.length < 4 || p[0] !== 0x00 || p[1] !== 0x59) return { kind: "unknown" };
  if (p.length === 8 && p[2] === 0x00) return { kind: "ack" };
  if (p.length === 107 && p[2] === HEAD_READ) return { kind: "state", state: parseState(p) };
  if (p.length === 19 && p[10] === 0x20 && p[11] === 0x04) return { kind: "preset", id: p[14] };
  return { kind: "other" };
}

// The 92 state bytes sit at offset 14; a byte's index is its write address.
export function parseState(p) {
  const d = p.slice(14, 14 + STATE_BYTES);
  const s = {
    volume: d[VOLUME_ADDR],
    routing: Array.from(d.slice(ROUTING_ADDR, ROUTING_ADDR + 6)),
    blocks: {},
  };
  for (const b of BLOCKS) {
    const knobs = [];
    for (let i = 0; i < 6; i++) knobs.push(d[knobAddr(b, i)] | (d[knobAddr(b, i) + 1] << 8));
    s.blocks[b.id] = { on: d[b.toggle] === 1, model: d[b.model], knobs };
  }
  return s;
}

// Builds a state packet the same shape the pedal sends; used by the
// simulator and the tests.
export function encodeState(s) {
  const d = new Uint8Array(STATE_BYTES);
  d[VOLUME_ADDR] = s.volume;
  d.set(s.routing, ROUTING_ADDR);
  for (const b of BLOCKS) {
    const st = s.blocks[b.id];
    d[b.toggle] = st.on ? 1 : 0;
    d[b.model] = st.model;
    st.knobs.forEach((v, i) => { d[knobAddr(b, i)] = v & 0xff; d[knobAddr(b, i) + 1] = v >> 8; });
  }
  return frame({ head: HEAD_READ, space: 0x10, data: Array.from(d) });
}

// Name blocks arrive as "1AC-SeVin\0 2JVM_1960_57\0 ..." split across
// notifications; strip the 1-based index prefix from each.
export function parseNames(bytes) {
  const names = [];
  let cur = "";
  for (const b of bytes) {
    if (b === 0) {
      if (cur.trim()) names.push(cur.replace(/^\d+/, ""));
      cur = "";
    } else if (b >= 0x20 && b < 0x7f) {
      cur += String.fromCharCode(b);
    }
  }
  return names;
}

export const hex = (p) => Array.from(p, (b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
