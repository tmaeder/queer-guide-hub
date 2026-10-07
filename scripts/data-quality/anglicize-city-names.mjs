#!/usr/bin/env node
// READ-ONLY detector: which live cities carry a GERMAN name in cities.name, and
// what is the English name? Writes a review file; changes nothing.
//
// Output: scripts/data-quality/out/city-anglicize-review.json
//
// Why Wikidata and not a heuristic: a German exonym ("Taipeh", "Wladiwostok",
// "Kapstadt") and a correct English name look alike to any string test, and the
// DB's own name_i18n has no 'en' key. Wikidata carries both labels for the SAME
// entity, which is the only signal that says "this row's name is the German
// form of a place whose English name is X".
//
// A row is a candidate when, for one Wikidata entity E:
//   - the row's base name (comma qualifier stripped) equals E's German label,
//   - E's English label differs from that German label (Zürich: de = en, kept),
//   - and E is corroborated as THIS place: the row's coordinates lie within
//     100 km of E's P625 -- the bound measured for city_qid_gap_link
//     (correct adoptions 0.0-9.5 km, namesakes 584+ km).
// Rows with a cached wikidata_qid use that entity directly (still coord-gated:
// a held QID can be wrong, see the Kowloon / Long Island entries). Rows without
// one search Wikidata in German and accept only an exact-label, coord-agreeing
// hit; no coordinates means no corroboration means `unresolved`.
//
// Classes:
//   rename      -> set name to E's English label (no twin in the country)
//   merge_into  -> an English-named twin already exists in the same country and
//                  is the same place (same QID or <= 25 km); merge_cities, since
//                  (lower(name), country_id) is unique and a rename would 23505
//   nonplace    -> E is a country / first-level subdivision / region; not a
//                  rename, belongs to archive_city_as_nonplace review
//   twin_far    -> a same-name twin exists but is NOT corroborated as the same
//                  place; a human decides
// Everything that is not a candidate is simply absent from the file.
//
// Usage: node scripts/data-quality/anglicize-city-names.mjs [--limit N] [--only-qid]

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const UA = 'QueerGuideBackfill/1.0 (https://queer.guide; data-quality)'
const OUT = 'scripts/data-quality/out/city-anglicize-review.json'
const COORD_MAX_KM = 100
const TWIN_MAX_KM = 25

const args = process.argv.slice(2)
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined }
const LIMIT = Number(val('--limit') ?? 0)
const ONLY_QID = args.includes('--only-qid')

// Entity classes that make a "city" row a non-place. Not exhaustive on
// purpose: the review is by hand, this only pre-sorts.
const NONPLACE_P31 = new Set([
  'Q6256',     // country
  'Q3624078',  // sovereign state
  'Q35657',    // state of the United States
  'Q1221156',  // state of Germany
  'Q10864048', // first-level administrative country subdivision
  'Q82794',    // geographic region
  'Q5107',     // continent
  'Q1620908',  // historical region
  'Q3336843',  // country of the United Kingdom
  'Q19953632', // former administrative territorial entity
  'Q28575',    // county of the United States
])

let _token
function token() {
  if (_token) return _token
  if (process.env.SUPABASE_PAT) return (_token = process.env.SUPABASE_PAT)
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' }).trim()
  return (_token = Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8'))
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`mgmt API ${res.status}: ${(await res.text()).slice(0, 400)}`)
  return res.json()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function wd(params, tries = 5) {
  const url = `https://www.wikidata.org/w/api.php?format=json&${new URLSearchParams(params)}`
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * (i + 1)); continue }
    if (!res.ok) throw new Error(`wikidata ${res.status}`)
    return res.json()
  }
  throw new Error(`wikidata gave up: ${url}`)
}

const nfc = (s) => (typeof s === 'string' ? s.normalize('NFC').replace(/\s+/g, ' ').trim() : '')
const key = (s) => nfc(s).toLowerCase()

function haversineKm(a, b, c, d) {
  const r = (x) => (x * Math.PI) / 180
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

function p625(ent) {
  for (const st of ent?.claims?.P625 ?? []) {
    if (st.rank === 'deprecated') continue
    const v = st.mainsnak?.datavalue?.value
    if (v && Number.isFinite(v.latitude) && Number.isFinite(v.longitude)) return v
  }
  return null
}
const p31 = (ent) => (ent?.claims?.P31 ?? [])
  .filter((s) => s.rank !== 'deprecated')
  .map((s) => s.mainsnak?.datavalue?.value?.id)
  .filter(Boolean)

async function entities(ids) {
  const out = {}
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const d = await wd({ action: 'wbgetentities', ids: chunk.join('|'), props: 'labels|claims', languages: 'de|en' })
    Object.assign(out, d.entities ?? {})
    await sleep(300)
  }
  return out
}

/** Verdict for row vs entity, or null when the entity does not make it a candidate. */
function judge(row, ent) {
  const de = nfc(ent?.labels?.de?.value)
  const en = nfc(ent?.labels?.en?.value)
  if (!de || !en || key(de) === key(en)) return null
  if (key(row.base) !== key(de)) return null
  if (key(row.name) === key(en)) return null
  const geo = p625(ent)
  if (row.latitude == null || !geo) return { skip: 'coord_unchecked', en, de }
  const km = haversineKm(Number(row.latitude), Number(row.longitude), geo.latitude, geo.longitude)
  if (km > COORD_MAX_KM) return { skip: `coord_disagree:${km.toFixed(1)}km`, en, de }
  const nonplace = p31(ent).some((q) => NONPLACE_P31.has(q))
  return { en, de, km: Math.round(km * 10) / 10, nonplace, qid: ent.id }
}

async function main() {
  const rows = await sql(`
    select c.id, c.name, c.slug, c.country_id, co.code as country_code, c.latitude, c.longitude,
           c.wikidata_qid, c.shell_status,
           (select count(*) from public.venues v where v.city_id = c.id) as venues,
           (select count(*) from public.events e where e.city_id = c.id) as events
    from public.cities c left join public.countries co on co.id = c.country_id
    where c.duplicate_of_id is null and coalesce(c.shell_status::text,'real') <> 'merged'
      ${ONLY_QID ? 'and c.wikidata_qid is not null' : ''}
    order by c.id ${LIMIT ? `limit ${LIMIT}` : ''};`)
  for (const r of rows) r.base = nfc(String(r.name).split(',')[0])
  console.log(`${rows.length} live cities`)

  // Name index for twin detection: same country, same lower(name).
  const all = await sql(`
    select id, name, country_id, latitude, longitude, wikidata_qid from public.cities
    where duplicate_of_id is null and coalesce(shell_status::text,'real') <> 'merged';`)
  const byCountryName = new Map()
  for (const c of all) byCountryName.set(`${c.country_id}|${key(c.name)}`, c)

  const findings = []
  const skipped = { coord_unchecked: 0, coord_disagree: 0 }

  // 1. Rows with a cached QID.
  const withQid = rows.filter((r) => r.wikidata_qid)
  const ents = await entities(withQid.map((r) => r.wikidata_qid))
  for (const r of withQid) {
    const v = judge(r, ents[r.wikidata_qid])
    if (!v) continue
    if (v.skip) { skipped[v.skip.split(':')[0]]++; continue }
    findings.push({ row: r, ...v, via: 'cached_qid' })
  }
  console.log(`cached-QID pass: ${findings.length} candidates`)

  // 2. Rows without one: search in German, accept an exact, coord-agreeing hit.
  if (!ONLY_QID) {
    const noQid = rows.filter((r) => !r.wikidata_qid)
    let n = 0
    for (const r of noQid) {
      if (++n % 100 === 0) console.log(`  search ${n}/${noQid.length}`)
      if (r.latitude == null) continue
      const s = await wd({ action: 'wbsearchentities', search: r.base, language: 'de', uselang: 'de', type: 'item', limit: '7' })
      const ids = (s.search ?? []).filter((h) => key(h.label) === key(r.base)).map((h) => h.id)
      if (!ids.length) { await sleep(150); continue }
      const cand = await entities(ids)
      const hits = ids.map((id) => judge(r, cand[id])).filter((v) => v && !v.skip)
      if (hits.length === 1) findings.push({ row: r, ...hits[0], via: 'search_de' })
      else if (hits.length > 1) findings.push({ row: r, ambiguous: hits.map((h) => `${h.qid}:${h.en}`), via: 'search_de' })
      await sleep(150)
    }
  }

  // 3. Classify.
  const out = findings.map((f) => {
    const r = f.row
    const base = {
      id: r.id, name: r.name, slug: r.slug, country: r.country_code, shell_status: r.shell_status,
      venues: Number(r.venues), events: Number(r.events), via: f.via,
    }
    if (f.ambiguous) return { ...base, class: 'ambiguous', candidates: f.ambiguous }
    const target = { en: f.en, de: f.de, qid: f.qid, km: f.km }
    if (f.nonplace) return { ...base, class: 'nonplace', ...target }
    const twin = byCountryName.get(`${r.country_id}|${key(f.en)}`)
    if (twin && twin.id !== r.id) {
      const sameQid = twin.wikidata_qid && twin.wikidata_qid === f.qid
      const km = twin.latitude != null && r.latitude != null
        ? haversineKm(Number(r.latitude), Number(r.longitude), Number(twin.latitude), Number(twin.longitude))
        : null
      if (sameQid || (km != null && km <= TWIN_MAX_KM)) {
        return { ...base, class: 'merge_into', keep_id: twin.id, keep_name: twin.name, twin_km: km && Math.round(km * 10) / 10, ...target }
      }
      return { ...base, class: 'twin_far', twin_id: twin.id, twin_km: km && Math.round(km * 10) / 10, ...target }
    }
    return { ...base, class: 'rename', ...target }
  })

  const counts = out.reduce((a, o) => ((a[o.class] = (a[o.class] ?? 0) + 1), a), {})
  mkdirSync('scripts/data-quality/out', { recursive: true })
  writeFileSync(OUT, JSON.stringify({ generated_at: new Date().toISOString(), counts, skipped, rows: out }, null, 2) + '\n')
  console.log('counts:', counts, 'skipped:', skipped)
  console.log(`wrote ${OUT}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
