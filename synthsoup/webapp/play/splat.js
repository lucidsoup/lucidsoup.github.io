// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 SynthSoup contributors
// Liquid splatters in place of rounded boxes (the player's panel, the site's boxes). shape() / outline() trace a box
// as a blob: its edge bulging out by up to amp (never in, so what is inside stays inside), drips of up to drip
// running down off its bottom, drops beside them. The same seed draws the same splat every time. The drips move:
// each oozes longer, lets a drop fall and pulls back (still for a viewer who asks for less motion).
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";

  // the splat's shape: its edge points (each with how far it faces down), its drips (each oozing longer over its own
  // period, then letting a drop go), its splashes; outline() traces it at a moment
  function shape(x, y, w, h, seed, amp, drip, splash = 0) {
    let s = (seed * 2654435761) >>> 0 || 1;
    const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    const n = Math.max(28, Math.min(160, Math.round((w + h) / 5)));
    const R = Math.min(Math.min(w, h) * .25, 12 + amp), sw = w - 2 * R, sh = h - 2 * R, per = 2 * sw + 2 * sh + 2 * Math.PI * R;
    const edge = (u) => {                                        // the box with round corners, u along it (0..per):
      const q = [[x + R, y, sw, 0, -Math.PI / 2], [x + w - R, y + R, sh, 1, 0],   // [x, y, its outward angle]
                 [x + w - R, y + h, sw, 2, Math.PI / 2], [x + R, y + h - R, sh, 3, Math.PI]];
      for (const [qx, qy, len, side, ang] of q) {
        if (u < len) return side === 0 ? [qx + u, qy, ang] : side === 1 ? [qx + R, qy + u, ang] :
                            side === 2 ? [qx - u, qy, ang] : [qx - R, qy - u, ang];
        u -= len;
        if (u < Math.PI * R / 2) {                               // the corner after this side
          const a = ang + u / R, ccx = side < 2 ? x + w - R : x + R, ccy = side === 0 || side === 3 ? y + R : y + h - R;
          return [ccx + R * Math.cos(a), ccy + R * Math.sin(a), a];
        }
        u -= Math.PI * R / 2;
      }
      return [x + R, y, -Math.PI / 2];
    };
    const k = [2 + Math.floor(rnd() * 3), 5 + Math.floor(rnd() * 4), 11 + Math.floor(rnd() * 6)];
    const ph = k.map(() => rnd() * 2 * Math.PI);
    const lobes = [], nl = 2 + Math.floor(rnd() * 3);              // a few big bulges, as where the splash landed
    for (let i = 0; i < nl; i++) lobes.push([rnd() * 2 * Math.PI, amp * (.8 + rnd() * .9), .12 + rnd() * .25]);
    const drips = [], nd = drip > 0 ? 1 + Math.floor(rnd() * Math.min(5, 1 + w / 60)) : 0;
    for (let i = 0; i < nd; i++) {
      const wd = Math.max(1.5, Math.min(7, w * .03)) * (.7 + .6 * rnd());
      drips.push({ x: x + w * (.12 + .76 * rnd()), len: drip * (.35 + .65 * rnd()), wd,
                   period: 2.6 + rnd() * 4.5, phase: rnd(), r: wd * (.45 + .25 * rnd()), dx: (rnd() - .5) * 2 });
    }
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = i / n * 2 * Math.PI, [bx, by, na] = edge(i / n * per), c = Math.cos(na), sn = Math.sin(na);
      let wob = amp * ((.5 * Math.sin(k[0] * t + ph[0]) + .3 * Math.sin(k[1] * t + ph[1]) +
                        .2 * Math.sin(k[2] * t + ph[2])) * .3 + .35);
      for (const [lt, la, lw] of lobes) {
        const dt = Math.atan2(Math.sin(t - lt), Math.cos(t - lt));
        wob += la * Math.exp(-((dt / lw) ** 2));
      }
      pts.push([bx + wob * c, by + wob * sn, sn]);
    }
    const splashes = [];
    for (let i = 0; i < splash; i++) {                           // splashes around the edge
      const [px, py, na] = edge(rnd() * per), c = Math.cos(na), sn = Math.sin(na), r = 1 + rnd() * Math.max(1.5, amp * .5);
      splashes.push([px + c * (amp * 1.6 + r + rnd() * amp), py + sn * (amp * 1.6 + r + rnd() * amp), r]);
    }
    const sh_ = { pts, drips, splashes, y, h, amp, drip, bottom: y + h };
    const still = outline(sh_, null);
    sh_.bottom = still.bottom;
    return sh_;
  }

  // a drip's length (of its full len) and its falling drop at time sec (null: still, full length, the drop hanging
  // under it): it oozes down over 80 % of its period, lets the drop go and pulls back
  function dripAt(dr, sec) {
    if (sec == null) return { k: 1, drop: dr.len > 0 ? 0 : -1, fade: 1 };
    const u = (sec / dr.period + dr.phase) % 1;
    if (u < .8) {
      const e = u / .8;
      return { k: .4 + .6 * e * e * (3 - 2 * e), drop: -1, fade: 1 };
    }
    const f = (u - .8) / .2;
    return { k: 1 - .6 * f, drop: f, fade: 1 - f };
  }

  // the outline at time sec: { d: its path, drops: [[cx, cy, r, opacity]], bottom }
  function outline(sh, sec) {
    const { pts, drips, splashes } = sh, n = pts.length, st = drips.map((dr) => dripAt(dr, sec));
    const out = [];
    let bottom = sh.y + sh.h;
    for (const [px, py0, sn] of pts) {
      let py = py0;
      if (sn > .15)
        drips.forEach((dr, i) => { py += dr.len * st[i].k * Math.exp(-(((px - dr.x) / dr.wd) ** 2)) * Math.min(1, sn * 2); });
      bottom = Math.max(bottom, py);
      out.push([px, py]);
    }
    let d = `M${out[0][0].toFixed(1)},${out[0][1].toFixed(1)}`;
    for (let i = 0; i < n; i++) {                                // Catmull-Rom through the points, closed
      const p0 = out[(i + n - 1) % n], p1 = out[i], p2 = out[(i + 1) % n], p3 = out[(i + 2) % n];
      d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ` +
           `${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ` +
           `${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    const drops = splashes.map(([cx, cy, r]) => [cx, cy, r, 1]);
    drips.forEach((dr, i) => {                                   // the drop under a drip: hanging, then falling
      if (st[i].drop < 0 || dr.len <= sh.drip * .45) return;
      const tip = sh.y + sh.h + sh.amp + dr.len * st[i].k;
      drops.push([dr.x + dr.dx, tip + dr.r * 2.2 + st[i].drop * st[i].drop * Math.max(12, sh.drip), dr.r, st[i].fade]);
    });
    for (const p of drops) if (p[3] === 1) bottom = Math.max(bottom, p[1] + p[2]);
    return { d, drops, bottom };
  }

  // the moving splats: each frame (about 30 a second) their drips and drops redrawn; none when the viewer asks for
  // less motion
  const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const live = new Set();
  let ticking = false, lastT = 0;
  function tick(now) {
    if (!live.size) { ticking = false; return; }
    if (now - lastT > 33) {
      lastT = now;
      for (const a of live) {
        if (!a.path.isConnected) { live.delete(a); continue; }
        a.draw(now / 1000);
      }
    }
    requestAnimationFrame(tick);
  }

  // the splat as SVG in parent: a <path> (attrs on it) and its drops (circles in the same fill); its drips move when
  // they are long enough to see (drip >= MOVE_MIN: the small ones on buttons and keys keep still)
  const MOVE_MIN = 12;
  function splatSvg(parent, x, y, w, h, seed, amp, drip, attrs, splash = 0) {
    const sh = shape(x, y, w, h, seed, amp, drip, splash), mk = (tag, a) => {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(a)) e.setAttribute(k, v);
      parent.appendChild(e);
      return e;
    };
    const moves = !still && drip >= MOVE_MIN;
    const path = mk("path", { d: outline(sh, moves ? 0 : null).d, ...attrs });
    const fill = { fill: attrs.fill || "currentColor" };
    if (attrs.class) fill.class = attrs.class;
    if (attrs.stroke) Object.assign(fill, { stroke: attrs.stroke, "stroke-width": attrs["stroke-width"] || 1 });
    const circles = [];
    const draw = (sec) => {
      const o = outline(sh, sec);
      path.setAttribute("d", o.d);
      o.drops.forEach(([cx, cy, r, op], i) => {
        const c = circles[i] || (circles[i] = mk("circle", fill));
        c.setAttribute("cx", cx.toFixed(1));
        c.setAttribute("cy", cy.toFixed(1));
        c.setAttribute("r", r.toFixed(1));
        c.setAttribute("opacity", op.toFixed(2));
      });
      for (let i = o.drops.length; i < circles.length; i++) circles[i].setAttribute("opacity", 0);
    };
    draw(moves ? performance.now() / 1000 : null);
    if (moves) {
      live.add({ path, draw });
      if (!ticking) { ticking = true; requestAnimationFrame(tick); }
    }
    return { path, bottom: sh.bottom };
  }

  // an HTML box drawn as a splat: an SVG behind its content, redrawn when its size changes (fill, stroke: CSS
  // colours; the box's own background and border are to be none)
  function splatBox(box, seed, { amp = 6, drip = 14, fill = "var(--tray)", stroke = "none", splash = 3 } = {}) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("splat-bg");
    Object.assign(svg.style, { position: "absolute", inset: "0", width: "100%", height: "100%", overflow: "visible",
                               zIndex: "-1", pointerEvents: "none" });
    if (getComputedStyle(box).position === "static") box.style.position = "relative";
    box.style.isolation = "isolate";
    box.prepend(svg);
    let last = "";
    const draw = () => {
      const w = box.clientWidth, h = box.clientHeight, key = `${w}x${h}`;
      if (!w || !h || key === last) return;
      last = key;
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      svg.replaceChildren();                                     // (the old splat's animation ends with it)
      splatSvg(svg, 0, 0, w, h, seed, amp, drip, { fill, stroke, "stroke-width": 1.5 }, splash);
    };
    draw();
    if (window.ResizeObserver) new ResizeObserver(draw).observe(box);
  }

  window.SoupSplat = { shape, outline, splatSvg, splatBox };
})();
