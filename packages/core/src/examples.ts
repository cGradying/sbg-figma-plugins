import { newDoc } from './model.ts';
import type { Doc, Paint, Role } from './model.ts';
import { merge, paintCells, rectKeys, updateBox } from './ops.ts';
import { applyGradient } from './gradient.ts';
import { cellKey } from './model.ts';

const solid = (role: Role, opacity?: number): Paint => ({ kind: 'solid', role, ...(opacity === undefined ? {} : { opacity }) });

function put(doc: Doc, cells: [number, number, Paint][]): Doc {
  return cells.reduce((d, [x, y, p]) => paintCells(d, [cellKey(d, x, y)], p), doc);
}

const text = (value: string, size: number, align: 'left' | 'center', role: Role) => ({
  value, size, align, role, family: 'Inter', style: 'Bold',
});

// The "Co-Lead" recruitment post: 20x20 grid of 54px cells, cell positions read off the reference.
export function coLead(): Doc {
  let d = newDoc({ canvas: { w: 1080, h: 1080 }, theme: 'light' });
  d = put(d, [
    [11, 4, solid('pink')], [0, 7, solid('green')],
    [7, 17, solid('green')], [6, 18, solid('blue')], [14, 17, solid('blue')], [13, 18, solid('purple')],
  ]);
  const bar = (d0: Doc, x0: number, y0: number, x1: number, y1: number, fill: Paint, t?: ReturnType<typeof text>): Doc => {
    const next = merge(d0, { x: x0, y: y0 }, { x: x1, y: y1 }, fill);
    return t ? updateBox(next, next.boxes.at(-1)!.id, { text: t }) : next;
  };
  d = bar(d, 12, 3, 19, 3, solid('blue'), text('CORE TEAM RECRUITMENT', 26, 'center', 'onAccent'));
  d = bar(d, 1, 5, 6, 6, solid('purple'), text('Co-Lead', 80, 'left', 'onAccent'));
  d = bar(d, 0, 19, 5, 19, solid('purple'));
  d = bar(d, 7, 19, 12, 19, solid('pink'));
  d = bar(d, 14, 19, 19, 19, solid('green'));
  return d;
}

// Yellow pixel cluster laid over a photo, with a see-through cell, an outline cell and a gradient name bar.
export function photoOverlay(): Doc {
  let d = newDoc({ canvas: { w: 1080, h: 1350 }, cell: 108, theme: 'photo', mode: 'overlay' });
  const y = solid('yellow');
  d = put(d, [
    [5, 0, y], [6, 0, y], [8, 0, y],
    [6, 1, y], [7, 1, y], [9, 1, solid('yellow', 0.5)],
    [6, 2, y], [8, 2, { kind: 'outline', role: 'yellow', weight: 3 }], [9, 2, y],
    [8, 3, y], [5, 4, y], [8, 5, y],
  ]);
  d = merge(d, { x: 3, y: 11 }, { x: 6, y: 11 }, solid('purple'));
  d = updateBox(d, 'b1', { text: text('HANNAH NICOLE PARTIBLE', 28, 'center', 'ink') });
  d = merge(d, { x: 2, y: 12 }, { x: 6, y: 12 }, solid('purple'));
  d = updateBox(d, 'b2', { text: { ...text('SENIOR ASSOCIATE SECRETARY IN CAMPUS', 24, 'center', 'ink'), style: 'Regular' } });
  d = applyGradient(d, rectKeys(d, { x: 3, y: 11 }, { x: 6, y: 11 }), { id: 'bar', stops: [{ role: 'purple', at: 0 }, { role: 'pink', at: 1 }], angle: 90, mode: 'smooth' });
  return d;
}
