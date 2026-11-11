// Rasterise icons/soup.svg to the PNGs the manifest and Apple touch icon
// need. Chromium is the renderer because it is the only SVG engine actually
// installed here, and because it is also the engine that will display the
// result — what comes out is exactly what a browser would draw.
//
//   node tools/icons.mjs            # write icons/*.png
//   node tools/icons.mjs --preview  # also write a big look-at-it copy
//
// The maskable icon is the same art inset to the safe zone: Android crops a
// maskable icon to whatever shape the launcher likes, and anything outside
// the middle 80% is not guaranteed to survive.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Playwright is installed globally for the container, not as a dependency of
// this repo, so an ESM bare import cannot find it from here. createRequire
// uses Node's CommonJS lookup, which can.
const { chromium } = createRequire(import.meta.url)('/opt/node22/lib/node_modules/playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'icons/soup.svg'), 'utf8');

const TARGETS = [
    { file: 'icons/soup-180.png', size: 180, inset: 0 },   // apple-touch-icon
    { file: 'icons/soup-192.png', size: 192, inset: 0 },
    { file: 'icons/soup-512.png', size: 512, inset: 0 },
    { file: 'icons/soup-maskable-512.png', size: 512, inset: 0.1 },
];
if (process.argv.includes('--preview')) {
    TARGETS.push({ file: 'icons/preview-1024.png', size: 1024, inset: 0 });
}

// On a maskable icon the background has to reach the edges even though the
// art does not, or the launcher crops into transparency.
const page = (size, inset) => `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden;background:#05040f}
  #pad{width:${size}px;height:${size}px;display:grid;place-items:center;
       background:radial-gradient(circle at 50% 38%,#2a1256,#140a2e 55%,#05040f)}
  svg{width:${Math.round(size * (1 - inset * 2))}px;height:${Math.round(size * (1 - inset * 2))}px;display:block}
</style><div id="pad">${svg}</div>`;

const browser = await chromium.launch();
mkdirSync(join(root, 'icons'), { recursive: true });
for (const t of TARGETS) {
    const p = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
    await p.setContent(page(t.size, t.inset), { waitUntil: 'load' });
    const buf = await p.screenshot({ type: 'png' });
    writeFileSync(join(root, t.file), buf);
    console.log(`${t.file.padEnd(32)} ${t.size}px  inset ${t.inset}  ${(buf.length / 1024).toFixed(1)} KiB`);
    await p.close();
}
await browser.close();
