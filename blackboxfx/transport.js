// Three ways to reach a pedal, one interface:
//   await t.connect(); await t.send(rawPacket); t.onPacket = (raw) => ...
// Packets are always the raw 00 59 ... form; USB wraps them in SysEx.
import * as P from "./protocol.js";

const SERVICE = "0000ae40-0000-1000-8000-00805f9b34fb";
const TX = "0000ae41-0000-1000-8000-00805f9b34fb";
const RX = "0000ae42-0000-1000-8000-00805f9b34fb";
const PORT_MATCH = /black\s*box|m-?vave|cuvave/i;

class Base {
  constructor() {
    this.onPacket = () => {};
    this.onClose = () => {};
    this.name = "";
  }
}

export class UsbTransport extends Base {
  static supported() { return typeof navigator !== "undefined" && !!navigator.requestMIDIAccess; }

  // Output port names, so the user can choose when auto-detection misses.
  static async listPorts() {
    const access = await navigator.requestMIDIAccess({ sysex: true });
    return Array.from(access.outputs.values(), (p) => p.name);
  }

  // portName: exact port to use; otherwise the first BlackBox-looking port.
  async connect(portName) {
    if (!UsbTransport.supported()) throw new Error("This browser has no Web MIDI. Use Chrome or Edge.");
    const access = await navigator.requestMIDIAccess({ sysex: true });
    const pick = (ports) => {
      const all = Array.from(ports.values());
      return all.find((p) => (portName ? p.name === portName : PORT_MATCH.test(p.name))) || null;
    };
    this.input = pick(access.inputs);
    this.output = pick(access.outputs);
    if (!this.input || !this.output) {
      const names = Array.from(access.outputs.values(), (p) => p.name).join(", ") || "none";
      const err = new Error(`No BlackBox MIDI port found (ports: ${names}).`);
      err.code = "NO_PORT";
      throw err;
    }
    this.name = this.output.name;
    this.input.onmidimessage = (e) => {
      if (e.data[0] === 0xf0) this.onPacket(P.unpackSysex(e.data));
    };
    access.onstatechange = (e) => {
      if (e.port.id === this.output.id && e.port.state === "disconnected") this.onClose();
    };
  }

  async send(raw) { this.output.send(P.packSysex(raw)); }

  async close() {
    if (this.input) this.input.onmidimessage = null;
  }
}

export class BleTransport extends Base {
  static supported() { return typeof navigator !== "undefined" && !!navigator.bluetooth; }

  async connect() {
    if (!BleTransport.supported()) {
      throw new Error("This browser has no Web Bluetooth. Use Chrome or Edge (Android, Windows, macOS, ChromeOS).");
    }
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: "BlackBox" }],
      optionalServices: [SERVICE],
    });
    this.device.addEventListener("gattserverdisconnected", () => this.onClose());
    const server = await this.device.gatt.connect();
    const svc = await server.getPrimaryService(SERVICE);
    this.tx = await svc.getCharacteristic(TX);
    const rx = await svc.getCharacteristic(RX);
    rx.addEventListener("characteristicvaluechanged", (e) => {
      const v = e.target.value;
      this.onPacket(new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice());
    });
    await rx.startNotifications();
    this.name = this.device.name;
  }

  async send(raw) { await this.tx.writeValueWithoutResponse(raw); }

  async close() {
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
  }
}

// A pretend pedal that answers like the real one: ACKs writes, returns its
// state, preset number and fragmented name lists.
export class SimTransport extends Base {
  // silent: records what it is sent but never answers, like a pedal that
  // isn't listening
  constructor(state, { silent = false } = {}) {
    super();
    this.state = state;
    this.silent = silent;
    this.preset = 0;
    this.received = [];
    this.name = "Simulated BlackBox";
  }

  async connect() {}

  reply(p) { setTimeout(() => this.onPacket(p), 5); }

  async send(raw) {
    this.received.push(P.hex(raw));
    if (this.silent) return;
    if (raw[raw.length - 1] !== P.checksum(raw)) return;   // the pedal ignores bad packets
    const head = raw[2], target = raw[7], space = raw[10], data = raw.slice(14, -1);
    if (head === P.HEAD_READ) {
      if (raw[6] === 0x05) return this.replyNames(raw);
      if (space === 0x10) return this.reply(P.encodeState(this.state));
      if (space === 0x20) {
        const p = new Uint8Array(19);
        p.set([0x00, 0x59, P.HEAD_READ, 12, 0, 0, 4, 0, 0, 0, 0x20, 0x04, 0, 0, this.preset]);
        p[18] = P.checksum(p);
        return this.reply(p);
      }
      return;
    }
    if (space === 0xe0) this.preset = target;
    else if (space === 0x10) this.write(target, data);
    this.reply(Uint8Array.from([0x00, 0x59, 0x00, 0x01, 0, 0, 0, 0xff]));
  }

  write(addr, data) {
    const s = this.state;
    if (addr === P.ROUTING_ADDR && data.length === 6) { s.routing = Array.from(data); return; }
    for (const b of P.BLOCKS) {
      if (addr === b.toggle) { s.blocks[b.id].on = data[0] === 1; return; }
      if (addr === b.model) { s.blocks[b.id].model = data[0]; return; }
      const slot = (addr - b.knobs) / 2;
      if (Number.isInteger(slot) && slot >= 0 && slot < 6) { s.blocks[b.id].knobs[slot] = data[0] | (data[1] << 8); return; }
    }
    if (addr === P.VOLUME_ADDR) s.volume = data[0];
  }

  replyNames(raw) {
    const amps = raw[10] === 0x90;
    const names = Array.from({ length: 20 }, (_, i) => `${i + 1}${amps ? "SimAmp" : "SimCab"}-${i + 1}`);
    const bytes = new TextEncoder().encode(names.join("\0") + "\0");
    for (let o = 0; o < bytes.length; o += 60) this.reply(bytes.slice(o, o + 60));
  }
}
