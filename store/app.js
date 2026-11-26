"use strict";
// Soup Lab storefront. Plain DOM, no framework. Every piece of data is put on
// the page as text (never innerHTML), so catalog content can't inject markup.

const CFG = Object.assign({
  supabaseUrl: "", supabaseAnonKey: "", brand: "LucidSoup Drops", tagline: "", legalName: "",
  contactEmail: "", refundDays: 14,
}, window.SHOP_CONFIG || {});
const LIVE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
const API = CFG.supabaseUrl.replace(/\/+$/, "");
const HEADERS = { "Content-Type": "application/json", apikey: CFG.supabaseAnonKey, Authorization: `Bearer ${CFG.supabaseAnonKey}` };
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const SVG = "http://www.w3.org/2000/svg";

// ---------------------------------------------------------------- tiny DOM helpers
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  return fill(el, attrs, kids);
}
function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVG, tag);
  return fill(el, attrs, kids);
}
function fill(el, attrs, kids) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.setAttribute("class", v);
    else if (k === "style" && typeof v === "object") for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}
const $ = (q) => document.querySelector(q);
const money = (c) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);
const size = (b) => !b ? "" : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
const PLATFORM = { mac: "🍎", windows: "🪟", linux: "🐧", any: "" };
const fileLabel = (f) => (PLATFORM[f.platform] ? PLATFORM[f.platform] + " " : "") + f.label;
const KIND = { plugin: "Plugin", sample_pack: "Sample pack", tool: "Tool", firmware: "Firmware", max_device: "Max for Live", drambo_rack: "Drambo rack", bundle: "Everything" };
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
async function api(path, init = {}) {
  const res = await fetch(`${API}/functions/v1/${path}`, { ...init, headers: { ...HEADERS, ...init.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Something went wrong — please try again.");
  return body;
}
/* What a thing used to cost, when it is a bundle of things that still sell
   one at a time. Only shown when the catalogue says so and the saving is
   real — a struck-through number that is not actually higher is a lie, and
   the one check that stops it is cheaper than the apology. */
const saving = (v) => (v.compare_at_cents && v.compare_at_cents > v.price_cents ? v.compare_at_cents - v.price_cents : 0);

const head = (title, dlg) => h("div", { class: "dlg-head" }, h("h2", {}, title), h("button", { class: "x", "aria-label": "Close", onclick: () => dlg.close() }, "×"));

// ---------------------------------------------------------------- classes (categories) and their colours
const CLASSES = [
  // White, and first: a bundle is not one class beside the others, it is all
  // of them in one box.
  ["Bundles", "#ffffff"],
  ["Instruments", "#ff00e6"],
  // Green: the shop had no class for an effect, and four of these are
  // nothing else. Lime is next door and cyan is one over, so this sits
  // between them — the one hue the table was not already using.
  ["Effects", "#00e676"],
  ["DJ & Performance", "#00ffd5"],
  ["Utilities", "#aaff00"],
  ["Sample Packs", "#ff6a3d"],
  ["Drambo Racks", "#c77dff"],
  ["Bridges & Max for Live", "#7b9bff"],
  ["Hardware Lab", "#ffb000"],
];
const classColor = (c) => (CLASSES.find(([n]) => n === c) || [null, "#ebe8ff"])[1];
const classOrder = (c) => { const i = CLASSES.findIndex(([n]) => n === c); return i < 0 ? 99 : i; };

// ---------------------------------------------------------------- demo catalog (until Supabase is configured)
const DEMO = [
  ["SoupLoop", "Sl", "Instruments", "plugin", 3900, "Looper · sampler · sequencer with a dubstep bass lab", ["VST3", "AU", "Standalone"]],
  ["Kelp", "Kp", "Instruments", "plugin", 3500, "Modular synth and tracker on a cable canvas", ["VST3", "AU", "Standalone"]],
  ["BassBoY", "Bb", "Instruments", "plugin", 2900, "A screaming robot head that sings dubstep bass", ["VST3", "CLAP", "AU"]],
  ["ScratchSoup", "Sc", "DJ & Performance", "plugin", 2500, "Two psychedelic turntables you can actually scratch", ["VST3", "AU", "Standalone"]],
  ["Snap to C", "C", "Utilities", "plugin", 0, "Tunes any sample to the nearest C for chromatic play", ["VST3", "AU", "CLI"]],
  ["SoupLoop Bridge", "Br", "Bridges & Max for Live", "max_device", 0, "Locks SoupLoop's video lab to Ableton Live's clock", ["Max for Live"]],
  ["DarkEffectFX", "Df", "Hardware Lab", "tool", 0, "An everything-effects engine for a pocket pedal", ["CLI", "C library"]],
  ["SynthSoup", "Ss", "Hardware Lab", "firmware", 0, "Psychedelic custom firmware for a pocket FM synth", ["Firmware"]],
  ["Drambo Instruments", "Di", "Drambo Racks", "drambo_rack", 1200, "Five Code-module synth voices for Drambo, tuned to 432 Hz", ["Drambo Code"]],
  ["Drambo FX Racks", "Dx", "Drambo Racks", "drambo_rack", 1500, "Nine Code-module effects: granular, tape, resonators, reverb", ["Drambo Code"]],
  ["Drambo Utilities", "Du", "Drambo Racks", "drambo_rack", 0, "Sample Stepper and Video Slicer for Drambo, free", ["Drambo Code"]],
].map(([title, symbol, category, kind, price, tagline, formats], i) => ({
  id: "demo-" + i, slug: "demo-" + i, title, symbol, category, kind, tagline, formats, status: "soon", sort: i + 1,
  images: [], preview_url: null, product_files: [], specs: { Status: "Demo listing" },
  description: "Sample listing — the live catalog appears here once the shop is connected to Supabase.",
  variants: [{ id: `demo-${i}`, name: "Default", price_cents: price, image: null }],
}));

let PRODUCTS = [];
let filter = "All";
const isFree = (p) => p.variants[0].price_cents === 0;
const buyable = (p) => p.status === "active";
const symbolOf = (p) => p.symbol || (p.title.replace(/[^A-Za-z]/g, "").slice(0, 2).replace(/^(.)(.?)/, (_, a, b) => a.toUpperCase() + b.toLowerCase()) || "?");
const atomic = (p) => String(PRODUCTS.indexOf(p) + 1).padStart(3, "0");
// A fixed, per-product tilt: chaos that stays put between visits.
function tiltOf(slug) {
  let x = 0;
  for (const ch of slug) x = (x * 31 + ch.charCodeAt(0)) | 0;
  return ((x % 17) / 17) * 1.6 - 0.8;
}

async function loadCatalog() {
  if (!LIVE) return DEMO;
  const url = `${API}/rest/v1/products?select=id,slug,title,tagline,description,images,category,kind,formats,preview_url,sort,status,symbol,specs,` +
    `variants(id,name,image,price_cents,compare_at_cents),product_files(id,label,platform,bytes,sort)&status=in.(active,soon)&kind=neq.physical&order=sort.asc,created_at.desc`;
  const res = await fetch(url, { headers: { apikey: CFG.supabaseAnonKey, Authorization: `Bearer ${CFG.supabaseAnonKey}` } });
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  const rows = await res.json();
  return rows.filter((p) => p.variants?.length).map((p) => ({
    ...p,
    variants: p.variants.sort((a, b) => a.price_cents - b.price_cents),
    product_files: (p.product_files || []).sort((a, b) => a.sort - b.sort),
  })).sort((a, b) => classOrder(a.category) - classOrder(b.category) || a.sort - b.sort);
}

// ---------------------------------------------------------------- the apparatus: flask, drips, gears that really mesh
// Gears share one tooth size (pitch radius = 2 × teeth), so any pair meshes. A
// driven gear turns at -N1/N2 the speed of its driver, phased so a tooth of one
// sits in a gap of the other along the line between their centres.
function gearPath(teeth) {
  const r = teeth * 2, ra = r + 4, rd = r - 5, step = (Math.PI * 2) / teeth, pts = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    for (const [ang, rad] of [[a - step * 0.5, rd], [a - step * 0.28, rd], [a - step * 0.16, ra], [a + step * 0.16, ra], [a + step * 0.28, rd]]) {
      pts.push(`${(Math.cos(ang) * rad).toFixed(2)},${(Math.sin(ang) * rad).toFixed(2)}`);
    }
  }
  return `M${pts.join("L")}Z`;
}
function buildApparatus() {
  const svgEl = $("#apparatus");
  const defs = s("defs", {},
    s("linearGradient", { id: "soupGrad", x1: "0", y1: "0", x2: "1", y2: "1" },
      s("stop", { offset: "0", "stop-color": "#ff00e6" }), s("stop", { offset: ".45", "stop-color": "#7b2bff" }),
      s("stop", { offset: ".75", "stop-color": "#00ffd5" }), s("stop", { offset: "1", "stop-color": "#aaff00" })),
    s("filter", { id: "swirl", x: "-10%", y: "-10%", width: "120%", height: "120%" },
      s("feTurbulence", { type: "fractalNoise", baseFrequency: "0.018", numOctaves: "2", seed: "7", result: "n" },
        REDUCED ? null : s("animate", { attributeName: "baseFrequency", dur: "18s", values: "0.018;0.032;0.018", repeatCount: "indefinite" })),
      s("feDisplacementMap", { in: "SourceGraphic", in2: "n", scale: "26" })),
    s("filter", { id: "goo" },
      s("feGaussianBlur", { in: "SourceGraphic", stdDeviation: "4", result: "b" }),
      s("feColorMatrix", { in: "b", values: "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" })),
    s("clipPath", { id: "flaskClip" }, s("path", { d: flaskPath() })));

  // measurement scale on the left
  const scale = s("g", {});
  for (let i = 0; i <= 20; i++) {
    const y = 60 + i * 13;
    scale.append(s("line", { class: "tick", x1: "14", x2: i % 5 ? "22" : "30", y1: y, y2: y }));
    if (i % 5 === 0) scale.append(s("text", { x: "34", y: y + 3 }, `${(20 - i) * 25}ml`));
  }

  // the flask: swirling soup with bubbles, and a spout that drips into a beaker
  const bubbles = s("g", {});
  for (let i = 0; i < 9; i++) {
    bubbles.append(s("circle", { class: "bubble", cx: 112 + ((i * 37) % 96), cy: 300 - (i % 3) * 8, r: 3 + (i % 4),
      fill: "rgba(255,255,255,.55)", style: { "--t": `${2.4 + (i % 5) * 0.5}s`, "--d": `${(i * 0.37).toFixed(2)}s` } }));
  }
  const wave = s("path", { d: "M60 196 Q 100 186 140 196 T 220 196 T 300 196 V 340 H 60 Z", fill: "url(#soupGrad)", filter: "url(#swirl)" },
    REDUCED ? null : s("animate", { attributeName: "d", dur: "4s", repeatCount: "indefinite",
      values: "M60 196 Q 100 186 140 196 T 220 196 T 300 196 V 340 H 60 Z;M60 196 Q 100 206 140 196 T 220 196 T 300 196 V 340 H 60 Z;M60 196 Q 100 186 140 196 T 220 196 T 300 196 V 340 H 60 Z" }));
  const flask = s("g", {},
    s("g", { "clip-path": "url(#flaskClip)" }, s("g", { class: "liquid" }, wave, bubbles)),
    s("path", { class: "glass", d: flaskPath() }),
    s("path", { d: "M150 78 H 214", stroke: "rgba(200,255,250,.6)", "stroke-width": "3" }),
    s("text", { x: "120", y: "360" }, "SPECIMEN Nº 432 · SOUP"));

  // spout: a bent tube from the flask neck to a beaker, with goo drips falling
  const spout = s("path", { d: "M200 96 C 250 70, 300 70, 330 100 L 352 128", fill: "none", stroke: "rgba(200,255,250,.55)", "stroke-width": "7", "stroke-linecap": "round" });
  const falling = s("g", { filter: "url(#goo)" },
    s("rect", { x: "346", y: "124", width: "14", height: "8", rx: "3", fill: "#ff00e6" }),
    ...[0, 0.65, 1.3].map((d) => s("ellipse", { class: "fall", cx: "353", cy: "134", rx: "5", ry: "7", fill: "#ff00e6", style: { "--d": `${d}s` } })));
  const beaker = s("g", {},
    s("rect", { x: "322", y: "226", width: "64", height: "8", fill: "url(#soupGrad)", opacity: ".9" }),
    s("path", { class: "glass", d: "M318 196 V 290 Q 318 300 328 300 H 380 Q 390 300 390 290 V 196" }),
    s("rect", { x: "321", y: "234", width: "66", height: "64", rx: "6", fill: "url(#soupGrad)", opacity: ".55", class: "liquid" }));

  // gear train
  const train = [
    { teeth: 14, x: 452, y: 96, cls: "gear" },
    { teeth: 9, cls: "gear alt", angle: 2.2 },
    { teeth: 20, cls: "gear acid", angle: 1.15 },
    { teeth: 8, cls: "gear", angle: 2.7 },
  ];
  for (let i = 1; i < train.length; i++) {
    const p = train[i - 1], g = train[i], dist = (p.teeth + g.teeth) * 2;
    g.x = p.x + Math.cos(g.angle) * dist;
    g.y = p.y + Math.sin(g.angle) * dist;
  }
  const gearEls = train.map((g) => {
    const body = s("g", {},
      s("path", { class: g.cls, d: gearPath(g.teeth) }),
      s("circle", { r: Math.max(4, g.teeth * 0.6), fill: "none", stroke: "rgba(255,255,255,.35)" }),
      s("circle", { r: "2.5", fill: "#fff" }),
      ...[0, 1, 2].map((k) => s("line", { x1: "0", y1: "0", x2: (Math.cos(k * 2.094) * g.teeth * 1.4).toFixed(1), y2: (Math.sin(k * 2.094) * g.teeth * 1.4).toFixed(1), stroke: "rgba(255,255,255,.18)" })));
    return { ...g, el: s("g", { transform: `translate(${g.x.toFixed(1)} ${g.y.toFixed(1)})` }, body), body };
  });

  // pressure gauge
  const needle = s("line", { x1: "0", y1: "0", x2: "0", y2: "-26", stroke: "#aaff00", "stroke-width": "2", "stroke-linecap": "round" });
  const gauge = s("g", { transform: "translate(472 300)" },
    s("circle", { r: "34", fill: "rgba(0,0,0,.6)", stroke: "rgba(200,255,250,.55)", "stroke-width": "2" }),
    ...Array.from({ length: 11 }, (_, i) => {
      const a = (-135 + i * 27) * Math.PI / 180;
      return s("line", { class: "tick", x1: (Math.sin(a) * 26).toFixed(1), y1: (-Math.cos(a) * 26).toFixed(1), x2: (Math.sin(a) * 31).toFixed(1), y2: (-Math.cos(a) * 31).toFixed(1) });
    }),
    needle, s("circle", { r: "3", fill: "#fff" }),
    s("text", { x: "-16", y: "20" }, "PSI·FX"));

  svgEl.replaceChildren(defs, scale, spout, falling, beaker, flask, ...gearEls.map((g) => g.el), gauge);

  // drive the gears and the gauge
  let speed = 0.55; // radians per second for the first gear
  svgEl.addEventListener("pointerenter", () => { speed = 1.6; });
  svgEl.addEventListener("pointerleave", () => { speed = 0.55; });
  let a0 = 0, last = performance.now();
  function frame(now) {
    a0 += speed * Math.min(0.05, (now - last) / 1000);
    last = now;
    let prevAngle = a0;
    gearEls.forEach((g, i) => {
      let ang = a0;
      if (i > 0) {
        const p = gearEls[i - 1], theta = Math.atan2(g.y - p.y, g.x - p.x);
        ang = theta + Math.PI - Math.PI / g.teeth - (prevAngle - theta) * (p.teeth / g.teeth);
      }
      prevAngle = ang;
      g.body.setAttribute("transform", `rotate(${(ang * 180 / Math.PI).toFixed(2)})`);
    });
    needle.setAttribute("transform", `rotate(${(Math.sin(now / 900) * 38 + Math.sin(now / 237) * 6).toFixed(1)})`);
    if (!REDUCED) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
function flaskPath() {
  // a round-bottom flask with a long neck
  return "M150 70 H 214 V 150 C 214 168, 300 180, 300 250 C 300 310, 250 340, 182 340 C 114 340, 60 310, 60 250 C 60 180, 150 168, 150 150 Z";
}

function buildDrips() {
  const svgEl = $("#drips");
  const w = 1200;
  svgEl.setAttribute("viewBox", `0 0 ${w} 46`);
  const grad = s("linearGradient", { id: "dripGrad", x1: "0", x2: "1" },
    s("stop", { offset: "0", "stop-color": "#ff00e6" }), s("stop", { offset: ".5", "stop-color": "#00ffd5" }), s("stop", { offset: "1", "stop-color": "#aaff00" }));
  const g = s("g", { filter: "url(#hgoo)", fill: "url(#dripGrad)" }, s("rect", { x: "0", y: "0", width: w, height: "5" }));
  for (let i = 0; i < 22; i++) {
    const x = (i * 211) % w + 20;
    g.append(s("ellipse", { class: "drop", cx: x, cy: "4", rx: 4 + (i % 3) * 2, ry: 6 + (i % 4) * 2,
      style: { "--t": `${4 + (i % 5) * 1.3}s`, "--d": `${((i * 0.83) % 6).toFixed(2)}s` } }));
  }
  svgEl.replaceChildren(s("defs", {}, grad,
    s("filter", { id: "hgoo" }, s("feGaussianBlur", { in: "SourceGraphic", stdDeviation: "3", result: "b" }),
      s("feColorMatrix", { in: "b", values: "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" }))), g);
}

// ---------------------------------------------------------------- audio previews (one at a time)
const player = new Audio();
player.preload = "none";
let playing = null;
function togglePreview(p, btn) {
  if (playing === p.id) { player.pause(); return; }
  player.src = p.preview_url;
  player.play().catch(() => {});
  playing = p.id;
  document.querySelectorAll(".play").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
}
player.addEventListener("pause", () => { playing = null; document.querySelectorAll(".play").forEach((b) => b.setAttribute("aria-pressed", "false")); });

// ---------------------------------------------------------------- the periodic table
function renderLegend() {
  const classes = [...new Set(PRODUCTS.map((p) => p.category).filter(Boolean))].sort((a, b) => classOrder(a) - classOrder(b));
  const opts = [["All", null], ...classes.map((c) => [c, classColor(c)])];
  if (PRODUCTS.some(isFree)) opts.push(["Free", "#aaff00"]);
  if (PRODUCTS.some((p) => !buyable(p)) && PRODUCTS.some(buyable)) opts.push(["Available now", "#00ffd5"]);
  $("#legend").replaceChildren(...opts.map(([c, col]) =>
    h("button", { class: "chip", style: col ? { "--c": col } : null, "aria-pressed": String(c === filter), onclick: () => { filter = c; renderLegend(); renderTable(); } },
      col ? h("i", { "aria-hidden": "true" }) : null, c)));
}
function shown(p) {
  return filter === "All" || p.category === filter || (filter === "Free" && isFree(p)) || (filter === "Available now" && buyable(p));
}
function element(p) {
  const c = classColor(p.category);
  const v = p.variants[0];
  const tile = h("button", { class: "el", "aria-label": `${p.title}, ${p.category || KIND[p.kind] || ""}, ${v.price_cents ? money(v.price_cents) : "free"}${saving(v) ? `, down from ${money(v.compare_at_cents)}` : ""}${buyable(p) ? "" : ", in the lab"}`,
    onclick: () => openProduct(p.slug, true) },
    h("div", { class: "el-top" }, h("span", {}, atomic(p)),
      h("b", {}, saving(v) ? h("s", { class: "was" }, money(v.compare_at_cents)) : null, v.price_cents ? money(v.price_cents) : "FREE")),
    h("div", { class: "el-sym", "aria-hidden": "true" }, symbolOf(p)),
    h("div", { class: "el-name" }, p.title),
    h("div", { class: "el-sub" }, h("span", {}, KIND[p.kind] || ""),
      h("span", {}, (p.formats || []).filter((f) => f !== KIND[p.kind]).slice(0, 2).join(" · "))),
    buyable(p) ? null : h("span", { class: "stamp" }, "IN THE LAB"),
    h("span", { class: "goo" }), h("span", { class: "goo" }));
  return h("div", { class: "cell", style: { "--c": c, "--tilt": `${tiltOf(p.slug).toFixed(2)}deg` } }, tile,
    p.preview_url ? h("button", { class: "play", "aria-pressed": "false", "aria-label": `Play preview of ${p.title}`, onclick: (e) => togglePreview(p, e.currentTarget) }, "▶") : null);
}
function renderTable() {
  const list = PRODUCTS.filter(shown);
  const groups = new Map();
  for (const p of list) {
    const k = p.category || KIND[p.kind] || "Other";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  $("#table").replaceChildren(...(list.length ? [...groups].map(([name, items]) =>
    h("section", { class: "group", style: { "--c": classColor(name), "--n": String(Math.min(items.length, 3)) }, "aria-label": name },
      h("h3", {}, `${name} · ${items.length}`),
      h("div", { class: "elements" }, items.map(element))))
    : [h("div", { class: "empty" }, "Nothing in this class yet. The lab is brewing ✦")]));
  const live = PRODUCTS.filter(buyable).length;
  $("#table-meta").textContent = `${PRODUCTS.length} specimens · ${live} available now`;
  $("#r-count").textContent = String(PRODUCTS.length).padStart(2, "0");
  $("#r-classes").textContent = String(new Set(PRODUCTS.map((p) => p.category)).size).padStart(2, "0");
  $("#r-free").textContent = String(PRODUCTS.filter(isFree).length).padStart(2, "0");
}

// ---------------------------------------------------------------- specimen sheet (deep-linkable: ?p=slug)
const baseTitle = document.title;
function setSeo(p) {
  document.title = p ? `${p.title} — ${CFG.brand}` : baseTitle;
  $('meta[name="description"]').setAttribute("content", p ? (p.tagline || p.description || p.title).slice(0, 155) : CFG.tagline || "");
  document.getElementById("ld")?.remove();
  if (!p) return;
  const ld = h("script", { type: "application/ld+json", id: "ld" });
  ld.textContent = JSON.stringify({
    "@context": "https://schema.org", "@type": "Product", name: p.title, image: p.images, description: p.tagline || p.description,
    brand: { "@type": "Brand", name: CFG.brand },
    ...(buyable(p) ? { offers: p.variants.map((x) => ({ "@type": "Offer", price: (x.price_cents / 100).toFixed(2), priceCurrency: "USD", availability: "https://schema.org/InStock", url: location.href })) } : {}),
  });
  document.head.append(ld);
}

function freeForm(p) {
  const email = h("input", { type: "email", required: true, placeholder: "Your email", autocomplete: "email", "aria-label": "Email" });
  const consent = h("input", { type: "checkbox" });
  const out = h("div", { role: "status", class: "small" });
  const go = h("button", { class: "btn primary", type: "submit" }, "Extract it free →");
  return h("form", { class: "free", onsubmit: async (e) => {
    e.preventDefault();
    if (!LIVE) { out.textContent = "Demo mode — connect Supabase in config.js to give packs away."; return; }
    go.disabled = true; out.textContent = "Distilling…";
    try {
      const r = await api("claim-free", { method: "POST", body: JSON.stringify({ product_id: p.id, email: email.value, consent: consent.checked }) });
      if (r.token) { $("#pdp").close(); openDownloads({ token: r.token }); return; }
      out.textContent = `✦ Sent! Check ${email.value} for your download link (and your spam folder, just in case).`;
    } catch (err) {
      out.textContent = err.message; go.disabled = false;
    }
  } }, email, h("label", { class: "chk" }, consent, "Email me about new specimens. Unsubscribe any time."), go, out);
}

function openProduct(slug, push) {
  const p = PRODUCTS.find((x) => x.slug === slug);
  if (!p) return;
  if (push) history.pushState({ p: slug }, "", `?p=${encodeURIComponent(slug)}`);
  let v = p.variants[0];
  const dlg = $("#pdp");
  const c = classColor(p.category);
  dlg.style.setProperty("--c", c);

  function draw() {
    // Picking a different format rebuilds the sheet, which throws away the
    // "Try it" button but not the audio behind it.
    stopSimulation();
    const inCart = cart.some((l) => l.variant_id === v.id);
    const free = v.price_cents === 0;
    const specs = Object.entries(p.specs || {});
    let action;
    if (!buyable(p)) {
      // Two different "not yet": nothing has been built, or it is built and
      // sitting right there in the Contents list below. Telling somebody the
      // files do not exist while naming two of them reads as a shop that does
      // not know what it has.
      action = h("div", { class: "notice" }, p.product_files?.length
        ? "◉ IN THE LAB — the build is finished and listed below; this specimen just isn't on sale yet. Check back soon."
        : "◉ IN THE LAB — this specimen is catalogued but its files aren't released yet. Check back soon.");
    } else if (free) {
      action = freeForm(p);
    } else {
      action = h("div", { class: "buy" },
        h("button", { class: "btn primary", disabled: inCart, onclick: () => { addToCart(p, v); dlg.close(); openCart(); } }, inCart ? "In your cart ✓" : "Add to cart"),
        inCart ? h("button", { class: "btn", onclick: () => { dlg.close(); openCart(); } }, "Go to cart") : null);
    }
    dlg.replaceChildren(
      head(`Specimen ${symbolOf(p)}-${atomic(p)} · ${p.category || KIND[p.kind] || ""} · ${buyable(p) ? "stable" : "in the lab"}`, dlg),
      h("div", { class: "dlg-body sheet" },
        h("div", {},
          h("div", { class: "big" }, h("small", {}, atomic(p)), h("em", {}, KIND[p.kind] || ""), h("span", { "aria-hidden": "true" }, symbolOf(p))),
          ...(p.images || []).slice(0, 3).map((src) => h("img", { src, alt: p.title, loading: "lazy" })),
          p.preview_url ? h("audio", { controls: true, preload: "none", src: p.preview_url, "aria-label": "Preview" }) : null),
        h("div", {},
          h("h3", {}, p.title),
          p.tagline ? h("p", { class: "tagline" }, p.tagline) : null,
          free ? h("div", { class: "price free" }, "FREE")
               : h("div", { class: "price" }, money(v.price_cents),
                   saving(v) ? h("span", { class: "save" }, h("s", {}, money(v.compare_at_cents)),
                     " \u00b7 save " + money(saving(v))) : null),
          p.variants.length > 1 ? h("div", { class: "fmts", role: "group", "aria-label": "Options" }, p.variants.map((x) =>
            h("button", { class: "chip", "aria-pressed": String(x.id === v.id), onclick: () => { v = x; draw(); } }, `${x.name} · ${x.price_cents ? money(x.price_cents) : "free"}`))) : null,
          p.formats?.length ? h("div", { class: "fmts" }, p.formats.map((f) => h("span", { class: "fmt" }, f))) : null,
          action,
          buyable(p) ? h("p", { class: "small" }, free ? "Free download · no account needed" : "Instant download after payment · yours to keep") : null,
          simulation(p),
          specs.length ? h("table", { class: "labdata" }, h("caption", {}, "Lab data"),
            h("tbody", {}, specs.map(([k, val]) => h("tr", {}, h("th", { scope: "row" }, k), h("td", {}, String(val)))))) : null,
          p.product_files?.length ? [h("div", { class: "cap" }, "Contents"), h("ul", { class: "files" }, p.product_files.map((f) =>
            h("li", {}, h("span", {}, fileLabel(f)), h("span", { class: "sz" }, size(f.bytes)))))] : null,
          h("div", { class: "desc" }, p.description || ""))));
  }
  draw();
  setSeo(p);
  if (!dlg.open) dlg.showModal();
}

// The order they were built in, which is also the order they make sense in:
// the measuring tools, then the effects, then the instruments and the links.
const BENCH = ["spectraeye", "looprepeat", "syrupvox", "grainstorm", "mischief", "etherradio",
               "mindbloom", "blackwidow", "hydra", "euclidrings", "kelp", "snaptoc", "osclink"];

// ---------------------------------------------------------------- the simulation
/* Every plugin in here has a simulation built in demos.js: the real signal
   path, in Web Audio, in the page — not a video of one. It is wired by name
   (lucidDemos.find), so a specimen only offers one if a simulation for it
   actually exists.

   It mounts on a click rather than with the sheet. Two reasons: an AudioContext
   started without a gesture is suspended by every browser, and opening a
   specimen sheet should not start making noise at somebody. */
/* Whatever is playing, anywhere on the page. A simulation holds an oscillator
   bank and a requestAnimationFrame loop; hiding the dialog it lives in stops
   neither, so closing a sheet with a running simulation left it playing to an
   empty screen. One at a time, and it is stopped before the next starts. */
let running = null;
function stopSimulation() {
  if (!running) return;
  try { running.dispose(); } catch (err) { /* already gone */ }
  running = null;
}

function simulation(p) {
  const D = window.lucidDemos;
  const id = D && D.find ? (D.find(p.title) || D.find(p.slug)) : null;
  if (!id) return null;

  const host = h("div", { class: "demo-host" });
  const panel = h("div", { class: "demo", hidden: true },
    h("div", { class: "demo-bar" }, h("h3", {}, "Simulation", h("small", {}, "runs in this page \u00b7 nothing is downloaded"))),
    host);
  const open = h("button", { class: "btn", type: "button" }, "\u25b6 Try it in the page");
  open.addEventListener("click", () => {
    open.remove();
    panel.hidden = false;
    host.replaceChildren(h("p", { class: "demo-none" }, "Starting the simulation\u2026"));
    try {
      running = D.mount(id, host);
    } catch (err) {
      // A simulation that will not start is a broken toy, not a broken shop:
      // say so here and leave the rest of the sheet alone.
      host.replaceChildren(h("p", { class: "demo-none" }, "The simulation could not start in this browser. The plugin itself is unaffected."));
    }
  });
  return h("div", { class: "demo-wrap" }, open, panel);
}

// ---------------------------------------------------------------- cart (one of each: they're downloads)
let cart = store.get("lib-cart", []);
function saveCart() {
  store.set("lib-cart", cart);
  $("#cart-count").textContent = cart.length;
  $("#cart-count").dataset.n = cart.length;
}
function addToCart(p, v) {
  if (cart.some((l) => l.variant_id === v.id)) return;
  cart.push({ variant_id: v.id, slug: p.slug, title: p.title, name: v.name, price_cents: v.price_cents, symbol: symbolOf(p), category: p.category || "" });
  saveCart();
}
// Re-price the saved cart against the live catalog; drop anything gone, free, or not released.
function reconcileCart() {
  const live = new Map(PRODUCTS.filter(buyable).flatMap((p) => p.variants.map((v) => [v.id, v])));
  cart = cart.filter((l) => live.get(l.variant_id)?.price_cents > 0).map((l) => ({ ...l, price_cents: live.get(l.variant_id).price_cents }));
  saveCart();
}

function openCart() {
  const dlg = $("#cart");
  const err = h("div", { class: "err", role: "alert" });
  const total = cart.reduce((a, l) => a + l.price_cents, 0);
  const checkout = h("button", { class: "btn primary", style: { width: "100%", "justify-content": "center" }, disabled: !cart.length, onclick: go }, "Checkout securely →");

  async function go() {
    if (!LIVE) { err.textContent = "Demo mode — connect Supabase in config.js to take real orders."; return; }
    checkout.disabled = true; checkout.textContent = "Opening Stripe…";
    try {
      const body = await api("checkout", { method: "POST", body: JSON.stringify({ items: cart.map((l) => ({ variant_id: l.variant_id })) }) });
      const url = new URL(body.url);
      if (url.protocol !== "https:" || !/(^|\.)stripe\.com$/.test(url.hostname)) throw new Error("Unexpected checkout address.");
      location.href = url.href;
    } catch (e) {
      err.textContent = e.message;
      checkout.disabled = false; checkout.textContent = "Checkout securely →";
    }
  }

  dlg.replaceChildren(
    head("Your cart", dlg),
    h("div", { class: "dlg-body" },
      cart.length ? cart.map((l) => h("div", { class: "line" },
        h("div", { class: "sym", style: { "--c": classColor(l.category) } }, l.symbol || "?"),
        h("div", {},
          h("div", { class: "t" }, l.title + (l.name && l.name !== "Default" ? ` — ${l.name}` : "")),
          h("button", { class: "rm", onclick: () => { cart = cart.filter((x) => x !== l); saveCart(); openCart(); } }, "remove")),
        h("div", { class: "price", style: { "font-size": "15px" } }, money(l.price_cents))))
        : h("p", { class: "small" }, "The beaker is empty."),
      h("div", { class: "total" }, h("span", {}, "Total"), h("span", {}, money(total))),
      h("p", { class: "small" }, "Downloads unlock the moment payment goes through. Taxes, if any, are shown at checkout."),
      checkout, err));
  if (!dlg.open) dlg.showModal();
}

// ---------------------------------------------------------------- downloads page (?dl=token, or right after checkout)
async function openDownloads({ token, session, number }) {
  const dlg = $("#downloads");
  const body = h("div", { class: "dlg-body" }, h("p", { class: "small" }, "Fetching your files…"));
  dlg.replaceChildren(head(number ? `Order ${number}` : "Your downloads", dlg), body);
  if (!dlg.open) dlg.showModal();
  if (!LIVE) { body.replaceChildren(h("p", { class: "small" }, "Demo mode — no downloads yet.")); return; }

  let r;
  try {
    // Right after checkout the payment webhook can take a few seconds to land.
    for (let i = 0; i < 15; i++) {
      r = await api(`download?${token ? "token=" + encodeURIComponent(token) : "session=" + encodeURIComponent(session)}`);
      if (!r.pending) break;
      body.replaceChildren(h("p", { class: "small" }, "Payment received — unlocking your downloads…"));
      await new Promise((ok) => setTimeout(ok, 2000));
    }
  } catch (e) {
    body.replaceChildren(h("p", { class: "err" }, e.message), h("p", { class: "small" }, "Use My downloads to get your links by email."));
    return;
  }
  if (r.pending) {
    body.replaceChildren(h("p", {}, "Your payment went through. The download link is on its way by email — it can take a minute."));
    return;
  }
  token = token || r.token;
  // Make the address bar the permanent link, so a bookmark brings them back.
  history.replaceState({}, "", `?dl=${encodeURIComponent(token)}`);
  const fileUrl = (id) => `${API}/functions/v1/download?token=${encodeURIComponent(token)}&file=${encodeURIComponent(id)}`;
  body.replaceChildren(
    r.free ? h("p", {}, "✦ Extraction complete. Enjoy!") : h("p", {}, `✦ Thank you! Order ${r.number} is paid and ready.`),
    ...r.items.map((it) => h("div", { class: "dl" },
      h("h3", {}, it.title),
      it.files.length ? it.files.map((f) => h("a", { class: "btn", href: fileUrl(f.id), rel: "nofollow noreferrer" },
        h("span", {}, "⬇ ", fileLabel(f)), h("span", { class: "small" }, size(f.bytes))))
        : h("p", { class: "small" }, "Files are being prepared — we'll email you when they're ready."))),
    h("p", { class: "small" }, `Bookmark this page: it's your personal download link. ${r.downloads_left} downloads left on this order.`));
}

// ---------------------------------------------------------------- "My downloads": links by email
function openLibrary() {
  const dlg = $("#library");
  const out = h("div", { role: "status", style: { "margin-top": "12px" } });
  const email = h("input", { type: "email", placeholder: "Email used at checkout", required: true, autocomplete: "email", "aria-label": "Email" });
  const go = h("button", { class: "btn primary", type: "submit" }, "Email me my links");
  const form = h("form", { class: "track", onsubmit: async (e) => {
    e.preventDefault();
    if (!LIVE) { out.replaceChildren(h("p", { class: "small" }, "Demo mode — no orders yet.")); return; }
    go.disabled = true;
    try {
      const r = await api("resend-downloads", { method: "POST", body: JSON.stringify({ email: email.value }) });
      out.replaceChildren(h("p", {}, "✦ " + r.message));
    } catch (err) {
      out.replaceChildren(h("p", { class: "err" }, err.message));
      go.disabled = false;
    }
  } }, h("p", { class: "small", style: { margin: "0" } }, "Bought something or grabbed a free specimen? We'll email you fresh download links."), email, go);
  dlg.replaceChildren(head("My downloads", dlg), h("div", { class: "dlg-body" }, form, out));
  dlg.showModal();
}

// ---------------------------------------------------------------- policies (review these with your own situation in mind)
function policies() {
  const who = CFG.legalName || CFG.brand;
  const mail = CFG.contactEmail;
  // A function, not one element: a DOM node can only live in one place.
  const contact = () => mail ? h("a", { href: `mailto:${mail}` }, mail) : "the email address your download link came from";
  const P = (...t) => h("p", {}, ...t);
  return {
    license: ["License", [
      P(h("b", {}, "Sample packs. "), "Use the sounds royalty-free in your own music and audio productions, including commercial releases, streams, sync and client work. No credit needed (though it's appreciated)."),
      P("You may not resell, share, or redistribute the samples themselves, alone or in another sample pack, sound library, or instrument, or upload them to sample-sharing sites."),
      P(h("b", {}, "Plugins and tools. "), "A license for one person, installable on all of your own computers. Anything you make with them is yours. Don't share the installers or your download link."),
      P(h("b", {}, "Open-source specimens. "), "Some items (marked in their lab data) include open-source components or are open source themselves; their own licences come in the download and take precedence for those parts."),
      P(`All rights not granted here are reserved by ${who}.`),
    ]],
    refunds: ["Refunds", [
      P("Downloads are delivered instantly and can't be returned, so all sales are final once a file has been downloaded."),
      P("But if something doesn't work (a corrupt file, or a plugin that won't run on a supported system), email ", contact(), ` within ${CFG.refundDays} days. We'll fix it, or refund you in full if we can't.`),
      P("Bought the same thing twice by accident? Email us and we'll refund the duplicate."),
    ]],
    privacy: ["Privacy", [
      P(`${who} collects only what's needed to deliver your downloads: your email address, plus your name if you pay by card.`),
      P("Payments are processed by Stripe; we never see or store your card details."),
      P("We email you your download links and anything about your order. If you ticked the box, we also email you about new releases, and you can unsubscribe any time. We never sell your data."),
      P("To stop abuse, we keep a scrambled (hashed) form of your IP address with checkout and download requests for a limited time. This site stores your cart in your browser only."),
      P("To see or delete your data, email ", contact(), "."),
    ]],
    terms: ["Terms", [
      P(`By buying or downloading from ${who} you agree to these terms and the License. Prices are in USD; the price you pay is the one shown at checkout.`),
      P("Each order's download link allows a limited number of downloads. If you run out, email us and we'll reset it."),
      P("Plugins, tools and firmware are provided as-is: check the requirements in each item's lab data before buying. Firmware marked untested on hardware is installed at your own risk. Our liability is limited to the amount you paid."),
    ]],
    contact: ["Contact", [
      P("Questions, download problems, or license questions? Email ", contact(), ". We answer within 1–2 business days."),
      P("Include your order number (it starts with SL) to speed things up."),
    ]],
  };
}

/* ---- the bench ----
   Every simulation, whether or not a product in the catalogue is named after
   it. Thirteen of these exist; at the time of writing the catalogue names two
   of them, so without this the other eleven would be built, working and
   unreachable. A specimen sheet is still the better place to meet one — this
   is the way in for the rest. */
function openBench(pick) {
  const D = window.lucidDemos;
  const dlg = $("#bench");
  if (!D || !D.find) {
    dlg.replaceChildren(head("The bench", dlg),
      h("div", { class: "dlg-body" }, h("p", { class: "demo-none" }, "The simulations could not be loaded.")));
    return void dlg.showModal();
  }
  const ids = BENCH.filter((id) => D.has(id));
  let current = pick && ids.includes(pick) ? pick : ids[0];

  function draw() {
    stopSimulation();
    const host = h("div", { class: "demo-host" });
    dlg.replaceChildren(head("The bench", dlg),
      h("div", { class: "dlg-body" },
        h("p", { class: "small" }, "The real signal path of each plugin, running in this page. Nothing is downloaded and nothing is bought."),
        h("div", { class: "fmts", role: "group", "aria-label": "Choose a simulation" }, ids.map((id) =>
          h("button", { class: "chip", "aria-pressed": String(id === current), onclick: () => { current = id; draw(); } }, D.titleOf(id)))),
        h("div", { class: "demo" }, host)));
    try {
      running = D.mount(current, host);
    } catch (err) {
      host.replaceChildren(h("p", { class: "demo-none" }, "That simulation could not start in this browser."));
    }
  }
  draw();
  if (!dlg.open) dlg.showModal();
}

// ---------------------------------------------------------------- wiring
function wire() {
  document.querySelectorAll("[data-policy]").forEach((b) => b.addEventListener("click", () => {
    const [title, body] = policies()[b.dataset.policy];
    const dlg = $("#policy");
    dlg.replaceChildren(head(title, dlg), h("div", { class: "dlg-body policy" }, body));
    dlg.showModal();
  }));
  // Close dialogs by clicking the backdrop.
  document.querySelectorAll("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));
  document.querySelectorAll("[data-bench]").forEach((b) => b.addEventListener("click", () => openBench()));
  $("#btn-cart").addEventListener("click", openCart);
  $("#btn-library").addEventListener("click", openLibrary);
  // A dialog closing is the only signal that the thing inside it is finished.
  $("#bench").addEventListener("close", stopSimulation);
  $("#pdp").addEventListener("close", stopSimulation);
  $("#pdp").addEventListener("close", () => {
    if (new URLSearchParams(location.search).has("p")) history.pushState({}, "", location.pathname);
    setSeo(null);
  });
  $("#downloads").addEventListener("close", () => {
    if (new URLSearchParams(location.search).has("dl")) history.replaceState({}, "", location.pathname);
  });
  addEventListener("popstate", () => {
    const slug = new URLSearchParams(location.search).get("p");
    if (slug) openProduct(slug, false);
    else if ($("#pdp").open) $("#pdp").close();
  });
}

(async function boot() {
  wire();
  buildDrips();
  buildApparatus();
  $("#brand").textContent = CFG.brand;
  if (CFG.tagline) $("#hero-tag").textContent = CFG.tagline;
  $("#copy").textContent = `© ${new Date().getFullYear()} ${CFG.legalName || CFG.brand}`;

  const q = new URLSearchParams(location.search);
  const banners = $("#banners");
  if (q.has("cancelled")) {
    banners.append(h("div", { class: "banner info" }, "Checkout cancelled — your cart is saved."));
    history.replaceState({}, "", location.pathname);
  }
  if (!LIVE) banners.append(h("div", { class: "banner info" }, "Demo mode: sample catalog. Fill in config.js to go live."));
  // A download link that failed comes back here with the reason.
  if (q.get("err")) banners.append(h("div", { class: "banner info", role: "alert" }, q.get("err")));
  if (q.has("paid")) { cart = []; }
  saveCart();

  // The downloads page doesn't need the catalog: open it straight away.
  if (q.get("dl")) openDownloads({ token: q.get("dl") });
  else if (q.get("session")) openDownloads({ session: q.get("session"), number: q.get("paid") });

  try {
    PRODUCTS = await loadCatalog();
  } catch (e) {
    console.error(e);
    $("#table").replaceChildren(h("div", { class: "empty" }, "The lab is taking a breather — try again in a minute."));
    return;
  }
  if (LIVE) reconcileCart();
  renderLegend();
  renderTable();
  if (q.get("p")) openProduct(q.get("p"), false);
})();
