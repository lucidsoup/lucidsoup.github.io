// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Leo Kuroshita (@kurogedelic), Hügelton Instruments
// Felucca in an AudioWorklet: felucca.wasm is the whole FM-1 firmware against a simulated FM-1
// (web/emu/felucca_web.c). Each render quantum asks it for 128 frames, which runs the device's clock forward;
// between quanta the page's input goes in and, about 30 times a second (4 when the page is hidden), the screen,
// the lights and any changed flash go out. After X0X's web/emu/worklet.js (charlesvestal/fm1-x0x, GPL-3.0).

// The flash the page keeps: storage.c's areas (projects, user presets and their FM6 patches, the user sample
// slots 0x97000..0xDFFFF; the autosave 0xE5000..0xE6FFF (1.2) and FM6's voice bank 0xE7000 (1.4.1); the settings and
// the second FM6 copy 0xFC000..0xFFFFF), only the sectors that hold something (an erased sector is all 0xFF). {offset: bytes}
export const STORE_AREAS = [[0x97000, 0xE0000], [0xE5000, 0xE8000], [0xFC000, 0x100000]];
export function storeSectors(nor) {
  const out = {};
  for (const [a, b] of STORE_AREAS)
    for (let off = a; off < b; off += 4096) {
      const s = nor.subarray(off, off + 4096);
      if (s.some((v) => v !== 0xFF)) out[off] = s.slice();
    }
  return out;
}
export function restoreSectors(nor, sectors) {
  for (const [k, v] of Object.entries(sectors || {})) {
    const off = +k, b = v instanceof Uint8Array ? v : new Uint8Array(v);
    if (STORE_AREAS.some(([a, e]) => off >= a && off + 4096 <= e && off % 4096 === 0) && b.length === 4096)
      nor.set(b, off);
  }
}

export const HOLD_MS = 24;

// SynthSoup's Sound & MIDI panel: a C string out of the module's memory; the engines and their presets
function cstr(ex, p) {
  const m = new Uint8Array(ex.memory.buffer);
  let e = p;
  while (m[e]) e++;
  return String.fromCharCode(...m.subarray(p, e));
}
export function catalog(ex) {
  if (!ex.web_eng_count) return null;
  const out = [];
  for (let i = 0; i < ex.web_eng_count(); i++) {
    const e = ex.web_eng_at(i), presets = [];
    for (let n = 0; n < ex.web_preset_count(e); n++) presets.push(cstr(ex, ex.web_preset_name(e, n)));
    out.push({ id: e, name: cstr(ex, ex.web_eng_name(e)), presets });
  }
  return out;
}
export function soundState(ex) {
  if (!ex.web_sel) return null;
  const t = ex.web_sel();
  const samples = ex.web_smp_len ? [0, 1, 2].map((k) => ({ name: cstr(ex, ex.web_smp_name(k)), len: ex.web_smp_len(k) })) : null;
  const insert = ex.web_trk_insert ? ex.web_trk_insert(t) : 0;
  return { track: t, engine: ex.web_trk_engine(t), preset: ex.web_trk_preset(t), voice: ex.web_trk_voice(t), route: ex.web_route(), samples, insert };
}

if (typeof registerProcessor === "function") {
  const clock = globalThis.performance ? () => globalThis.performance.now() : () => Date.now();
  class Felucca extends AudioWorkletProcessor {
    constructor() {
      super();
      this.ex = null;
      this.sentDraws = -1;
      this.sentWrites = -1;
      this.sentLeds = "";
      this.sentState = "";
      this.lastFrame = 0;
      this.period = 1 / 30;
      this.busy = 0;
      this.frames = 0;
      this.queue = [];                                // button / key changes, each held >= HOLD_MS of device time
      this.nextOk = 0;
      this.port.onmessage = (e) => this.onMessage(e.data);
      // the device runs at 44.1 kHz; a context at another rate (iOS: 48 kHz) gets it resampled (linear), in tune
      this.step = 44100 / sampleRate;
      this.src = [new Float32Array(2048), new Float32Array(2048)];
      this.have = 0;                                  // source frames buffered
      this.pos = 0;                                   // read position in them (fractional)
      this.mic = false;                               // the VOCODER's microphone (the node's input) going in
      this.micPos = 0;                                // .. its read position, resampled to 44.1 kHz
      this.micLast = 0;
    }

    async onMessage(m) {
      if (m.type === "load") {
        try {
          const { instance } = await WebAssembly.instantiate(m.wasm, {});
          const ex = instance.exports;
          ex._initialize();
          ex.web_nor_erase();
          restoreSectors(new Uint8Array(ex.memory.buffer, ex.web_nor(), ex.web_nor_size()), m.sectors);
          ex.web_master(m.master ?? 700);
          ex.web_boot();
          this.ex = ex;
          this.sentWrites = ex.web_flash_writes_count();
          if (m.route !== undefined && ex.web_set_route) ex.web_set_route(m.route);
          this.port.postMessage({ type: "ready", rate: ex.web_sample_rate(), catalog: catalog(ex) });
        } catch (err) {
          this.port.postMessage({ type: "error", message: String(err && err.message || err) });
        }
        return;
      }
      const ex = this.ex;
      if (!ex) return;
      if (m.type === "buttons" || m.type === "keys") this.queue.push(m);
      else if (m.type === "enc") ex.web_enc(m.role, m.n | 0);
      else if (m.type === "master") ex.web_master(m.value | 0);
      else if (m.type === "midi") ex.web_midi(m.data[0] | 0, m.data[1] | 0, m.data[2] | 0);
      else if (m.type === "visible") this.period = m.on ? 1 / 30 : 1 / 4;
      else if (m.type === "select" && ex.web_select) ex.web_select(m.track | 0);
      else if (m.type === "sound" && ex.web_set_sound) ex.web_set_sound(m.track | 0, m.engine | 0, m.preset | 0);
      else if (m.type === "voice" && ex.web_set_voice) ex.web_set_voice(m.track | 0, m.voice | 0);
      else if (m.type === "route" && ex.web_set_route) ex.web_set_route(m.route | 0);
      else if (m.type === "mic" && ex.web_mic_enable) { this.mic = !!m.on; ex.web_mic_enable(m.on ? 1 : 0); }
      else if (m.type === "insert" && ex.web_set_insert) ex.web_set_insert(m.track | 0, m.itype | 0, m.a | 0, m.b | 0, m.c | 0, m.mix | 0);
      else if (m.type === "sample" && ex.web_smp_put) {   // the Samples panel: ADPCM (m.data) of m.n samples into slot m.slot
        const mem = new Uint8Array(ex.memory.buffer), nm = (m.name || "").slice(0, 8);
        mem.set(m.data, ex.web_smp_buf());
        mem.fill(0, ex.web_smp_namebuf(), ex.web_smp_namebuf() + 9);
        for (let i = 0; i < nm.length; i++) mem[ex.web_smp_namebuf() + i] = nm.charCodeAt(i) & 0x7F;
        const ok = ex.web_smp_put(m.slot | 0, m.n | 0);
        if (ok && m.play !== undefined) ex.web_use_sample(m.play | 0, m.slot | 0);
        this.port.postMessage({ type: "sampled", slot: m.slot, ok: !!ok });
      } else if (m.type === "use-sample" && ex.web_use_sample) ex.web_use_sample(m.track | 0, m.slot | 0);
    }

    publish() {
      const ex = this.ex, mem = ex.memory.buffer;
      const msg = { type: "frame" };
      const leds = [ex.web_lit_buttons(), ex.web_lit_keys(), ex.web_dim_buttons(), ex.web_dim_keys(), ex.web_dim_level(),
                    ex.web_breath_buttons(), ex.web_breath_keys(), ex.web_mid_keys ? ex.web_mid_keys() : 0];
      const an = ex.web_anim_levels ? ex.web_anim_levels() : 0;   // the power-on sweep: each LED's level
      const anim = an ? Array.from(new Uint8Array(mem, an, 41)) : null;
      const key = leds.join(",") + (anim ? ";" + anim.join(",") : "");
      if (key !== this.sentLeds) {
        this.sentLeds = key;
        msg.leds = leds;
        msg.anim = anim;
      }
      const st = soundState(ex), sk = st ? JSON.stringify(st) : "";
      if (sk !== this.sentState) {
        this.sentState = sk;
        msg.state = st;
      }
      if (this.frames >= 44100) {                     // the share of real time spent running the device
        msg.load = this.busy / (this.frames / 44.1);
        this.busy = this.frames = 0;
      }
      const transfer = [];
      const draws = ex.web_screen_draws();
      if (draws !== this.sentDraws) {
        this.sentDraws = draws;
        msg.fb = new Uint16Array(mem, ex.web_screen(), 240 * 240).slice();
        transfer.push(msg.fb.buffer);
      }
      const writes = ex.web_flash_writes_count();
      if (writes !== this.sentWrites) {               // a save is done within one main-loop pass: whole here
        this.sentWrites = writes;
        msg.sectors = storeSectors(new Uint8Array(mem, ex.web_nor(), ex.web_nor_size()));
      }
      if (msg.leds || msg.fb || msg.sectors || msg.state || msg.load !== undefined) this.port.postMessage(msg, transfer);
    }

    // A click's down and up can arrive within one render quantum, but the FM-1's contacts never close for less than
    // its debounce, and the UI reads them once a frame: each change of the buttons or the keys stays HOLD_MS of the
    // device's time before the next one goes in (a tap: down for a frame and more, then up).
    input() {
      const ex = this.ex, now = ex.web_now_ms();
      while (this.queue.length && now - this.nextOk >= 0) {
        const m = this.queue.shift();
        if (m.type === "buttons") ex.web_buttons(m.mask >>> 0);
        else ex.web_keys(m.mask >>> 0);
        this.nextOk = now + HOLD_MS;
      }
    }

    process(inputs, outputs) {
      const ex = this.ex;
      if (!ex) return true;
      if (this.queue.length) this.input();
      const inp = inputs[0] && inputs[0][0];
      if (this.mic && inp && ex.web_mic_put) {         // the microphone into the vocoder, at 44.1 kHz (linear)
        const buf = new Float32Array(ex.memory.buffer, ex.web_mic_in(), 2048), step = sampleRate / 44100;
        let k = 0, p = this.micPos;
        for (; p < inp.length && k < 2048; p += step, k++) {
          const i = Math.floor(p), f = p - i, a = i > 0 ? inp[i - 1] : this.micLast, b = inp[i];
          buf[k] = a + (b - a) * f;
        }
        this.micPos = p - inp.length;
        this.micLast = inp[inp.length - 1];
        ex.web_mic_put(k);
      }
      const out = outputs[0], n = out[0].length;
      const t0 = clock();
      if (this.step === 1) {
        ex.web_render(n);
        this.frames += n;
        out[0].set(new Float32Array(ex.memory.buffer, ex.web_out_l(), n));
        if (out[1]) out[1].set(new Float32Array(ex.memory.buffer, ex.web_out_r(), n));
      } else {
        const [sl, sr] = this.src, need = Math.floor(this.pos + n * this.step) + 2;
        if (need > this.have) {                       // render what the interpolation will read
          const k = need - this.have;
          ex.web_render(k);
          sl.set(new Float32Array(ex.memory.buffer, ex.web_out_l(), k), this.have);
          sr.set(new Float32Array(ex.memory.buffer, ex.web_out_r(), k), this.have);
          this.have += k;
          this.frames += k;
        }
        const l = out[0], r = out[1] || out[0];
        let p = this.pos;
        for (let i = 0; i < n; i++, p += this.step) {
          const j = p | 0, f = p - j;
          l[i] = sl[j] + (sl[j + 1] - sl[j]) * f;
          r[i] = sr[j] + (sr[j + 1] - sr[j]) * f;
        }
        const used = p | 0;                           // drop what is behind the read position
        sl.copyWithin(0, used, this.have);
        sr.copyWithin(0, used, this.have);
        this.have -= used;
        this.pos = p - used;
      }
      this.busy += clock() - t0;
      if (currentTime - this.lastFrame >= this.period) {
        this.lastFrame = currentTime;
        this.publish();
      }
      return true;
    }
  }
  registerProcessor("felucca", Felucca);
}
