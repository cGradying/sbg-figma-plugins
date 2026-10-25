import { cellXY } from './model.ts';
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

// M/L/Z only, the commands Figma's vectorPaths accepts everywhere. Coordinates are relative to `origin` (in cells).
export function rectsPath(rects: readonly Rect[], cell: number, origin: { x: number; y: number } = { x: 0, y: 0 }): string {
  return rects
    .map((r) => {
      const [x0, y0, x1, y1] = [(r.x - origin.x) * cell, (r.y - origin.y) * cell, (r.x + r.w - origin.x) * cell, (r.y + r.h - origin.y) * cell];
      return `M${x0} ${y0}L${x1} ${y0}L${x1} ${y1}L${x0} ${y1}Z`;
    })
    .join('');
}

export function pathOrigin(rects: readonly Rect[]): { x: number; y: number } {
  return { x: Math.min(...rects.map((r) => r.x)), y: Math.min(...rects.map((r) => r.y)) };
}

export function gridPath(canvas: { w: number; h: number }, cell: number): string {
  let d = '';
  for (let x = cell; x < canvas.w; x += cell) d += `M${x} 0L${x} ${canvas.h}`;
  for (let y = cell; y < canvas.h; y += cell) d += `M0 ${y}L${canvas.w} ${y}`;
  return d;
}
