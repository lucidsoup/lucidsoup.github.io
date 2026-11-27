"use strict";
const R = { page: "blackbox-probe 2", when: new Date().toISOString(), agent: navigator.userAgent, usb: null, hid: null,
            midi: { ports: [], identity: [], log: [] }, ble: { device: null, services: [], log: [] } };
const $ = (id) => document.getElementById(id);
const hex = (a) => Array.from(a, (b) => b.toString(16).padStart(2, "0")).join(" ");
const h4 = (n) => "0x" + n.toString(16).padStart(4, "0");
function show() { $("report").textContent = JSON.stringify(R, null, 1); }
show();

// ---------------------------------------------------------------- 1. USB descriptors (no open, no claim)
const USB_CLASS = { 0: "per-interface", 1: "audio", 2: "CDC", 3: "HID", 8: "mass storage", 0xef: "misc", 0xfe: "app-specific", 0xff: "vendor" };
$("usb").onclick = async () => {
  if (!navigator.usb) { $("usbOut").textContent = "This browser has no WebUSB: use Chrome or Edge on a computer."; return; }
  try {
    const d = await navigator.usb.requestDevice({ filters: [] });
    const u = { vendorId: h4(d.vendorId), productId: h4(d.productId), manufacturer: d.manufacturerName || "", product: d.productName || "",
                usbVersion: `${d.usbVersionMajor}.${d.usbVersionMinor}.${d.usbVersionSubminor}`,
                deviceVersion: `${d.deviceVersionMajor}.${d.deviceVersionMinor}.${d.deviceVersionSubminor}`,
                class: d.deviceClass, subclass: d.deviceSubclass, protocol: d.deviceProtocol,
                serialPresent: !!d.serialNumber, configurations: [] };
    for (const c of d.configurations || []) {
      const cc = { value: c.configurationValue, name: c.configurationName || "", interfaces: [] };
      for (const i of c.interfaces) for (const a of i.alternates)
        cc.interfaces.push({ n: i.interfaceNumber, alt: a.alternateSetting, class: `${a.interfaceClass} ${USB_CLASS[a.interfaceClass] || ""}`.trim(),
                             subclass: a.interfaceSubclass, protocol: a.interfaceProtocol, name: a.interfaceName || "",
                             endpoints: a.endpoints.map((e) => `${e.direction} #${e.endpointNumber} ${e.type} ${e.packetSize}B`) });
      u.configurations.push(cc);
    }
    R.usb = u;
    $("usbOut").textContent = JSON.stringify(u, null, 1);
  } catch (e) { $("usbOut").textContent = "Not read: " + e.message; }
  show();
};

// ---------------------------------------------------------------- 2. HID report layout (no reports sent)
$("hid").onclick = async () => {
  if (!navigator.hid) { $("hidOut").textContent = "This browser has no WebHID: use Chrome or Edge on a computer."; return; }
  try {
    const ds = await navigator.hid.requestDevice({ filters: [] });
    R.hid = ds.map((d) => ({ vendorId: h4(d.vendorId), productId: h4(d.productId), product: d.productName,
      collections: d.collections.map((c) => ({ usagePage: h4(c.usagePage), usage: h4(c.usage), type: c.type,
        input: c.inputReports.map((r) => ({ id: r.reportId, bits: r.items.reduce((s, i) => s + i.reportSize * i.reportCount, 0) })),
        output: c.outputReports.map((r) => ({ id: r.reportId, bits: r.items.reduce((s, i) => s + i.reportSize * i.reportCount, 0) })),
        feature: c.featureReports.map((r) => ({ id: r.reportId, bits: r.items.reduce((s, i) => s + i.reportSize * i.reportCount, 0) })) })) }));
    $("hidOut").textContent = JSON.stringify(R.hid, null, 1);
  } catch (e) { $("hidOut").textContent = "Not read: " + e.message; }
  show();
};

// ---------------------------------------------------------------- 3. MIDI: ports, the identity query, what it sends
let access = null;
const HS_QUERY = [0xF0, 0x00, 0x32, 0x45, 0x00, 0x00, 0x00, 0x40, 0x7F, 0xF7];   // M-VAVE's updater asks this (fm1_install.py)
const UNIVERSAL_ID = [0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7];                       // the standard MIDI identity request
function unpack7(s) {
  const out = []; let acc = 0, nb = 0;
  for (const b of s) { acc |= (b & 0x7F) << nb; nb += 7; while (nb >= 8) { out.push(acc & 0xFF); acc >>= 8; nb -= 8; } }
  return out;
}
function identityOf(p) {                                                        // as fm1_install.py parse_identity
  if (p.length < 2 || p[0] !== 0xF0 || p[p.length - 1] !== 0xF7) return null;
  const d = unpack7(p.slice(1, -1));
  if (d.length !== 34 || d[0] !== 0x00 || d[1] !== 0x59 || d[2] !== 0x11) return null;
  return d.slice(6, 33).filter((c) => c).map((c) => (c >= 32 && c < 127 ? String.fromCharCode(c) : "?")).join("");
}
function logMidi(line) {
  R.midi.log.push(line);
  if (R.midi.log.length > 400) R.midi.log.shift();
  $("midiOut").textContent = R.midi.log.join("\n");
  $("midiOut").scrollTop = 1e9;
  show();
}
function describe(d) {
  const s = d[0] & 0xF0, ch = (d[0] & 0x0F) + 1;
  if (d[0] === 0xF0) return `SysEx ${d.length} B: ${hex(d.length > 64 ? d.slice(0, 64) : d)}${d.length > 64 ? " ..." : ""}`;
  const name = { 0x80: "note off", 0x90: "note on", 0xA0: "poly AT", 0xB0: "CC", 0xC0: "program", 0xD0: "chan AT", 0xE0: "pitch bend" }[s];
  return name ? `ch ${ch} ${name} ${hex(d.slice(1))}` : hex(d);
}
$("midi").onclick = async () => {
  if (!navigator.requestMIDIAccess) { $("midiOut").textContent = "This browser has no Web MIDI: use Chrome or Edge on a computer."; return; }
  try {
    access = await navigator.requestMIDIAccess({ sysex: true });
    R.midi.ports = [];
    for (const p of [...access.inputs.values(), ...access.outputs.values()]) R.midi.ports.push(`${p.type}: ${p.name} (${p.manufacturer || "?"})`);
    for (const inp of access.inputs.values())
      inp.onmidimessage = (ev) => {
        const d = Array.from(ev.data);
        if (d[0] === 0xF8 || d[0] === 0xFE) return;                              // (clock, active sensing)
        const id = identityOf(d);
        if (id) { R.midi.identity.push(`${inp.name}: ${id}`); logMidi(`IDENTITY from ${inp.name}: ${id}`); return; }
        logMidi(`${(ev.timeStamp / 1000).toFixed(2)}s ${inp.name}: ${describe(d)}`);
      };
    logMidi("ports:\n  " + R.midi.ports.join("\n  "));
    const sel = $("port"), outs = [...access.outputs.values()];
    sel.replaceChildren();
    const none = new Option("(pick the BlackBox's output)", "");
    sel.add(none);
    for (const o of outs) {
      const opt = new Option(o.name, o.id);
      if (/black|box|m-vave|mvave|\bann\b/i.test(o.name) && !sel.value) opt.selected = true;
      sel.add(opt);
    }
    sel.disabled = false;
    $("ask").disabled = false;
  } catch (e) { $("midiOut").textContent = "MIDI not opened: " + e.message; }
  show();
};
$("ask").onclick = () => {
  const o = access.outputs.get($("port").value);
  if (!o) { logMidi("pick the BlackBox's MIDI output first (nothing sent)"); return; }
  o.send(HS_QUERY);
  setTimeout(() => o.send(UNIVERSAL_ID), 300);
  logMidi(`asked ${o.name} its identity`);
  setTimeout(() => { if (!R.midi.identity.length) logMidi("no identity reply (yet): that is a result too"); }, 2500);
};
$("clear").onclick = () => { R.midi.log = []; $("midiOut").textContent = ""; show(); };

// ---------------------------------------------------------------- 4. Bluetooth: the GATT table, reads, notifications
// the BlackBox V20's GATT table (from its firmware): Generic Access 1800 (2A00 the name), JieLi's data service AE40
// (AE41 write, AE42 notify), BLE-MIDI. The common standard ones are asked for too, in case another version has them.
const BLE_MIDI_SVC = "03b80e5a-ede8-4b33-a751-6ce34ec4c700", BLE_MIDI_CHR = "7772e5db-3868-4112-a1a9-f2669d106bf3";
const BLE_SERVICES = [0x1800, 0x1801, 0x180a, 0x180f, 0xae40, 0xae00, 0xfff0, 0xffe0, BLE_MIDI_SVC];
const bleName = (u) => ({ "00001800": "Generic Access", "00001801": "Generic Attribute", "0000180a": "Device Information",
  "0000180f": "Battery", "0000ae40": "JieLi data (AE40)", "03b80e5a": "BLE-MIDI" })[u.slice(0, 8)] || "";
let gatt = null, midiChr = null, bleSysex = null, bleStatus = 0;
function bleLog(line) {
  R.ble.log.push(line);
  if (R.ble.log.length > 400) R.ble.log.shift();
  $("bleOut").textContent = R.ble.log.join("\n");
  $("bleOut").scrollTop = 1e9;
  show();
}
const text = (dv) => Array.from(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength), (c) => (c >= 32 && c < 127 ? String.fromCharCode(c) : ".")).join("");
const bytes = (dv) => Array.from(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength));
function bleMidiIn(p) {                                   // a BLE-MIDI packet: header, then [timestamp] status data ...
  const out = [];
  for (let i = 1; i < p.length; i++) {
    const b = p[i];
    if (bleSysex) {
      if (b >= 0x80 && p[i + 1] === 0xF7) { bleSysex.push(0xF7); out.push(bleSysex); bleSysex = null; i++; }
      else if (b < 0x80) bleSysex.push(b);
      continue;
    }
    if (b >= 0x80 && i + 1 < p.length && p[i + 1] >= 0x80) {                      // timestamp, status
      const st = p[++i];
      if (st === 0xF0) { bleSysex = [0xF0]; continue; }
      if (st < 0xF0) bleStatus = st;                                                // (running status from here)
      const m = [st];
      while (i + 1 < p.length && p[i + 1] < 0x80) m.push(p[++i]);
      out.push(m);
    } else if (b >= 0x80) {                                                         // timestamp, running status
      const m = bleStatus ? [bleStatus] : [];
      while (i + 1 < p.length && p[i + 1] < 0x80) m.push(p[++i]);
      if (m.length) out.push(m);
    }
  }
  for (const m of out) {
    const id = identityOf(m);
    if (id) { R.midi.identity.push(`BLE: ${id}`); bleLog(`IDENTITY over BLE-MIDI: ${id}`); }
    else bleLog(`BLE-MIDI: ${describe(m)}`);
  }
}
$("ble").onclick = async () => {
  if (!navigator.bluetooth) { $("bleOut").textContent = "This browser has no Web Bluetooth: use Chrome or Edge (computer or Android), or Bluefy on an iPhone."; return; }
  try {
    const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES });
    R.ble.device = dev.name || "(no name)";
    R.ble.services = [];
    R.ble.log = [];
    bleLog(`connecting to ${R.ble.device} ...`);
    dev.addEventListener("gattserverdisconnected", () => { bleLog("disconnected"); $("bleAsk").disabled = $("bleOff").disabled = true; });
    gatt = await dev.gatt.connect();
    for (const svc of await gatt.getPrimaryServices()) {
      const S = { uuid: svc.uuid, name: bleName(svc.uuid), characteristics: [] };
      R.ble.services.push(S);
      bleLog(`service ${svc.uuid} ${S.name}`);
      for (const c of await svc.getCharacteristics()) {
        const pr = c.properties, props = ["read", "write", "writeWithoutResponse", "notify", "indicate"].filter((k) => pr[k]);
        const C = { uuid: c.uuid, props };
        S.characteristics.push(C);
        if (pr.read) {
          try { const v = await c.readValue(); C.value = text(v); C.hex = hex(bytes(v)); } catch (e) { C.readError = e.message; }
        }
        bleLog(`  char ${c.uuid} [${props.join(" ")}]${C.value !== undefined ? ` = "${C.value}" (${C.hex})` : ""}`);
        if (pr.notify || pr.indicate) {
          const midi = c.uuid === BLE_MIDI_CHR;
          if (midi) midiChr = c;
          c.addEventListener("characteristicvaluechanged", (ev) => {
            const b = bytes(ev.target.value);
            if (midi) bleMidiIn(b);
            else bleLog(`${c.uuid.slice(4, 8).toUpperCase()} notify ${b.length} B: ${hex(b.slice(0, 64))}${b.length > 64 ? " ..." : ""}`);
          });
          try { await c.startNotifications(); bleLog(`    listening`); } catch (e) { bleLog(`    can't listen: ${e.message}`); }
        }
      }
    }
    $("bleAsk").disabled = !midiChr;
    $("bleOff").disabled = false;
    bleLog("ready: use the pedal's controls");
  } catch (e) { bleLog("Bluetooth: " + e.message); }
  show();
};
$("bleAsk").onclick = async () => {                        // the same identity query, as one BLE-MIDI SysEx packet
  const pkt = [0x80, 0x80, ...HS_QUERY.slice(0, -1), 0x80, 0xF7];
  try { await midiChr.writeValueWithoutResponse(new Uint8Array(pkt)); bleLog("asked its identity over BLE-MIDI"); }
  catch (e) { bleLog("not sent: " + e.message); }
  setTimeout(() => { if (!R.midi.identity.some((x) => x.startsWith("BLE"))) bleLog("no identity reply over BLE (yet): that is a result too"); }, 2500);
};
$("bleOff").onclick = () => { if (gatt) gatt.disconnect(); };

// ---------------------------------------------------------------- 5. the report
$("copy").onclick = async () => {
  try { await navigator.clipboard.writeText(JSON.stringify(R, null, 1)); $("copy").textContent = "Copied"; }
  catch { $("copy").textContent = "Select the report and copy it"; }
};
$("save").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(R, null, 1)], { type: "application/json" }));
  a.download = "blackbox-probe-report.json";
  a.click();
};
