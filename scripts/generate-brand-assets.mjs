// One-shot: regenerate favicon PNGs + OG image from the brand SVGs.
// Usage: node scripts/generate-brand-assets.mjs   (needs: npm i -D sharp)
import { readFile, writeFile, rm } from 'node:fs/promises';
import sharp from 'sharp';
import { chromium } from 'playwright';

const svg = await readFile('public/favicon.svg');
for (const size of [48, 180, 192, 512]) {
  await sharp(svg).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
}
await sharp(svg).resize(32, 32).png().toFile('public/favicon-32.tmp.png');

const og = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Anton; src: url('file://${process.cwd()}/public/fonts/anton/anton-latin-wght-normal.woff2') format('woff2'); }
body { margin:0; width:1200px; height:630px; background:#FAFAF5; color:#111;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:24px; }
.wm { font-family:Anton, sans-serif; font-size:110px; letter-spacing:-1px; }
</style><body>
<svg viewBox="0 0 360 210" width="480"><g fill="none" stroke="#111" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"><path d="M 16 108 H 134"/><path d="M 58 84 L 92 108 L 58 132"/><path d="M 180 158 C 152 136 132 116 132 96 C 132 79 145 68 159 68 C 172 68 180 78 180 89 C 180 78 188 68 201 68 C 215 68 228 79 228 96 C 228 116 208 136 180 158 Z"/><path d="M 219.8 75.6 L 248 41 M 248 41 L 226 41 M 248 41 L 248 63"/><path d="M 180 158 L 180 196 M 165 180 L 195 180"/><path d="M 225.7 108 C 250 80 266 132 288 104 C 296 94 306 90 318 93 L 336 89 M 336 89 L 312 75 M 336 89 L 310 105"/></g></svg>
<div class="wm">queer.guide</div>
</body>`;
await writeFile('scripts/.og-tmp.html', og);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`file://${process.cwd()}/scripts/.og-tmp.html`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'public/images/og-image.png' });
await browser.close();
await rm('scripts/.og-tmp.html');
console.log('done');
