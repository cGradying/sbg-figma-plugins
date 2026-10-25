import { buildScene, parse, parseTheme, sceneToSvg } from '@sbg/core';
import type { ToMain, ToUI } from '../src/messages.ts';

const out = document.getElementById('figma')!;
const toUI = (d: ToUI) => window.dispatchEvent(new CustomEvent('dev-incoming', { detail: d }));
let n = 0;

function show(svg: string, title: string) {
  out.innerHTML = `<p class="cap">${title}</p><div class="paper">${svg}</div>`;
}

// A stand-in photo for the editor, drawn once.
const photo = document.createElement('canvas');
photo.width = 432;
photo.height = 540;
{
  const c = photo.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 432, 540);
  g.addColorStop(0, '#7a5a9a');
  g.addColorStop(1, '#2a1a3a');
  c.fillStyle = g;
  c.fillRect(0, 0, 432, 540);
  c.fillStyle = '#e8d2c0';
  c.beginPath(); c.arc(216, 230, 90, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#16121c';
  c.fillRect(110, 340, 212, 200);
}
const photoUrl = photo.toDataURL('image/png');

async function sendPhoto() {
  const blob = await new Promise<Blob>((r) => photo.toBlob((b) => r(b!), 'image/png'));
  toUI({ type: 'preview', id: 'photo', png: new Uint8Array(await blob.arrayBuffer()) });
}

window.addEventListener('dev-post', (e) => {
  const m = (e as CustomEvent<ToMain>).detail;
  try {
    if (m.type === 'ready') toUI({ type: 'init', themes: [], fonts: ['Inter', 'Space Grotesk', 'Silkscreen'] });
    else if (m.type === 'render' || m.type === 'flatten') {
      const doc = parse(m.doc);
      const scene = buildScene(doc, parseTheme(m.theme), { flatten: m.type === 'flatten' });
      show(sceneToSvg(scene), `${m.type === 'flatten' ? 'Flattened' : 'Rendered'} (${scene.items.length} nodes, simulated Figma output)`);
      const info = { id: `n${++n}`, name: 'Pixel Render', w: doc.canvas.w, h: doc.canvas.h };
      toUI({ type: 'done', message: `${m.type} ok: ${scene.items.length} nodes` });
      toUI({ type: 'selection', info: { kind: 'pixel', target: info, doc: m.doc } });
    } else if (m.type === 'cut') {
      const doc = parse(m.doc);
      const { cut, canvas } = buildScene(doc, parseTheme(m.theme));
      if (!cut?.visible || !cut.hidden) throw new Error('Draw some cells first. Nothing is cut out of the photo yet.');
      const clip = `<clipPath id="c"><path transform="translate(${cut.visible.at.x} ${cut.visible.at.y})" d="${cut.visible.d}"/></clipPath>`;
      show(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas.w} ${canvas.h}"><defs>${clip}</defs><image href="${photoUrl}" width="${canvas.w}" height="${canvas.h}" preserveAspectRatio="none" clip-path="url(#c)"/></svg>`,
        'Cut photo (simulated Figma output: copy of the photo with a mask)',
      );
      toUI({ type: 'done', message: 'cut ok' });
    }
  } catch (err) {
    toUI({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
});

document.getElementById('sim-photo')!.onclick = () => {
  toUI({ type: 'selection', info: { kind: 'target', target: { id: 'photo', name: 'Photo', w: 1080, h: 1350 } } });
  void sendPhoto();
};
document.getElementById('sim-none')!.onclick = () => {
  toUI({ type: 'selection', info: { kind: 'none' } });
  toUI({ type: 'preview', id: '', png: null });
};
