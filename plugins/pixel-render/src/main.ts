import { buildScene, figmaGradientTransform, fromChunks, parse, parseTheme, serialize, toChunks } from '@sbg/core';
import type { Doc, Fill, Item, Scene, Theme } from '@sbg/core';
import type { SelectionInfo, ToMain, ToUI } from './messages.ts';

const DATA = 'pixel-render';
const FALLBACK_FONT: FontName = { family: 'Inter', style: 'Regular' };

figma.showUI(__html__, { width: 420, height: 760, title: 'Pixel Render', themeColors: false });

const send = (m: ToUI) => figma.ui.postMessage(m);

const rgb = (hex: string): RGB => ({
  r: parseInt(hex.slice(1, 3), 16) / 255,
  g: parseInt(hex.slice(3, 5), 16) / 255,
  b: parseInt(hex.slice(5, 7), 16) / 255,
});

function paint(f: Fill): Paint {
  if (f.type === 'solid') return { type: 'SOLID', color: rgb(f.hex), opacity: f.opacity };
  return {
    type: 'GRADIENT_LINEAR',
    gradientStops: f.stops.map((s) => ({ position: s.at, color: { ...rgb(s.hex), a: 1 } })),
    gradientTransform: figmaGradientTransform(f.rect, f.angle),
  };
}

function savePluginData(frame: FrameNode, doc: Doc) {
  const chunks = toChunks(serialize(doc));
  const old = Number(frame.getPluginData(`${DATA}.n`) || 0);
  chunks.forEach((c, i) => frame.setPluginData(`${DATA}.${i}`, c));
  for (let i = chunks.length; i < old; i++) frame.setPluginData(`${DATA}.${i}`, '');
  frame.setPluginData(`${DATA}.n`, String(chunks.length));
}

function loadPluginData(node: SceneNode): string | undefined {
  const n = Number(node.getPluginData(`${DATA}.n`) || 0);
  if (!n) return undefined;
  return fromChunks(Array.from({ length: n }, (_, i) => node.getPluginData(`${DATA}.${i}`)));
}

async function loadFonts(scene: Scene): Promise<Map<string, FontName>> {
  const wanted = new Map<string, FontName>();
  for (const it of scene.items) if (it.kind === 'box' && it.text) wanted.set(`${it.text.family}|${it.text.style}`, { family: it.text.family, style: it.text.style });
  const out = new Map<string, FontName>();
  await figma.loadFontAsync(FALLBACK_FONT);
  for (const [k, font] of wanted) {
    try {
      await figma.loadFontAsync(font);
      out.set(k, font);
    } catch {
      out.set(k, FALLBACK_FONT);
    }
  }
  return out;
}

function vector(name: string, d: string, at: { x: number; y: number }): VectorNode {
  const v = figma.createVector();
  v.name = name;
  v.vectorPaths = [{ windingRule: 'NONZERO', data: d }];
  v.x = at.x;
  v.y = at.y;
  return v;
}

function makeItem(it: Item, fonts: Map<string, FontName>): SceneNode {
  if (it.kind === 'rect') {
    const r = figma.createRectangle();
    r.name = it.name;
    r.x = it.rect.x;
    r.y = it.rect.y;
    r.resize(it.rect.w, it.rect.h);
    r.fills = it.fill ? [paint(it.fill)] : [];
    if (it.stroke) {
      r.strokes = [{ type: 'SOLID', color: rgb(it.stroke.hex), opacity: it.stroke.opacity }];
      r.strokeWeight = it.stroke.weight;
      r.strokeAlign = 'INSIDE';
    }
    return r;
  }
  if (it.kind === 'path') {
    const v = vector(it.name, it.d, it.at);
    v.fills = [paint(it.fill)];
    return v;
  }
  const box = figma.createFrame();
  box.name = it.name;
  box.x = it.rect.x;
  box.y = it.rect.y;
  box.resize(it.rect.w, it.rect.h);
  box.clipsContent = false;
  const font = it.text ? (fonts.get(`${it.text.family}|${it.text.style}`) ?? FALLBACK_FONT) : FALLBACK_FONT;
  const label = () => {
    const t = figma.createText();
    t.fontName = font;
    t.characters = it.text!.value;
    t.fontSize = it.text!.size;
    t.fills = [{ type: 'SOLID', color: rgb(it.text!.hex) }];
    return t;
  };
  if (!it.d) {
    box.fills = it.fill.type === 'solid' && it.fill.opacity === 0 ? [] : [paint(it.fill)];
    if (it.text) {
      box.layoutMode = 'HORIZONTAL';
      box.primaryAxisSizingMode = 'FIXED';
      box.counterAxisSizingMode = 'FIXED';
      box.counterAxisAlignItems = 'CENTER';
      box.primaryAxisAlignItems = it.text.align === 'left' ? 'MIN' : 'CENTER';
      box.paddingLeft = box.paddingRight = Math.round(it.rect.h * 0.2);
      box.appendChild(label());
    }
    return box;
  }
  // Irregular shape: the frame holds one outline vector, and the text floats in the biggest rectangle.
  box.fills = [];
  const shape = vector('Shape', it.d, { x: 0, y: 0 });
  shape.fills = [paint(it.fill)];
  box.appendChild(shape);
  if (it.text) {
    const t = label();
    box.appendChild(t);
    const tr = it.textRect;
    t.x = tr.x - it.rect.x + (it.text.align === 'left' ? tr.h * 0.2 : (tr.w - t.width) / 2);
    t.y = tr.y - it.rect.y + (tr.h - t.height) / 2;
  }
  return box;
}

// Resizing the frame in Figma stretches every shape with it.
const SCALE: Constraints = { horizontal: 'SCALE', vertical: 'SCALE' };

function group(frame: FrameNode, name: string, nodes: SceneNode[]) {
  if (nodes.length === 0) return;
  for (const n of nodes) {
    frame.appendChild(n);
    if ('constraints' in n) n.constraints = SCALE;
  }
  figma.group(nodes, frame).name = name;
}

async function draw(frame: FrameNode, doc: Doc, scene: Scene, save = true) {
  const fonts = await loadFonts(scene);
  for (const c of [...frame.children]) c.remove();
  frame.resize(scene.canvas.w, scene.canvas.h);
  frame.clipsContent = true;
  frame.exportSettings = [{ format: 'PNG', suffix: '@2x', constraint: { type: 'SCALE', value: 2 }, contentsOnly: true }, { format: 'SVG', suffix: '', contentsOnly: true }];
  frame.fills = scene.background ? [{ type: 'SOLID', color: rgb(scene.background) }] : [];
  if (scene.grid) {
    const g = vector('Grid', scene.grid.d, { x: 0, y: 0 });
    g.fills = [];
    g.strokes = [{ type: 'SOLID', color: rgb(scene.grid.hex), opacity: scene.grid.opacity }];
    g.strokeWeight = 2;
    group(frame, 'Grid', [g]);
  }
  const shapes = scene.items.filter((i) => i.kind !== 'box');
  group(frame, 'Cells', shapes.map((i) => makeItem(i, fonts)));
  group(frame, 'Boxes', scene.items.filter((i) => i.kind === 'box').map((i) => makeItem(i, fonts)));
  if (save) savePluginData(frame, doc);
}

async function nodeById(id: string | undefined): Promise<SceneNode> {
  const n = id ? await figma.getNodeByIdAsync(id) : null;
  if (!n || !('width' in n) || n.removed) throw new Error('The selected layer is gone. Select it again.');
  return n as SceneNode;
}

const info = (n: SceneNode) => ({ id: n.id, name: n.name, w: Math.round(n.width), h: Math.round(n.height) });

function selectionInfo(): SelectionInfo {
  const [n, extra] = figma.currentPage.selection;
  if (!n || extra) return { kind: 'none' };
  const doc = loadPluginData(n);
  return doc ? { kind: 'pixel', target: info(n), doc } : { kind: 'target', target: info(n) };
}

function reveal(frame: FrameNode) {
  figma.currentPage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);
}

async function onRender(m: Extract<ToMain, { type: 'render' }>) {
  const doc = parse(m.doc);
  const theme = parseTheme(m.theme);
  const scene = buildScene(doc, theme);
  let frame: FrameNode;
  if (m.mode === 'update') {
    const n = await nodeById(m.targetId);
    if (n.type !== 'FRAME' || !loadPluginData(n)) throw new Error('Select a Pixel Render frame to update.');
    frame = n;
  } else {
    frame = figma.createFrame();
    frame.name = 'Pixel Render';
    if (m.mode === 'overlay') {
      const t = await nodeById(m.targetId);
      if (!t.parent || t.parent.type === 'DOCUMENT') throw new Error('Cannot overlay a top-level page.');
      (t.parent as ChildrenMixin).appendChild(frame);
      frame.x = t.x;
      frame.y = t.y;
    } else {
      figma.currentPage.appendChild(frame);
      frame.x = Math.round(figma.viewport.center.x - doc.canvas.w / 2);
      frame.y = Math.round(figma.viewport.center.y - doc.canvas.h / 2);
    }
  }
  await draw(frame, doc, scene);
  reveal(frame);
  send({ type: 'done', message: `${m.mode === 'update' ? 'Updated' : 'Rendered'} ${frame.name}` });
}

async function onFlatten(m: Extract<ToMain, { type: 'flatten' }>) {
  const src = await nodeById(m.targetId);
  const doc = parse(m.doc);
  const flat = figma.createFrame();
  flat.name = 'Pixel Render (flat)';
  (src.parent as ChildrenMixin).appendChild(flat);
  flat.x = src.x + src.width + 40;
  flat.y = src.y;
  await draw(flat, doc, buildScene(doc, parseTheme(m.theme), { flatten: true }), false);
  reveal(flat);
  send({ type: 'done', message: 'Flattened copy created next to the original' });
}

const guard = (fn: () => Promise<void>) => fn().catch((e: unknown) => send({ type: 'error', message: e instanceof Error ? e.message : String(e) }));

figma.ui.onmessage = (m: ToMain) =>
  guard(async () => {
    switch (m.type) {
      case 'ready': {
        const raw = (await figma.clientStorage.getAsync('themes')) as unknown;
        const themes: Theme[] = [];
        for (const t of Array.isArray(raw) ? raw : []) {
          try { themes.push(parseTheme(t)); } catch { /* drop a stored theme that no longer validates */ }
        }
        const fonts = [...new Set((await figma.listAvailableFontsAsync()).map((f) => f.fontName.family))].sort();
        const draft = (await figma.clientStorage.getAsync('draft')) as string | undefined;
        send({ type: 'init', themes, fonts, ...(typeof draft === 'string' ? { draft } : {}) });
        send({ type: 'selection', info: selectionInfo() });
        return;
      }
      case 'render': return onRender(m);
      case 'flatten': return onFlatten(m);
      case 'save-themes': return figma.clientStorage.setAsync('themes', m.themes);
      case 'save-draft': return figma.clientStorage.setAsync('draft', m.doc);
      case 'notify': figma.notify(m.message); return;
    }
  });

figma.on('selectionchange', () => send({ type: 'selection', info: selectionInfo() }));
