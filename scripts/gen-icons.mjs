// Gera os ícones do aplicativo e as imagens do instalador a partir de brand/logo.svg.
//
// Uso: npm run icons
// Requer o Playwright (Chromium) disponível no ambiente de desenvolvimento.
// Os arquivos gerados ficam versionados, então só é preciso rodar ao mudar a logo.

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'src-tauri', 'icons');
const logoSvg = readFileSync(join(root, 'brand', 'logo.svg'), 'utf8');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Instale com: npm i -D playwright');
  process.exit(1);
}

// A fonte é embutida em base64: a página about:blank não consegue carregar arquivos file://.
const fontUrl = `data:font/woff2;base64,${readFileSync(
  join(root, 'node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2'),
).toString('base64')}`;

const fontFace = `@font-face{font-family:'Jakarta';src:url('${fontUrl}') format('woff2');font-weight:200 800;}`;

/** Converte um PNG (buffer RGBA vindo do canvas) em BMP 24 bits, formato exigido pelo NSIS. */
function rgbaToBmp(width, height, rgba) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const dataSize = rowSize * height;
  const buf = Buffer.alloc(54 + dataSize);
  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(54 + dataSize, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(dataSize, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 4;
    const dst = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const i = src + x * 4;
      const a = rgba[i + 3] / 255;
      // Fundo branco para pixels transparentes.
      const r = Math.round(rgba[i] * a + 255 * (1 - a));
      const g = Math.round(rgba[i + 1] * a + 255 * (1 - a));
      const b = Math.round(rgba[i + 2] * a + 255 * (1 - a));
      buf[dst + x * 3] = b;
      buf[dst + x * 3 + 1] = g;
      buf[dst + x * 3 + 2] = r;
    }
  }
  return buf;
}

async function renderPng(page, html, width, height, transparent = true) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><html><head><style>${fontFace}html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden;background:transparent}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  return page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width, height } });
}

async function renderRgba(page, html, width, height) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><html><head><style>${fontFace}html,body{margin:0;padding:0;background:#fff}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  // Desenha o resultado num canvas para obter os pixels.
  const png = await page.screenshot({ clip: { x: 0, y: 0, width, height } });
  const data = await page.evaluate(async ({ b64, w, h }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(0, 0, w, h).data);
  }, { b64: png.toString('base64'), w: width, h: height });
  return Uint8Array.from(data);
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

// 1) Ícone mestre 1024x1024 com cantos transparentes.
const master = await renderPng(page, logoSvg.replace('width="512" height="512"', 'width="1024" height="1024"'), 1024, 1024);
const masterPath = join(iconsDir, 'app-icon.png');
writeFileSync(masterPath, master);

// 2) Imagem lateral do instalador (164x314).
const sidebarHtml = `
<div style="width:164px;height:314px;box-sizing:border-box;padding:34px 16px 0;background:linear-gradient(160deg,#0F3B46 0%,#123A5C 45%,#2B2A6B 100%);font-family:Jakarta,sans-serif;color:#fff;text-align:center;position:relative;overflow:hidden">
  <div style="position:absolute;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(45,212,191,.35),rgba(45,212,191,0) 70%);top:-70px;left:-40px"></div>
  <div style="position:absolute;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(99,102,241,.35),rgba(99,102,241,0) 70%);bottom:-80px;right:-70px"></div>
  <div style="position:relative">${logoSvg.replace('width="512" height="512"', 'width="84" height="84"')}</div>
  <div style="position:relative;font-weight:800;font-size:19px;letter-spacing:-.02em;margin-top:14px">Organizador</div>
  <div style="position:relative;font-weight:500;font-size:10.5px;line-height:1.45;opacity:.82;margin-top:8px">Organize, limpe e otimize<br/>seu computador</div>
  <div style="position:absolute;left:16px;right:16px;bottom:18px;font-size:9px;opacity:.6;font-weight:600;letter-spacing:.08em">100% OFF-LINE</div>
</div>`;
writeFileSync(join(iconsDir, 'nsis-sidebar.bmp'), rgbaToBmp(164, 314, await renderRgba(page, sidebarHtml, 164, 314)));

// 3) Cabeçalho do instalador (150x57).
const headerHtml = `
<div style="width:150px;height:57px;background:#fff;display:flex;align-items:center;justify-content:flex-end;padding-right:10px;box-sizing:border-box;gap:7px;font-family:Jakarta,sans-serif">
  <span style="font-weight:800;font-size:13px;color:#13314A;letter-spacing:-.02em">Organizador</span>
  ${logoSvg.replace('width="512" height="512"', 'width="38" height="38"')}
</div>`;
writeFileSync(join(iconsDir, 'nsis-header.bmp'), rgbaToBmp(150, 57, await renderRgba(page, headerHtml, 150, 57)));

await browser.close();

// 4) Gera o conjunto de ícones (ico/png) com a CLI do Tauri.
const tmp = mkdtempSync(join(tmpdir(), 'org-icons-'));
execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tauri', 'icon', masterPath, '-o', tmp], {
  cwd: root,
  stdio: 'inherit',
});
for (const name of ['32x32.png', '64x64.png', '128x128.png', '128x128@2x.png', 'icon.png', 'icon.ico']) {
  const from = join(tmp, name);
  if (existsSync(from)) copyFileSync(from, join(iconsDir, name));
}
rmSync(tmp, { recursive: true, force: true });

// 5) Favicon usado no modo navegador (npm run dev).
writeFileSync(join(root, 'public', 'favicon.svg'), logoSvg);

console.log('Ícones gerados em', iconsDir, '→', readdirSync(iconsDir).join(', '));
