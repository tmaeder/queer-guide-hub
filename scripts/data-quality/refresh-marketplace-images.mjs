#!/usr/bin/env node
// Refresh dead marketplace images for the two merchants that re-platformed.
//
//   ohmyfantasy.com  — Shopify store, wiped + rebuilt its catalog with new slugs.
//                      The old stored cdn URLs (ohmyfantasy.com/cdn/shop/...) 404.
//                      Recover the few products that still exist by exact handle/
//                      title match against the public products.json feed; the rest
//                      404 at the product page and are demoted to status='inactive'.
//   www.forttroff.com — migrated Miva → Next.js/Medusa + Payload CMS. Images now
//                      serve from cms.terminuscash.com / terminus S3. Re-scrape each
//                      product page's og:image; products that 308-redirect to a
//                      /category page are discontinued → status='inactive'. Slugs
//                      that redirect to a new product slug are re-pointed.
//
// Idempotent + resumable: drives off the live image host, so a re-run only touches
// rows still pointing at a dead host. Verifies every candidate image returns
// 200 image/* before writing. DB writes go through the Supabase Management API
// query endpoint (keychain CLI token), batched to stay under the statement
// timeout that the per-row search_documents_sync trigger can trip.
//
// Usage:
//   node scripts/data-quality/refresh-marketplace-images.mjs --dry-run
//   node scripts/data-quality/refresh-marketplace-images.mjs            # live

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const DRY = process.argv.includes('--dry-run')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' }).trim()
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
const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const host = (u) => (u || '').replace(/^https?:\/\//, '').split('/')[0]

async function fetchText(url, { redirect = 'follow' } = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect })
  return { status: res.status, finalUrl: res.url, body: await res.text() }
}

// HEAD/GET a candidate image; trust only a real 200 image/*.
async function imageOk(url) {
  try {
    let res = await fetch(url, { method: 'GET', headers: { 'User-Agent': UA } })
    return res.status === 200 && (res.headers.get('content-type') || '').startsWith('image/')
  } catch { return false }
}

const decode = (s) => { try { while (/%25/.test(s)) s = decodeURIComponent(s); } catch {} return s }
const ogImage = (html) => {
  const m = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
  return m ? decode(m[1]) : null
}

// ── ohmyfantasy ────────────────────────────────────────────────────────────
async function buildOmfFeed() {
  const byHandle = new Map(), byTitle = new Map()
  const norm = (s) => s.toLowerCase().replace(/[“”„«»"]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
  for (let page = 1; page <= 60; page++) {
    const { body } = await fetchText(`https://ohmyfantasy.com/products.json?limit=250&page=${page}`)
    let data; try { data = JSON.parse(body) } catch { break }
    if (!data.products?.length) break
    for (const p of data.products) {
      const imgs = (p.images || []).map((i) => i.src).filter(Boolean)
      if (!imgs.length) continue
      if (!byHandle.has(p.handle)) byHandle.set(p.handle, imgs)
      if (!byTitle.has(norm(p.title))) byTitle.set(norm(p.title), imgs)
    }
  }
  return { byHandle, byTitle, norm }
}

async function handleOhmyfantasy() {
  console.log('\n── ohmyfantasy ──')
  const feed = await buildOmfFeed()
  console.log(`feed products w/ images: ${feed.byHandle.size}`)
  const rows = await sql(`
    select id, title, source_entity_id, images[1] img
    from marketplace_listings
    where status='active' and images[1] like 'http%'
      and split_part(regexp_replace(images[1],'^https?://',''),'/',1)='ohmyfantasy.com'`)
  console.log(`active dead-image rows: ${rows.length}`)

  const refresh = [], dead = []
  for (const r of rows) {
    const handle = r.source_entity_id.replace(/^ohmyfantasy:/, '')
    const imgs = feed.byHandle.get(handle) || feed.byTitle.get(feed.norm(r.title))
    if (imgs && (await imageOk(imgs[0]))) refresh.push({ id: r.id, imgs })
    else dead.push(r.id)
  }
  console.log(`recoverable: ${refresh.length}   discontinued(404)→inactive: ${dead.length}`)
  await applyRefresh(refresh)
  await applyInactive(dead)
}

// ── forttroff ──────────────────────────────────────────────────────────────
async function handleForttroff() {
  console.log('\n── forttroff ──')
  const rows = await sql(`
    select id, title, external_url
    from marketplace_listings
    where status='active' and images[1] like 'http%'
      and split_part(regexp_replace(images[1],'^https?://',''),'/',1)='www.forttroff.com'`)
  console.log(`active dead-image rows: ${rows.length}`)

  const refresh = [], dead = []
  for (const r of rows) {
    const { finalUrl, body } = await fetchText(r.external_url)
    // Redirect to a /category page == product discontinued.
    if (/\/store\/category\//.test(finalUrl)) { dead.push(r.id); continue }
    const img = ogImage(body)
    if (img && (await imageOk(img))) {
      const patch = { id: r.id, imgs: [img] }
      // Product re-slugged → keep external_url pointing at the live page.
      if (finalUrl && finalUrl.replace(/\/$/, '') !== r.external_url.replace(/\/$/, '')) patch.url = finalUrl
      refresh.push(patch)
    } else dead.push(r.id)
  }
  console.log(`recoverable: ${refresh.length}   discontinued→inactive: ${dead.length}`)
  await applyRefresh(refresh)
  await applyInactive(dead)
}

// ── writers ──────────────────────────────────────────────────────────────
async function applyRefresh(items) {
  if (!items.length) return
  if (DRY) { items.forEach((i) => console.log(`  [dry] refresh ${i.id} -> ${i.imgs[0]}${i.url ? `  url=${i.url}` : ''}`)); return }
  for (const i of items) {
    const arr = `array[${i.imgs.map(q).join(',')}]::text[]`
    const setUrl = i.url ? `, external_url=${q(i.url)}` : ''
    await sql(`update marketplace_listings set images=${arr}, link_health='ok', link_checked_at=now()${setUrl} where id=${q(i.id)}`)
    process.stdout.write('.')
  }
  console.log(` refreshed ${items.length}`)
}

async function applyInactive(ids) {
  if (!ids.length) return
  if (DRY) { console.log(`  [dry] inactivate ${ids.length} rows`); return }
  // Chunked: status flip re-syncs search_documents per row; keep batches small.
  const CHUNK = 100
  let done = 0
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK)
    await sql(`update marketplace_listings
      set status='inactive', link_health='broken', link_checked_at=now()
      where id in (${slice.map(q).join(',')})`)
    done += slice.length
    process.stdout.write(`  inactivated ${done}/${ids.length}\r`)
  }
  console.log(`\n  inactivated ${done}`)
}

async function main() {
  console.log(`marketplace image refresh ${DRY ? '(DRY RUN)' : '(LIVE)'}`)
  await handleOhmyfantasy()
  await handleForttroff()
  console.log('\ndone.')
}
main().catch((e) => { console.error('FATAL', e); process.exit(1) })
