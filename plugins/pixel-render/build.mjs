import * as esbuild from 'esbuild';
import { mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs';

async function build() {
  mkdirSync('dist', { recursive: true });
  await esbuild.build({ entryPoints: ['src/main.ts'], bundle: true, outfile: 'dist/code.js', target: 'es2018', format: 'iife', logLevel: 'warning' });
  const js = (await esbuild.build({ entryPoints: ['src/ui.ts'], bundle: true, write: false, target: 'es2020', format: 'iife', logLevel: 'warning' })).outputFiles[0].text;
  const css = (await esbuild.build({ entryPoints: ['src/styles.css'], bundle: true, write: false, minify: true, loader: { '.woff2': 'dataurl' }, logLevel: 'warning' })).outputFiles[0].text;
  const body = readFileSync('src/ui.html', 'utf8');
  writeFileSync(
    'dist/ui.html',
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pixel Render</title><style>${css}</style></head><body>${body}<script>${js.replace(/<\/script>/g, '<\\/script>')}</script></body></html>`,
  );
  const dev = (await esbuild.build({ entryPoints: ['dev/preview.ts'], bundle: true, write: false, target: 'es2020', format: 'iife', logLevel: 'warning' })).outputFiles[0].text;
  const shell = 'html,body{margin:0;height:100%}.shell{display:flex;height:100vh;background:#0e0b14}.plug{width:420px;height:100vh;flex:none;border-right:1px solid #352c4d}.stagepane{flex:1;overflow:auto;padding:16px;color:#ece8f7;font:12px system-ui}.sim{display:flex;gap:8px;margin-bottom:12px}.sim button{padding:6px 10px;background:#241d33;color:#ece8f7;border:1px solid #4a3f68;border-radius:6px}.paper{background:#444;padding:12px;display:inline-block}.paper svg{width:520px;height:auto;display:block;background:repeating-conic-gradient(#333 0 25%,#3a3a3a 0 50%) 0 0/20px 20px}.cap{margin:0 0 8px;color:#9a90b8}';
  writeFileSync(
    'dist/preview.html',
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Pixel Render preview</title><style>${css}${shell}</style></head><body><div class="shell"><div class="plug">${body}</div><div class="stagepane"><div class="sim"><button id="sim-photo">Simulate: select a 1080×1350 photo frame</button><button id="sim-none">Simulate: select nothing</button></div><div id="figma"><p class="cap">Press "Render to Figma" to see the output the plugin would draw.</p></div></div></div><script>${js.replace(/<\/script>/g, '<\\/script>')}</script><script>${dev}</script></body></html>`,
  );
  console.log(`built ${new Date().toLocaleTimeString()}`);
}

await build();
if (process.argv.includes('--watch')) {
  let t;
  for (const dir of ['src', '../../packages/core/src', '../../packages/ui']) {
    watch(dir, { recursive: true }, () => { clearTimeout(t); t = setTimeout(() => build().catch(console.error), 150); });
  }
}
