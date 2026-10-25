import { cellRect, cellXY, paintKey } from './model.ts';
import type { Doc, Paint, Rect } from './model.ts';
import { colorAt, gradientBounds, tAt } from './gradient.ts';
import { gridPath, mergeRects, pathOrigin, rectsPath } from './geometry.ts';
import { resolve } from './theme.ts';
import type { Theme } from './theme.ts';

export type Fill =
  | { type: 'solid'; hex: string; opacity: number }
  | { type: 'linear'; stops: { hex: string; at: number }[]; rect: Rect; angle: number };

export type Item =
  | { kind: 'rect'; name: string; rect: Rect; fill?: Fill; stroke?: { hex: string; weight: number } }
  | { kind: 'path'; name: string; at: { x: number; y: number }; d: string; fill: Fill }
  | { kind: 'box'; name: string; rect: Rect; fill: Fill; text?: { value: string; hex: string; size: number; family: string; style: string; align: 'left' | 'center' } };

export type Scene = {
  canvas: { w: number; h: number };
  background: string | null;
  grid: { d: string; hex: string; opacity: number } | null;
  items: Item[];
};

function pathItem(doc: Doc, name: string, keys: Iterable<number>, fill: Fill): Item {
  const rects = mergeRects(doc, keys);
  const o = pathOrigin(rects);
  return { kind: 'path', name, at: { x: o.x * doc.cell, y: o.y * doc.cell }, d: rectsPath(rects, doc.cell, o), fill };
}

const solid = (hex: string, opacity = 1): Fill => ({ type: 'solid', hex, opacity });

export function buildScene(doc: Doc, theme: Theme, o: { flatten?: boolean } = {}): Scene {
  const overlay = doc.mode === 'overlay';
  const items: Item[] = [];
  const groups = new Map<string, { paint: Paint; keys: number[] }>();
  for (const [k, p] of doc.cells) (groups.get(paintKey(p)) ?? groups.set(paintKey(p), { paint: p, keys: [] }).get(paintKey(p))!).keys.push(k);

  const flat = new Map<string, { fill: Fill; keys: number[] }>();
  const addFlat = (fill: Fill, k: number) => {
    const id = fill.type === 'solid' ? `${fill.hex}:${fill.opacity}` : '';
    (flat.get(id) ?? flat.set(id, { fill, keys: [] }).get(id)!).keys.push(k);
  };
  const cellItem = (k: number, fill: Fill) => {
    const { x, y } = cellXY(doc, k);
    items.push({ kind: 'rect', name: `cell ${x},${y}`, rect: cellRect(doc, x, y), fill });
  };

  for (const { paint, keys } of groups.values()) {
    if (paint.kind === 'solid') {
      for (const k of keys) o.flatten ? addFlat(solid(resolve(theme, paint.role), paint.opacity ?? 1), k) : cellItem(k, solid(resolve(theme, paint.role), paint.opacity ?? 1));
    } else if (paint.kind === 'outline') {
      const weight = paint.weight ?? 3;
      for (const k of keys) {
        const { x, y } = cellXY(doc, k);
        const r = cellRect(doc, x, y);
        items.push({ kind: 'rect', name: `outline ${x},${y}`, rect: { x: r.x + weight / 2, y: r.y + weight / 2, w: r.w - weight, h: r.h - weight }, stroke: { hex: resolve(theme, paint.role), weight } });
      }
    } else {
      const g = doc.gradients[paint.id];
      const bounds = gradientBounds(doc, paint.id);
      if (!g || !bounds) continue;
      if (g.mode === 'smooth') {
        items.push(pathItem(doc, `gradient ${g.id}`, keys, { type: 'linear', stops: g.stops.map((s) => ({ hex: resolve(theme, s.role), at: s.at })), rect: bounds, angle: g.angle }));
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
    let fill: Fill;
    if (b.fill.kind === 'solid') fill = solid(resolve(theme, b.fill.role), b.fill.opacity ?? 1);
    else if (b.fill.kind === 'gradient') {
      const g = doc.gradients[b.fill.id];
      if (!g) throw new Error(`box ${b.id} uses missing gradient ${b.fill.id}`);
      fill = { type: 'linear', stops: g.stops.map((s) => ({ hex: resolve(theme, s.role), at: s.at })), rect, angle: g.angle };
    } else fill = solid(resolve(theme, b.fill.role), 0);
    items.push({
      kind: 'box',
      name: `box ${b.id}`,
      rect,
      fill,
      ...(b.text ? { text: { ...b.text, hex: resolve(theme, b.text.role) } } : {}),
    });
  }

  return {
    canvas: doc.canvas,
    background: overlay ? null : resolve(theme, 'bg'),
    grid: overlay || doc.grid === 'off' ? null : { d: gridPath(doc.canvas, doc.cell), hex: resolve(theme, 'gridLine'), opacity: doc.grid === 'faint' ? 0.7 : 1 },
    items,
  };
}
