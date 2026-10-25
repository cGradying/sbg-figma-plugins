"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // ../../packages/core/src/model.ts
  var MAX_CELLS = 120;
  var paintKey = (p) => {
    var _a, _b;
    return p.kind === "solid" ? `s:${p.role}:${(_a = p.opacity) != null ? _a : 1}` : p.kind === "outline" ? `o:${p.role}:${(_b = p.weight) != null ? _b : 3}` : `g:${p.id}`;
  };
  var cellXY = (doc, k) => ({
    x: k % doc.cols,
    y: Math.floor(k / doc.cols)
  });
  var cellRect = (doc, x, y) => ({
    x: x * doc.cell,
    y: y * doc.cell,
    w: doc.cell,
    h: doc.cell
  });

  // ../../packages/core/src/theme.ts
  var REQUIRED_ROLES = ["bg", "gridLine", "ink", "onAccent", "purple", "pink", "green", "blue"];
  var HEX = /^#[0-9a-f]{6}$/i;
  function resolve(theme, role) {
    const hex = theme.roles[role];
    if (hex === void 0) throw new Error(`theme "${theme.id}" has no role "${role}"`);
    return hex;
  }
  function parseTheme(raw) {
    if (typeof raw !== "object" || raw === null) throw new Error("theme must be an object");
    const t = raw;
    if (typeof t.id !== "string" || !/^[\w-]{1,40}$/.test(t.id)) throw new Error("theme id must be 1-40 word characters");
    if (typeof t.name !== "string" || t.name.length === 0 || t.name.length > 60) throw new Error("theme name must be 1-60 characters");
    if (typeof t.roles !== "object" || t.roles === null) throw new Error("theme roles must be an object");
    const roles = {};
    for (const [k, v] of Object.entries(t.roles)) {
      if (typeof v !== "string" || !HEX.test(v)) throw new Error(`role "${k}" must be a #rrggbb color`);
      roles[k] = v.toLowerCase();
    }
    for (const r of REQUIRED_ROLES) if (!(r in roles)) throw new Error(`theme is missing required role "${r}"`);
    return { id: t.id, name: t.name, roles };
  }
  function parseHex(hex) {
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  }
  var toHex = (rgb2) => "#" + rgb2.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("");
  function mix(a, b, t) {
    const [ar, ag, ab] = parseHex(a);
    const [br, bg, bb] = parseHex(b);
    return toHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
  }

  // ../../packages/core/src/gradient.ts
  var rad = (d) => d * Math.PI / 180;
  function gradientEnds(r, angle) {
    const dx = Math.sin(rad(angle));
    const dy = -Math.cos(rad(angle));
    const len = Math.abs(r.w * dx) + Math.abs(r.h * dy);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    return { s: { x: cx - dx * len / 2, y: cy - dy * len / 2 }, e: { x: cx + dx * len / 2, y: cy + dy * len / 2 } };
  }
  function tAt(r, angle, p) {
    const { s, e } = gradientEnds(r, angle);
    const vx = e.x - s.x;
    const vy = e.y - s.y;
    const len2 = vx * vx + vy * vy;
    if (len2 === 0) return 0;
    return Math.min(1, Math.max(0, ((p.x - s.x) * vx + (p.y - s.y) * vy) / len2));
  }
  function colorAt(g, t, theme) {
    const stops = [...g.stops].sort((a2, b2) => a2.at - b2.at);
    const first = stops[0];
    const last = stops.at(-1);
    if (!first || !last) throw new Error(`gradient ${g.id} has no stops`);
    if (t <= first.at) return resolve(theme, first.role);
    if (t >= last.at) return resolve(theme, last.role);
    const i = stops.findIndex((s) => s.at >= t);
    const a = stops[i - 1];
    const b = stops[i];
    return mix(resolve(theme, a.role), resolve(theme, b.role), (t - a.at) / (b.at - a.at));
  }
  function gradientBounds(doc, id) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [k, p] of doc.cells) {
      if (p.kind !== "gradient" || p.id !== id) continue;
      const { x, y } = cellXY(doc, k);
      const r = cellRect(doc, x, y);
      x0 = Math.min(x0, r.x);
      y0 = Math.min(y0, r.y);
      x1 = Math.max(x1, r.x + r.w);
      y1 = Math.max(y1, r.y + r.h);
    }
    return x0 === Infinity ? void 0 : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function figmaGradientTransform(r, angle) {
    const { s, e } = gradientEnds(r, angle);
    const ev = { x: (e.x - s.x) / r.w, y: (e.y - s.y) / r.h };
    const pv = { x: -(e.y - s.y) / r.w, y: (e.x - s.x) / r.h };
    const o = { x: (s.x - r.x) / r.w - pv.x / 2, y: (s.y - r.y) / r.h - pv.y / 2 };
    const [m00, m01, m02, m10, m11, m12] = [ev.x, pv.x, o.x, ev.y, pv.y, o.y];
    const det = m00 * m11 - m01 * m10;
    if (det === 0) throw new Error("gradient bounds are degenerate");
    return [
      [m11 / det, -m01 / det, (m01 * m12 - m11 * m02) / det],
      [-m10 / det, m00 / det, (m10 * m02 - m00 * m12) / det]
    ];
  }

  // ../../packages/core/src/geometry.ts
  function mergeRects(doc, keys) {
    var _a;
    const rows = /* @__PURE__ */ new Map();
    for (const k of keys) {
      const { x, y } = cellXY(doc, k);
      ((_a = rows.get(y)) != null ? _a : rows.set(y, []).get(y)).push(x);
    }
    const runsByRow = /* @__PURE__ */ new Map();
    for (const [y, xs] of rows) {
      xs.sort((a, b) => a - b);
      const runs = [];
      for (const x of xs) {
        const last = runs.at(-1);
        if (last && last.x + last.w === x) last.w++;
        else runs.push({ x, w: 1 });
      }
      runsByRow.set(y, runs);
    }
    const out = [];
    const open = /* @__PURE__ */ new Map();
    for (const y of [...runsByRow.keys()].sort((a, b) => a - b)) {
      const next = /* @__PURE__ */ new Map();
      for (const r of runsByRow.get(y)) {
        const id = `${r.x}:${r.w}`;
        const above = open.get(id);
        if (above && above.y + above.h === y) {
          above.h++;
          next.set(id, above);
        } else {
          const rect = { x: r.x, y, w: r.w, h: 1 };
          out.push(rect);
          next.set(id, rect);
        }
      }
      open.clear();
      for (const [id, r] of next) open.set(id, r);
    }
    return out;
  }
  function rectsPath(rects, cell, origin = { x: 0, y: 0 }) {
    return rects.map((r) => {
      const [x0, y0, x1, y1] = [(r.x - origin.x) * cell, (r.y - origin.y) * cell, (r.x + r.w - origin.x) * cell, (r.y + r.h - origin.y) * cell];
      return `M${x0} ${y0}L${x1} ${y0}L${x1} ${y1}L${x0} ${y1}Z`;
    }).join("");
  }
  function pathOrigin(rects) {
    return { x: Math.min(...rects.map((r) => r.x)), y: Math.min(...rects.map((r) => r.y)) };
  }
  function gridPath(canvas, cell) {
    let d = "";
    for (let x = cell; x < canvas.w; x += cell) d += `M${x} 0L${x} ${canvas.h}`;
    for (let y = cell; y < canvas.h; y += cell) d += `M0 ${y}L${canvas.w} ${y}`;
    return d;
  }

  // ../../packages/core/src/serialize.ts
  var VERSION = 1;
  function serialize(doc) {
    const used = /* @__PURE__ */ new Set();
    for (const p of doc.cells.values()) if (p.kind === "gradient") used.add(p.id);
    for (const b of doc.boxes) if (b.fill.kind === "gradient") used.add(b.fill.id);
    const paints = [];
    const index = /* @__PURE__ */ new Map();
    const keys = [...doc.cells.keys()].sort((a, b) => a - b);
    const runs = [];
    for (const k of keys) {
      const p = doc.cells.get(k);
      let i = index.get(paintKey(p));
      if (i === void 0) {
        i = paints.push(p) - 1;
        index.set(paintKey(p), i);
      }
      const n = runs.length;
      if (n && runs[n - 1] === i && runs[n - 3] + runs[n - 2] === k) runs[n - 2]++;
      else runs.push(k, 1, i);
    }
    const wire = {
      v: VERSION,
      cols: doc.cols,
      rows: doc.rows,
      cell: doc.cell,
      canvas: doc.canvas,
      grid: doc.grid,
      theme: doc.theme,
      mode: doc.mode,
      paints,
      runs,
      boxes: [...doc.boxes],
      gradients: Object.values(doc.gradients).filter((g) => used.has(g.id))
    };
    return JSON.stringify(wire);
  }
  var isNum = (n) => typeof n === "number" && Number.isFinite(n);
  function parse(json) {
    var _a, _b, _c, _d;
    const w = JSON.parse(json);
    if (w.v !== VERSION) throw new Error(`unsupported pixel render data version ${String(w.v)}`);
    if (![w.cols, w.rows, w.cell, (_a = w.canvas) == null ? void 0 : _a.w, (_b = w.canvas) == null ? void 0 : _b.h].every(isNum)) throw new Error("corrupt grid size");
    if (w.cols < 1 || w.rows < 1 || w.cols > MAX_CELLS || w.rows > MAX_CELLS) throw new Error("grid size out of range");
    if (!Array.isArray(w.paints) || !Array.isArray(w.runs) || w.runs.length % 3 !== 0) throw new Error("corrupt cell data");
    const cells = /* @__PURE__ */ new Map();
    const total = w.cols * w.rows;
    for (let i = 0; i < w.runs.length; i += 3) {
      const [start2, len, pi] = [w.runs[i], w.runs[i + 1], w.runs[i + 2]];
      const paint2 = w.paints[pi];
      if (!paint2 || !isNum(start2) || !isNum(len) || start2 < 0 || len < 1 || start2 + len > total) throw new Error("corrupt cell run");
      for (let k = start2; k < start2 + len; k++) cells.set(k, paint2);
    }
    return {
      cols: w.cols,
      rows: w.rows,
      cell: w.cell,
      canvas: w.canvas,
      grid: w.grid,
      theme: w.theme,
      mode: w.mode,
      cells,
      boxes: (_c = w.boxes) != null ? _c : [],
      gradients: Object.fromEntries(((_d = w.gradients) != null ? _d : []).map((g) => [g.id, g]))
    };
  }
  var CHUNK = 9e4;
  var toChunks = (json) => Array.from({ length: Math.max(1, Math.ceil(json.length / CHUNK)) }, (_, i) => json.slice(i * CHUNK, (i + 1) * CHUNK));
  var fromChunks = (chunks) => chunks.join("");

  // ../../packages/core/src/render.ts
  function pathItem(doc, name, keys, fill) {
    const rects = mergeRects(doc, keys);
    const o = pathOrigin(rects);
    return { kind: "path", name, at: { x: o.x * doc.cell, y: o.y * doc.cell }, d: rectsPath(rects, doc.cell, o), fill };
  }
  var solid = (hex, opacity = 1) => ({ type: "solid", hex, opacity });
  function buildScene(doc, theme, o = {}) {
    var _a, _b, _c, _d, _e;
    const overlay = doc.mode === "overlay";
    const items = [];
    const groups = /* @__PURE__ */ new Map();
    for (const [k, p] of doc.cells) ((_a = groups.get(paintKey(p))) != null ? _a : groups.set(paintKey(p), { paint: p, keys: [] }).get(paintKey(p))).keys.push(k);
    const flat = /* @__PURE__ */ new Map();
    const addFlat = (fill, k) => {
      var _a2;
      const id = fill.type === "solid" ? `${fill.hex}:${fill.opacity}` : "";
      ((_a2 = flat.get(id)) != null ? _a2 : flat.set(id, { fill, keys: [] }).get(id)).keys.push(k);
    };
    const cellItem = (k, fill) => {
      const { x, y } = cellXY(doc, k);
      items.push({ kind: "rect", name: `cell ${x},${y}`, rect: cellRect(doc, x, y), fill });
    };
    for (const { paint: paint2, keys } of groups.values()) {
      if (paint2.kind === "solid") {
        for (const k of keys) o.flatten ? addFlat(solid(resolve(theme, paint2.role), (_b = paint2.opacity) != null ? _b : 1), k) : cellItem(k, solid(resolve(theme, paint2.role), (_c = paint2.opacity) != null ? _c : 1));
      } else if (paint2.kind === "outline") {
        const weight = (_d = paint2.weight) != null ? _d : 3;
        for (const k of keys) {
          const { x, y } = cellXY(doc, k);
          const r = cellRect(doc, x, y);
          items.push({ kind: "rect", name: `outline ${x},${y}`, rect: { x: r.x + weight / 2, y: r.y + weight / 2, w: r.w - weight, h: r.h - weight }, stroke: { hex: resolve(theme, paint2.role), weight } });
        }
      } else {
        const g = doc.gradients[paint2.id];
        const bounds = gradientBounds(doc, paint2.id);
        if (!g || !bounds) continue;
        if (g.mode === "smooth") {
          items.push(pathItem(doc, `gradient ${g.id}`, keys, { type: "linear", stops: g.stops.map((s) => ({ hex: resolve(theme, s.role), at: s.at })), rect: bounds, angle: g.angle }));
        } else {
          for (const k of keys) {
            const { x, y } = cellXY(doc, k);
            const r = cellRect(doc, x, y);
            const t = tAt(bounds, g.angle, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
            const fill = solid(colorAt(g, t, theme));
            o.flatten ? addFlat(fill, k) : cellItem(k, fill);
          }
        }
      }
    }
    for (const [id, { fill, keys }] of flat) items.push(pathItem(doc, `fill ${id}`, keys, fill));
    for (const b of doc.boxes) {
      const rect = { x: b.x * doc.cell, y: b.y * doc.cell, w: b.w * doc.cell, h: b.h * doc.cell };
      let fill;
      if (b.fill.kind === "solid") fill = solid(resolve(theme, b.fill.role), (_e = b.fill.opacity) != null ? _e : 1);
      else if (b.fill.kind === "gradient") {
        const g = doc.gradients[b.fill.id];
        if (!g) throw new Error(`box ${b.id} uses missing gradient ${b.fill.id}`);
        fill = { type: "linear", stops: g.stops.map((s) => ({ hex: resolve(theme, s.role), at: s.at })), rect, angle: g.angle };
      } else fill = solid(resolve(theme, b.fill.role), 0);
      items.push({
        kind: "box",
        name: `box ${b.id}`,
        rect,
        fill,
        ...b.text ? { text: { ...b.text, hex: resolve(theme, b.text.role) } } : {}
      });
    }
    return {
      canvas: doc.canvas,
      background: overlay ? null : resolve(theme, "bg"),
      grid: overlay || doc.grid === "off" ? null : { d: gridPath(doc.canvas, doc.cell), hex: resolve(theme, "gridLine"), opacity: doc.grid === "faint" ? 0.7 : 1 },
      items
    };
  }

  // ../../packages/core/src/history.ts
  var history_exports = {};
  __export(history_exports, {
    commit: () => commit,
    redo: () => redo,
    start: () => start,
    undo: () => undo
  });
  var CAP = 100;
  var start = (present) => ({ past: [], present, future: [] });
  function commit(h, next) {
    if (next === h.present) return h;
    return { past: [...h.past, h.present].slice(-CAP), present: next, future: [] };
  }
  function undo(h) {
    const prev = h.past.at(-1);
    if (prev === void 0) return h;
    return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
  }
  function redo(h) {
    const [next, ...rest] = h.future;
    if (next === void 0) return h;
    return { past: [...h.past, h.present], present: next, future: rest };
  }

  // src/main.ts
  var DATA = "pixel-render";
  var FALLBACK_FONT = { family: "Inter", style: "Regular" };
  figma.showUI(__html__, { width: 420, height: 760, title: "Pixel Render", themeColors: false });
  var send = (m) => figma.ui.postMessage(m);
  var rgb = (hex) => ({
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255
  });
  function paint(f) {
    if (f.type === "solid") return { type: "SOLID", color: rgb(f.hex), opacity: f.opacity };
    return {
      type: "GRADIENT_LINEAR",
      gradientStops: f.stops.map((s) => ({ position: s.at, color: { ...rgb(s.hex), a: 1 } })),
      gradientTransform: figmaGradientTransform(f.rect, f.angle)
    };
  }
  function savePluginData(frame, doc) {
    const chunks = toChunks(serialize(doc));
    const old = Number(frame.getPluginData(`${DATA}.n`) || 0);
    chunks.forEach((c, i) => frame.setPluginData(`${DATA}.${i}`, c));
    for (let i = chunks.length; i < old; i++) frame.setPluginData(`${DATA}.${i}`, "");
    frame.setPluginData(`${DATA}.n`, String(chunks.length));
  }
  function loadPluginData(node) {
    const n = Number(node.getPluginData(`${DATA}.n`) || 0);
    if (!n) return void 0;
    return fromChunks(Array.from({ length: n }, (_, i) => node.getPluginData(`${DATA}.${i}`)));
  }
  async function loadFonts(scene) {
    const wanted = /* @__PURE__ */ new Map();
    for (const it of scene.items) if (it.kind === "box" && it.text) wanted.set(`${it.text.family}|${it.text.style}`, { family: it.text.family, style: it.text.style });
    const out = /* @__PURE__ */ new Map();
    await figma.loadFontAsync(FALLBACK_FONT);
    for (const [k, font] of wanted) {
      try {
        await figma.loadFontAsync(font);
        out.set(k, font);
      } catch (e) {
        out.set(k, FALLBACK_FONT);
      }
    }
    return out;
  }
  function vector(name, d, at) {
    const v = figma.createVector();
    v.name = name;
    v.vectorPaths = [{ windingRule: "NONZERO", data: d }];
    v.x = at.x;
    v.y = at.y;
    return v;
  }
  function makeItem(it, fonts) {
    var _a;
    if (it.kind === "rect") {
      const r = figma.createRectangle();
      r.name = it.name;
      r.x = it.rect.x;
      r.y = it.rect.y;
      r.resize(it.rect.w, it.rect.h);
      r.fills = it.fill ? [paint(it.fill)] : [];
      if (it.stroke) {
        r.strokes = [{ type: "SOLID", color: rgb(it.stroke.hex) }];
        r.strokeWeight = it.stroke.weight;
        r.strokeAlign = "INSIDE";
      }
      return r;
    }
    if (it.kind === "path") {
      const v = vector(it.name, it.d, it.at);
      v.fills = [paint(it.fill)];
      return v;
    }
    const box = figma.createFrame();
    box.name = it.name;
    box.x = it.rect.x;
    box.y = it.rect.y;
    box.resize(it.rect.w, it.rect.h);
    box.fills = it.fill.type === "solid" && it.fill.opacity === 0 ? [] : [paint(it.fill)];
    box.clipsContent = false;
    if (it.text) {
      box.layoutMode = "HORIZONTAL";
      box.primaryAxisSizingMode = "FIXED";
      box.counterAxisSizingMode = "FIXED";
      box.counterAxisAlignItems = "CENTER";
      box.primaryAxisAlignItems = it.text.align === "left" ? "MIN" : "CENTER";
      box.paddingLeft = box.paddingRight = Math.round(it.rect.h * 0.2);
      const t = figma.createText();
      t.fontName = (_a = fonts.get(`${it.text.family}|${it.text.style}`)) != null ? _a : FALLBACK_FONT;
      t.characters = it.text.value;
      t.fontSize = it.text.size;
      t.fills = [{ type: "SOLID", color: rgb(it.text.hex) }];
      box.appendChild(t);
    }
    return box;
  }
  function group(frame, name, nodes) {
    if (nodes.length === 0) return;
    for (const n of nodes) frame.appendChild(n);
    figma.group(nodes, frame).name = name;
  }
  async function draw(frame, doc, scene, save = true) {
    const fonts = await loadFonts(scene);
    for (const c of [...frame.children]) c.remove();
    frame.resize(scene.canvas.w, scene.canvas.h);
    frame.clipsContent = true;
    frame.fills = scene.background ? [{ type: "SOLID", color: rgb(scene.background) }] : [];
    if (scene.grid) {
      const g = vector("Grid", scene.grid.d, { x: 0, y: 0 });
      g.fills = [];
      g.strokes = [{ type: "SOLID", color: rgb(scene.grid.hex), opacity: scene.grid.opacity }];
      g.strokeWeight = 2;
      group(frame, "Grid", [g]);
    }
    const shapes = scene.items.filter((i) => i.kind !== "box");
    group(frame, "Cells", shapes.map((i) => makeItem(i, fonts)));
    group(frame, "Boxes", scene.items.filter((i) => i.kind === "box").map((i) => makeItem(i, fonts)));
    if (save) savePluginData(frame, doc);
  }
  async function nodeById(id) {
    const n = id ? await figma.getNodeByIdAsync(id) : null;
    if (!n || !("width" in n) || n.removed) throw new Error("The selected layer is gone. Select it again.");
    return n;
  }
  var info = (n) => ({ id: n.id, name: n.name, w: Math.round(n.width), h: Math.round(n.height) });
  function selectionInfo() {
    const [n, extra] = figma.currentPage.selection;
    if (!n || extra) return { kind: "none" };
    const doc = loadPluginData(n);
    return doc ? { kind: "pixel", target: info(n), doc } : { kind: "target", target: info(n) };
  }
  function reveal(frame) {
    figma.currentPage.selection = [frame];
    figma.viewport.scrollAndZoomIntoView([frame]);
  }
  async function onRender(m) {
    const doc = parse(m.doc);
    const theme = parseTheme(m.theme);
    const scene = buildScene(doc, theme);
    let frame;
    if (m.mode === "update") {
      const n = await nodeById(m.targetId);
      if (n.type !== "FRAME" || !loadPluginData(n)) throw new Error("Select a Pixel Render frame to update.");
      frame = n;
    } else {
      frame = figma.createFrame();
      frame.name = "Pixel Render";
      if (m.mode === "overlay") {
        const t = await nodeById(m.targetId);
        if (!t.parent || t.parent.type === "DOCUMENT") throw new Error("Cannot overlay a top-level page.");
        t.parent.appendChild(frame);
        frame.x = t.x;
        frame.y = t.y;
      } else {
        figma.currentPage.appendChild(frame);
        frame.x = Math.round(figma.viewport.center.x - doc.canvas.w / 2);
        frame.y = Math.round(figma.viewport.center.y - doc.canvas.h / 2);
      }
    }
    await draw(frame, doc, scene);
    reveal(frame);
    send({ type: "done", message: `${m.mode === "update" ? "Updated" : "Rendered"} ${frame.name}` });
  }
  async function onFlatten(m) {
    const src = await nodeById(m.targetId);
    const doc = parse(m.doc);
    const flat = figma.createFrame();
    flat.name = "Pixel Render (flat)";
    src.parent.appendChild(flat);
    flat.x = src.x + src.width + 40;
    flat.y = src.y;
    await draw(flat, doc, buildScene(doc, parseTheme(m.theme), { flatten: true }), false);
    reveal(flat);
    send({ type: "done", message: "Flattened copy created next to the original" });
  }
  var guard = (fn) => fn().catch((e) => send({ type: "error", message: e instanceof Error ? e.message : String(e) }));
  figma.ui.onmessage = (m) => guard(async () => {
    switch (m.type) {
      case "ready": {
        const raw = await figma.clientStorage.getAsync("themes");
        const themes = [];
        for (const t of Array.isArray(raw) ? raw : []) {
          try {
            themes.push(parseTheme(t));
          } catch (e) {
          }
        }
        const fonts = [...new Set((await figma.listAvailableFontsAsync()).map((f) => f.fontName.family))].sort();
        const draft = await figma.clientStorage.getAsync("draft");
        send({ type: "init", themes, fonts, ...typeof draft === "string" ? { draft } : {} });
        send({ type: "selection", info: selectionInfo() });
        return;
      }
      case "render":
        return onRender(m);
      case "flatten":
        return onFlatten(m);
      case "save-themes":
        return figma.clientStorage.setAsync("themes", m.themes);
      case "save-draft":
        return figma.clientStorage.setAsync("draft", m.doc);
      case "notify":
        figma.notify(m.message);
        return;
    }
  });
  figma.on("selectionchange", () => send({ type: "selection", info: selectionInfo() }));
})();
