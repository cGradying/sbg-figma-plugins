import { cellRect, cellXY, keysBounds, paintKey } from './model.ts';
import type { Doc, Paint, Rect } from './model.ts';
import { colorAt, gradientBounds, tAt } from './gradient.ts';
import { biggestRect, gridPath, isRectangle, outlinePath } from './geometry.ts';
import { resolve } from './theme.ts';
import type { Theme } from './theme.ts';

export type Fill =
  | { type: 'solid'; hex: string; opacity: number }
  | { type: 'linear'; stops: { hex: string; at: number }[]; rect: Rect; angle: number };

export type BoxItem = {
  kind: 'box';
  name: string;
  rect: Rect;
  // Outline of an irregular shape, relative to rect. Absent for a plain rectangle.
  d?: string;
  textRect: Rect;
  fill: Fill;
  text?: { value: string; hex: string; size: number; family: string; style: string; align: 'left' | 'center' };
};

export type Item =
  | { kind: 'rect'; name: string; rect: Rect; fill?: Fill; stroke?: { hex: string; weight: number; opacity: number } }
  | { kind: 'path'; name: string; at: { x: number; y: number }; d: string; fill: Fill }
  | BoxItem;

export type Scene = {
  canvas: { w: number; h: number };
  background: string | null;
  grid: { d: string; hex: string; opacity: number } | null;
  items: Item[];
};

const solid = (hex: string, opacity = 1): Fill => ({ type: 'solid', hex, opacity });

const px = (doc: Doc, r: Rect): Rect => ({ x: r.x * doc.cell, y: r.y * doc.cell, w: r.w * doc.cell, h: r.h * doc.cell });

function pathItem(doc: Doc, name: string, keys: Iterable<number>, fill: Fill): Item {
  const set = new Set(keys);
  const b = keysBounds(doc, set)!;
  return { kind: 'path', name, at: { x: b.x * doc.cell, y: b.y * doc.cell }, d: outlinePath(doc, set, b), fill };
}

export function buildScene(doc: Doc, theme: Theme, o: { flatten?: boolean } = {}): Scene {
  const items: Item[] = [];
  const groups = new Map<string, { paint: Paint; keys: number[] }>();
  for (const [k, p] of doc.cells) {
    const id = paintKey(p);
    (groups.get(id) ?? groups.set(id, { paint: p, keys: [] }).get(id)!).keys.push(k);
  }

  const flat = new Map<string, { fill: Fill; keys: number[] }>();
  const addFlat = (fill: Fill, k: number) => {
    const id = fill.type === 'solid' ? `${fill.hex}:${fill.opacity}` : '';
    (flat.get(id) ?? flat.set(id, { fill, keys: [] }).get(id)!).keys.push(k);
  };
  const cellItem = (k: number, fill: Fill) => {
    const { x, y } = cellXY(doc, k);
    items.push({ kind: 'rect', name: `cell ${x},${y}`, rect: cellRect(doc, x, y), fill });
  };
  const linear = (g: { stops: { role: string; at: number }[]; angle: number }, rect: Rect): Fill => ({
    type: 'linear',
    stops: g.stops.map((s) => ({ hex: resolve(theme, s.role), at: s.at })),
    rect,
    angle: g.angle,
  });

  for (const { paint, keys } of groups.values()) {
    if (paint.kind === 'solid') {
      const fill = solid(resolve(theme, paint.role), paint.opacity ?? 1);
      for (const k of keys) o.flatten ? addFlat(fill, k) : cellItem(k, fill);
    } else if (paint.kind === 'outline') {
      const weight = paint.weight ?? 3;
      for (const k of keys) {
        const { x, y } = cellXY(doc, k);
        const r = cellRect(doc, x, y);
        items.push({
          kind: 'rect',
          name: `outline ${x},${y}`,
          rect: { x: r.x + weight / 2, y: r.y + weight / 2, w: r.w - weight, h: r.h - weight },
          stroke: { hex: resolve(theme, paint.role), weight, opacity: paint.opacity ?? 1 },
        });
      }
    } else {
      const g = doc.gradients[paint.id];
      const bounds = gradientBounds(doc, paint.id);
      if (!g || !bounds) continue;
      if (g.mode === 'smooth') {
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
    const bounds = keysBounds(doc, b.keys)!;
    const rect = px(doc, bounds);
    let fill: Fill;
    if (b.fill.kind === 'solid') fill = solid(resolve(theme, b.fill.role), b.fill.opacity ?? 1);
    else {
      const g = doc.gradients[b.fill.id];
      if (!g) throw new Error(`box ${b.id} uses missing gradient ${b.fill.id}`);
      fill = linear(g, rect);
    }
    const plain = isRectangle(doc, b.keys, bounds);
    items.push({
      kind: 'box',
      name: `box ${b.id}`,
      rect,
      ...(plain ? {} : { d: outlinePath(doc, b.keys, bounds) }),
      textRect: plain ? rect : px(doc, biggestRect(doc, b.keys)),
      fill,
      ...(b.text ? { text: { ...b.text, hex: resolve(theme, b.text.role) } } : {}),
    });
  }

  const d = gridPath(doc);
  return {
    canvas: doc.canvas,
    background: doc.mode === 'overlay' ? null : resolve(theme, 'bg'),
    grid: doc.gridOpacity > 0 && d ? { d, hex: resolve(theme, 'gridLine'), opacity: doc.gridOpacity } : null,
    items,
  };
}
