import { boxAt, boxCovers, cellKey, cellXY, inBounds, newDoc, paintKey } from './model.ts';
import type { Box, Doc, Paint, Rect } from './model.ts';

export type Selection = ReadonlySet<number>;

function withCells(doc: Doc, f: (cells: Map<number, Paint>) => void): Doc {
  const cells = new Map(doc.cells);
  f(cells);
  return { ...doc, cells };
}

export function rectKeys(doc: Doc, a: { x: number; y: number }, b: { x: number; y: number }): Set<number> {
  const x0 = Math.max(0, Math.min(a.x, b.x));
  const y0 = Math.max(0, Math.min(a.y, b.y));
  const x1 = Math.min(doc.cols - 1, Math.max(a.x, b.x));
  const y1 = Math.min(doc.rows - 1, Math.max(a.y, b.y));
  const keys = new Set<number>();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) keys.add(cellKey(doc, x, y));
  return keys;
}

export function selectionBounds(doc: Doc, sel: Selection): Rect | undefined {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const k of sel) {
    const { x, y } = cellXY(doc, k);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return x0 === Infinity ? undefined : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function paintCells(doc: Doc, keys: Iterable<number>, paint: Paint): Doc {
  return withCells(doc, (cells) => {
    for (const k of keys) {
      const { x, y } = cellXY(doc, k);
      if (inBounds(doc, x, y) && !boxAt(doc, x, y)) cells.set(k, paint);
    }
  });
}

export function eraseCells(doc: Doc, keys: Iterable<number>): Doc {
  const list = [...keys];
  const hit = new Set(
    doc.boxes.filter((b) => list.some((k) => { const { x, y } = cellXY(doc, k); return boxCovers(b, x, y); })).map((b) => b.id),
  );
  return {
    ...withCells(doc, (cells) => { for (const k of list) cells.delete(k); }),
    boxes: doc.boxes.filter((b) => !hit.has(b.id)),
  };
}

export const fillRect = (doc: Doc, a: { x: number; y: number }, b: { x: number; y: number }, paint: Paint): Doc =>
  paintCells(doc, rectKeys(doc, a, b), paint);

export function bucket(doc: Doc, at: { x: number; y: number }, paint: Paint): Doc {
  if (!inBounds(doc, at.x, at.y) || boxAt(doc, at.x, at.y)) return doc;
  const idOf = (k: number) => { const p = doc.cells.get(k); return p ? paintKey(p) : ''; };
  const start = cellKey(doc, at.x, at.y);
  const target = idOf(start);
  if (target === paintKey(paint)) return doc;
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length) {
    const k = queue.pop()!;
    const { x, y } = cellXY(doc, k);
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      if (!inBounds(doc, nx, ny) || boxAt(doc, nx, ny)) continue;
      const nk = cellKey(doc, nx, ny);
      if (!seen.has(nk) && idOf(nk) === target) { seen.add(nk); queue.push(nk); }
    }
  }
  return paintCells(doc, seen, paint);
}

const nextBoxId = (doc: Doc): string =>
  `b${1 + Math.max(0, ...doc.boxes.map((b) => Number(b.id.slice(1))))}`;

export function merge(doc: Doc, a: { x: number; y: number }, b: { x: number; y: number }, fill?: Paint): Doc {
  const keys = rectKeys(doc, a, b);
  const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
  const rect = { x: Math.max(0, x0), y: Math.max(0, y0), w: 0, h: 0 };
  rect.w = Math.min(doc.cols, Math.max(a.x, b.x) + 1) - rect.x;
  rect.h = Math.min(doc.rows, Math.max(a.y, b.y) + 1) - rect.y;
  if (rect.w < 1 || rect.h < 1) throw new Error('merge rectangle is outside the grid');
  if (doc.boxes.some((o) => o.x < rect.x + rect.w && rect.x < o.x + o.w && o.y < rect.y + rect.h && rect.y < o.y + o.h)) {
    throw new Error('merge rectangle overlaps another box');
  }
  const first = [...keys].map((k) => doc.cells.get(k)).find((p) => p !== undefined);
  const box: Box = { ...rect, id: nextBoxId(doc), fill: fill ?? first ?? { kind: 'solid', role: 'purple' } };
  return { ...withCells(doc, (cells) => { for (const k of keys) cells.delete(k); }), boxes: [...doc.boxes, box] };
}

export function split(doc: Doc, id: string): Doc {
  const box = doc.boxes.find((b) => b.id === id);
  if (!box) return doc;
  const cells = new Map(doc.cells);
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) cells.set(cellKey(doc, x, y), box.fill);
  return { ...doc, cells, boxes: doc.boxes.filter((b) => b.id !== id) };
}

export function updateBox(doc: Doc, id: string, patch: Partial<Pick<Box, 'fill' | 'text'>>): Doc {
  return { ...doc, boxes: doc.boxes.map((b) => (b.id === id ? { ...b, ...patch } : b)) };
}

export function boxesInside(doc: Doc, sel: Selection): Box[] {
  return doc.boxes.filter((b) => {
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (!sel.has(cellKey(doc, x, y))) return false;
    return true;
  });
}

export function moveSelection(doc: Doc, sel: Selection, dx: number, dy: number): { doc: Doc; selection: Set<number> } {
  const moving = boxesInside(doc, sel);
  const movingIds = new Set(moving.map((b) => b.id));
  const shifted = (k: number) => {
    const { x, y } = cellXY(doc, k);
    if (!inBounds(doc, x + dx, y + dy)) throw new Error('move would leave the grid');
    return cellKey(doc, x + dx, y + dy);
  };
  const selection = new Set([...sel].map(shifted));
  const staying = doc.boxes.filter((b) => !movingIds.has(b.id));
  const landed = moving.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy }));
  for (const k of selection) {
    const { x, y } = cellXY(doc, k);
    if (staying.some((b) => boxCovers(b, x, y))) throw new Error('move would land on another box');
  }
  const cells = new Map(doc.cells);
  const carried = [...sel].filter((k) => cells.has(k)).map((k) => [shifted(k), cells.get(k)!] as const);
  for (const k of sel) cells.delete(k);
  for (const [k, p] of carried) cells.set(k, p);
  return { doc: { ...doc, cells, boxes: [...staying, ...landed] }, selection };
}

// New canvas and cell size. Cells keep their (x, y); anything outside the new grid is dropped.
export function resize(doc: Doc, o: { canvas: { w: number; h: number }; cell: number }): Doc {
  const next = newDoc({ canvas: o.canvas, cell: o.cell, theme: doc.theme, mode: doc.mode });
  const cells = new Map<number, Paint>();
  for (const [k, p] of doc.cells) {
    const { x, y } = cellXY(doc, k);
    if (inBounds(next, x, y)) cells.set(cellKey(next, x, y), p);
  }
  const boxes = doc.boxes.filter((b) => b.x + b.w <= next.cols && b.y + b.h <= next.rows);
  return { ...next, grid: doc.grid, cells, boxes, gradients: doc.gradients };
}
