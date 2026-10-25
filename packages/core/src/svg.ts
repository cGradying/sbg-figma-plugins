import { gradientEnds } from './gradient.ts';
import type { Fill, Scene } from './render.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function sceneToSvg(scene: Scene): string {
  const defs: string[] = [];
  const fillAttr = (f: Fill | undefined): string => {
    if (!f) return 'fill="none"';
    if (f.type === 'solid') return `fill="${f.hex}" fill-opacity="${f.opacity}"`;
    const id = `g${defs.length}`;
    const { s, e } = gradientEnds(f.rect, f.angle);
    defs.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${s.x}" y1="${s.y}" x2="${e.x}" y2="${e.y}">` +
        f.stops.map((st) => `<stop offset="${st.at}" stop-color="${st.hex}"/>`).join('') +
        '</linearGradient>',
    );
    return `fill="url(#${id})"`;
  };
  const body: string[] = [];
  if (scene.background) body.push(`<rect width="${scene.canvas.w}" height="${scene.canvas.h}" fill="${scene.background}"/>`);
  const grid = scene.grid ? `<path d="${scene.grid.d}" stroke="${scene.grid.hex}" stroke-opacity="${scene.grid.opacity}" stroke-width="2" fill="none"/>` : '';
  if (!scene.gridTop) body.push(grid);
  for (const it of scene.items) {
    if (it.kind === 'path') body.push(`<path transform="translate(${it.at.x} ${it.at.y})" d="${it.d}" ${fillAttr(it.fill)}/>`);
    else if (it.kind === 'rect') {
      const stroke = it.stroke ? ` stroke="${it.stroke.hex}" stroke-opacity="${it.stroke.opacity}" stroke-width="${it.stroke.weight}"` : '';
      body.push(`<rect x="${it.rect.x}" y="${it.rect.y}" width="${it.rect.w}" height="${it.rect.h}" ${fillAttr(it.fill)}${stroke}/>`);
    } else {
      const r = it.rect;
      body.push(
        it.d
          ? `<path transform="translate(${r.x} ${r.y})" d="${it.d}" ${fillAttr(it.fill)}/>`
          : `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" ${fillAttr(it.fill)}/>`,
      );
      if (it.text) {
        const left = it.text.align === 'left';
        const t = it.textRect;
        body.push(
          `<text x="${left ? t.x + t.h * 0.2 : t.x + t.w / 2}" y="${t.y + t.h / 2}" fill="${it.text.hex}" font-family="${esc(it.text.family)}, Helvetica, Arial, sans-serif" font-weight="700" font-size="${it.text.size}" text-anchor="${left ? 'start' : 'middle'}" dominant-baseline="central">${esc(it.text.value)}</text>`,
        );
      }
    }
  }
  if (scene.gridTop) body.push(grid);
  const { w, h } = scene.canvas;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${body.join('')}</svg>`;
}
