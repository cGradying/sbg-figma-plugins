import { boxAt, cellKey, cellXY, components, inBounds, keysBounds, newDoc, paintKey } from './model.ts';
import type { Box, Doc, FillPaint, Paint, Rect } from './model.ts';

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

export const selectionBounds = (doc: Doc, sel: Selection): Rect | undefined => keysBounds(doc, sel);

export function paintCells(doc: Doc, keys: Iterable<number>, paint: Paint): Doc {
  return withCells(doc, (cells) => {
    for (const k of keys) {
      const { x, y } = cellXY(doc, k);
      if (inBounds(doc, x, y) && !boxAt(doc, x, y)) cells.set(k, paint);
    }
  });
}

const nextBoxIds = (doc: Doc, n: number): string[] => {
  const top = Math.max(0, ...doc.boxes.map((b) => Number(b.id.slice(1))));
  return Array.from({ length: n }, (_, i) => `b${top + 1 + i}`);
};

// Removes cells, and carves the cells out of any box they touch. A box that falls into
// separate pieces keeps its id and text on the biggest piece, the others become new boxes.
export function eraseCells(doc: Doc, keys: Iterable<number>): Doc {
  const gone = new Set(keys);
  const cells = new Map(doc.cells);
  for (const k of gone) cells.delete(k);
  const boxes: Box[] = [];
  const pending: Box[] = [];
  for (const b of doc.boxes) {
    if (![...b.keys].some((k) => gone.has(k))) { boxes.push(b); continue; }
    const parts = components(doc.cols, [...b.keys].filter((k) => !gone.has(k))).sort((p, q) => q.length - p.length);
    parts.forEach((part, i) => {
      if (i === 0) boxes.push({ ...b, keys: new Set(part) });
      else pending.push({ id: '', keys: new Set(part), fill: b.fill });
    });
  }
  const ids = nextBoxIds({ ...doc, boxes }, pending.length);
  pending.forEach((b, i) => boxes.push({ ...b, id: ids[i]! }));
  return { ...doc, cells, boxes };
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

const solidOnly = (p: Paint | undefined): FillPaint | undefined => (p && p.kind !== 'outline' ? p : undefined);

// Turns the cells into one box. Boxes the cells overlap are absorbed, so merging boxes is the same
// operation as drawing over them. The box keeps the first absorbed box's fill and text, otherwise
// `fill`, otherwise the first painted cell.
export function merge(doc: Doc, keys: Iterable<number>, fill?: FillPaint): Doc {
  const want = new Set([...keys].filter((k) => k >= 0 && k < doc.cols * doc.rows));
  if (!want.size) throw new Error('Select some cells to merge.');
  const touched = doc.boxes.filter((b) => [...b.keys].some((k) => want.has(k)));
  for (const b of touched) for (const k of b.keys) want.add(k);
  if (components(doc.cols, want).length !== 1) throw new Error('Merge needs cells that touch each other.');
  const lead = touched[0];
  const text = touched.find((b) => b.text)?.text;
  const painted = [...want].map((k) => solidOnly(doc.cells.get(k))).find((p) => p !== undefined);
  const box: Box = {
    id: lead?.id ?? nextBoxIds(doc, 1)[0]!,
    keys: want,
    fill: lead?.fill ?? fill ?? painted ?? { kind: 'solid', role: 'purple' },
    ...(text ? { text } : {}),
  };
  const gone = new Set(touched.map((b) => b.id));
  return {
    ...withCells(doc, (cells) => { for (const k of want) cells.delete(k); }),
    boxes: [...doc.boxes.filter((b) => !gone.has(b.id)), box],
  };
}

export function split(doc: Doc, id: string): Doc {
  const box = doc.boxes.find((b) => b.id === id);
  if (!box) return doc;
  const cells = new Map(doc.cells);
  for (const k of box.keys) cells.set(k, box.fill);
  return { ...doc, cells, boxes: doc.boxes.filter((b) => b.id !== id) };
}

export function updateBox(doc: Doc, id: string, patch: Partial<Pick<Box, 'fill' | 'text'>>): Doc {
  return { ...doc, boxes: doc.boxes.map((b) => (b.id === id ? { ...b, ...patch } : b)) };
}

export function boxesInside(doc: Doc, sel: Selection): Box[] {
  return doc.boxes.filter((b) => [...b.keys].every((k) => sel.has(k)));
}

export function moveSelection(doc: Doc, sel: Selection, dx: number, dy: number): { doc: Doc; selection: Set<number> } {
  const moving = boxesInside(doc, sel);
  const movingIds = new Set(moving.map((b) => b.id));
  const shifted = (k: number) => {
    const { x, y } = cellXY(doc, k);
    if (!inBounds(doc, x + dx, y + dy)) throw new Error('That would move past the edge of the grid.');
    return cellKey(doc, x + dx, y + dy);
  };
  const selection = new Set([...sel].map(shifted));
  const staying = doc.boxes.filter((b) => !movingIds.has(b.id));
  for (const k of selection) if (staying.some((b) => b.keys.has(k))) throw new Error('That would land on another box.');
  const landed = moving.map((b) => ({ ...b, keys: new Set([...b.keys].map(shifted)) }));
  const cells = new Map(doc.cells);
  const carried = [...sel].filter((k) => cells.has(k)).map((k) => [shifted(k), cells.get(k)!] as const);
  for (const k of sel) cells.delete(k);
  for (const [k, p] of carried) cells.set(k, p);
  return { doc: { ...doc, cells, boxes: [...staying, ...landed] }, selection };
}

// New canvas and cell size. Cells and box cells keep their (x, y); anything outside the new grid is dropped.
export function resize(doc: Doc, o: { canvas: { w: number; h: number }; cell: number }): Doc {
  const next = newDoc({ canvas: o.canvas, cell: o.cell, theme: doc.theme, mode: doc.mode });
  const rekey = (k: number): number | undefined => {
    const { x, y } = cellXY(doc, k);
    return inBounds(next, x, y) ? cellKey(next, x, y) : undefined;
  };
  const cells = new Map<number, Paint>();
  for (const [k, p] of doc.cells) { const n = rekey(k); if (n !== undefined) cells.set(n, p); }
  const cut = new Set<number>();
  for (const id of doc.gridCut) {
    const n = rekey(id >> 1);
    if (n !== undefined) cut.add(n * 2 + (id & 1));
  }
  const boxes: Box[] = [];
  for (const b of doc.boxes) {
    const kept = [...b.keys].map(rekey).filter((k): k is number => k !== undefined);
    components(next.cols, kept).sort((p, q) => q.length - p.length).forEach((part, i) => {
      boxes.push({ ...b, id: i === 0 ? b.id : '', keys: new Set(part), ...(i === 0 ? {} : { text: undefined }) });
    });
  }
  const spare = nextBoxIds({ ...next, boxes: boxes.filter((b) => b.id) }, boxes.filter((b) => !b.id).length);
  let s = 0;
  return {
    ...next,
    gridOpacity: doc.gridOpacity,
    gridTop: doc.gridTop,
    photoKeep: doc.photoKeep,
    gridCut: cut,
    cells,
    boxes: boxes.map((b) => (b.id ? b : { ...b, id: spare[s++]! })),
    gradients: doc.gradients,
  };
}

export function setLines(doc: Doc, ids: Iterable<number>, hidden: boolean): Doc {
  const gridCut = new Set(doc.gridCut);
  for (const id of ids) hidden ? gridCut.add(id) : gridCut.delete(id);
  return { ...doc, gridCut };
}
