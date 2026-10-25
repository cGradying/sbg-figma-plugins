import {
  BUILT_IN, applyGradient, bucket, buildScene, cellKey, coLead, eraseCells, exportTheme, fillRect, history,
  hardShadow, importTheme, merge, moveSelection, newDoc, outline, paintCells, parse, pixelFade, rectKeys,
  resize, seededScatter, selectionBounds, serialize, split, stairStagger, updateBox, boxAt, boxesInside,
} from '@sbg/core';
import type { Box, Doc, Paint, Theme } from '@sbg/core';
import type { SelectionInfo, ToMain, ToUI } from './messages.ts';
import { draw, fadeBand } from './view.ts';

type Tool = 'brush' | 'eraser' | 'rect' | 'bucket' | 'select';
type Cell = { x: number; y: number };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const inFigma = parent !== window;
const post = (m: ToMain) => (inFigma ? parent.postMessage({ pluginMessage: m }, '*') : window.dispatchEvent(new CustomEvent('dev-post', { detail: m })));

const ACCENTS = ['purple', 'pink', 'green', 'blue'];

const st = {
  hist: history.start(newDoc({ canvas: { w: 1080, h: 1080 }, theme: 'light' })),
  sel: new Set<number>() as ReadonlySet<number>,
  tool: 'brush' as Tool,
  role: 'purple',
  kind: 'solid' as 'solid' | 'outline',
  opacity: 1,
  custom: [] as Theme[],
  fsel: { kind: 'none' } as SelectionInfo,
  gmode: 'stepped' as 'stepped' | 'smooth',
  align: 'center' as 'left' | 'center',
  scatterRoles: new Set<string>(['purple', 'pink']),
  hover: undefined as number | undefined,
  working: undefined as Doc | undefined,
  preview: undefined as ReadonlySet<number> | undefined,
  shift: undefined as { dx: number; dy: number } | undefined,
};

const doc = () => st.working ?? st.hist.present;
const themes = () => [...BUILT_IN, ...st.custom];
const theme = (): Theme => themes().find((t) => t.id === doc().theme) ?? BUILT_IN[0]!;
const isBuiltIn = (t: Theme) => BUILT_IN.some((b) => b.id === t.id);

function status(msg: string, kind: '' | 'ok' | 'err' = '') {
  const el = $('status');
  el.textContent = msg;
  el.className = `status ${kind}`;
}

let saveTimer = 0;
function redraw() {
  const d = doc();
  const scene = buildScene(d, theme());
  draw($<HTMLCanvasElement>('cv'), scene, d, { selection: st.sel, ...(st.hover === undefined ? {} : { hover: st.hover }), ...(st.preview ? { preview: st.preview } : {}), ...(st.shift ? { shift: st.shift } : {}) });
  $('readout').textContent = `${d.cols}×${d.rows} cells · ${d.cell}px · ${d.canvas.w}×${d.canvas.h} · ${d.cells.size} cells, ${d.boxes.length} boxes`;
  $('tag-canvas').textContent = `${d.canvas.w}×${d.canvas.h}`;
  $('tag-theme').textContent = theme().name;
  $('tag-sel').textContent = st.sel.size ? `${st.sel.size} cells` : 'none';
  ($('undo') as HTMLButtonElement).disabled = st.hist.past.length === 0;
  ($('redo') as HTMLButtonElement).disabled = st.hist.future.length === 0;
  syncDock();
}

function apply(next: Doc) {
  st.hist = history.commit(st.hist, next);
  st.working = undefined;
  redraw();
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => post({ type: 'save-draft', doc: serialize(st.hist.present) }), 600);
}

function attempt(fn: () => void) {
  try { fn(); } catch (e) { status(e instanceof Error ? e.message : String(e), 'err'); }
}

const currentPaint = (): Paint =>
  st.kind === 'outline' ? { kind: 'outline', role: st.role, weight: 3 } : { kind: 'solid', role: st.role, ...(st.opacity < 1 ? { opacity: st.opacity } : {}) };

/* ---------- palette and theme controls ---------- */

function roleOrder(t: Theme): string[] {
  const rest = Object.keys(t.roles).filter((r) => !ACCENTS.includes(r) && !['ink', 'onAccent', 'bg', 'gridLine'].includes(r));
  return [...ACCENTS, ...rest, 'ink', 'onAccent', 'bg', 'gridLine'].filter((r) => r in t.roles);
}

function fillRoleSelects() {
  const roles = roleOrder(theme());
  for (const id of ['g-a', 'g-b', 't-role', 'fx-sh-role', 'fx-ol-role']) {
    const el = $<HTMLSelectElement>(id);
    const keep = el.value;
    el.replaceChildren(...roles.map((r) => new Option(r, r)));
    el.value = roles.includes(keep) ? keep : id === 'g-b' ? 'pink' : id === 't-role' ? 'onAccent' : id === 'fx-sh-role' ? 'ink' : roles[0]!;
  }
}

function renderChips() {
  const t = theme();
  const roles = roleOrder(t);
  if (!roles.includes(st.role)) st.role = 'purple';
  const chips = $('chips');
  chips.replaceChildren(
    ...roles.map((r) => {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.style.background = t.roles[r]!;
      b.title = r;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', r);
      b.setAttribute('aria-checked', String(r === st.role));
      b.onclick = () => { st.role = r; renderChips(); };
      return b;
    }),
  );
  const sc = $('fx-sc-roles');
  sc.replaceChildren(
    ...roles.filter((r) => !['bg', 'gridLine', 'onAccent', 'ink'].includes(r)).map((r) => {
      const b = document.createElement('button');
      b.className = 'swatch check';
      b.textContent = r;
      b.setAttribute('role', 'checkbox');
      b.setAttribute('aria-checked', String(st.scatterRoles.has(r)));
      b.onclick = () => { st.scatterRoles.has(r) ? st.scatterRoles.delete(r) : st.scatterRoles.add(r); renderChips(); };
      return b;
    }),
  );
}

function renderThemePanel() {
  const sel = $<HTMLSelectElement>('theme');
  sel.replaceChildren(...themes().map((t) => new Option(t.name + (isBuiltIn(t) ? '' : ' (custom)'), t.id)));
  sel.value = theme().id;
  const t = theme();
  const locked = isBuiltIn(t);
  $('roles').replaceChildren(
    ...roleOrder(t).map((r) => {
      const row = document.createElement('div');
      row.className = 'r';
      const name = document.createElement('span');
      name.textContent = r;
      const input = document.createElement('input');
      input.type = 'color';
      input.value = t.roles[r]!;
      input.disabled = locked;
      input.setAttribute('aria-label', `${t.name} ${r}`);
      input.oninput = () => { updateCustom({ ...t, roles: { ...t.roles, [r]: input.value } }); };
      row.append(name, input);
      return row;
    }),
  );
  ($('theme-delete') as HTMLButtonElement).disabled = locked;
  ($('theme-copy') as HTMLButtonElement).disabled = !locked;
  ($('role-add-btn') as HTMLButtonElement).disabled = locked;
  fillRoleSelects();
  renderChips();
}

function updateCustom(next: Theme) {
  st.custom = st.custom.map((c) => (c.id === next.id ? next : c));
  post({ type: 'save-themes', themes: st.custom });
  redraw();
  renderChips();
}

function setTheme(id: string) {
  apply({ ...st.hist.present, theme: id });
  renderThemePanel();
}

$('theme').onchange = (e) => setTheme((e.target as HTMLSelectElement).value);
$('theme-copy').onclick = () => {
  const base = theme();
  const id = `custom-${Date.now().toString(36)}`;
  st.custom = [...st.custom, { id, name: `${base.name} copy`, roles: { ...base.roles } }];
  post({ type: 'save-themes', themes: st.custom });
  setTheme(id);
};
$('theme-delete').onclick = () => {
  const t = theme();
  st.custom = st.custom.filter((c) => c.id !== t.id);
  post({ type: 'save-themes', themes: st.custom });
  setTheme('light');
};
$('role-add-btn').onclick = () => {
  const name = $<HTMLInputElement>('role-name').value.trim().replace(/\s+/g, '-').toLowerCase();
  if (!/^[a-z][\w-]{0,23}$/.test(name)) return status('Role names are 1-24 letters, digits, - or _, starting with a letter.', 'err');
  updateCustom({ ...theme(), roles: { ...theme().roles, [name]: $<HTMLInputElement>('role-color').value } });
  $<HTMLInputElement>('role-name').value = '';
  renderThemePanel();
};
$('theme-export').onclick = () => { $<HTMLTextAreaElement>('theme-json').value = exportTheme(theme()); };
$('theme-import').onclick = () =>
  attempt(() => {
    const t = importTheme($<HTMLTextAreaElement>('theme-json').value);
    const id = isBuiltIn(t) || st.custom.some((c) => c.id === t.id) ? `${t.id}-${Date.now().toString(36)}` : t.id;
    st.custom = [...st.custom, { ...t, id }];
    post({ type: 'save-themes', themes: st.custom });
    setTheme(id);
    status(`Imported ${t.name}`, 'ok');
  });

/* ---------- canvas settings ---------- */

function syncCanvasInputs() {
  const d = st.hist.present;
  $<HTMLInputElement>('cw').value = String(d.canvas.w);
  $<HTMLInputElement>('ch').value = String(d.canvas.h);
  $<HTMLInputElement>('cell').value = String(d.cell);
  $<HTMLSelectElement>('grid').value = d.grid;
  for (const b of $('mode').children) b.classList.toggle('on', (b as HTMLElement).dataset.mode === d.mode);
  for (const b of $('canvas-preset').children) b.classList.toggle('on', Number((b as HTMLElement).dataset.w) === d.canvas.w && Number((b as HTMLElement).dataset.h) === d.canvas.h);
}

function setCanvas(w: number, h: number, cell = st.hist.present.cell) {
  attempt(() => { apply(resize(st.hist.present, { canvas: { w, h }, cell })); syncCanvasInputs(); st.sel = new Set(); redraw(); });
}

for (const b of $('canvas-preset').children) (b as HTMLElement).onclick = () => setCanvas(Number((b as HTMLElement).dataset.w), Number((b as HTMLElement).dataset.h));
for (const id of ['cw', 'ch', 'cell']) $(id).onchange = () => setCanvas(Number($<HTMLInputElement>('cw').value), Number($<HTMLInputElement>('ch').value), Number($<HTMLInputElement>('cell').value));
$('grid').onchange = (e) => { apply({ ...st.hist.present, grid: (e.target as HTMLSelectElement).value as Doc['grid'] }); };
for (const b of $('mode').children) (b as HTMLElement).onclick = () => {
  apply({ ...st.hist.present, mode: (b as HTMLElement).dataset.mode as Doc['mode'] });
  syncCanvasInputs();
  matchTarget();
};

function matchTarget() {
  const d = st.hist.present;
  if (d.mode === 'overlay' && st.fsel.kind === 'target' && (st.fsel.target.w !== d.canvas.w || st.fsel.target.h !== d.canvas.h)) setCanvas(st.fsel.target.w, st.fsel.target.h);
}

/* ---------- tools ---------- */

for (const b of $('tools').children) (b as HTMLElement).onclick = () => setTool((b as HTMLElement).dataset.tool as Tool);
function setTool(t: Tool) {
  st.tool = t;
  for (const b of $('tools').children) b.classList.toggle('on', (b as HTMLElement).dataset.tool === t);
}
for (const b of $('paint-kind').children) (b as HTMLElement).onclick = () => {
  st.kind = (b as HTMLElement).dataset.kind as 'solid' | 'outline';
  for (const o of $('paint-kind').children) o.classList.toggle('on', o === b);
};
$('opacity').oninput = (e) => {
  st.opacity = Number((e.target as HTMLInputElement).value) / 100;
  $('opacity-v').textContent = `${Math.round(st.opacity * 100)}%`;
};
$('undo').onclick = () => { st.hist = history.undo(st.hist); st.sel = new Set(); redraw(); };
$('redo').onclick = () => { st.hist = history.redo(st.hist); st.sel = new Set(); redraw(); };

const cv = $<HTMLCanvasElement>('cv');
function cellAt(e: PointerEvent): Cell {
  const r = cv.getBoundingClientRect();
  const d = st.hist.present;
  const x = Math.floor(((e.clientX - r.left) / r.width) * d.cols);
  const y = Math.floor(((e.clientY - r.top) / r.height) * d.rows);
  return { x: Math.min(d.cols - 1, Math.max(0, x)), y: Math.min(d.rows - 1, Math.max(0, y)) };
}

function line(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = [];
  const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  for (let i = 0; i <= n; i++) out.push({ x: Math.round(a.x + ((b.x - a.x) * i) / (n || 1)), y: Math.round(a.y + ((b.y - a.y) * i) / (n || 1)) });
  return out;
}

type Drag = { start: Cell; last: Cell; moving: boolean };
let drag: Drag | undefined;

cv.onpointerdown = (e) => {
  cv.setPointerCapture(e.pointerId);
  const c = cellAt(e);
  const d = st.hist.present;
  drag = { start: c, last: c, moving: false };
  const k = cellKey(d, c.x, c.y);
  if (st.tool === 'brush') st.working = paintCells(d, [k], currentPaint());
  else if (st.tool === 'eraser') st.working = eraseCells(d, [k]);
  else if (st.tool === 'bucket') { apply(bucket(d, c, currentPaint())); drag = undefined; return; }
  else if (st.tool === 'rect') st.preview = new Set([k]);
  else if (st.tool === 'select') {
    if (st.sel.has(k)) { drag.moving = true; st.shift = { dx: 0, dy: 0 }; }
    else st.preview = new Set([k]);
  }
  redraw();
};

cv.onpointermove = (e) => {
  const c = cellAt(e);
  const d = doc();
  st.hover = cellKey(d, c.x, c.y);
  if (drag) {
    const base = st.hist.present;
    if (st.tool === 'brush' || st.tool === 'eraser') {
      const keys = line(drag.last, c).map((p) => cellKey(base, p.x, p.y));
      st.working = st.tool === 'brush' ? paintCells(doc(), keys, currentPaint()) : eraseCells(doc(), keys);
    } else if (st.tool === 'rect' || (st.tool === 'select' && !drag.moving)) st.preview = rectKeys(base, drag.start, c);
    else if (drag.moving) st.shift = { dx: c.x - drag.start.x, dy: c.y - drag.start.y };
    drag.last = c;
  }
  $('readout').textContent = `cell ${c.x}, ${c.y} · ${d.cols}×${d.rows} · ${d.cell}px`;
  redraw();
};

cv.onpointerleave = () => { st.hover = undefined; if (!drag) redraw(); };

cv.onpointerup = (e) => {
  if (!drag) return;
  const c = cellAt(e);
  const d = st.hist.present;
  const { start, moving } = drag;
  drag = undefined;
  attempt(() => {
    if (st.tool === 'brush' || st.tool === 'eraser') { if (st.working) apply(st.working); }
    else if (st.tool === 'rect') apply(fillRect(d, start, c, currentPaint()));
    else if (st.tool === 'select') {
      if (moving) {
        const out = moveSelection(d, st.sel, c.x - start.x, c.y - start.y);
        st.sel = out.selection;
        apply(out.doc);
      } else {
        const keys = new Set(rectKeys(d, start, c));
        const b = start.x === c.x && start.y === c.y ? boxAt(d, c.x, c.y) : undefined;
        if (b) for (const k of rectKeys(d, { x: b.x, y: b.y }, { x: b.x + b.w - 1, y: b.y + b.h - 1 })) keys.add(k);
        st.sel = e.shiftKey ? new Set([...st.sel, ...keys]) : keys;
      }
    }
  });
  st.working = undefined;
  st.preview = undefined;
  st.shift = undefined;
  fillTextForm();
  redraw();
};

document.onkeydown = (e) => {
  if ((e.target as HTMLElement).matches('input,textarea,select')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? $('redo') : $('undo')).click(); return; }
  const keys: Record<string, Tool> = { b: 'brush', e: 'eraser', r: 'rect', g: 'bucket', s: 'select' };
  const tool = keys[e.key.toLowerCase()];
  if (tool && !mod) setTool(tool);
  if (e.key === 'Escape') { st.sel = new Set(); redraw(); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && st.sel.size) $('sel-clear').click();
};

/* ---------- selection actions ---------- */

const selBox = (): Box | undefined => {
  const boxes = boxesInside(st.hist.present, st.sel);
  return boxes.length === 1 ? boxes[0] : undefined;
};

function needSel(fn: (sel: ReadonlySet<number>) => void) {
  if (!st.sel.size) return status('Select cells first with the Select tool.', 'err');
  attempt(() => fn(st.sel));
}

$('sel-paint').onclick = () => needSel((s) => apply(paintCells(st.hist.present, s, currentPaint())));
$('sel-clear').onclick = () => needSel((s) => apply(eraseCells(st.hist.present, s)));
$('sel-merge').onclick = () => needSel((s) => {
  const b = selectionBounds(st.hist.present, s)!;
  apply(merge(st.hist.present, { x: b.x, y: b.y }, { x: b.x + b.w - 1, y: b.y + b.h - 1 }));
  st.sel = new Set(rectKeys(st.hist.present, { x: b.x, y: b.y }, { x: b.x + b.w - 1, y: b.y + b.h - 1 }));
  fillTextForm();
  redraw();
});
$('sel-split').onclick = () => needSel(() => {
  const b = selBox();
  if (!b) throw new Error('Select exactly one box to split it.');
  apply(split(st.hist.present, b.id));
});
for (const b of document.querySelectorAll<HTMLElement>('[data-n]')) b.onclick = () => needSel((s) => {
  const [dx, dy] = b.dataset.n!.split(',').map(Number) as [number, number];
  const out = moveSelection(st.hist.present, s, dx, dy);
  st.sel = out.selection;
  apply(out.doc);
});

for (const b of $('g-mode').children) (b as HTMLElement).onclick = () => {
  st.gmode = (b as HTMLElement).dataset.gm as 'stepped' | 'smooth';
  for (const o of $('g-mode').children) o.classList.toggle('on', o === b);
};
$('g-apply').onclick = () => needSel((s) => apply(applyGradient(st.hist.present, s, {
  id: `g${Date.now().toString(36)}`,
  stops: [{ role: $<HTMLSelectElement>('g-a').value, at: 0 }, { role: $<HTMLSelectElement>('g-b').value, at: 1 }],
  angle: Number($<HTMLInputElement>('g-angle').value) || 0,
  mode: st.gmode,
})));

for (const b of $('t-align').children) (b as HTMLElement).onclick = () => {
  st.align = (b as HTMLElement).dataset.a as 'left' | 'center';
  for (const o of $('t-align').children) o.classList.toggle('on', o === b);
};

function fillTextForm() {
  const b = selBox();
  if (!b?.text) return;
  $<HTMLInputElement>('t-value').value = b.text.value;
  $<HTMLInputElement>('t-font').value = b.text.family;
  $<HTMLInputElement>('t-style').value = b.text.style;
  $<HTMLInputElement>('t-size').value = String(b.text.size);
  $<HTMLSelectElement>('t-role').value = b.text.role;
}

$('t-apply').onclick = () => needSel(() => {
  const b = selBox();
  if (!b) throw new Error('Select exactly one box to give it text.');
  const value = $<HTMLInputElement>('t-value').value;
  apply(updateBox(st.hist.present, b.id, value === '' ? { text: undefined } : {
    text: {
      value,
      role: $<HTMLSelectElement>('t-role').value,
      size: Number($<HTMLInputElement>('t-size').value) || 48,
      family: $<HTMLInputElement>('t-font').value || 'Inter',
      style: $<HTMLInputElement>('t-style').value || 'Bold',
      align: st.align,
    },
  }));
});

/* ---------- effects ---------- */

const num = (id: string) => Number($<HTMLInputElement>(id).value);
const FX: Record<string, (d: Doc, s: ReadonlySet<number>) => Doc> = {
  fade: (d, s) => pixelFade(d, s, { edge: $<HTMLSelectElement>('fx-fade-edge').value as 'left', density: num('fx-fade-d') / 100, seed: num('fx-fade-s') }),
  stair: (d, s) => stairStagger(d, s, { dir: num('fx-stair-dir') < 0 ? -1 : 1, step: num('fx-stair-step') }),
  shadow: (d, s) => hardShadow(d, s, { dx: num('fx-sh-x'), dy: num('fx-sh-y'), role: $<HTMLSelectElement>('fx-sh-role').value }),
  scatter: (d, s) => seededScatter(d, s, { seed: num('fx-sc-s'), density: num('fx-sc-d') / 100, roles: [...st.scatterRoles] }),
  outline: (d, s) => outline(d, s, { role: $<HTMLSelectElement>('fx-ol-role').value }),
};
for (const b of document.querySelectorAll<HTMLElement>('[data-fx]')) b.onclick = () => needSel((s) => apply(FX[b.dataset.fx!]!(st.hist.present, s)));
$('fx-sc-roll').onclick = () => { $<HTMLInputElement>('fx-sc-s').value = String(Math.floor(Math.random() * 9999)); };

/* ---------- Figma side ---------- */

const theTheme = () => theme();
const target = () => (st.fsel.kind === 'none' ? undefined : st.fsel.target);

function syncDock() {
  const d = st.hist.present;
  const k = st.fsel.kind;
  const overlay = d.mode === 'overlay';
  $('render-new').textContent = overlay ? (k === 'target' ? 'Render over selection' : 'Select a layer to overlay') : 'Render to Figma';
  ($('render-new') as HTMLButtonElement).disabled = overlay && k !== 'target';
  ($('render-update') as HTMLButtonElement).disabled = k !== 'pixel';
  ($('render-load') as HTMLButtonElement).disabled = k !== 'pixel';
  ($('render-flat') as HTMLButtonElement).disabled = k !== 'pixel';
}

$('render-new').onclick = () => {
  const d = st.hist.present;
  const t = target();
  status('Rendering…');
  post({ type: 'render', doc: serialize(d), theme: theTheme(), mode: d.mode === 'overlay' ? 'overlay' : 'new', ...(d.mode === 'overlay' && t ? { targetId: t.id } : {}) });
};
$('render-update').onclick = () => {
  const t = target();
  if (!t) return;
  status('Updating…');
  post({ type: 'render', doc: serialize(st.hist.present), theme: theTheme(), mode: 'update', targetId: t.id });
};
$('render-flat').onclick = () => {
  const t = target();
  if (!t || st.fsel.kind !== 'pixel') return;
  status('Flattening…');
  post({ type: 'flatten', doc: st.fsel.doc, theme: theTheme(), targetId: t.id });
};
$('render-load').onclick = () => attempt(() => {
  if (st.fsel.kind !== 'pixel') return;
  const d = parse(st.fsel.doc);
  st.sel = new Set();
  apply(d);
  syncCanvasInputs();
  renderThemePanel();
  status(`Loaded ${st.fsel.target.name}`, 'ok');
});

function onMessage(m: ToUI) {
  if (m.type === 'init') {
    st.custom = m.themes;
    $('fonts').replaceChildren(...m.fonts.map((f) => new Option(f)));
    if (m.draft) { try { st.hist = history.start(parse(m.draft)); } catch { /* an old draft that no longer parses is dropped */ } }
    syncCanvasInputs();
    renderThemePanel();
    redraw();
  } else if (m.type === 'selection') {
    st.fsel = m.info;
    matchTarget();
    redraw();
  } else if (m.type === 'done') status(m.message, 'ok');
  else status(m.message, 'err');
}

window.addEventListener('message', (e) => { if (e.data?.pluginMessage) onMessage(e.data.pluginMessage as ToUI); });
window.addEventListener('dev-incoming', (e) => onMessage((e as CustomEvent<ToUI>).detail));
window.addEventListener('resize', redraw);

export const dev = { loadExample: () => { apply(coLead()); syncCanvasInputs(); renderThemePanel(); }, state: st };
(window as unknown as { pixelRender: typeof dev }).pixelRender = dev;

fadeBand($<HTMLCanvasElement>('fade'));
syncCanvasInputs();
renderThemePanel();
redraw();
post({ type: 'ready' });
