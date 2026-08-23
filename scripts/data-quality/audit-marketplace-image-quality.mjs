#!/usr/bin/env node
// Measure what a reader actually gets when a marketplace card paints.
//
// Why this exists: "marketplace images look bad" is a claim about PIXELS, and
// nothing in the database records how many pixels an image has —
// `image_assets.width` is null on 80,860 of the rows that carry an
// `optimized_url`. So the only way to know whether a listing image is soft is
// to fetch it and look, which is what this does.
//
// It measures BOTH sides of every listing image:
//   - `optimized_url`  what the site serves (R2 mirror or Supabase storage)
//   - `url`            the merchant's own copy the mirror was made from
// A mirror narrower than its source means the mirror threw pixels away and is
// worth re-fetching. A mirror EQUAL to a small source means the merchant never
// had anything better and no amount of re-importing will help — that
// distinction is the entire point, and it is invisible without both numbers.
//
// Dimensions are read from the first 64 KB via a Range request rather than by
// downloading the file: a JPEG/PNG/WebP header carries the size in its first
// few hundred bytes, so a 72k-asset sweep costs ~4 GB less than a full read.
// Hosts that ignore Range simply stream more; the parser stops either way.
//
// img.queer.guide is Referer-gated at the Cloudflare edge (a request without
// `Referer: https://queer.guide/` gets `error code: 1011`), so the mirror host
// needs that header or every asset reads as dead. That is a WAF rule, not a
// broken image.
//
// Usage:
//   node scripts/data-quality/audit-marketplace-image-quality.mjs --limit 500
//   node scripts/data-quality/audit-marketplace-image-quality.mjs --all --out /tmp/audit.jsonl

import { execFileSync } from 'node:child_process'
import { appendFileSync, writeFileSync } from 'node:fs'
import { imageSize } from '../lib/image-size.mjs'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback
}
const LIMIT = args.includes('--all') ? null : Number(flag('limit', 400))
const CONCURRENCY = Number(flag('concurrency', 12))
const OUT = flag('out', null)
const SOURCE = flag('source', null)

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim()
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8')
}
const TOKEN = token()

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`mgmt API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

async function measure(url) {
  if (!url) return { error: 'no_url' }
  const headers = { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*,*/*', Range: 'bytes=0-65535' }
  // The mirror host's WAF answers any other Referer with `error code: 1011`.
  if (url.includes('img.queer.guide')) headers.Referer = 'https://queer.guide/'
  try {
    const ctl = AbortSignal.timeout(20000)
    const res = await fetch(url, { headers, redirect: 'follow', signal: ctl })
    if (!res.ok && res.status !== 206) return { error: `http_${res.status}` }
    const buf = Buffer.from(await res.arrayBuffer())
    const size = imageSize(buf)
    if (!size) return { error: 'unparsed', bytes: buf.length }
    return { ...size, bytes: Number(res.headers.get('content-range')?.split('/')?.[1] ?? buf.length) }
  } catch (e) {
    return { error: String(e?.name ?? e).slice(0, 40) }
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++
        if (i >= items.length) return
        out[i] = await fn(items[i], i)
      }
    }),
  )
  return out
}

const pct = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : null)

async function main() {
  const where = SOURCE ? `and l.source_type = ${JSON.stringify(SOURCE).replace(/"/g, "'")}` : ''
  const rows = await sql(`
    select l.id, l.source_type, ia.optimized_url, ia.url
    from marketplace_listings l
    join image_asset_links k on k.entity_type = 'marketplace_listing' and k.entity_id = l.id and k.sort_order = 0
    join image_assets ia on ia.id = k.asset_id
    where l.status = 'active' and ia.optimized_url is not null ${where}
    order by ${LIMIT ? 'random()' : 'l.id'}
    ${LIMIT ? `limit ${LIMIT}` : ''}`)

  console.log(`measuring ${rows.length} listing cover images (concurrency ${CONCURRENCY})…`)
  if (OUT) writeFileSync(OUT, '')

  let done = 0
  const results = await mapLimit(rows, CONCURRENCY, async (r) => {
    const [served, source] = await Promise.all([measure(r.optimized_url), measure(r.url)])
    const rec = { ...r, served, source }
    if (OUT) appendFileSync(OUT, JSON.stringify(rec) + '\n')
    if (++done % 100 === 0) process.stdout.write(`  ${done}/${rows.length}\r`)
    return rec
  })

  const ok = results.filter((r) => r.served.w)
  const widths = ok.map((r) => r.served.w).sort((a, b) => a - b)
  const under = (n) => widths.filter((w) => w < n).length

  // A mirror narrower than its own source is recoverable work. A mirror that
  // matches a small source is not — the merchant has nothing better.
  const shrunk = ok.filter((r) => r.source.w && r.source.w > r.served.w * 1.1)
  const deadSource = results.filter((r) => r.source.error && !r.served.w)

  console.log(`\nmeasured ${ok.length}/${results.length}`)
  console.log(`served width  p10 ${pct(widths, 0.1)}  p25 ${pct(widths, 0.25)}  median ${pct(widths, 0.5)}  p75 ${pct(widths, 0.75)}`)
  for (const n of [400, 600, 800, 1000]) {
    console.log(`  under ${n}px: ${under(n)} (${((100 * under(n)) / widths.length).toFixed(1)}%)`)
  }
  console.log(`mirror narrower than source: ${shrunk.length}`)
  console.log(`unreadable served + unreadable source: ${deadSource.length}`)

  const bySource = new Map()
  for (const r of ok) {
    const e = bySource.get(r.source_type) ?? { n: 0, widths: [], shrunk: 0 }
    e.n++
    e.widths.push(r.served.w)
    if (r.source.w && r.source.w > r.served.w * 1.1) e.shrunk++
    bySource.set(r.source_type, e)
  }
  const worst = [...bySource.entries()]
    .map(([s, e]) => [s, e.n, pct(e.widths.sort((a, b) => a - b), 0.5), e.shrunk])
    .filter(([, n]) => n >= 3)
    .sort((a, b) => a[2] - b[2])
    .slice(0, 20)
  console.log('\nworst sources by median served width:')
  for (const [s, n, med, sh] of worst) console.log(`  ${String(med).padStart(5)}px  ${String(n).padStart(4)} imgs  ${s}${sh ? `  (${sh} shrunk)` : ''}`)
  if (OUT) console.log(`\nper-image records: ${OUT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
