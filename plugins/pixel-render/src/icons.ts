const BITMAPS: Record<string, string[]> = {
  brush: ['.....##.', '....####', '...####.', '..####..', '.####...', '##.#....', '##......', '#.......'],
  box: ['........', '.###....', '.###....', '.######.', '.######.', '.######.', '........', '........'],
  rect: ['########', '#......#', '#......#', '#......#', '#......#', '#......#', '#......#', '########'],
  bucket: ['...##...', '..#..#..', '.#....#.', '######.#', '######.#', '.####..#', '..##....', '........'],
  eraser: ['........', '...####.', '..#####.', '.#####..', '#####...', '####....', '........', '.#######'],
  lines: ['#..#..#.', '#..#..#.', '########', '#..#..#.', '........', '########', '#..#..#.', '#..#..#.'],
  select: ['#.......', '##......', '###.....', '####....', '#####...', '####....', '##.##...', '#...##..'],
  undo: ['...#....', '..##....', '.#######', '..##...#', '...#...#', '.......#', '......##', '.#####..'],
  up: ['...##...', '..####..', '.######.', '...##...', '...##...', '...##...', '...##...', '...##...'],
  close: ['#......#', '##....##', '.##..##.', '..####..', '..####..', '.##..##.', '##....##', '#......#'],
};

const rotate = (g: string[]) => g.map((_, y) => g.map((row) => row[g.length - 1 - y]).join(''));
const mirror = (g: string[]) => g.map((row) => [...row].reverse().join(''));

BITMAPS.redo = mirror(BITMAPS.undo!);
BITMAPS.right = rotate(BITMAPS.up!);
BITMAPS.down = rotate(BITMAPS.right);
BITMAPS.left = rotate(BITMAPS.down);

export function mountIcons(root: ParentNode = document) {
  for (const el of root.querySelectorAll<HTMLElement>('i[data-icon]')) {
    const rows = BITMAPS[el.dataset.icon!];
    if (!rows) continue;
    const cells = rows.flatMap((row, y) => [...row].map((c, x) => (c === '#' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : '')));
    el.innerHTML = `<svg viewBox="0 0 8 8" aria-hidden="true">${cells.join('')}</svg>`;
  }
}
