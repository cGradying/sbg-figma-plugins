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
    var _a, _b, _c;
    return p.kind === "solid" ? `s:${p.role}:${(_a = p.opacity) != null ? _a : 1}` : p.kind === "outline" ? `o:${p.role}:${(_b = p.weight) != null ? _b : 3}:${(_c = p.opacity) != null ? _c : 1}` : `g:${p.id}`;
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
  function keysBounds(doc, keys) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of keys) {
      const { x, y } = cellXY(doc, k);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    return x0 === Infinity ? void 0 : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  function components(cols, keys) {
    const left = new Set(keys);
    const out = [];
    while (left.size) {
      const first = left.values().next().value;
      left.delete(first);
      const comp = [first];
      for (let i = 0; i < comp.length; i++) {
        const k = comp[i];
        const x = k % cols;
        for (const n of [x > 0 ? k - 1 : -1, x < cols - 1 ? k + 1 : -1, k - cols, k + cols]) {
          if (left.delete(n)) comp.push(n);
        }
      }
      out.push(comp);
    }
    return out;
  }
  var vEdge = (doc, x, y) => (y * doc.cols + x) * 2;
  var hEdge = (doc, x, y) => (y * doc.cols + x) * 2 + 1;

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
  var biggestRect = (doc, keys) => mergeRects(doc, keys).reduce((a, b) => b.w * b.h > a.w * a.h ? b : a);
  function outlinePath(doc, keys, origin = { x: 0, y: 0 }) {
    var _a;
    const set = new Set(keys);
    const W = doc.cols + 1;
    const out = /* @__PURE__ */ new Map();
    const edge = (x0, y0, x1, y1) => {
      var _a2;
      const a = y0 * W + x0;
      ((_a2 = out.get(a)) != null ? _a2 : out.set(a, []).get(a)).push(y1 * W + x1);
    };
    const has = (x, y) => x >= 0 && x < doc.cols && y >= 0 && set.has(y * doc.cols + x);
    for (const k of set) {
      const { x, y } = cellXY(doc, k);
      if (!has(x, y - 1)) edge(x, y, x + 1, y);
      if (!has(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
      if (!has(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
      if (!has(x - 1, y)) edge(x, y + 1, x, y);
    }
    let d = "";
    for (const [start2, ends] of out) {
      while (ends.length) {
        const pts = [];
        let cur = start2;
        for (; ; ) {
          const next = (_a = out.get(cur)) == null ? void 0 : _a.pop();
          if (next === void 0) break;
          pts.push(cur);
          cur = next;
          if (cur === start2) break;
        }
        const at = (v) => ({ x: v % W, y: Math.floor(v / W) });
        const corners = pts.filter((v, i) => {
          const a = at(pts[(i + pts.length - 1) % pts.length]), b = at(v), c = at(pts[(i + 1) % pts.length]);
          return (b.x - a.x) * (c.y - b.y) !== (b.y - a.y) * (c.x - b.x);
        });
        d += corners.map((v, i) => `${i ? "L" : "M"}${(at(v).x - origin.x) * doc.cell} ${(at(v).y - origin.y) * doc.cell}`).join("") + "Z";
      }
    }
    return d;
  }
  var isRectangle = (doc, keys, bounds) => keys.size === bounds.w * bounds.h && components(doc.cols, keys).length === 1;
  function gridPath(doc) {
    const { cell, canvas } = doc;
    let d = "";
    for (let x = 1; x < doc.cols && x * cell < canvas.w; x++) {
      for (let y = 0; y < doc.rows; y++) {
        if (doc.gridCut.has(vEdge(doc, x, y))) continue;
        const y0 = y;
        while (y + 1 < doc.rows && !doc.gridCut.has(vEdge(doc, x, y + 1))) y++;
        d += `M${x * cell} ${y0 * cell}L${x * cell} ${Math.min((y + 1) * cell, canvas.h)}`;
      }
    }
    for (let y = 1; y < doc.rows && y * cell < canvas.h; y++) {
      for (let x = 0; x < doc.cols; x++) {
        if (doc.gridCut.has(hEdge(doc, x, y))) continue;
        const x0 = x;
        while (x + 1 < doc.cols && !doc.gridCut.has(hEdge(doc, x + 1, y))) x++;
        d += `M${x0 * cell} ${y * cell}L${Math.min((x + 1) * cell, canvas.w)} ${y * cell}`;
      }
    }
    return d;
  }

  // ../../packages/core/src/serialize.ts
  var VERSION = 2;
  function toRuns(keys) {
    const runs = [];
    for (const k of [...keys].sort((a, b) => a - b)) {
      const n = runs.length;
      if (n && runs[n - 2] + runs[n - 1] === k) runs[n - 1]++;
      else runs.push(k, 1);
    }
    return runs;
  }
  function fromRuns(runs, total) {
    if (!Array.isArray(runs) || runs.length % 2 !== 0) throw new Error("corrupt box data");
    const keys = /* @__PURE__ */ new Set();
    for (let i = 0; i < runs.length; i += 2) {
      const [start2, len] = [runs[i], runs[i + 1]];
      if (!isNum(start2) || !isNum(len) || start2 < 0 || len < 1 || start2 + len > total) throw new Error("corrupt box run");
      for (let k = start2; k < start2 + len; k++) keys.add(k);
    }
    return keys;
  }
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
      gridOpacity: doc.gridOpacity,
      gridCut: [...doc.gridCut].sort((a, b) => a - b),
      theme: doc.theme,
      mode: doc.mode,
      paints,
      runs,
      boxes: doc.boxes.map((b) => ({ id: b.id, runs: toRuns(b.keys), fill: b.fill, ...b.text ? { text: b.text } : {} })),
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
      gridOpacity: isNum(w.gridOpacity) ? w.gridOpacity : 0.7,
      gridCut: new Set(Array.isArray(w.gridCut) ? w.gridCut.filter(isNum) : []),
      theme: w.theme,
      mode: w.mode,
      cells,
      boxes: ((_c = w.boxes) != null ? _c : []).map((b) => ({ id: b.id, keys: fromRuns(b.runs, total), fill: b.fill, ...b.text ? { text: b.text } : {} })),
      gradients: Object.fromEntries(((_d = w.gradients) != null ? _d : []).map((g) => [g.id, g]))
    };
  }
  var CHUNK = 9e4;
  var toChunks = (json) => Array.from({ length: Math.max(1, Math.ceil(json.length / CHUNK)) }, (_, i) => json.slice(i * CHUNK, (i + 1) * CHUNK));
  var fromChunks = (chunks) => chunks.join("");

  // ../../packages/core/src/render.ts
  var solid = (hex, opacity = 1) => ({ type: "solid", hex, opacity });
  var px = (doc, r) => ({ x: r.x * doc.cell, y: r.y * doc.cell, w: r.w * doc.cell, h: r.h * doc.cell });
  function pathItem(doc, name, keys, fill) {
    const set = new Set(keys);
    const b = keysBounds(doc, set);
    return { kind: "path", name, at: { x: b.x * doc.cell, y: b.y * doc.cell }, d: outlinePath(doc, set, b), fill };
  }
  function buildScene(doc, theme, o = {}) {
    var _a, _b, _c, _d, _e;
    const items = [];
    const groups = /* @__PURE__ */ new Map();
    for (const [k, p] of doc.cells) {
      const id = paintKey(p);
      ((_a = groups.get(id)) != null ? _a : groups.set(id, { paint: p, keys: [] }).get(id)).keys.push(k);
    }
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
    const linear = (g, rect) => ({
      type: "linear",
      stops: g.stops.map((s) => ({ hex: resolve(theme, s.role), at: s.at })),
      rect,
      angle: g.angle
    });
    for (const { paint: paint2, keys } of groups.values()) {
      if (paint2.kind === "solid") {
        const fill = solid(resolve(theme, paint2.role), (_b = paint2.opacity) != null ? _b : 1);
        for (const k of keys) o.flatten ? addFlat(fill, k) : cellItem(k, fill);
      } else if (paint2.kind === "outline") {
        const weight = (_c = paint2.weight) != null ? _c : 3;
        for (const k of keys) {
          const { x, y } = cellXY(doc, k);
          const r = cellRect(doc, x, y);
          items.push({
            kind: "rect",
            name: `outline ${x},${y}`,
            rect: { x: r.x + weight / 2, y: r.y + weight / 2, w: r.w - weight, h: r.h - weight },
            stroke: { hex: resolve(theme, paint2.role), weight, opacity: (_d = paint2.opacity) != null ? _d : 1 }
          });
        }
      } else {
        const g = doc.gradients[paint2.id];
        const bounds = gradientBounds(doc, paint2.id);
        if (!g || !bounds) continue;
        if (g.mode === "smooth") {
          items.push(pathItem(doc, `gradient ${g.id}`, keys, linear(g, bounds)));
        } else {
          for (const k of keys) {
            const { x, y } = cellXY(doc, k);
            const r = cellRect(doc, x, y);
            const fill = solid(colorAt(g, tAt(bounds, g.angle, { x: r.x + r.w / 2, y: r.y + r.h / 2 }), theme));
            o.flatten ? addFlat(fill, k) : cellItem(k, fill);
          }
        }
      }
    }
    for (const [id, { fill, keys }] of flat) items.push(pathItem(doc, `fill ${id}`, keys, fill));
    for (const b of doc.boxes) {
      const bounds = keysBounds(doc, b.keys);
      const rect = px(doc, bounds);
      let fill;
      if (b.fill.kind === "solid") fill = solid(resolve(theme, b.fill.role), (_e = b.fill.opacity) != null ? _e : 1);
      else {
        const g = doc.gradients[b.fill.id];
        if (!g) throw new Error(`box ${b.id} uses missing gradient ${b.fill.id}`);
        fill = linear(g, rect);
      }
      const plain = isRectangle(doc, b.keys, bounds);
      items.push({
        kind: "box",
        name: `box ${b.id}`,
        rect,
        ...plain ? {} : { d: outlinePath(doc, b.keys, bounds) },
        textRect: plain ? rect : px(doc, biggestRect(doc, b.keys)),
        fill,
        ...b.text ? { text: { ...b.text, hex: resolve(theme, b.text.role) } } : {}
      });
    }
    const d = gridPath(doc);
    return {
      canvas: doc.canvas,
      background: doc.mode === "overlay" ? null : resolve(theme, "bg"),
      grid: doc.gridOpacity > 0 && d ? { d, hex: resolve(theme, "gridLine"), opacity: doc.gridOpacity } : null,
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
        r.strokes = [{ type: "SOLID", color: rgb(it.stroke.hex), opacity: it.stroke.opacity }];
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
    box.clipsContent = false;
    const font = it.text ? (_a = fonts.get(`${it.text.family}|${it.text.style}`)) != null ? _a : FALLBACK_FONT : FALLBACK_FONT;
    const label = () => {
      const t = figma.createText();
      t.fontName = font;
      t.characters = it.text.value;
      t.fontSize = it.text.size;
      t.fills = [{ type: "SOLID", color: rgb(it.text.hex) }];
      return t;
    };
    if (!it.d) {
      box.fills = it.fill.type === "solid" && it.fill.opacity === 0 ? [] : [paint(it.fill)];
      if (it.text) {
        box.layoutMode = "HORIZONTAL";
        box.primaryAxisSizingMode = "FIXED";
        box.counterAxisSizingMode = "FIXED";
        box.counterAxisAlignItems = "CENTER";
        box.primaryAxisAlignItems = it.text.align === "left" ? "MIN" : "CENTER";
        box.paddingLeft = box.paddingRight = Math.round(it.rect.h * 0.2);
        box.appendChild(label());
      }
      return box;
    }
    box.fills = [];
    const shape = vector("Shape", it.d, { x: 0, y: 0 });
    shape.fills = [paint(it.fill)];
    box.appendChild(shape);
    if (it.text) {
      const t = label();
      box.appendChild(t);
      const tr = it.textRect;
      t.x = tr.x - it.rect.x + (it.text.align === "left" ? tr.h * 0.2 : (tr.w - t.width) / 2);
      t.y = tr.y - it.rect.y + (tr.h - t.height) / 2;
    }
    return box;
  }
  var SCALE = { horizontal: "SCALE", vertical: "SCALE" };
  function group(frame, name, nodes) {
    if (nodes.length === 0) return;
    for (const n of nodes) {
      frame.appendChild(n);
      if ("constraints" in n) n.constraints = SCALE;
    }
    figma.group(nodes, frame).name = name;
  }
  async function draw(frame, doc, scene, save = true) {
    const fonts = await loadFonts(scene);
    for (const c of [...frame.children]) c.remove();
    frame.resize(scene.canvas.w, scene.canvas.h);
    frame.clipsContent = true;
    frame.exportSettings = [{ format: "PNG", suffix: "@2x", constraint: { type: "SCALE", value: 2 }, contentsOnly: true }, { format: "SVG", suffix: "", contentsOnly: true }];
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
