import { gradientEnds } from '@sbg/core';
import type { Doc, Fill, Scene } from '@sbg/core';

export type Overlay = { selection: ReadonlySet<number>; hover?: number; preview?: ReadonlySet<number>; shift?: { dx: number; dy: number } };

function fillStyle(ctx: CanvasRenderingContext2D, f: Fill): string | CanvasGradient {
  if (f.type === 'solid') return f.hex;
  const { s, e } = gradientEnds(f.rect, f.angle);
  const g = ctx.createLinearGradient(s.x, s.y, e.x, e.y);
  for (const st of f.stops) g.addColorStop(st.at, st.hex);
  return g;
}

function checker(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const s = 24;
  for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
    ctx.fillStyle = (x / s + y / s) % 2 ? '#262033' : '#1b1626';
    ctx.fillRect(x, y, s, s);
  }
}

export function draw(canvas: HTMLCanvasElement, scene: Scene, doc: Doc, ov: Overlay) {
  const aspect = scene.canvas.w / scene.canvas.h;
  const avail = canvas.parentElement?.clientWidth || 380;
  const cssW = Math.floor(Math.min(avail, window.innerHeight * 0.44 * aspect));
  const cssH = cssW / aspect;
  const scale = cssW / scene.canvas.w;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  ctx.clearRect(0, 0, scene.canvas.w, scene.canvas.h);
  if (scene.background) {
    ctx.fillStyle = scene.background;
    ctx.fillRect(0, 0, scene.canvas.w, scene.canvas.h);
  } else {
    ctx.save();
    ctx.scale(1 / scale, 1 / scale);
    checker(ctx, cssW, cssH);
    ctx.restore();
  }
  if (scene.grid) {
    ctx.globalAlpha = scene.grid.opacity;
    ctx.strokeStyle = scene.grid.hex;
    ctx.lineWidth = 2;
    ctx.stroke(new Path2D(scene.grid.d));
    ctx.globalAlpha = 1;
  } else if (!scene.background) {
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.lineWidth = 1 / scale;
    for (let x = doc.cell; x < scene.canvas.w; x += doc.cell) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, scene.canvas.h); ctx.stroke(); }
    for (let y = doc.cell; y < scene.canvas.h; y += doc.cell) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(scene.canvas.w, y); ctx.stroke(); }
  }
  for (const it of scene.items) {
    if (it.kind === 'rect') {
      if (it.fill) {
        ctx.globalAlpha = it.fill.type === 'solid' ? it.fill.opacity : 1;
        ctx.fillStyle = fillStyle(ctx, it.fill);
        ctx.fillRect(it.rect.x, it.rect.y, it.rect.w, it.rect.h);
        ctx.globalAlpha = 1;
      }
      if (it.stroke) {
        ctx.strokeStyle = it.stroke.hex;
        ctx.lineWidth = it.stroke.weight;
        ctx.strokeRect(it.rect.x, it.rect.y, it.rect.w, it.rect.h);
      }
    } else if (it.kind === 'path') {
      ctx.save();
      ctx.fillStyle = fillStyle(ctx, it.fill);
      const p = new Path2D();
      p.addPath(new Path2D(it.d), new DOMMatrix().translate(it.at.x, it.at.y));
      ctx.fill(p);
      ctx.restore();
    } else {
      ctx.globalAlpha = it.fill.type === 'solid' ? it.fill.opacity : 1;
      ctx.fillStyle = fillStyle(ctx, it.fill);
      ctx.fillRect(it.rect.x, it.rect.y, it.rect.w, it.rect.h);
      ctx.globalAlpha = 1;
      if (it.text) {
        const left = it.text.align === 'left';
        ctx.fillStyle = it.text.hex;
        ctx.font = `700 ${it.text.size}px ${it.text.family}, Helvetica, Arial, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = left ? 'left' : 'center';
        ctx.fillText(it.text.value, left ? it.rect.x + it.rect.h * 0.2 : it.rect.x + it.rect.w / 2, it.rect.y + it.rect.h / 2);
      }
    }
  }
  const mark = (keys: Iterable<number>, fill: string, stroke: string, shift = { dx: 0, dy: 0 }) => {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2 / scale;
    for (const k of keys) {
      const x = ((k % doc.cols) + shift.dx) * doc.cell;
      const y = (Math.floor(k / doc.cols) + shift.dy) * doc.cell;
      ctx.fillRect(x, y, doc.cell, doc.cell);
      ctx.strokeRect(x + 1 / scale, y + 1 / scale, doc.cell - 2 / scale, doc.cell - 2 / scale);
    }
  };
  mark(ov.selection, 'rgba(166,107,255,.22)', 'rgba(166,107,255,.9)', ov.shift);
  if (ov.preview) mark(ov.preview, 'rgba(255,255,255,.18)', 'rgba(255,255,255,.7)');
  if (ov.hover !== undefined) mark([ov.hover], 'rgba(255,255,255,.08)', 'rgba(255,255,255,.5)');
}

// Pixel-fade backdrop for the brand band, same idea as pixel-id-maker: drifting grid cells.
export function fadeBand(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const cell = 14;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const colors = ['#a66bff', '#7c3aed', '#ff56e9', '#42b1ff', '#01e282'];
  let t = 0;
  const frame = () => {
    const w = (canvas.width = canvas.clientWidth);
    const h = (canvas.height = canvas.clientHeight);
    ctx.clearRect(0, 0, w, h);
    for (let x = 0; x * cell < w; x++) for (let y = 0; y * cell < h; y++) {
      const n = Math.sin(x * 12.9898 + y * 78.233 + Math.floor(t / 60) * 3.1) * 43758.5453;
      const r = n - Math.floor(n);
      const edge = x / (w / cell);
      if (r < edge * 0.28) { ctx.globalAlpha = 0.25 + 0.75 * edge; ctx.fillStyle = colors[Math.floor(r * 100) % colors.length]!; ctx.fillRect(x * cell, y * cell, cell - 1, cell - 1); }
    }
    t++;
    if (!reduce) setTimeout(() => requestAnimationFrame(frame), 120);
  };
  frame();
}
