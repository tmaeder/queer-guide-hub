#!/usr/bin/env node
// One-time sitemap generator for salzgeber.shop.
//
// salzgeber.shop (PrestaShop) has no product sitemap at all (every common path
// 404s), but its category LISTING pages carry a `data-id-product` tile per
// product with a link to the canonical detail page — and the detail pages
// themselves carry full schema.org/Product microdata, which is exactly what
// source-shop-crawl's `microdata` reader expects. This script walks the 4
// top-level categories + pagination, dedupes by product id, and writes 3
// sitemap XML files (split by product family so each can carry its own
// `subcategory` in marketplace_merchants.config) for source-shop-crawl to read.
//
// This is a snapshot, not a live sitemap — new titles need a re-run + re-upload.
// Every product it DOES list gets automatic price/stock refresh forever via the
// crawler's own cursor + refresh_after_days mechanism.
//
// Usage:
//   node scripts/marketplace/generate-salzgeber-sitemaps.mjs
//   node scripts/marketplace/generate-salzgeber-sitemaps.mjs --out /tmp/sitemaps

const UA = 'QueerGuideBot/1.0 (+https://queer.guide/bot)'
const DELAY_MS = 400
const BASE = 'https://salzgeber.shop'

// family -> [category slugs]
const FAMILIES = {
  film: ['812-film'],
  buch: ['169-buch'],
  other: ['69-kalender', '1213-andere-schoene-dinge'],
}

const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const OUT_DIR = outIdx >= 0 ? args[outIdx + 1] : '/private/tmp/claude-501/-Users-tobiasmaeder-QG/cdb496cd-5870-4505-8015-b2334ee555c9/scratchpad'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } })
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return res.text()
}

// Product tiles: <article ... data-id-product="ID" ...> ... <a href="URL" class="thumbnail product-thumbnail">
const TILE_RE = /data-id-product="(\d+)"[\s\S]{0,600}?<a\s+href="(https:\/\/salzgeber\.shop\/[^"]+)"\s+class="thumbnail product-thumbnail"/g

function extractTiles(html) {
  const out = []
  for (const m of html.matchAll(TILE_RE)) out.push({ id: m[1], url: m[2] })
  return out
}

function maxPage(html) {
  let max = 1
  for (const m of html.matchAll(/[?&]page=(\d+)/g)) max = Math.max(max, Number(m[1]))
  return max
}

async function crawlCategory(slug) {
  const first = await getText(`${BASE}/${slug}`)
  const pages = maxPage(first)
  const seen = new Map()
  for (const t of extractTiles(first)) seen.set(t.id, t.url)
  process.stderr.write(`${slug}: ${pages} pages, page 1 -> ${seen.size} products\n`)

  for (let p = 2; p <= pages; p++) {
    await sleep(DELAY_MS)
    const html = await getText(`${BASE}/${slug}?page=${p}`)
    const tiles = extractTiles(html)
    for (const t of tiles) seen.set(t.id, t.url)
    process.stderr.write(`${slug}: page ${p}/${pages} -> +${tiles.length} (total ${seen.size})\n`)
  }
  return seen
}

function toSitemap(urls) {
  const body = urls
    .map((u) => `  <url><loc>${u.replace(/&/g, '&amp;')}</loc></url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

const fs = await import('node:fs/promises')
await fs.mkdir(OUT_DIR, { recursive: true })

for (const [family, slugs] of Object.entries(FAMILIES)) {
  const merged = new Map()
  for (const slug of slugs) {
    const found = await crawlCategory(slug)
    for (const [id, url] of found) merged.set(id, url)
    await sleep(DELAY_MS)
  }
  const urls = [...merged.values()].sort()
  const xml = toSitemap(urls)
  const path = `${OUT_DIR}/salzgeber-${family}-sitemap.xml`
  await fs.writeFile(path, xml, 'utf8')
  process.stderr.write(`\n${family}: ${urls.length} unique product URLs -> ${path}\n\n`)
}
