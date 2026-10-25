export type Role = string;
export type Rect = { x: number; y: number; w: number; h: number };

export type Paint =
  | { kind: 'solid'; role: Role; opacity?: number }
  | { kind: 'outline'; role: Role; weight?: number }
  | { kind: 'gradient'; id: string };

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

export type Box = Rect & { id: string; fill: Paint; text?: BoxText };

export type GridStyle = 'faint' | 'visible' | 'off';

export type Doc = {
  cols: number;
  rows: number;
  cell: number;
  canvas: { w: number; h: number };
  grid: GridStyle;
  cells: ReadonlyMap<number, Paint>;
  boxes: readonly Box[];
  gradients: Readonly<Record<string, Gradient>>;
  theme: string;
  mode: 'standalone' | 'overlay';
};

export const DEFAULT_CELL = 54;
export const MAX_CELLS = 120;

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
    grid: 'faint',
    cells: new Map(),
    boxes: [],
    gradients: {},
    theme: o.theme,
    mode: o.mode ?? 'standalone',
  };
}

export const paintKey = (p: Paint): string =>
  p.kind === 'solid' ? `s:${p.role}:${p.opacity ?? 1}` : p.kind === 'outline' ? `o:${p.role}:${p.weight ?? 3}` : `g:${p.id}`;

export const cellKey = (doc: Pick<Doc, 'cols'>, x: number, y: number): number => y * doc.cols + x;

export const cellXY = (doc: Pick<Doc, 'cols'>, k: number): { x: number; y: number } => ({
  x: k % doc.cols,
  y: Math.floor(k / doc.cols),
});

export const inBounds = (doc: Pick<Doc, 'cols' | 'rows'>, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < doc.cols && y < doc.rows;

export const boxCovers = (b: Rect, x: number, y: number): boolean =>
  x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h;

export const boxAt = (doc: Pick<Doc, 'boxes'>, x: number, y: number): Box | undefined =>
  doc.boxes.find((b) => boxCovers(b, x, y));

export const cellRect = (doc: Pick<Doc, 'cell'>, x: number, y: number): Rect => ({
  x: x * doc.cell,
  y: y * doc.cell,
  w: doc.cell,
  h: doc.cell,
});
