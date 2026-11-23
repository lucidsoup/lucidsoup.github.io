"use strict";
// Control Room: the editor for the Soup Lab catalog. Talks only to the `admin`
// edge function (which checks the session and does the writes) and uploads
// files straight to Storage through the signed URLs it hands out. Everything
// from the catalog is put on the page as text, never as HTML.

// Never inside someone else's frame: GitHub Pages can't send X-Frame-Options,
// and a framed editor could be used to trick a signed-in editor into clicks.
if (window.top !== window.self) {
  document.documentElement.textContent = "";
  try { window.top.location.href = window.location.href; } catch { /* blocked: stay blank */ }
  throw new Error("framed");
}

const CFG = Object.assign({ supabaseUrl: "", supabaseAnonKey: "" }, globalThis.SHOP_CONFIG || {});
const API = CFG.supabaseUrl.replace(/\/+$/, "");
const KINDS = { plugin: "Plugin", sample_pack: "Sample pack", tool: "Tool", firmware: "Firmware", max_device: "Max for Live", drambo_rack: "Drambo rack" };
const CATEGORIES = ["Instruments", "DJ & Performance", "Utilities", "Sample Packs", "Drambo Racks", "Bridges & Max for Live", "Hardware Lab"];
const STATUSES = [
  ["active", "Live", "On the site and can be bought or downloaded."],
  ["soon", "Soon", "On the site with its details, but not available yet."],
  ["hidden", "Hidden", "Off the site. Past buyers keep their downloads."],
  ["draft", "Draft", "Off the site while you work on it."],
];
const PLATFORMS = { any: "Any", mac: "macOS", windows: "Windows", linux: "Linux" };
const TOKEN_KEY = "soup-control-token";

// ---------------------------------------------------------------- DOM helpers
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}
const $ = (q) => document.querySelector(q);
const size = (b) => !b ? "" : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
const field = (label, input, hint) => h("label", null, h("span", null, label), input, hint ? h("small", { class: "hint" }, hint) : null);

let toastTimer;
function toast(msg, err = false) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const t = h("div", { class: "toast" + (err ? " err" : ""), role: err ? "alert" : "status" }, msg);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), err ? 7000 : 3500);
}

const store = {
  get() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } },
  set(v) { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode: session only */ } },
};
let token = store.get();

async function api(action, body = {}) {
  const res = await fetch(`${API}/functions/v1/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: CFG.supabaseAnonKey, Authorization: `Bearer ${CFG.supabaseAnonKey}`, "x-admin-token": token },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && action !== "login") {
    signedOut(data.error || "Please sign in.");
    throw new Error(data.error || "Please sign in.");
  }
  if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status}).`);
  return data;
}

// Busy-state wrapper for buttons: disables while working, shows errors as toasts.
async function busy(btn, fn) {
  if (btn) btn.disabled = true;
  try {
    return await fn();
  } catch (e) {
    toast(e.message, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Upload one file: signed URL from the function, then PUT with progress.
async function upload(file, { bucket, productId, onProgress }) {
  const { signedUrl, path, publicUrl } = await api("file.upload", { bucket, product_id: productId, filename: file.name, bytes: file.size });
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", file);
  await new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", signedUrl);
    x.setRequestHeader("x-upsert", "true");
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => x.status < 300 ? resolve() : reject(new Error(uploadError(x)));
    x.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    x.send(form);
  });
  return { path, publicUrl };
}
function uploadError(x) {
  try {
    const m = JSON.parse(x.responseText).message || "";
    if (/size|large/i.test(m)) return "That file is too big for storage (50 MB limit on the current plan).";
    return m || `Upload failed (${x.status}).`;
  } catch {
    return `Upload failed (${x.status}).`;
  }
}

// ---------------------------------------------------------------- sign in / invite
function signedOut(msg) {
  token = "";
  store.set("");
  state.editor = null;
  $("#tabs").hidden = true;
  $("#who").replaceChildren();
  showLogin(msg);
}

function gate(title, intro, fields, submitLabel, onSubmit) {
  const btn = h("button", { class: "go", type: "submit" }, submitLabel);
  const form = h("form", { class: "card gate" }, h("h2", null, title), h("p", null, intro), ...fields, btn);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    busy(btn, () => onSubmit(Object.fromEntries(new FormData(form))));
  });
  $("#app").replaceChildren(form);
  form.querySelector("input")?.focus();
}

function showLogin(msg) {
  gate("Enter the lab", msg || "Sign in to edit the catalog.", [
    field("Email", h("input", { name: "email", type: "email", autocomplete: "username", required: true })),
    field("Passphrase", h("input", { name: "password", type: "password", autocomplete: "current-password", required: true })),
  ], "Sign in", async (f) => {
    const r = await api("login", { email: f.email, password: f.password });
    signedIn(r);
  });
}

function showInvite(code) {
  gate("You're invited", "Choose the email and passphrase you'll use to sign in. A passphrase of three or four random words is easy to remember and hard to guess.", [
    field("Your name", h("input", { name: "name", autocomplete: "name", maxlength: "60" })),
    field("Email", h("input", { name: "email", type: "email", autocomplete: "username", required: true })),
    field("Passphrase", h("input", { name: "password", type: "password", autocomplete: "new-password", minlength: "10", required: true }), "At least 10 characters."),
  ], "Join the lab", async (f) => {
    const r = await api("accept", { code, name: f.name, email: f.email, password: f.password });
    history.replaceState(null, "", location.pathname);
    signedIn(r);
    toast("Welcome to the lab.");
  });
}

function signedIn(r) {
  token = r.token;
  store.set(token);
  state.editor = r.editor;
  start();
}

// ---------------------------------------------------------------- main
const state = { editor: null, editors: [], products: [], selected: null, draft: null, dirty: false, tab: "items" };

async function start() {
  const me = await api("me");
  state.editor = me.editor;
  state.editors = me.editors;
  $("#who").replaceChildren(
    h("span", null, me.editor.name || me.editor.email),
    h("a", { href: "./", target: "_blank", rel: "noopener" }, "View site ↗"),
    h("button", { class: "ghost", onclick: () => api("logout").finally(() => signedOut("Signed out.")) }, "Sign out"));
  $("#tabs").hidden = false;
  await loadCatalog();
  render();
}

async function loadCatalog() {
  state.products = (await api("catalog")).products;
}

function setTab(tab) {
  if (tab === state.tab) return;
  if (!leaveOk()) return;
  state.tab = tab;
  document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === tab)));
  render();
}

function leaveOk() {
  if (!state.dirty || confirm("You have unsaved changes. Leave without saving?")) {
    state.dirty = false;
    return true;
  }
  return false;
}
addEventListener("beforeunload", (e) => { if (state.dirty) e.preventDefault(); });

function render() {
  if (state.tab === "team") return renderTeam();
  const product = state.products.find((p) => p.id === state.selected) || null;
  if (!state.draft || (product && state.draft.id !== product.id)) state.draft = toDraft(product);
  $("#app").replaceChildren(h("div", { class: "layout" }, renderList(), renderEditor()));
}

function renderList() {
  const groups = new Map();
  for (const p of [...state.products].sort((a, b) => a.sort - b.sort)) {
    const k = p.category || "No category";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  const order = (k) => { const i = CATEGORIES.indexOf(k); return i < 0 ? 99 : i; };
  return h("aside", { class: "card list", "aria-label": "Items" },
    h("button", { class: "go new", onclick: () => select(null) }, "+ New item"),
    [...groups.keys()].sort((a, b) => order(a) - order(b) || a.localeCompare(b)).map((k) => [
      h("div", { class: "grp" }, k),
      groups.get(k).map((p) => h("button", {
        class: "item", "aria-current": String(p.id === state.selected), onclick: () => select(p.id),
      }, h("span", { class: "sym" }, p.symbol || "?"), h("span", null, p.title), h("span", { class: `pill ${p.status}` }, labelOf(p.status)))),
    ]));
}
const labelOf = (s) => (STATUSES.find(([k]) => k === s) || [, s])[1];

function select(id) {
  if (!leaveOk()) return;
  state.selected = id;
  state.draft = toDraft(state.products.find((p) => p.id === id) || null);
  render();
  scrollTo({ top: 0, behavior: "smooth" });
}

function toDraft(p) {
  const v = (p?.variants || []).find((x) => x.name === "Default") || p?.variants?.[0];
  return {
    id: p?.id || null, title: p?.title || "", symbol: p?.symbol || "", slug: p?.slug || "", category: p?.category || "",
    kind: p?.kind || "plugin", status: p?.status || "soon", tagline: p?.tagline || "", description: p?.description || "",
    formats: (p?.formats || []).join(", "), specs: Object.entries(p?.specs || {}), sort: p?.sort ?? state.products.length + 1,
    preview_url: p?.preview_url || "", images: [...(p?.images || [])],
    price: v ? (v.price_cents / 100).toFixed(2).replace(/\.00$/, "") : "0",
    files: [...(p?.product_files || [])].sort((a, b) => a.sort - b.sort),
  };
}

function renderEditor() {
  const d = state.draft;
  const touch = () => { state.dirty = true; dirtyNote.hidden = false; };
  const bind = (key, input) => { input.addEventListener("input", () => { d[key] = input.value; touch(); }); return input; };
  const dirtyNote = h("span", { class: "dirty", hidden: !state.dirty }, "● Unsaved changes");

  const statusHelp = h("div", { class: "status-help" });
  const statusBtns = STATUSES.map(([k, label, help]) => h("button", {
    type: "button", "aria-pressed": String(d.status === k), title: help,
    onclick: (e) => {
      d.status = k;
      statusBtns.forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
      statusHelp.textContent = help;
      touch();
    },
  }, label));
  statusHelp.textContent = STATUSES.find(([k]) => k === d.status)?.[2] || "";

  const cats = [...new Set([...CATEGORIES, ...state.products.map((p) => p.category).filter(Boolean)])];
  const specsBox = h("div", { style: "display:grid;gap:8px" });
  const drawSpecs = () => specsBox.replaceChildren(...d.specs.map((pair, i) => h("div", { class: "kv" },
    h("input", { value: pair[0], placeholder: "Label (e.g. Formats)", "aria-label": "Lab data label", oninput: (e) => { pair[0] = e.target.value; touch(); } }),
    h("input", { value: pair[1], placeholder: "Value", "aria-label": "Lab data value", oninput: (e) => { pair[1] = e.target.value; touch(); } }),
    h("button", { type: "button", class: "warn", "aria-label": "Remove row", onclick: () => { d.specs.splice(i, 1); drawSpecs(); touch(); } }, "×"))));
  drawSpecs();

  const thumbs = h("div", { class: "thumbs" });
  const drawThumbs = () => thumbs.replaceChildren(...d.images.map((src, i) => h("figure", null,
    h("img", { src, alt: "" }),
    h("button", { type: "button", "aria-label": "Remove image", onclick: () => { d.images.splice(i, 1); drawThumbs(); touch(); } }, "×"))));
  drawThumbs();

  const audio = h("div", { style: "display:grid;gap:8px" });
  const drawAudio = () => audio.replaceChildren(d.preview_url
    ? h("div", { class: "copy" }, h("audio", { controls: true, preload: "none", src: d.preview_url, style: "flex:1;min-width:0" }),
      h("button", { type: "button", class: "warn", onclick: () => { d.preview_url = ""; drawAudio(); touch(); } }, "Remove"))
    : h("small", { class: "hint" }, "No sound preview yet."));
  drawAudio();

  const mediaPicker = (accept, multiple, onFile, label) => {
    const input = h("input", { type: "file", accept, multiple, hidden: true });
    const btn = h("button", { type: "button", onclick: () => d.id ? input.click() : toast("Save the item first, then add pictures and sounds.", true) }, label);
    input.addEventListener("change", () => busy(btn, async () => {
      for (const f of input.files) {
        btn.textContent = `Uploading ${f.name}…`;
        const { publicUrl } = await upload(f, { bucket: "previews", productId: d.id });
        onFile(publicUrl);
      }
      touch();
      toast("Added. Press Save to put it on the site.");
    }).finally(() => { btn.textContent = label; input.value = ""; }));
    return [btn, input];
  };

  const saveBtn = h("button", { class: "go", type: "submit" }, d.id ? "Save" : "Create item");
  const form = h("form", { class: "card editor", novalidate: true },
    h("h2", null, d.id ? d.title || "Untitled" : "New item"),
    h("div", { class: "row wide" },
      field("Name", bind("title", h("input", { value: d.title, required: true, maxlength: "80" }))),
      field("Symbol", bind("symbol", h("input", { value: d.symbol, maxlength: "2", placeholder: "Sl" })), "1–2 letters, like an element."),
      field("Price", h("div", { class: "money" }, bind("price", h("input", { value: d.price, inputmode: "decimal" }))), "0 = free for an email.")),
    h("div", null, h("label", null, h("span", null, "Status")), h("div", { class: "status" }, statusBtns), statusHelp),
    h("div", { class: "row" },
      field("Category", bind("category", h("input", { value: d.category, list: "cats", maxlength: "40" })), "Pick one or type a new one."),
      h("datalist", { id: "cats" }, cats.map((c) => h("option", { value: c }))),
      field("Type", bind("kind", h("select", null, Object.entries(KINDS).map(([k, v]) => h("option", { value: k, selected: d.kind === k }, v))))),
      field("Order", bind("sort", h("input", { value: String(d.sort), inputmode: "numeric" })), "Lower shows first."),
      field("Web name", bind("slug", h("input", { value: d.slug, placeholder: "made from the name", maxlength: "60" })), "Used in links. Lowercase and dashes.")),
    field("Tagline", bind("tagline", h("input", { value: d.tagline, maxlength: "140" })), "One line under the name."),
    field("Description", bind("description", h("textarea", { value: d.description, maxlength: "8000" })), "Blank line = new paragraph."),
    field("Formats", bind("formats", h("input", { value: d.formats, placeholder: "VST3, AU, Standalone" })), "Separate with commas."),
    h("fieldset", null, h("legend", null, "Lab data"), specsBox,
      h("div", null, h("button", { type: "button", onclick: () => { d.specs.push(["", ""]); drawSpecs(); touch(); specsBox.querySelector(".kv:last-child input")?.focus(); } }, "+ Add row"))),
    h("fieldset", null, h("legend", null, "Pictures & sound"), thumbs,
      h("div", { class: "copy" }, ...mediaPicker("image/png,image/jpeg,image/webp,image/gif", true, (u) => { d.images.push(u); drawThumbs(); }, "+ Add pictures"),
        ...mediaPicker("audio/mpeg,audio/ogg,audio/mp4,audio/wav", false, (u) => { d.preview_url = u; drawAudio(); }, "Set sound preview")),
      audio),
    renderFiles(d),
    h("div", { class: "actions" }, saveBtn, dirtyNote,
      d.id ? h("a", { href: `./?p=${encodeURIComponent(d.slug)}`, target: "_blank", rel: "noopener" }, "View on site ↗") : null,
      d.id ? h("button", { type: "button", class: "warn", style: "margin-left:auto", onclick: (e) => remove(e.currentTarget) }, "Delete") : null));

  form.addEventListener("submit", (e) => { e.preventDefault(); busy(saveBtn, save); });
  return form;
}

function parsePrice(s) {
  const n = Number(String(s).replace(/[$,\s]/g, "") || "0");
  if (!Number.isFinite(n) || n < 0) throw new Error("Price must be a number like 12 or 12.50.");
  return Math.round(n * 100);
}

async function save() {
  const d = state.draft;
  const body = {
    id: d.id,
    price_cents: parsePrice(d.price),
    product: {
      title: d.title, symbol: d.symbol, slug: d.slug, category: d.category, kind: d.kind, status: d.status,
      tagline: d.tagline, description: d.description, sort: d.sort, preview_url: d.preview_url, images: d.images,
      formats: d.formats.split(",").map((s) => s.trim()).filter(Boolean),
      specs: Object.fromEntries(d.specs.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), v.trim()])),
    },
  };
  const { product } = await api("product.save", body);
  replaceProduct(product);
  state.dirty = false;
  state.selected = product.id;
  state.draft = toDraft(product);
  render();
  toast(d.id ? "Saved. The site shows it now." : "Created. Now add its files.");
}

function replaceProduct(product) {
  const i = state.products.findIndex((p) => p.id === product.id);
  if (i < 0) state.products.push(product);
  else state.products[i] = product;
}

async function remove(btn) {
  const d = state.draft;
  if (!confirm(`Delete “${d.title}” and its files for good? (To take it off the site but keep it, set it to Hidden instead.)`)) return;
  await busy(btn, async () => {
    await api("product.delete", { id: d.id });
    state.products = state.products.filter((p) => p.id !== d.id);
    state.dirty = false;
    state.selected = null;
    state.draft = null;
    render();
    toast("Deleted.");
  });
}

// Files buyers download. Uploading or editing these saves right away.
function renderFiles(d) {
  const box = h("fieldset", null, h("legend", null, "Download files"));
  if (!d.id) return box.append(h("small", { class: "hint" }, "Create the item first, then upload its files here.")), box;

  const afterChange = (product) => {
    replaceProduct(product);
    // Keep any unsaved edits to the other fields; only the files list changes.
    d.files = [...(product.product_files || [])].sort((a, b) => a.sort - b.sort);
    box.replaceWith(renderFiles(d));
  };

  const rows = d.files.map((f) => {
    const label = h("input", { value: f.label, "aria-label": "File label" });
    const platform = h("select", { "aria-label": "Platform" }, Object.entries(PLATFORMS).map(([k, v]) => h("option", { value: k, selected: f.platform === k }, v)));
    const saveF = h("button", { type: "button", onclick: (e) => busy(e.currentTarget, async () => {
      afterChange((await api("file.update", { id: f.id, label: label.value, platform: platform.value, sort: f.sort })).product);
      toast("File updated.");
    }) }, "Update");
    const del = h("button", { type: "button", class: "warn", "aria-label": `Remove ${f.label}`, onclick: (e) => {
      if (!confirm(`Remove “${f.label}”? Buyers won't be able to download it anymore.`)) return;
      busy(e.currentTarget, async () => { afterChange((await api("file.delete", { id: f.id })).product); toast("File removed."); });
    } }, "×");
    return h("tr", null, h("td", null, label), h("td", null, platform), h("td", { class: "n" }, f.storage_path.split("/").pop(), " · ", size(f.bytes)), h("td", { class: "copy" }, saveF, del));
  });

  const progress = h("div", { style: "display:grid;gap:6px" });
  const input = h("input", { type: "file", multiple: true, hidden: true });
  const drop = h("div", { class: "drop", tabindex: "0", role: "button", onclick: () => input.click(), onkeydown: (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.click()) },
    "Drop files here or click to choose. Uploading a file with the same name replaces the old one.");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); go(e.dataTransfer.files); });
  input.addEventListener("change", () => { go(input.files); });

  async function go(files) {
    let last;
    for (const file of [...files]) {
      const bar = h("i");
      const line = h("div", null, h("small", { class: "hint" }, `${file.name} · ${size(file.size)}`), h("div", { class: "bar" }, bar));
      progress.append(line);
      try {
        const { path } = await upload(file, { bucket: "library", productId: d.id, onProgress: (p) => { bar.style.width = `${Math.round(p * 100)}%`; } });
        const name = path.split("/").pop();
        const existing = d.files.find((f) => f.storage_path === path);
        last = (await api("file.attach", {
          product_id: d.id, path, platform: existing?.platform || guessPlatform(name),
          label: existing?.label || prettyLabel(name), sort: existing?.sort ?? d.files.length + 1,
        })).product;
        d.files = last.product_files;
        line.querySelector("small").textContent = `✓ ${file.name}`;
      } catch (e) {
        line.querySelector("small").textContent = `✗ ${file.name}: ${e.message}`;
        toast(e.message, true);
      }
    }
    input.value = "";
    if (last) { afterChange(last); toast("Uploaded. Buyers get the new file right away."); }
  }

  box.append(
    d.files.length ? h("table", { class: "files" }, h("thead", null, h("tr", null, h("th", null, "Label"), h("th", null, "Platform"), h("th", null, "File"), h("th"))), h("tbody", null, rows))
      : h("small", { class: "hint" }, "No files yet. Buyers get every file listed here."),
    drop, input, progress);
  return box;
}

function guessPlatform(name) {
  if (/mac|osx|darwin|\.dmg$|\.pkg$/i.test(name)) return "mac";
  if (/win|\.exe$|\.msi$/i.test(name)) return "windows";
  if (/linux/i.test(name)) return "linux";
  return "any";
}
function prettyLabel(name) {
  const p = guessPlatform(name);
  return p === "any" ? name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") : PLATFORMS[p];
}

// ---------------------------------------------------------------- team
function renderTeam() {
  const linkBox = h("div");
  const inviteName = h("input", { placeholder: "Their name (optional)", maxlength: "60", "aria-label": "Their name" });
  const inviteBtn = h("button", { class: "go", type: "submit" }, "Make invite link");
  const invite = h("form", { class: "card", style: "display:grid;gap:12px" },
    h("h3", { style: "margin:0" }, "Invite a partner"),
    h("small", { class: "hint" }, "Makes a one-time link that works for 3 days. Send it to them privately (a text message is fine). They choose their own passphrase."),
    inviteName, inviteBtn, linkBox);
  invite.addEventListener("submit", (e) => {
    e.preventDefault();
    busy(inviteBtn, async () => {
      const { link } = await api("editors.invite", { label: inviteName.value });
      const out = h("input", { value: link, readonly: true, "aria-label": "Invite link" });
      linkBox.replaceChildren(h("div", { class: "copy" }, out, h("button", { type: "button", onclick: () => {
        navigator.clipboard?.writeText(link).then(() => toast("Copied."), () => { out.select(); toast("Select and copy the link.", true); });
      } }, "Copy")));
      out.select();
    });
  });

  const people = h("div", { class: "card team" }, h("h3", { style: "margin:0 0 6px" }, "Editors"), h("ul", null, state.editors.map((p) => h("li", null,
    h("strong", null, p.name || p.email), h("span", { class: "meta" }, p.email),
    h("span", { class: "meta" }, p.last_login ? `last in ${new Date(p.last_login).toLocaleDateString()}` : "not signed in yet"),
    p.id === state.editor.id ? h("span", { class: "pill active", style: "margin-left:auto" }, "you")
      : h("button", { class: "warn", style: "margin-left:auto", onclick: (e) => {
        if (!confirm(`Remove ${p.name || p.email}? They'll be signed out and can't edit anymore.`)) return;
        busy(e.currentTarget, async () => {
          await api("editors.remove", { id: p.id });
          state.editors = state.editors.filter((x) => x.id !== p.id);
          renderTeam();
        });
      } }, "Remove")))));

  const cur = h("input", { type: "password", autocomplete: "current-password", required: true });
  const next = h("input", { type: "password", autocomplete: "new-password", minlength: "10", required: true });
  const passBtn = h("button", { type: "submit" }, "Change passphrase");
  const pass = h("form", { class: "card", style: "display:grid;gap:12px" }, h("h3", { style: "margin:0" }, "Your passphrase"),
    field("Current", cur), field("New", next, "At least 10 characters. Signs you out everywhere else."), passBtn);
  pass.addEventListener("submit", (e) => {
    e.preventDefault();
    busy(passBtn, async () => {
      const r = await api("passphrase.change", { current: cur.value, next: next.value });
      token = r.token;
      store.set(token);
      pass.reset();
      toast("Passphrase changed.");
    });
  });

  $("#app").replaceChildren(h("div", { class: "team-grid" }, people, invite, pass));
}

// ---------------------------------------------------------------- boot
document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
(function boot() {
  if (!API) return void $("#app").replaceChildren(h("p", null, "The shop isn't connected to its database (config.js)."));
  const invite = new URLSearchParams(location.hash.slice(1)).get("invite");
  if (invite) return showInvite(invite);
  if (!token) return showLogin();
  start().catch((e) => showLogin(e.message));
})();
