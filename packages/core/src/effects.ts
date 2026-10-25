import { boxAt, cellKey, cellXY, inBounds } from './model.ts';
import type { Doc, Paint, Role } from './model.ts';
import { paintCells, selectionBounds } from './ops.ts';
import type { Selection } from './ops.ts';

// mulberry32, so the same seed always scatters the same cells.
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Edge = 'left' | 'right' | 'top' | 'bottom';

// Cells thin out toward `edge`. density 0 keeps everything, 1 clears the far side completely.
export function pixelFade(doc: Doc, sel: Selection, o: { edge: Edge; density: number; seed: number }): Doc {
  const b = selectionBounds(doc, sel);
  if (!b) return doc;
  const rand = rng(o.seed);
  const cells = new Map(doc.cells);
  for (const k of [...sel].sort((p, q) => p - q)) {
    const { x, y } = cellXY(doc, k);
    const along = o.edge === 'left' ? (x - b.x) / b.w : o.edge === 'right' ? (b.x + b.w - 1 - x) / b.w : o.edge === 'top' ? (y - b.y) / b.h : (b.y + b.h - 1 - y) / b.h;
    const r = rand();
    if (cells.has(k) && r < along * o.density) cells.delete(k);
  }
  return { ...doc, cells };
}

// Each row shifts one more cell every `step` rows, giving a staircase edge. Cells shifted off the grid are dropped.
export function stairStagger(doc: Doc, sel: Selection, o: { dir: 1 | -1; step: number }): Doc {
  const b = selectionBounds(doc, sel);
  if (!b || o.step < 1) return doc;
  const cells = new Map(doc.cells);
  const moved: [number, Paint][] = [];
  for (const k of sel) {
    const p = cells.get(k);
    if (!p) continue;
    const { x, y } = cellXY(doc, k);
    const nx = x + o.dir * Math.floor((y - b.y) / o.step);
    cells.delete(k);
    if (inBounds(doc, nx, y) && !boxAt(doc, nx, y)) moved.push([cellKey(doc, nx, y), p]);
  }
  for (const [k, p] of moved) cells.set(k, p);
  return { ...doc, cells };
}

export function hardShadow(doc: Doc, sel: Selection, o: { dx: number; dy: number; role: Role; opacity?: number }): Doc {
  const shadow: Paint = { kind: 'solid', role: o.role, ...(o.opacity === undefined ? {} : { opacity: o.opacity }) };
  const targets: number[] = [];
  for (const k of sel) {
    if (!doc.cells.has(k)) continue;
    const { x, y } = cellXY(doc, k);
    const nx = x + o.dx;
    const ny = y + o.dy;
    if (!inBounds(doc, nx, ny)) continue;
    const nk = cellKey(doc, nx, ny);
    if (!sel.has(nk) && !doc.cells.has(nk)) targets.push(nk);
  }
  return paintCells(doc, targets, shadow);
}

export function seededScatter(doc: Doc, sel: Selection, o: { seed: number; density: number; roles: Role[] }): Doc {
  if (o.roles.length === 0) return doc;
  const rand = rng(o.seed);
  const cells = new Map(doc.cells);
  for (const k of [...sel].sort((p, q) => p - q)) {
    if (rand() >= o.density) continue;
    const { x, y } = cellXY(doc, k);
    const role = o.roles[Math.floor(rand() * o.roles.length)]!;
    if (inBounds(doc, x, y) && !boxAt(doc, x, y)) cells.set(k, { kind: 'solid', role });
  }
  return { ...doc, cells };
}

// Paints the empty cells that touch the selection from outside.
export function outline(doc: Doc, sel: Selection, o: { role: Role }): Doc {
  const ring = new Set<number>();
  for (const k of sel) {
    const { x, y } = cellXY(doc, k);
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
      if (!inBounds(doc, nx, ny)) continue;
      const nk = cellKey(doc, nx, ny);
      if (!sel.has(nk) && !doc.cells.has(nk)) ring.add(nk);
    }
  }
  return paintCells(doc, ring, { kind: 'solid', role: o.role });
}
