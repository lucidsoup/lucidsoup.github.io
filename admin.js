// ============================================================================
// LUCIDSOUP SHOP ADMIN
// ============================================================================

const DEFAULT_PASSWORD = "lucidsoup";  // initial password — user can change
const STORAGE_PW_HASH = "admin_pw_hash";   // sha-256 of password
const STORAGE_AUTHED  = "admin_authed";    // session flag
const STORAGE_ITEMS   = "admin_items_draft"; // local edits before save
const STORAGE_DIRTY   = "admin_items_dirty";

// ===== Password handling =====
// Real security needs a backend, but for a personal site, this is a reasonable
// deterrent. Password is stored as a sha-256 hash in localStorage.

async function sha256(str) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getCurrentPasswordHash() {
    let h = localStorage.getItem(STORAGE_PW_HASH);
    if (!h) {
        h = await sha256(DEFAULT_PASSWORD);
        localStorage.setItem(STORAGE_PW_HASH, h);
    }
    return h;
}

async function checkPassword(input) {
    const inputHash = await sha256(input);
    const stored = await getCurrentPasswordHash();
    return inputHash === stored;
}

// ===== State =====
let items = [];
let dirty = false;
let saveTimer = null;

// ===== Init =====
document.addEventListener("DOMContentLoaded", async () => {
    // Already authed in this browser?
    if (localStorage.getItem(STORAGE_AUTHED) === "1") {
        showAdmin();
    }

    document.getElementById("login-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById("password").value;
        const errEl = document.getElementById("login-error");
        const ok = await checkPassword(input);
        if (ok) {
            localStorage.setItem(STORAGE_AUTHED, "1");
            errEl.textContent = "";
            showAdmin();
        } else {
            errEl.textContent = "Incorrect password.";
            document.getElementById("password").value = "";
        }
    });

    document.getElementById("logout-btn").addEventListener("click", () => {
        localStorage.removeItem(STORAGE_AUTHED);
        location.reload();
    });

    document.getElementById("password-btn").addEventListener("click", changePassword);
    document.getElementById("export-btn").addEventListener("click", exportItems);
    document.getElementById("reload-btn").addEventListener("click", reloadFromFile);
});

async function showAdmin() {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("admin-view").classList.add("active");
    await loadItems();
    renderAll();
    updateStatus();
}

// ===== Items loading =====
async function loadItems() {
    setStatus("Loading items.json…");
    // Use draft from localStorage if it exists and is marked dirty
    const draft = localStorage.getItem(STORAGE_ITEMS);
    const isDirty = localStorage.getItem(STORAGE_DIRTY) === "1";

    if (draft && isDirty) {
        try {
            items = JSON.parse(draft);
            dirty = true;
            setStatus("Unsaved local edits loaded.", "unsaved");
            return;
        } catch (e) {
            console.warn("Bad draft, ignoring:", e);
        }
    }

    try {
        const r = await fetch("items.json?t=" + Date.now());
        if (!r.ok) throw new Error("Status " + r.status);
        const data = await r.json();
        items = Array.isArray(data) ? data : (data.items || []);
        dirty = false;
        setStatus("Loaded from items.json", "saved");
    } catch (err) {
        console.warn("[Admin] Could not load items.json:", err.message);
        items = [];
        setStatus("No items.json found — start fresh.", "unsaved");
    }
}

async function reloadFromFile() {
    if (dirty && !confirm("You have unsaved changes. Discard and reload from items.json?")) {
        return;
    }
    localStorage.removeItem(STORAGE_ITEMS);
    localStorage.removeItem(STORAGE_DIRTY);
    await loadItems();
    renderAll();
}

// ===== Mark dirty + autosave draft =====
function markDirty() {
    dirty = true;
    setStatus("Unsaved changes (auto-saved to browser)", "unsaved");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        try {
            localStorage.setItem(STORAGE_ITEMS, JSON.stringify(items));
            localStorage.setItem(STORAGE_DIRTY, "1");
        } catch (e) {
            console.error("Could not save draft:", e);
        }
    }, 400);
}

function setStatus(msg, kind) {
    const el = document.getElementById("admin-status");
    el.textContent = msg;
    el.className = "admin-status " + (kind || "");
}

function updateStatus() {
    setStatus(dirty
        ? `${items.length} items · unsaved changes`
        : `${items.length} items · synced with items.json`,
        dirty ? "unsaved" : "saved");
}

// ===== Render =====
function renderAll() {
    const grid = document.getElementById("admin-grid");
    grid.innerHTML = "";
    items.forEach((item, idx) => grid.appendChild(itemCard(item, idx)));
    // Add new item card
    const add = document.createElement("button");
    add.className = "add-card";
    add.textContent = "+ Add Item";
    add.addEventListener("click", addItem);
    grid.appendChild(add);
    updateStatus();
}

function itemCard(item, idx) {
    const card = document.createElement("div");
    card.className = "admin-item" + (item.available === false ? " sold-out" : "");
    card.draggable = true;
    card.dataset.index = String(idx);

    // Drag handlers
    card.addEventListener("dragstart", (e) => {
        card.classList.add("dragging");
        e.dataTransfer.setData("text/plain", String(idx));
        e.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    card.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
    card.addEventListener("drop", (e) => {
        e.preventDefault();
        const from = +e.dataTransfer.getData("text/plain");
        const to = idx;
        if (from === to || isNaN(from)) return;
        const moved = items.splice(from, 1)[0];
        items.splice(to, 0, moved);
        markDirty();
        renderAll();
    });

    // ===== Header =====
    const header = document.createElement("div");
    header.className = "admin-item-header";
    header.innerHTML = `
        <span class="item-id">⋮⋮ #${item.id || idx + 1}</span>
        <span class="item-actions">
            <button class="icon-btn" data-act="up" title="Move up">↑</button>
            <button class="icon-btn" data-act="down" title="Move down">↓</button>
            <button class="icon-btn danger" data-act="del" title="Delete">✕</button>
        </span>
    `;
    header.querySelector('[data-act="up"]').addEventListener("click", () => moveItem(idx, -1));
    header.querySelector('[data-act="down"]').addEventListener("click", () => moveItem(idx, 1));
    header.querySelector('[data-act="del"]').addEventListener("click", () => deleteItem(idx));
    card.appendChild(header);

    // ===== Image area =====
    const imgArea = document.createElement("div");
    imgArea.className = "admin-item-image-area";
    imgArea.addEventListener("click", () => editImage(idx));
    if (item.image) {
        const img = document.createElement("img");
        img.src = item.image;
        img.alt = item.title || "";
        img.onerror = () => {
            imgArea.innerHTML = imagePlaceholderHTML();
            imgArea.appendChild(imgOverlay());
        };
        imgArea.appendChild(img);
    } else {
        imgArea.innerHTML = imagePlaceholderHTML();
    }
    imgArea.appendChild(imgOverlay());
    card.appendChild(imgArea);

    // ===== Body =====
    const body = document.createElement("div");
    body.className = "admin-item-body";

    body.appendChild(fieldInput("Title",     "title", item, "title"));
    body.appendChild(fieldInput("Subtitle / Category", "subtitle", item, "subtitle"));
    body.appendChild(fieldTextarea("Description", "description", item));

    const row = document.createElement("div");
    row.className = "field-row";
    row.appendChild(fieldInput("Price",       "price", item, "price"));
    row.appendChild(fieldInput("Button Text", "buttonText", item));
    body.appendChild(row);

    // Checkout
    const checkout = document.createElement("div");
    checkout.className = "checkout-area";

    const typeField = document.createElement("div");
    typeField.className = "field";
    typeField.innerHTML = `<div class="field-label">Checkout Type</div>`;
    const sel = document.createElement("select");
    sel.innerHTML = `
        <option value="link">External Link (Gumroad, Bandcamp, etc.)</option>
        <option value="email">Email Inquiry (mailto)</option>
    `;
    sel.value = item.checkoutType || "link";
    sel.addEventListener("change", () => {
        item.checkoutType = sel.value;
        checkoutInput.placeholder = sel.value === "email"
            ? "you@example.com"
            : "https://gumroad.com/...";
        checkoutLabel.textContent = sel.value === "email" ? "Email Address" : "Checkout URL";
        markDirty();
    });
    typeField.appendChild(sel);
    checkout.appendChild(typeField);

    const checkoutFld = document.createElement("div");
    checkoutFld.className = "field";
    checkoutFld.style.marginTop = "0.5rem";
    const checkoutLabel = document.createElement("div");
    checkoutLabel.className = "field-label";
    checkoutLabel.textContent = sel.value === "email" ? "Email Address" : "Checkout URL";
    checkoutFld.appendChild(checkoutLabel);
    const checkoutInput = document.createElement("input");
    checkoutInput.type = "text";
    checkoutInput.value = item.checkoutValue || "";
    checkoutInput.placeholder = sel.value === "email" ? "you@example.com" : "https://gumroad.com/...";
    checkoutInput.addEventListener("input", () => { item.checkoutValue = checkoutInput.value; markDirty(); });
    checkoutFld.appendChild(checkoutInput);
    checkout.appendChild(checkoutFld);

    body.appendChild(checkout);

    // Available toggle
    const toggleRow = document.createElement("div");
    toggleRow.className = "toggle-row";
    const sw = document.createElement("div");
    sw.className = "toggle-switch" + (item.available !== false ? " on" : "");
    const lbl = document.createElement("label");
    lbl.textContent = item.available !== false ? "Available" : "Sold out / unavailable";
    sw.addEventListener("click", () => {
        item.available = item.available === false ? true : false;
        sw.classList.toggle("on");
        lbl.textContent = item.available !== false ? "Available" : "Sold out / unavailable";
        card.classList.toggle("sold-out", item.available === false);
        markDirty();
    });
    lbl.addEventListener("click", () => sw.click());
    toggleRow.appendChild(sw);
    toggleRow.appendChild(lbl);
    body.appendChild(toggleRow);

    card.appendChild(body);
    return card;
}

function imagePlaceholderHTML() {
    return `<div class="image-placeholder"><span>✶</span><small>CLICK TO ADD IMAGE</small></div>`;
}
function imgOverlay() {
    const o = document.createElement("div");
    o.className = "image-overlay";
    o.innerHTML = `<div class="image-overlay-text">📷 Change Image</div>`;
    return o;
}

function fieldInput(label, prop, item, cls) {
    const f = document.createElement("div");
    f.className = "field";
    f.innerHTML = `<div class="field-label">${label}</div>`;
    const inp = document.createElement("input");
    inp.type = "text";
    inp.value = item[prop] || "";
    inp.placeholder = label;
    if (cls) inp.className = cls;
    inp.addEventListener("input", () => { item[prop] = inp.value; markDirty(); refreshTitleInHeader(item); });
    f.appendChild(inp);
    return f;
}

function fieldTextarea(label, prop, item) {
    const f = document.createElement("div");
    f.className = "field";
    f.innerHTML = `<div class="field-label">${label}</div>`;
    const ta = document.createElement("textarea");
    ta.value = item[prop] || "";
    ta.placeholder = label;
    ta.rows = 3;
    ta.addEventListener("input", () => { item[prop] = ta.value; markDirty(); });
    f.appendChild(ta);
    return f;
}

function refreshTitleInHeader(item) {
    // Just update status counter as needed
}

// ===== Item ops =====
function addItem() {
    const id = String(items.length + 1).padStart(2, "0");
    items.push({
        id,
        title: "New Item",
        subtitle: "",
        description: "",
        price: "",
        image: "",
        checkoutType: "link",
        checkoutValue: "",
        buttonText: "BUY",
        available: true,
    });
    markDirty();
    renderAll();
    // Scroll to bottom
    setTimeout(() => {
        const grid = document.getElementById("admin-grid");
        const lastCard = grid.children[grid.children.length - 2];
        if (lastCard) lastCard.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
}

function deleteItem(idx) {
    const item = items[idx];
    if (!confirm(`Delete "${item.title || 'this item'}"?`)) return;
    items.splice(idx, 1);
    markDirty();
    renderAll();
}

function moveItem(idx, dir) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= items.length) return;
    const tmp = items[idx];
    items[idx] = items[newIdx];
    items[newIdx] = tmp;
    markDirty();
    renderAll();
}

function editImage(idx) {
    const item = items[idx];
    const current = item.image || "";
    const value = prompt(
        "Image URL or repo path:\n\n" +
        "• Relative path:  images/print.jpg  (file lives in your repo)\n" +
        "• Full URL:       https://example.com/image.jpg\n" +
        "• Empty:          remove image",
        current
    );
    if (value === null) return; // cancelled
    item.image = value.trim();
    markDirty();
    renderAll();
}

// ===== Export =====
function exportItems() {
    // Re-sequence IDs cleanly
    items.forEach((it, i) => { if (!it.id || /^\d+$/.test(it.id)) it.id = String(i + 1).padStart(2, "0"); });

    const data = { items };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "items.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Mark as saved (clear dirty flag) — but it's only really saved when user uploads to repo
    localStorage.setItem(STORAGE_ITEMS, JSON.stringify(items));
    localStorage.removeItem(STORAGE_DIRTY);
    dirty = false;
    setStatus(`${items.length} items · exported! upload items.json to your repo`, "saved");

    setTimeout(() => {
        alert(
            "items.json downloaded.\n\n" +
            "Next: upload this file to the root of your repository\n" +
            "(same folder as index.html) and push. Nothing on the site\n" +
            "reads it yet \u2014 the shop is not published.\n\n" +
            "Your changes stay saved in this browser in the meantime."
        );
    }, 100);
}

// ===== Password change =====
async function changePassword() {
    const cur = prompt("Current password:");
    if (cur === null) return;
    const ok = await checkPassword(cur);
    if (!ok) { alert("Current password is incorrect."); return; }

    const newPw = prompt("New password (at least 6 characters):");
    if (newPw === null) return;
    if (!newPw || newPw.length < 6) { alert("Password too short."); return; }

    const confirm2 = prompt("Confirm new password:");
    if (confirm2 !== newPw) { alert("Passwords don't match."); return; }

    const hash = await sha256(newPw);
    localStorage.setItem(STORAGE_PW_HASH, hash);
    alert("Password updated. Note: this only applies in THIS browser.\nOther devices keep their existing password until you change it there too.");
}

// Warn before leaving with unsaved changes
window.addEventListener("beforeunload", (e) => {
    if (dirty) {
        e.preventDefault();
        e.returnValue = "";
    }
});

