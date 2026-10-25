import { MAX_CELLS, paintKey } from './model.ts';
import type { Doc, FillPaint, Gradient, BoxText, Paint } from './model.ts';

const VERSION = 2;

type Wire = {
  v: number;
  cols: number; rows: number; cell: number;
  canvas: { w: number; h: number };
  gridOpacity: number; gridCut: number[]; photoKeep: boolean; theme: string; mode: Doc['mode'];
  paints: Paint[];
  runs: number[];
  boxes: { id: string; runs: number[]; fill: FillPaint; text?: BoxText }[];
  gradients: Gradient[];
};

// [start, length] pairs over the sorted keys.
function toRuns(keys: Iterable<number>): number[] {
  const runs: number[] = [];
  for (const k of [...keys].sort((a, b) => a - b)) {
    const n = runs.length;
    if (n && runs[n - 2]! + runs[n - 1]! === k) runs[n - 1]!++;
    else runs.push(k, 1);
  }
  return runs;
}

function fromRuns(runs: unknown, total: number): Set<number> {
  if (!Array.isArray(runs) || runs.length % 2 !== 0) throw new Error('corrupt box data');
  const keys = new Set<number>();
  for (let i = 0; i < runs.length; i += 2) {
    const [start, len] = [runs[i], runs[i + 1]];
    if (!isNum(start) || !isNum(len) || start < 0 || len < 1 || start + len > total) throw new Error('corrupt box run');
    for (let k = start; k < start + len; k++) keys.add(k);
  }
  return keys;
}

export function serialize(doc: Doc): string {
  const used = new Set<string>();
  for (const p of doc.cells.values()) if (p.kind === 'gradient') used.add(p.id);
  for (const b of doc.boxes) if (b.fill.kind === 'gradient') used.add(b.fill.id);
  const paints: Paint[] = [];
  const index = new Map<string, number>();
  const keys = [...doc.cells.keys()].sort((a, b) => a - b);
  const runs: number[] = [];
  for (const k of keys) {
    const p = doc.cells.get(k)!;
    let i = index.get(paintKey(p));
    if (i === undefined) { i = paints.push(p) - 1; index.set(paintKey(p), i); }
    const n = runs.length;
    if (n && runs[n - 1] === i && runs[n - 3]! + runs[n - 2]! === k) runs[n - 2]!++;
    else runs.push(k, 1, i);
  }
  const wire: Wire = {
    v: VERSION,
    cols: doc.cols, rows: doc.rows, cell: doc.cell, canvas: doc.canvas,
    gridOpacity: doc.gridOpacity, gridCut: [...doc.gridCut].sort((a, b) => a - b), photoKeep: doc.photoKeep, theme: doc.theme, mode: doc.mode,
    paints, runs,
    boxes: doc.boxes.map((b) => ({ id: b.id, runs: toRuns(b.keys), fill: b.fill, ...(b.text ? { text: b.text } : {}) })),
    gradients: Object.values(doc.gradients).filter((g) => used.has(g.id)),
  };
  return JSON.stringify(wire);
}

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export function parse(json: string): Doc {
  const w = JSON.parse(json) as Wire;
  if (w.v !== VERSION) throw new Error(`unsupported pixel render data version ${String(w.v)}`);
  if (![w.cols, w.rows, w.cell, w.canvas?.w, w.canvas?.h].every(isNum)) throw new Error('corrupt grid size');
  if (w.cols < 1 || w.rows < 1 || w.cols > MAX_CELLS || w.rows > MAX_CELLS) throw new Error('grid size out of range');
  if (!Array.isArray(w.paints) || !Array.isArray(w.runs) || w.runs.length % 3 !== 0) throw new Error('corrupt cell data');
  const cells = new Map<number, Paint>();
  const total = w.cols * w.rows;
  for (let i = 0; i < w.runs.length; i += 3) {
    const [start, len, pi] = [w.runs[i]!, w.runs[i + 1]!, w.runs[i + 2]!];
    const paint = w.paints[pi];
    if (!paint || !isNum(start) || !isNum(len) || start < 0 || len < 1 || start + len > total) throw new Error('corrupt cell run');
    for (let k = start; k < start + len; k++) cells.set(k, paint);
  }
  return {
    cols: w.cols, rows: w.rows, cell: w.cell, canvas: w.canvas,
    gridOpacity: isNum(w.gridOpacity) ? w.gridOpacity : 0.7, gridCut: new Set(Array.isArray(w.gridCut) ? w.gridCut.filter(isNum) : []),
    photoKeep: w.photoKeep === true, theme: w.theme, mode: w.mode,
    cells,
    boxes: (w.boxes ?? []).map((b) => ({ id: b.id, keys: fromRuns(b.runs, total), fill: b.fill, ...(b.text ? { text: b.text } : {}) })),
    gradients: Object.fromEntries((w.gradients ?? []).map((g) => [g.id, g])),
  };
}

// Figma stores plugin data per key, so a big drawing is split over several keys.
export const CHUNK = 90_000;

export const toChunks = (json: string): string[] =>
  Array.from({ length: Math.max(1, Math.ceil(json.length / CHUNK)) }, (_, i) => json.slice(i * CHUNK, (i + 1) * CHUNK));

export const fromChunks = (chunks: readonly string[]): string => chunks.join('');
