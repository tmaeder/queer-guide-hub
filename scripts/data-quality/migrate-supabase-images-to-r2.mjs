#!/usr/bin/env node
// One-time migration: move every image off Supabase Storage onto Cloudflare R2
// (served from img.queer.guide). After this runs and verifies clean, the
// Supabase image buckets can be deleted — the product should host NO images on
// Supabase Storage.
//
// It is URL-driven and resumable. A local state file records every distinct
// Supabase-Storage URL found in the DB and its new R2 URL, so `copy` and
// `repoint` are independent idempotent phases and the whole thing survives an
// interruption (re-run picks up where it stopped).
//
// Bytes are copied by fetching the public Supabase object, hashing it, and
// PUTting it to the image-cdn Worker's admin `/upload/{prefix}/{sha256}.{ext}`
// endpoint (content-addressed → identical bytes dedupe, re-uploads are no-ops).
// This mirrors `supabase/functions/_shared/logo-mirror.ts` exactly, so migrated
// URLs match what the redirected uploaders now produce.
//
// Auth / env (required for copy/repoint/delete):
//   SUPABASE_URL                 https://xqeacpakadqfxjxjcewc.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    service-role key (DB read/write + storage admin)
//   IMAGE_CDN_ADMIN_SECRET       == image-cdn Worker ADMIN_SECRET
//   IMAGE_CDN_BASE_URL           default https://img.queer.guide
//
// Usage (run phases in order; each is safe to re-run):
//   node scripts/data-quality/migrate-supabase-images-to-r2.mjs map        # scan DB -> state file
//   node .../migrate-supabase-images-to-r2.mjs copy                        # fetch Supabase -> PUT R2
//   node .../migrate-supabase-images-to-r2.mjs repoint                     # rewrite DB URLs -> R2
//   node .../migrate-supabase-images-to-r2.mjs verify                      # count leftovers + spot-check R2
//   node .../migrate-supabase-images-to-r2.mjs delete --confirm            # DESTRUCTIVE: empty+drop buckets
//
// Flags: --dry-run (map/repoint/delete preview), --limit=N, --table=schema.col,
//        --concurrency=N (copy, default 8), --state=path (default ./.image-migration-state.json)

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'

const args = process.argv.slice(2)
const PHASE = args[0]
const DRY_RUN = args.includes('--dry-run')
const CONFIRM = args.includes('--confirm')
const flag = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : def
}
const LIMIT = Number(flag('limit', 0)) || 0
const ONLY_TABLE = flag('table', '')
const CONCURRENCY = Number(flag('concurrency', 8)) || 8
const STATE_PATH = flag('state', './.image-migration-state.json')

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xqeacpakadqfxjxjcewc.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const CDN_BASE = (process.env.IMAGE_CDN_BASE_URL || 'https://img.queer.guide').replace(/\/+$/, '')
const CDN_SECRET = process.env.IMAGE_CDN_ADMIN_SECRET || ''

const STORAGE_MARKER = '/storage/v1/object/public/'
const PUBLIC_HOST = new URL(SUPABASE_URL).host

// Every (table, column) that can hold a Supabase-Storage image URL, with its
// shape. `text` = single URL; `array` = text[]; `jsonb` = arbitrary JSON that
// may embed URLs anywhere (string-replaced). `image_assets` is special-cased in
// repoint so its thumbnail_url is re-derived onto the R2 key.
const TARGETS = [
  { table: 'image_assets', column: 'url', kind: 'text' },
  { table: 'image_assets', column: 'optimized_url', kind: 'text' },
  { table: 'image_assets', column: 'thumbnail_url', kind: 'text' },
  { table: 'marketplace_listings', column: 'images', kind: 'array' },
  { table: 'marketplace_listings', column: 'image_hashes', kind: 'jsonb' },
  { table: 'personalities', column: 'image_url', kind: 'text' },
  { table: 'unified_tags', column: 'image_url', kind: 'text' },
  { table: 'cities', column: 'image_url', kind: 'text' },
  { table: 'cities', column: 'curated_image_url', kind: 'text' },
  { table: 'cities', column: 'image_metadata', kind: 'jsonb' },
  { table: 'countries', column: 'image_url', kind: 'text' },
  { table: 'countries', column: 'curated_image_url', kind: 'text' },
  { table: 'queer_villages', column: 'image_url', kind: 'text' },
  { table: 'queer_villages', column: 'images', kind: 'array' },
  { table: 'queer_villages', column: 'image_metadata', kind: 'jsonb' },
  { table: 'venues', column: 'logo_url', kind: 'text' },
  { table: 'venues', column: 'images', kind: 'array' },
  { table: 'events', column: 'logo_url', kind: 'text' },
  { table: 'events', column: 'images', kind: 'array' },
  { table: 'organizations', column: 'logo_url', kind: 'text' },
  { table: 'organizations', column: 'cover_image_url', kind: 'text' },
  { table: 'organizations', column: 'images', kind: 'array' },
  { table: 'marketplace_brands', column: 'logo_url', kind: 'text' },
  { table: 'flyer_scans', column: 'image_url', kind: 'text' },
  { table: 'feedback', column: 'attachments', kind: 'jsonb' },
  // Denormalized search mirror. Entity-column repoints fire triggers that
  // rebuild these rows, but repointing directly makes verify converge without
  // waiting on async reindex.
  { table: 'search_documents', column: 'image_url', kind: 'text' },
]

const EXT_BY_TYPE = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp',
  'image/svg+xml': 'svg', 'image/gif': 'gif', 'image/avif': 'avif', 'image/heic': 'heic',
}

const sb = SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  : null

function loadState() {
  if (existsSync(STATE_PATH)) return JSON.parse(readFileSync(STATE_PATH, 'utf8'))
  return { urls: {} } // urls[oldUrl] = { newUrl, bucket, status, bytes, error }
}
let stateDirty = 0
function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 0))
  stateDirty = 0
}

function bucketOf(url) {
  const i = url.indexOf(STORAGE_MARKER)
  if (i < 0) return null
  return url.slice(i + STORAGE_MARKER.length).split('/')[0] || null
}
function isSupaImageUrl(v) {
  return typeof v === 'string' && v.includes(PUBLIC_HOST) && v.includes(STORAGE_MARKER)
}
// Pull every Supabase-Storage URL out of an arbitrary value (string/array/json).
function extractUrls(value) {
  const found = new Set()
  const walk = (v) => {
    if (typeof v === 'string') { if (isSupaImageUrl(v)) found.add(v) }
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(value)
  return [...found]
}

function must(cond, msg) { if (!cond) { console.error(`ERROR: ${msg}`); process.exit(1) } }

// ── map ──────────────────────────────────────────────────────────────────────
async function phaseMap() {
  must(sb, 'SUPABASE_SERVICE_ROLE_KEY required')
  const state = loadState()
  let added = 0
  for (const t of TARGETS) {
    if (ONLY_TABLE && ONLY_TABLE !== `${t.table}.${t.column}`) continue
    const PAGE = 1000
    let from = 0, scanned = 0
    for (;;) {
      // Text columns can be server-filtered; array/jsonb are paged + filtered client-side.
      let q = sb.from(t.table).select(`id, ${t.column}`).range(from, from + PAGE - 1).order('id')
      if (t.kind === 'text') q = q.like(t.column, `%${STORAGE_MARKER}%`)
      const { data, error } = await q
      if (error) { console.warn(`  skip ${t.table}.${t.column}: ${error.message}`); break }
      if (!data || data.length === 0) break
      for (const row of data) {
        for (const u of extractUrls(row[t.column])) {
          if (!state.urls[u]) {
            state.urls[u] = { newUrl: null, bucket: bucketOf(u), status: 'pending', bytes: 0, error: null }
            added++
          }
        }
      }
      scanned += data.length
      from += PAGE
      if (data.length < PAGE) break
      if (LIMIT && from >= LIMIT) break
    }
    console.log(`  scanned ${t.table}.${t.column} (${scanned} rows)`)
  }
  saveState(state)
  const total = Object.keys(state.urls).length
  const byBucket = {}
  for (const v of Object.values(state.urls)) byBucket[v.bucket] = (byBucket[v.bucket] || 0) + 1
  console.log(`\nmap: +${added} new, ${total} distinct URLs`)
  console.table(byBucket)
}

// ── copy ─────────────────────────────────────────────────────────────────────
async function copyOne(oldUrl, rec) {
  try {
    const res = await fetch(oldUrl, { signal: AbortSignal.timeout(30000) })
    if (res.status === 404 || res.status === 400) { rec.status = 'dead'; rec.error = `http_${res.status}`; return }
    if (!res.ok) { rec.status = 'error'; rec.error = `http_${res.status}`; return }
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength < 100) { rec.status = 'dead'; rec.error = 'too_small'; return }
    const ext = EXT_BY_TYPE[ct] || (oldUrl.match(/\.(png|jpe?g|webp|gif|svg|avif|heic)(\?|$)/i)?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg')
    const hash = createHash('sha256').update(bytes).digest('hex')
    const prefix = (rec.bucket || 'img').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'img'
    const key = `${prefix}/${hash}.${ext}`
    const put = await fetch(`${CDN_BASE}/upload/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': ct || 'image/jpeg', 'X-Admin-Secret': CDN_SECRET },
      body: bytes,
      signal: AbortSignal.timeout(30000),
    })
    if (!put.ok) { rec.status = 'error'; rec.error = `r2_${put.status}`; return }
    rec.newUrl = `${CDN_BASE}/${key}`
    rec.bytes = bytes.byteLength
    rec.status = 'copied'
    rec.error = null
  } catch (e) { rec.status = 'error'; rec.error = String(e).slice(0, 120) }
}

async function phaseCopy() {
  must(sb, 'SUPABASE_SERVICE_ROLE_KEY required')
  must(CDN_SECRET, 'IMAGE_CDN_ADMIN_SECRET required')
  const state = loadState()
  let todo = Object.entries(state.urls).filter(([, r]) => r.status === 'pending' || r.status === 'error')
  if (LIMIT) todo = todo.slice(0, LIMIT)
  console.log(`copy: ${todo.length} pending/error URLs, concurrency ${CONCURRENCY}`)
  let done = 0, ok = 0, dead = 0, err = 0
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const slice = todo.slice(i, i + CONCURRENCY)
    await Promise.all(slice.map(([u, r]) => copyOne(u, r)))
    for (const [, r] of slice) { if (r.status === 'copied') ok++; else if (r.status === 'dead') dead++; else err++ }
    done += slice.length
    if (++stateDirty >= 5 || done === todo.length) saveState(state)
    if (done % 200 === 0 || done === todo.length) console.log(`  ${done}/${todo.length}  ok=${ok} dead=${dead} err=${err}`)
  }
  saveState(state)
  console.log(`copy done: ok=${ok} dead=${dead} err=${err}`)
}

// ── repoint ──────────────────────────────────────────────────────────────────
function remapValue(value, map, deriveThumb) {
  const apply = (s) => {
    if (typeof s !== 'string') return s
    const n = map[s]
    return n ? n : s
  }
  if (typeof value === 'string') return apply(value)
  if (Array.isArray(value)) return value.map((v) => remapValue(v, map, deriveThumb))
  if (value && typeof value === 'object') {
    const out = Array.isArray(value) ? [] : {}
    for (const [k, v] of Object.entries(value)) out[k] = remapValue(v, map, deriveThumb)
    return out
  }
  return value
}

async function phaseRepoint() {
  must(sb, 'SUPABASE_SERVICE_ROLE_KEY required')
  const state = loadState()
  const map = {}
  for (const [u, r] of Object.entries(state.urls)) if (r.status === 'copied' && r.newUrl) map[u] = r.newUrl
  console.log(`repoint: ${Object.keys(map).length} copied URLs available`)

  for (const t of TARGETS) {
    if (ONLY_TABLE && ONLY_TABLE !== `${t.table}.${t.column}`) continue
    const PAGE = 500
    let from = 0, changed = 0, scanned = 0
    for (;;) {
      let q = sb.from(t.table).select(`id, ${t.column}`).range(from, from + PAGE - 1).order('id')
      if (t.kind === 'text') q = q.like(t.column, `%${STORAGE_MARKER}%`)
      const { data, error } = await q
      if (error) { console.warn(`  skip ${t.table}.${t.column}: ${error.message}`); break }
      if (!data || data.length === 0) break
      const updates = []
      for (const row of data) {
        const before = row[t.column]
        if (!extractUrls(before).some((u) => map[u])) continue
        let after = remapValue(before, map)
        const patch = { [t.column]: after }
        // image_assets: keep thumbnail_url pointing at the CDN thumb of the new key.
        if (t.table === 'image_assets' && t.column === 'optimized_url' && typeof after === 'string' && after.startsWith(CDN_BASE)) {
          patch.thumbnail_url = after.replace(`${CDN_BASE}/`, `${CDN_BASE}/thumb/`)
        }
        updates.push({ id: row.id, patch })
      }
      if (updates.length && !DRY_RUN) {
        for (const u of updates) {
          const { error: uerr } = await sb.from(t.table).update(u.patch).eq('id', u.id)
          if (uerr) console.warn(`    update ${t.table} ${u.id}: ${uerr.message}`)
        }
        // Throttle: entity updates fire per-row search-document triggers; pacing
        // avoids a write storm on the disk-constrained DB.
        await new Promise((r) => setTimeout(r, 150))
      }
      changed += updates.length
      scanned += data.length
      from += PAGE
      if (data.length < PAGE) break
      if (LIMIT && changed >= LIMIT) break
    }
    console.log(`  ${t.table}.${t.column}: ${DRY_RUN ? 'would change' : 'changed'} ${changed} rows (scanned ${scanned})`)
  }
}

// ── verify ───────────────────────────────────────────────────────────────────
async function phaseVerify() {
  must(sb, 'SUPABASE_SERVICE_ROLE_KEY required')
  let leftover = 0
  for (const t of TARGETS) {
    if (t.kind !== 'text') continue // count text cols precisely; array/jsonb sampled via map below
    const { count } = await sb.from(t.table).select('id', { count: 'exact', head: true }).like(t.column, `%${STORAGE_MARKER}%`)
    if (count) { console.log(`  LEFTOVER ${t.table}.${t.column}: ${count}`); leftover += count }
  }
  // Spot-check a few migrated R2 URLs actually resolve.
  const state = loadState()
  const sample = Object.values(state.urls).filter((r) => r.status === 'copied' && r.newUrl).slice(0, 10)
  let ok = 0
  for (const r of sample) { try { const h = await fetch(r.newUrl, { method: 'HEAD' }); if (h.ok) ok++ } catch { /* */ } }
  console.log(`verify: ${leftover} leftover text refs; R2 spot-check ${ok}/${sample.length} OK`)
  const st = {}
  for (const r of Object.values(state.urls)) st[r.status] = (st[r.status] || 0) + 1
  console.table(st)
}

// ── delete (destructive) ─────────────────────────────────────────────────────
async function phaseDelete() {
  must(sb, 'SUPABASE_SERVICE_ROLE_KEY required')
  const state = loadState()
  const buckets = [...new Set(Object.values(state.urls).map((r) => r.bucket).filter(Boolean))]
  console.log(`delete: ${buckets.length} buckets: ${buckets.join(', ')}`)
  if (!CONFIRM) { console.log('DRY (pass --confirm to actually empty + drop buckets)'); return }
  for (const bucket of buckets) {
    let total = 0
    // Recursive walk: Supabase list is per-prefix; collect files + recurse dirs.
    const files = await collectFiles(bucket, '')
    for (let i = 0; i < files.length; i += 100) {
      const chunk = files.slice(i, i + 100)
      const { error: derr } = await sb.storage.from(bucket).remove(chunk)
      if (derr) { console.warn(`  ${bucket} remove: ${derr.message}`); break }
      total += chunk.length
    }
    console.log(`  ${bucket}: removed ${total} objects`)
    const { error: berr } = await sb.storage.deleteBucket(bucket)
    console.log(`  ${bucket}: ${berr ? 'drop failed: ' + berr.message : 'bucket dropped'}`)
  }
}

async function collectFiles(bucket, prefix) {
  const out = []
  const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 10000 })
  if (error || !data) return out
  for (const item of data) {
    const path = prefix ? `${prefix}/${item.name}` : item.name
    if (item.id === null && !item.metadata) out.push(...(await collectFiles(bucket, path))) // folder
    else out.push(path)
  }
  return out
}

const PHASES = { map: phaseMap, copy: phaseCopy, repoint: phaseRepoint, verify: phaseVerify, delete: phaseDelete }
if (!PHASES[PHASE]) {
  console.error('Usage: migrate-supabase-images-to-r2.mjs <map|copy|repoint|verify|delete> [flags]')
  process.exit(1)
}
await PHASES[PHASE]()
