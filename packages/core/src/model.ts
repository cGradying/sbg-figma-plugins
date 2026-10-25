export type Role = string;
export type Rect = { x: number; y: number; w: number; h: number };

export type FillPaint =
  | { kind: 'solid'; role: Role; opacity?: number }
  | { kind: 'gradient'; id: string };

export type Paint = FillPaint | { kind: 'outline'; role: Role; weight?: number; opacity?: number };

export type Gradient = {
  id: string;
  stops: { role: Role; at: number }[];
  angle: number;
  mode: 'stepped' | 'smooth';
};

export type BoxText = {
  value: string;
  role: Role;
  size: number;
  family: string;
  style: string;
  align: 'left' | 'center';
};

// A merged shape: any set of touching cells. Erasing cells from it carves the shape.
export type Box = { id: string; keys: ReadonlySet<number>; fill: FillPaint; text?: BoxText };

export type Doc = {
  cols: number;
  rows: number;
  cell: number;
  canvas: { w: number; h: number };
  gridOpacity: number;
  // grid lines drawn above cells and boxes instead of under them
  gridTop: boolean;
  gridCut: ReadonlySet<number>;
  cells: ReadonlyMap<number, Paint>;
  boxes: readonly Box[];
  gradients: Readonly<Record<string, Gradient>>;
  theme: string;
  mode: 'standalone' | 'overlay' | 'photo';
  // photo mode: cells are cut out of the photo (false), or are the only part of it that stays (true)
  photoKeep: boolean;
};

export const DEFAULT_CELL = 54;
export const MAX_CELLS = 120;
export const DEFAULT_GRID_OPACITY = 0.7;

export function newDoc(o: {
  canvas: { w: number; h: number };
  cell?: number;
  theme: string;
  mode?: Doc['mode'];
}): Doc {
  const cell = o.cell ?? DEFAULT_CELL;
  const cols = Math.ceil(o.canvas.w / cell);
  const rows = Math.ceil(o.canvas.h / cell);
  if (cell < 4 || cols > MAX_CELLS || rows > MAX_CELLS) {
    throw new Error(`grid ${cols}x${rows} with cell ${cell} is outside 4px cells and ${MAX_CELLS} per side`);
  }
  return {
    cols,
    rows,
    cell,
    canvas: o.canvas,
    gridOpacity: DEFAULT_GRID_OPACITY,
    gridTop: false,
    gridCut: new Set(),
    cells: new Map(),
    boxes: [],
    gradients: {},
    theme: o.theme,
    mode: o.mode ?? 'standalone',
    photoKeep: false,
  };
}

export const paintKey = (p: Paint): string =>
  p.kind === 'solid'
    ? `s:${p.role}:${p.opacity ?? 1}`
    : p.kind === 'outline'
      ? `o:${p.role}:${p.weight ?? 3}:${p.opacity ?? 1}`
      : `g:${p.id}`;

export const cellKey = (doc: Pick<Doc, 'cols'>, x: number, y: number): number => y * doc.cols + x;

export const cellXY = (doc: Pick<Doc, 'cols'>, k: number): { x: number; y: number } => ({
  x: k % doc.cols,
  y: Math.floor(k / doc.cols),
});

export const inBounds = (doc: Pick<Doc, 'cols' | 'rows'>, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < doc.cols && y < doc.rows;

export const boxAt = (doc: Pick<Doc, 'boxes' | 'cols'>, x: number, y: number): Box | undefined => {
  const k = cellKey(doc, x, y);
  return doc.boxes.find((b) => b.keys.has(k));
};

export const cellRect = (doc: Pick<Doc, 'cell'>, x: number, y: number): Rect => ({
  x: x * doc.cell,
  y: y * doc.cell,
  w: doc.cell,
  h: doc.cell,
});

export function keysBounds(doc: Pick<Doc, 'cols'>, keys: Iterable<number>): Rect | undefined {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const k of keys) {
    const { x, y } = cellXY(doc, k);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return x0 === Infinity ? undefined : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// 4-connected groups of cells.
export function components(cols: number, keys: Iterable<number>): number[][] {
  const left = new Set(keys);
  const out: number[][] = [];
  while (left.size) {
    const first = left.values().next().value as number;
    left.delete(first);
    const comp = [first];
    for (let i = 0; i < comp.length; i++) {
      const k = comp[i]!;
      const x = k % cols;
      for (const n of [x > 0 ? k - 1 : -1, x < cols - 1 ? k + 1 : -1, k - cols, k + cols]) {
        if (left.delete(n)) comp.push(n);
      }
    }
    out.push(comp);
  }
  return out;
}

// Grid line segments are numbered per cell: a vertical segment is the left edge of a cell,
// a horizontal one is its top edge.
export const vEdge = (doc: Pick<Doc, 'cols'>, x: number, y: number): number => (y * doc.cols + x) * 2;
export const hEdge = (doc: Pick<Doc, 'cols'>, x: number, y: number): number => (y * doc.cols + x) * 2 + 1;

// The interior grid line segment nearest to a point in canvas pixels, if it is close enough to mean it.
export function nearestEdge(doc: Doc, px: number, py: number): number | undefined {
  const cx = px / doc.cell;
  const cy = py / doc.cell;
  const gx = Math.round(cx);
  const gy = Math.round(cy);
  const dx = Math.abs(cx - gx);
  const dy = Math.abs(cy - gy);
  const col = Math.floor(cx);
  const row = Math.floor(cy);
  if (dx <= dy && dx < 0.3 && gx >= 1 && gx < doc.cols && row >= 0 && row < doc.rows) return vEdge(doc, gx, row);
  if (dy < dx && dy < 0.3 && gy >= 1 && gy < doc.rows && col >= 0 && col < doc.cols) return hEdge(doc, col, gy);
  return undefined;
}

// Pixel endpoints of a segment, for drawing a highlight.
export function edgeLine(doc: Pick<Doc, 'cols' | 'cell'>, id: number): { x0: number; y0: number; x1: number; y1: number } {
  const k = id >> 1;
  const { x, y } = cellXY(doc, k);
  const c = doc.cell;
  return id & 1 ? { x0: x * c, y0: y * c, x1: (x + 1) * c, y1: y * c } : { x0: x * c, y0: y * c, x1: x * c, y1: (y + 1) * c };
}
