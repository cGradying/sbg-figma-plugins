import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newDoc, cellKey, rectKeys, setLines, vEdge, hEdge, nearestEdge, outlinePath, biggestRect, paintCells, fillRect, bucket, merge, split, eraseCells, moveSelection,
  mergeRects, serialize, parse, toChunks, fromChunks, LIGHT, DARK, buildScene, resolve, parseTheme,
  applyGradient, gradientBounds, tAt, figmaGradientTransform, gradientEnds, colorAt, history,
  pixelFade, resize, updateBox, seededScatter, stairStagger, hardShadow, outline, sceneToSvg, importTheme, exportTheme,
} from '../src/index.ts';
import type { Doc, Paint } from '../src/index.ts';

const purple: Paint = { kind: 'solid', role: 'purple' };
const pink: Paint = { kind: 'solid', role: 'pink' };
const doc0 = () => newDoc({ canvas: { w: 1080, h: 1080 }, theme: 'light' });
const area = (rs: { w: number; h: number }[]) => rs.reduce((a, r) => a + r.w * r.h, 0);

test('default canvas is a 20x20 grid of 54px cells', () => {
  const d = doc0();
  assert.deepEqual([d.cols, d.rows, d.cell], [20, 20, 54]);
});

test('4:5 canvas gets 25 rows', () => {
  assert.equal(newDoc({ canvas: { w: 1080, h: 1350 }, theme: 'light' }).rows, 25);
});

test('merge clears the cells under the box and keeps the first cell color', () => {
  let d = fillRect(doc0(), { x: 2, y: 2 }, { x: 5, y: 3 }, pink);
  d = merge(d, rectKeys(d, { x: 2, y: 2 }, { x: 5, y: 3 }));
  assert.equal(d.cells.size, 0);
  assert.deepEqual([d.boxes[0]!.id, d.boxes[0]!.keys.size, d.boxes[0]!.fill], ['b1', 8, pink]);
});

test('merging over an existing box absorbs it and keeps its fill and text', () => {
  let d = merge(doc0(), rectKeys(doc0(), { x: 0, y: 0 }, { x: 3, y: 1 }), purple);
  d = updateBox(d, 'b1', { text: { value: 'Hi', role: 'ink', size: 20, family: 'Inter', style: 'Bold', align: 'center' } });
  d = merge(d, rectKeys(d, { x: 3, y: 1 }, { x: 5, y: 2 }), pink);
  assert.equal(d.boxes.length, 1);
  assert.equal(d.boxes[0]!.keys.size, 8 + 6 - 1);
  assert.deepEqual([d.boxes[0]!.fill, d.boxes[0]!.text?.value], [purple, 'Hi']);
});

test('merge accepts an L shape and rejects cells that do not touch', () => {
  const d = doc0();
  const l = new Set([[0, 0], [0, 1], [0, 2], [1, 2]].map(([x, y]) => cellKey(d, x!, y!)));
  assert.equal(merge(d, l, purple).boxes[0]!.keys.size, 4);
  assert.throws(() => merge(d, [cellKey(d, 0, 0), cellKey(d, 5, 5)], purple), /touch/);
});

test('erasing part of a box carves it and keeps the box', () => {
  let d = merge(doc0(), rectKeys(doc0(), { x: 2, y: 2 }, { x: 4, y: 3 }), purple);
  d = eraseCells(d, [cellKey(d, 4, 3)]);
  assert.equal(d.boxes.length, 1);
  assert.equal(d.boxes[0]!.keys.size, 5);
  assert.ok(!d.boxes[0]!.keys.has(cellKey(d, 4, 3)));
});

test('erasing across a box splits it, the biggest piece keeps the id and text', () => {
  let d = merge(doc0(), rectKeys(doc0(), { x: 0, y: 0 }, { x: 4, y: 0 }), purple);
  d = updateBox(d, 'b1', { text: { value: 'A', role: 'ink', size: 20, family: 'Inter', style: 'Bold', align: 'left' } });
  d = eraseCells(d, [cellKey(d, 3, 0)]);
  assert.deepEqual(d.boxes.map((b) => [b.id, b.keys.size, b.text?.value]).sort(), [['b1', 3, 'A'], ['b2', 1, undefined]]);
});

test('erasing every cell of a box removes it', () => {
  let d = merge(doc0(), rectKeys(doc0(), { x: 0, y: 0 }, { x: 1, y: 1 }), purple);
  d = eraseCells(d, rectKeys(d, { x: 0, y: 0 }, { x: 1, y: 1 }));
  assert.equal(d.boxes.length, 0);
});

test('painting under a box is ignored', () => {
  const d = merge(doc0(), rectKeys(doc0(), { x: 0, y: 0 }, { x: 1, y: 1 }), purple);
  assert.equal(paintCells(d, [cellKey(d, 0, 0)], pink).cells.size, 0);
});

test('split puts the box fill back on every cell', () => {
  const d = split(merge(doc0(), rectKeys(doc0(), { x: 1, y: 1 }, { x: 2, y: 2 }), purple), 'b1');
  assert.equal(d.cells.size, 4);
  assert.equal(d.boxes.length, 0);
});

test('bucket fills a bounded region only', () => {
  let d = doc0();
  d = fillRect(d, { x: 0, y: 3 }, { x: 19, y: 3 }, purple);
  const filled = bucket(d, { x: 0, y: 0 }, pink);
  assert.equal(filled.cells.size, 20 * 3 + 20);
  assert.equal(filled.cells.get(cellKey(d, 0, 4)), undefined);
});

test('moveSelection carries cells and fully selected boxes, and rejects leaving the grid', () => {
  let d = fillRect(doc0(), { x: 0, y: 0 }, { x: 1, y: 0 }, purple);
  d = merge(d, rectKeys(d, { x: 4, y: 4 }, { x: 5, y: 5 }), pink);
  const sel = rectKeys(d, { x: 0, y: 0 }, { x: 5, y: 5 });
  const out = moveSelection(d, sel, 2, 1);
  assert.equal(out.doc.cells.get(cellKey(d, 2, 1)), purple);
  assert.ok(out.doc.boxes[0]!.keys.has(cellKey(d, 6, 5)) && out.doc.boxes[0]!.keys.size === 4);
  assert.throws(() => moveSelection(d, sel, -1, 0), /past the edge/);
});

test('mergeRects covers an L shape with 2 rects of equal area', () => {
  const d = doc0();
  const keys = [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]].map(([x, y]) => cellKey(d, x!, y!));
  const rs = mergeRects(d, keys);
  assert.equal(rs.length, 2);
  assert.equal(area(rs), 5);
});

test('mergeRects does not bridge a gap', () => {
  const d = doc0();
  const rs = mergeRects(d, [cellKey(d, 0, 0), cellKey(d, 2, 0)]);
  assert.equal(rs.length, 2);
});

test('serialize round-trips a dense 108x108 doc and stays chunkable', () => {
  let d = newDoc({ canvas: { w: 1080, h: 1080 }, cell: 10, theme: 'dark' });
  const roles = ['purple', 'pink', 'green', 'blue'];
  for (let k = 0; k < d.cols * d.rows; k++) if (k % 3 !== 0) d = paintCells(d, [k], { kind: 'solid', role: roles[(k * 7) % 4]! });
  d = merge(d, rectKeys(d, { x: 0, y: 0 }, { x: 3, y: 1 }), purple);
  d = setLines(d, [vEdge(d, 5, 5), hEdge(d, 2, 3)], true);
  const json = serialize(d);
  const back = parse(json);
  assert.deepEqual([...back.cells], [...d.cells]);
  assert.deepEqual(back.boxes, d.boxes);
  assert.deepEqual([...back.gridCut].sort((a, b) => a - b), [...d.gridCut].sort((a, b) => a - b));
  assert.equal(back.gridOpacity, d.gridOpacity);
  assert.equal(fromChunks(toChunks(json)), json);
});

test('parse rejects corrupt data', () => {
  const good = JSON.parse(serialize(doc0()));
  assert.throws(() => parse(JSON.stringify({ ...good, v: 9 })), /version/);
  assert.throws(() => parse(JSON.stringify({ ...good, boxes: [{ id: 'b1', runs: [999999, 2], fill: purple }] })), /box run/);
  assert.throws(() => parse(JSON.stringify({ ...good, runs: [0, 1] })), /corrupt/);
  assert.throws(() => parse(JSON.stringify({ ...good, paints: [purple], runs: [399, 5, 0] })), /run/);
});

test('switching theme changes every color and no structure', () => {
  let d = fillRect(doc0(), { x: 0, y: 0 }, { x: 3, y: 3 }, purple);
  d = merge(d, rectKeys(d, { x: 8, y: 8 }, { x: 9, y: 9 }), pink);
  const a = buildScene(d, LIGHT);
  const b = buildScene(d, DARK);
  assert.equal(a.items.length, b.items.length);
  assert.notEqual(a.background, b.background);
  const hex = (s: typeof a) => s.items.map((i) => (i.kind === 'rect' && i.fill?.type === 'solid' ? i.fill.hex : ''));
  assert.notDeepEqual(hex(a), hex(b));
  assert.equal(resolve(DARK, 'purple'), '#a05bf3');
});

test('overlay mode drops the background but keeps grid lines that are turned on', () => {
  const s = buildScene({ ...doc0(), mode: 'overlay' }, LIGHT);
  assert.equal(s.background, null);
  assert.ok(s.grid);
});

test('grid opacity 0 removes the grid, and cutting one segment shortens the path', () => {
  assert.equal(buildScene({ ...doc0(), gridOpacity: 0 }, LIGHT).grid, null);
  const d = doc0();
  const full = buildScene(d, LIGHT).grid!.d;
  const cut = buildScene(setLines(d, [vEdge(d, 3, 4)], true), LIGHT).grid!.d;
  assert.notEqual(full, cut);
  assert.ok(cut.includes('M162 0L162 216') && cut.includes('M162 270L162 1080'));
  assert.equal(buildScene(setLines(setLines(d, [vEdge(d, 3, 4)], true), [vEdge(d, 3, 4)], false), LIGHT).grid!.d, full);
});

test('nearestEdge picks the grid line under the pointer and ignores cell centers', () => {
  const d = doc0();
  assert.equal(nearestEdge(d, 162 + 4, 4 * 54 + 20), vEdge(d, 3, 4));
  assert.equal(nearestEdge(d, 3 * 54 + 20, 5 * 54 - 3), hEdge(d, 3, 5));
  assert.equal(nearestEdge(d, 3 * 54 + 27, 4 * 54 + 27), undefined);
  assert.equal(nearestEdge(d, 2, 100), undefined);
});

test('outline path of a rectangle is one loop, an L is six corners, a ring has a hole', () => {
  const d = doc0();
  const area = (path: string) => path.split('Z').filter(Boolean).reduce((sum, loop) => {
    const pts = [...loop.matchAll(/[ML](-?\d+) (-?\d+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
    return sum + pts.reduce((a, [x, y], i) => { const [nx, ny] = pts[(i + 1) % pts.length]!; return a + (x * ny - nx * y) / 2; }, 0);
  }, 0);
  const rect = outlinePath({ cols: 20, cell: 10 }, rectKeys(d, { x: 0, y: 0 }, { x: 2, y: 1 }));
  assert.equal(rect, 'M0 0L30 0L30 20L0 20Z');
  const l = outlinePath({ cols: 20, cell: 10 }, [[0, 0], [0, 1], [0, 2], [1, 2]].map(([x, y]) => cellKey(d, x!, y!)));
  assert.equal(l.split('L').length - 1, 5);
  const ring = rectKeys(d, { x: 0, y: 0 }, { x: 2, y: 2 });
  ring.delete(cellKey(d, 1, 1));
  const p = outlinePath({ cols: 20, cell: 10 }, ring);
  assert.equal(p.split('Z').length - 1, 2);
  assert.equal(Math.abs(area(p)), 800);
});

test('a carved box becomes an outline path and its text sits in the biggest rectangle', () => {
  let d = merge(doc0(), rectKeys(doc0(), { x: 0, y: 0 }, { x: 3, y: 1 }), purple);
  const plain = buildScene(d, LIGHT).items[0] as { d?: string };
  assert.equal(plain.d, undefined);
  d = eraseCells(d, [cellKey(d, 3, 1)]);
  const carved = buildScene(d, LIGHT).items[0] as { d?: string; textRect: { w: number; h: number } };
  assert.ok(carved.d);
  assert.deepEqual([carved.textRect.w, carved.textRect.h], [4 * 54, 54]);
  assert.deepEqual(biggestRect(d, d.boxes[0]!.keys), { x: 0, y: 0, w: 4, h: 1 });
});


test('flatten gives one path per fill', () => {
  const d = fillRect(doc0(), { x: 0, y: 0 }, { x: 4, y: 4 }, purple);
  const s = buildScene(d, LIGHT, { flatten: true });
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0]!.kind, 'path');
  assert.equal((s.items[0] as { d: string }).d, 'M0 0L270 0L270 270L0 270Z');
});

test('theme import rejects a missing role and a bad color', () => {
  const t = JSON.parse(exportTheme(LIGHT));
  delete t.roles.pink;
  assert.throws(() => parseTheme(t), /pink/);
  assert.throws(() => parseTheme({ ...JSON.parse(exportTheme(LIGHT)), roles: { ...LIGHT.roles, pink: 'red' } }), /color/);
  assert.equal(importTheme(exportTheme(DARK)).id, 'dark');
});

test('stepped gradient samples rise along the angle and hit the stop colors', () => {
  const g = { id: 'g1', stops: [{ role: 'purple', at: 0 }, { role: 'pink', at: 1 }], angle: 90, mode: 'stepped' as const };
  let d = fillRect(doc0(), { x: 0, y: 0 }, { x: 4, y: 0 }, purple);
  d = applyGradient(d, rectKeys(d, { x: 0, y: 0 }, { x: 4, y: 0 }), g);
  const s = buildScene(d, LIGHT);
  const hexes = s.items.map((i) => (i.kind === 'rect' && i.fill?.type === 'solid' ? i.fill.hex : ''));
  assert.equal(hexes.length, 5);
  const red = hexes.map((h) => parseInt(h.slice(1, 3), 16));
  assert.ok(red.every((v, i) => i === 0 || v >= red[i - 1]!));
  assert.ok(Math.abs(tAt(gradientBounds(d, 'g1')!, 90, { x: 0, y: 10 }) - 0) < 1e-9);
  assert.equal(colorAt(g, 0, LIGHT), LIGHT.roles.purple);
});

test('smooth gradient becomes one linear-filled path', () => {
  const g = { id: 'g2', stops: [{ role: 'blue', at: 0 }, { role: 'green', at: 1 }], angle: 180, mode: 'smooth' as const };
  let d = fillRect(doc0(), { x: 0, y: 0 }, { x: 2, y: 2 }, purple);
  d = applyGradient(d, rectKeys(d, { x: 0, y: 0 }, { x: 2, y: 2 }), g);
  const s = buildScene(d, LIGHT);
  assert.equal(s.items.length, 1);
  assert.equal((s.items[0] as { fill: { type: string } }).fill.type, 'linear');
  assert.match(sceneToSvg(s), /linearGradient/);
});

test('figma gradient transform sends the start to (0, 0.5) and the end to (1, 0.5)', () => {
  const r = { x: 100, y: 50, w: 400, h: 200 };
  for (const angle of [0, 45, 90, 135, 200]) {
    const t = figmaGradientTransform(r, angle);
    const { s, e } = gradientEnds(r, angle);
    const apply = (p: { x: number; y: number }) => {
      const u = (p.x - r.x) / r.w, v = (p.y - r.y) / r.h;
      return [t[0][0] * u + t[0][1] * v + t[0][2], t[1][0] * u + t[1][1] * v + t[1][2]];
    };
    const [sx, sy] = apply(s), [ex, ey] = apply(e);
    assert.ok(Math.abs(sx! - 0) < 1e-9 && Math.abs(sy! - 0.5) < 1e-9, `start at ${angle}`);
    assert.ok(Math.abs(ex! - 1) < 1e-9 && Math.abs(ey! - 0.5) < 1e-9, `end at ${angle}`);
  }
});

test('seeded scatter repeats for the same seed and differs for another', () => {
  const d = doc0();
  const sel = rectKeys(d, { x: 0, y: 0 }, { x: 9, y: 9 });
  const o = { density: 0.4, roles: ['purple', 'pink'] };
  const a = seededScatter(d, sel, { ...o, seed: 7 });
  assert.deepEqual([...a.cells], [...seededScatter(d, sel, { ...o, seed: 7 }).cells]);
  assert.notDeepEqual([...a.cells], [...seededScatter(d, sel, { ...o, seed: 8 }).cells]);
});

test('pixel fade keeps the near edge and thins the far edge', () => {
  let d = fillRect(doc0(), { x: 0, y: 0 }, { x: 19, y: 19 }, purple);
  const out = pixelFade(d, rectKeys(d, { x: 0, y: 0 }, { x: 19, y: 19 }), { edge: 'right', density: 1, seed: 3 });
  const inColumn = (x: number) => [...out.cells.keys()].filter((k) => k % 20 === x).length;
  assert.equal(inColumn(19), 20);
  assert.ok(inColumn(0) < 20);
});

test('hard shadow offsets into empty cells only', () => {
  let d = fillRect(doc0(), { x: 2, y: 2 }, { x: 3, y: 3 }, purple);
  const out = hardShadow(d, rectKeys(d, { x: 2, y: 2 }, { x: 3, y: 3 }), { dx: 1, dy: 1, role: 'ink' });
  assert.equal(out.cells.size, 4 + 3);
  assert.deepEqual(out.cells.get(cellKey(d, 4, 4)), { kind: 'solid', role: 'ink' });
});

test('outline rings the selection and stair stagger shifts rows', () => {
  let d = fillRect(doc0(), { x: 5, y: 5 }, { x: 6, y: 6 }, purple);
  const sel = rectKeys(d, { x: 5, y: 5 }, { x: 6, y: 6 });
  assert.equal(outline(d, sel, { role: 'pink' }).cells.size, 4 + 8);
  const st = stairStagger(d, sel, { dir: 1, step: 1 });
  assert.ok(st.cells.has(cellKey(d, 6, 6)) && st.cells.has(cellKey(d, 5, 5)));
});

test('history undo and redo move along the snapshots', () => {
  let h = history.start(1);
  h = history.commit(h, 2);
  h = history.commit(h, 3);
  h = history.undo(h);
  assert.equal(h.present, 2);
  h = history.redo(h);
  assert.equal(h.present, 3);
  assert.equal(history.undo(history.start(0)).present, 0);
});

test('resize keeps cells by position and drops boxes that no longer fit', () => {
  let d = fillRect(doc0(), { x: 0, y: 0 }, { x: 19, y: 0 }, purple);
  d = merge(d, rectKeys(d, { x: 15, y: 5 }, { x: 18, y: 6 }), pink);
  d = merge(d, rectKeys(d, { x: 8, y: 8 }, { x: 11, y: 8 }), pink);
  const out = resize(d, { canvas: { w: 540, h: 1350 }, cell: 54 });
  assert.deepEqual([out.cols, out.rows], [10, 25]);
  assert.equal(out.cells.size, 10);
  assert.deepEqual(out.boxes.map((b) => b.keys.size), [2]);
});

test('photo mode: cells become holes and the visible shape is the grid minus them', () => {
  const d = { ...fillRect(doc0(), { x: 5, y: 5 }, { x: 6, y: 6 }, purple), mode: 'photo' as const };
  const s = buildScene(d, LIGHT);
  assert.equal(s.items.length, 0);
  assert.deepEqual([s.cut!.hidden!.at, s.cut!.hidden!.d], [{ x: 270, y: 270 }, 'M0 0L108 0L108 108L0 108Z']);
  assert.equal(s.cut!.visible!.d.split('Z').length - 1, 2);
});

test('photo mode keep flips the shapes, and an empty drawing has nothing to cut', () => {
  const d = { ...fillRect(doc0(), { x: 5, y: 5 }, { x: 6, y: 6 }, purple), mode: 'photo' as const, photoKeep: true };
  const s = buildScene(d, LIGHT);
  assert.equal(s.cut!.visible!.d, 'M0 0L108 0L108 108L0 108Z');
  assert.equal(s.cut!.hidden!.d.split('Z').length - 1, 2);
  const none = buildScene({ ...doc0(), mode: 'photo' }, LIGHT).cut!;
  assert.deepEqual([none.hidden, none.visible === null], [null, false]);
});

test('boxes count as holes in photo mode and photoKeep survives serialize and resize', () => {
  let d = merge(doc0(), rectKeys(doc0(), { x: 0, y: 0 }, { x: 2, y: 2 }), purple);
  d = { ...d, mode: 'photo', photoKeep: true };
  assert.equal(buildScene(d, LIGHT).cut!.visible!.d, 'M0 0L162 0L162 162L0 162Z');
  assert.equal(parse(serialize(d)).photoKeep, true);
  assert.equal(parse(serialize(d)).mode, 'photo');
  assert.equal(resize(d, { canvas: { w: 540, h: 540 }, cell: 54 }).photoKeep, true);
});
