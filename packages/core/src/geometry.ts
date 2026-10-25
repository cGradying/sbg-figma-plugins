import { cellXY, components, hEdge, vEdge } from './model.ts';
import type { Doc, Rect } from './model.ts';

// Greedy cover of a cell set with few rectangles, in grid units: horizontal runs per row,
// then runs that repeat exactly on the next row grow downward.
export function mergeRects(doc: Pick<Doc, 'cols'>, keys: Iterable<number>): Rect[] {
  const rows = new Map<number, number[]>();
  for (const k of keys) {
    const { x, y } = cellXY(doc, k);
    (rows.get(y) ?? rows.set(y, []).get(y)!).push(x);
  }
  const runsByRow = new Map<number, { x: number; w: number }[]>();
  for (const [y, xs] of rows) {
    xs.sort((a, b) => a - b);
    const runs: { x: number; w: number }[] = [];
    for (const x of xs) {
      const last = runs.at(-1);
      if (last && last.x + last.w === x) last.w++;
      else runs.push({ x, w: 1 });
    }
    runsByRow.set(y, runs);
  }
  const out: Rect[] = [];
  const open = new Map<string, Rect>();
  for (const y of [...runsByRow.keys()].sort((a, b) => a - b)) {
    const next = new Map<string, Rect>();
    for (const r of runsByRow.get(y)!) {
      const id = `${r.x}:${r.w}`;
      const above = open.get(id);
      if (above && above.y + above.h === y) { above.h++; next.set(id, above); }
      else { const rect = { x: r.x, y, w: r.w, h: 1 }; out.push(rect); next.set(id, rect); }
    }
    open.clear();
    for (const [id, r] of next) open.set(id, r);
  }
  return out;
}

// The largest rectangle of the cover, used to place text inside an irregular shape.
export const biggestRect = (doc: Pick<Doc, 'cols'>, keys: Iterable<number>): Rect =>
  mergeRects(doc, keys).reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));

// Outline of a cell set as M/L/Z loops, coordinates relative to `origin` (in cells) and scaled by `cell`.
// One loop per boundary. Holes wind the opposite way, so a NONZERO fill leaves them empty.
// Only M/L/Z, the commands Figma's vectorPaths accepts everywhere.
export function outlinePath(doc: Pick<Doc, 'cols' | 'cell'>, keys: Iterable<number>, origin: { x: number; y: number } = { x: 0, y: 0 }): string {
  const set = new Set(keys);
  const W = doc.cols + 1;
  const out = new Map<number, number[]>();
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const a = y0 * W + x0;
    (out.get(a) ?? out.set(a, []).get(a)!).push(y1 * W + x1);
  };
  const has = (x: number, y: number) => x >= 0 && x < doc.cols && y >= 0 && set.has(y * doc.cols + x);
  for (const k of set) {
    const { x, y } = cellXY(doc, k);
    if (!has(x, y - 1)) edge(x, y, x + 1, y);
    if (!has(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
    if (!has(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
    if (!has(x - 1, y)) edge(x, y + 1, x, y);
  }
  let d = '';
  for (const [start, ends] of out) {
    while (ends.length) {
      const pts: number[] = [];
      let cur = start;
      for (;;) {
        const next = out.get(cur)?.pop();
        if (next === undefined) break;
        pts.push(cur);
        cur = next;
        if (cur === start) break;
      }
      const at = (v: number) => ({ x: v % W, y: Math.floor(v / W) });
      const corners = pts.filter((v, i) => {
        const a = at(pts[(i + pts.length - 1) % pts.length]!), b = at(v), c = at(pts[(i + 1) % pts.length]!);
        return (b.x - a.x) * (c.y - b.y) !== (b.y - a.y) * (c.x - b.x);
      });
      d += corners
        .map((v, i) => `${i ? 'L' : 'M'}${(at(v).x - origin.x) * doc.cell} ${(at(v).y - origin.y) * doc.cell}`)
        .join('') + 'Z';
    }
  }
  return d;
}

export const isRectangle = (doc: Pick<Doc, 'cols'>, keys: ReadonlySet<number>, bounds: Rect): boolean =>
  keys.size === bounds.w * bounds.h && components(doc.cols, keys).length === 1;

// Interior grid lines, one segment per cell edge, with hidden segments left out and runs joined.
export function gridPath(doc: Pick<Doc, 'cols' | 'rows' | 'cell' | 'canvas' | 'gridCut'>): string {
  const { cell, canvas } = doc;
  let d = '';
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
