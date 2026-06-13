#!/usr/bin/env node
// Backfill coordinates for live venues that have an address but no lat/lng.
//
// Among genuinely live venues (excluding duplicates/archived/refuge-restrooms)
// ~1,454 had no coordinates — all of them carry a street address. Exact city_id
// name-matching resolved almost none (the city text rarely maps to a known
// city), so the real fix is geocoding the address: that puts the venue on the
// map, and the write-time venue_coord_guard trigger + venues_misplaced sweep
// catch any result that disagrees with a known city (snap / needs_attention).
//
// Geocoder: Nominatim (OpenStreetMap), 1 req/s per their usage policy, real UA.
// Country-validated when the venue carries an ISO-2 country code. (0,0) results
// are dropped. Writes are batched (<=100/statement) to spare the disk-constrained
// DB + the search_documents sync trigger. Every write is audited in
// venue_coord_fixes (mode='regeocode', source='script'); fully resumable
// (keyset by id, only ever scans coord-less rows).
//
// Auth: Supabase Management API via the macOS-keychain CLI token (house pattern;
//   set SUPABASE_PAT to override). No service-role key needed.
//
// Usage:
//   node scripts/data-quality/backfill-venue-geo.mjs            # geocode all
//   node scripts/data-quality/backfill-venue-geo.mjs --limit 50 # cap (testing)
//   node scripts/data-quality/backfill-venue-geo.mjs --dry-run

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const LIMIT = Number(args[args.indexOf('--limit') + 1]) || Infinity
const SCAN = 200          // rows pulled per keyset page
const FLUSH = 100         // rows per write batch
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const UA = 'queer.guide-dataquality/1.0 (tmaeder@me.com)'

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' }).trim()
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8')
}
const TOKEN = token()

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`mgmt API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const lit = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`)

async function geocode(v) {
  const parts = [v.address, v.city, v.country].filter(Boolean).join(', ')
  if (!parts) return null
  const url = new URL(NOMINATIM)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('q', parts)
  url.searchParams.set('limit', '1')
  if (v.country && String(v.country).trim().length === 2) {
    url.searchParams.set('countrycodes', String(v.country).trim().toLowerCase())
  }
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) return null
  const hits = await res.json()
  const h = hits?.[0]
  if (!h) return null
  const lat = Number(h.lat), lng = Number(h.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) return null // Null Island guard
  return { lat, lng }
}

async function flush(rows) {
  if (!rows.length || DRY) return
  const values = rows.map((r) => `(${lit(r.id)}::uuid, ${r.lat}, ${r.lng})`).join(',')
  await sql(`
    with m(id, lat, lng) as (values ${values})
    update public.venues v set latitude = m.lat, longitude = m.lng, updated_at = now()
    from m where v.id = m.id and (v.latitude is null or v.longitude is null);`)
  const audit = rows.map((r) => `(${lit(r.id)}::uuid, 'regeocode', ${r.lat}, ${r.lng}, 'script')`).join(',')
  await sql(`
    insert into public.venue_coord_fixes (venue_id, mode, new_lat, new_lng, source)
    values ${audit};`)
}

async function main() {
  console.log(`[geo] ${DRY ? 'DRY-RUN ' : ''}geocoding coord-less venues with an address …`)
  let after = '00000000-0000-0000-0000-000000000000'
  let scanned = 0, geocoded = 0, failed = 0
  const pending = []

  for (;;) {
    if (geocoded >= LIMIT) break
    const rows = await sql(`
      select id, name, address, city, country
      from public.venues
      where (latitude is null or longitude is null)
        and duplicate_of_id is null
        and review_status is distinct from 'archived'
        and data_source is distinct from 'refuge-restrooms'
        and coalesce(btrim(address),'') <> ''
        and lower(btrim(address)) <> lower(btrim(name))  -- skip address==name junk (spartacus/yelp)
        and length(btrim(address)) > 12
        and id > ${lit(after)}::uuid
      order by id
      limit ${SCAN};`)
    if (!rows.length) break

    for (const v of rows) {
      after = v.id
      scanned++
      if (geocoded >= LIMIT) break
      const c = await geocode(v)
      await sleep(1100) // Nominatim: max 1 req/s
      if (!c) { failed++; continue }
      pending.push({ id: v.id, lat: c.lat, lng: c.lng })
      geocoded++
      if (pending.length >= FLUSH) {
        await flush(pending.splice(0))
        console.log(`  scanned ${scanned} · geocoded ${geocoded} · failed ${failed}`)
        await sleep(200)
      }
    }
  }
  await flush(pending.splice(0))
  console.log(`[geo] done — scanned ${scanned}, geocoded ${geocoded}, failed ${failed}${DRY ? ' (dry-run, no writes)' : ''}`)
}

await main()
