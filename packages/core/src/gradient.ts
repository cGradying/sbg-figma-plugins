import { cellRect, cellXY } from './model.ts';
import type { Doc, Gradient, Rect } from './model.ts';
import { mix, resolve } from './theme.ts';
import type { Theme } from './theme.ts';
import type { Selection } from './ops.ts';
import { boxesInside } from './ops.ts';

type Pt = { x: number; y: number };

const rad = (d: number) => (d * Math.PI) / 180;

// CSS convention: 0deg points up, 90deg points right.
export function gradientEnds(r: Rect, angle: number): { s: Pt; e: Pt } {
  const dx = Math.sin(rad(angle));
  const dy = -Math.cos(rad(angle));
  const len = Math.abs(r.w * dx) + Math.abs(r.h * dy);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return { s: { x: cx - (dx * len) / 2, y: cy - (dy * len) / 2 }, e: { x: cx + (dx * len) / 2, y: cy + (dy * len) / 2 } };
}

export function tAt(r: Rect, angle: number, p: Pt): number {
  const { s, e } = gradientEnds(r, angle);
  const vx = e.x - s.x;
  const vy = e.y - s.y;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return 0;
  return Math.min(1, Math.max(0, ((p.x - s.x) * vx + (p.y - s.y) * vy) / len2));
}

export function colorAt(g: Gradient, t: number, theme: Theme): string {
  const stops = [...g.stops].sort((a, b) => a.at - b.at);
  const first = stops[0];
  const last = stops.at(-1);
  if (!first || !last) throw new Error(`gradient ${g.id} has no stops`);
  if (t <= first.at) return resolve(theme, first.role);
  if (t >= last.at) return resolve(theme, last.role);
  const i = stops.findIndex((s) => s.at >= t);
  const a = stops[i - 1]!;
  const b = stops[i]!;
  return mix(resolve(theme, a.role), resolve(theme, b.role), (t - a.at) / (b.at - a.at));
}

// Pixel bounds of every cell painted with this gradient.
export function gradientBounds(doc: Doc, id: string): Rect | undefined {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [k, p] of doc.cells) {
    if (p.kind !== 'gradient' || p.id !== id) continue;
    const { x, y } = cellXY(doc, k);
    const r = cellRect(doc, x, y);
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
  }
  return x0 === Infinity ? undefined : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Figma gradientTransform maps node-normalized coordinates into gradient space,
// where the gradient line runs from (0, 0.5) to (1, 0.5). Built in pixels, then normalized.
export function figmaGradientTransform(r: Rect, angle: number): [[number, number, number], [number, number, number]] {
  const { s, e } = gradientEnds(r, angle);
  const ev = { x: (e.x - s.x) / r.w, y: (e.y - s.y) / r.h };
  const pv = { x: -(e.y - s.y) / r.w, y: (e.x - s.x) / r.h };
  const o = { x: (s.x - r.x) / r.w - pv.x / 2, y: (s.y - r.y) / r.h - pv.y / 2 };
  const [m00, m01, m02, m10, m11, m12] = [ev.x, pv.x, o.x, ev.y, pv.y, o.y] as const;
  const det = m00 * m11 - m01 * m10;
  if (det === 0) throw new Error('gradient bounds are degenerate');
  return [
    [m11 / det, -m01 / det, (m01 * m12 - m11 * m02) / det],
    [-m10 / det, m00 / det, (m10 * m02 - m00 * m12) / det],
  ];
}

export function applyGradient(doc: Doc, sel: Selection, g: Gradient): Doc {
  const paint = { kind: 'gradient', id: g.id } as const;
  const inBox = new Set(doc.boxes.flatMap((b) => [...b.keys]));
  const cells = new Map(doc.cells);
  for (const k of sel) if (!inBox.has(k)) cells.set(k, paint);
  const whole = new Set(boxesInside(doc, sel).map((b) => b.id));
  const boxes = doc.boxes.map((b) => (whole.has(b.id) ? { ...b, fill: paint } : b));
  return { ...doc, cells, boxes, gradients: { ...doc.gradients, [g.id]: g } };
}
