// One-shot: regenerate the app icons + OG image from the brand SVGs.
// Usage: node scripts/generate-brand-assets.mjs
//
// Rasterises with playwright (already a devDependency for e2e) rather than
// sharp, which was never installed here — so the previous version of this
// script could not run at all, which is how the icons drifted from the mark.
//
// The OG wordmark mirrors src/components/brand/Wordmark.tsx (which cannot be
// imported here — it is TSX). src/components/brand/__tests__/
// brandAssetSync.test.ts pins the copy to its component, including that it
// carries no colour.
//
// The OG image is the WORDMARK ALONE. It used to stack the "Cupid's transit"
// master symbol above it; the design project's brand rules retire that mark and
// state the logo "carries no symbol, no container and no colour", so at
// 1200x630 the wordmark simply sits on its own with room to spare.
import { readFile, writeFile, rm } from 'node:fs/promises';
import { chromium } from 'playwright';

const CWD = process.cwd();
const PAPER = '#FAFAF5';


const browser = await chromium.launch();

/** Rasterise `html` at exactly width×height and write it to `out`. */
async function shoot(html, width, height, out) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:${PAPER}}</style>${html}`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out });
  await page.close();
}

// ---- app icons -------------------------------------------------------------
// favicon.svg is the square crop of the mark and stays the single source for
// every raster icon; `pad` widens its viewBox for the maskable variants, whose
// ink must survive a platform mask cropping to the central 80%.
const faviconSvg = await readFile('public/favicon.svg', 'utf8');
const [vx, vy, vw, vh] = faviconSvg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);

function icon(size, pad = 0) {
  const box = `${vx - (vw * pad) / 2} ${vy - (vh * pad) / 2} ${vw * (1 + pad)} ${vh * (1 + pad)}`;
  return faviconSvg
    .replace(/viewBox="[^"]+"/, `viewBox="${box}" width="${size}" height="${size}"`)
    .replace(/<rect[^>]*\/>/, `<rect x="-9999" y="-9999" width="99999" height="99999" fill="${PAPER}"/>`);
}

for (const size of [48, 72, 96, 128, 144, 152, 180, 192, 384, 512]) {
  await shoot(icon(size), size, size, `public/icons/icon-${size}.png`);
}
// 25% extra box ⇒ the mark occupies 80% of the icon, inside the maskable safe zone.
for (const size of [192, 384, 512]) {
  await shoot(icon(size, 0.25), size, size, `public/icons/maskable-${size}.png`);
}

// ---- favicon.ico -----------------------------------------------------------
// Legacy fallback for clients that ignore the SVG <link>. A single-image ICO
// is a 22-byte header wrapped around a PNG payload, so no encoder is needed —
// and without this the .ico kept the pre-rebrand mark forever.
await shoot(icon(32), 32, 32, 'scripts/.ico-tmp.png');
const png = await readFile('scripts/.ico-tmp.png');
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // one image
header.writeUInt8(32, 6); // width
header.writeUInt8(32, 7); // height
header.writeUInt16LE(1, 10); // colour planes
header.writeUInt16LE(32, 12); // bits per pixel
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(header.length, 18);
await writeFile('public/favicon.ico', Buffer.concat([header, png]));
await rm('scripts/.ico-tmp.png');

// ---- OG image --------------------------------------------------------------
const og = `<style>
@font-face { font-family: Anton; src: url('file://${CWD}/public/fonts/anton/anton-latin-wght-normal.woff2') format('woff2'); }
body { width:1200px; height:630px; color:#111;
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:24px; }
.wm { font-family:Anton, sans-serif; font-size:110px; letter-spacing:-0.02em; line-height:1; }
</style>
<div class="wm">queer.guide</div>`;
// Served from a real file:// document, not setContent: an about:blank page
// cannot load the self-hosted Anton woff2 and would silently fall back.
await writeFile(
  'scripts/.og-tmp.html',
  `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:${PAPER}}</style>${og}`,
);
const ogPage = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await ogPage.goto(`file://${CWD}/scripts/.og-tmp.html`);
await ogPage.evaluate(() => document.fonts.ready);
await ogPage.screenshot({ path: 'public/images/og-image.png' });
await ogPage.close();
await rm('scripts/.og-tmp.html');

await browser.close();
console.log('done');
