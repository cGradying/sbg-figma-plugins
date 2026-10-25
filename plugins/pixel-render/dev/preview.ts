import { buildScene, parse, parseTheme, sceneToSvg } from '@sbg/core';
import type { ToMain, ToUI } from '../src/messages.ts';

const out = document.getElementById('figma')!;
const toUI = (d: ToUI) => window.dispatchEvent(new CustomEvent('dev-incoming', { detail: d }));
let n = 0;

function show(svg: string, title: string) {
  out.innerHTML = `<p class="cap">${title}</p><div class="paper">${svg}</div>`;
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
    }
  } catch (err) {
    toUI({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
});

document.getElementById('sim-photo')!.onclick = () => toUI({ type: 'selection', info: { kind: 'target', target: { id: 'photo', name: 'Photo', w: 1080, h: 1350 } } });
document.getElementById('sim-none')!.onclick = () => toUI({ type: 'selection', info: { kind: 'none' } });
