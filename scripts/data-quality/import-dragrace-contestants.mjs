#!/usr/bin/env node
// ============================================================
// import-dragrace-contestants.mjs
//
// Acquires every Drag Race contestant across the entire franchise
// from Wikipedia and emits ingestion_staging rows (normalized_data
// fully populated) that the personality commit RPC can ingest.
//
// Pipeline reuse: the emitted rows carry normalized_data shaped for
// commit_personality_staging_item — Wikidata-enriched bio/image/QID
// where an article exists, otherwise a synthesized factual bio from
// the season table. Auto-publish rule: visibility='public' only when
// a real bio AND image exist; otherwise 'draft' (review queue).
//
// Network only — no DB creds. Outputs:
//   out-dragrace/records.ndjson         (one merged record per contestant)
//   out-dragrace/staging-chunk-NNN.sql  (idempotent INSERT ... ON CONFLICT DO NOTHING)
//   out-dragrace/summary.json
//
// Re-runnable: HTTP responses cached under out-dragrace/cache/.
//
// Usage:
//   node scripts/data-quality/import-dragrace-contestants.mjs
//   node scripts/data-quality/import-dragrace-contestants.mjs --franchise="España" --max-pages=2
//   node scripts/data-quality/import-dragrace-contestants.mjs --no-enrich
// ============================================================

import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, 'out-dragrace')
const CACHE = join(OUT, 'cache')
mkdirSync(CACHE, { recursive: true })

const SOURCE_NAME = 'dragrace-wikipedia-2026-06-19'
const UA = 'queer.guide-dragrace-import/1.0 (https://queer.guide; admin@queer.guide)'
const API = 'https://en.wikipedia.org/w/api.php'
const REST = 'https://en.wikipedia.org/api/rest_v1/page/summary/'
const WD = 'https://www.wikidata.org/w/api.php'

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]
}))
const FRANCHISE_FILTER = args.franchise ? String(args.franchise).toLowerCase() : null
const MAX_PAGES = args['max-pages'] ? parseInt(args['max-pages'], 10) : Infinity
const NO_ENRICH = !!args['no-enrich']

// Franchises to skip: celebrity-in-drag formats (mislabel risk for non-LGBTQ
// guests) and returning-queen spinoffs already covered by their home season.
const SKIP_FRANCHISES = [
  "RuPaul's Secret Celebrity Drag Race",
  'Slaycation',
]
// Franchises that lack a season subcategory but exist as pages.
const EXTRA_PAGES = [
  { title: 'Drag Race Sverige', franchise: 'Drag Race Sverige' },
  { title: 'Drag Race Germany', franchise: 'Drag Race Germany' },
  { title: 'Drag Race Global All Stars', franchise: 'Drag Race Global All Stars' },
]
const COUNTRY_BY_FRANCHISE = [
  [/UK|United Kingdom/i, 'United Kingdom'], [/Canada/i, 'Canada'],
  [/Down Under/i, 'Australia'], [/España|Espana/i, 'Spain'], [/France/i, 'France'],
  [/Italia/i, 'Italy'], [/Holland/i, 'Netherlands'], [/Philippines/i, 'Philippines'],
  [/Belgique/i, 'Belgium'], [/Sverige/i, 'Sweden'], [/Brasil/i, 'Brazil'],
  [/México|Mexico/i, 'Mexico'], [/Germany/i, 'Germany'], [/Thailand/i, 'Thailand'],
  [/Switch/i, 'Chile'],
]

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function fetchCached(url, cacheKey) {
  const cf = join(CACHE, cacheKey.replace(/[^a-z0-9]+/gi, '_').slice(0, 180) + '.json')
  if (existsSync(cf)) { try { return JSON.parse(readFileSync(cf, 'utf8')) } catch {} }
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
      if (res.status === 404) { writeFileSync(cf, JSON.stringify({ __notfound: true })); return { __notfound: true } }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      writeFileSync(cf, JSON.stringify(j))
      return j
    } catch (e) {
      if (attempt === 3) { console.warn(`  ! fetch failed ${cacheKey}: ${e.message}`); return null }
      await sleep(500 * (attempt + 1))
    }
  }
}

const apiUrl = params => API + '?' + new URLSearchParams({ format: 'json', formatversion: '2', ...params })

// ---- discovery -------------------------------------------------------------
async function discoverSeasonPages() {
  const parent = 'Category:Drag Race (franchise) seasons'
  const subcatJson = await fetchCached(
    apiUrl({ action: 'query', list: 'categorymembers', cmtype: 'subcat', cmlimit: '200', cmtitle: parent }),
    'subcats')
  const subcats = (subcatJson?.query?.categorymembers ?? []).map(x => x.title)
  const pages = []
  for (const cat of subcats) {
    const franchise = cat.replace(/^Category:/, '').replace(/\s+seasons$/, '')
    if (SKIP_FRANCHISES.some(s => franchise.includes(s))) continue
    const mj = await fetchCached(
      apiUrl({ action: 'query', list: 'categorymembers', cmtype: 'page', cmlimit: '200', cmtitle: cat }),
      'cat_' + cat)
    for (const p of mj?.query?.categorymembers ?? []) pages.push({ title: p.title, franchise })
  }
  for (const e of EXTRA_PAGES) if (!pages.some(p => p.title === e.title)) pages.push(e)
  const seen = new Set()
  return pages.filter(p => {
    if (seen.has(p.title)) return false; seen.add(p.title)
    if (FRANCHISE_FILTER && !p.franchise.toLowerCase().includes(FRANCHISE_FILTER)) return false
    return true
  })
}

// ---- HTML table parsing ----------------------------------------------------
function stripTags(html) {
  let out = html
  let prev
  // Strip every HTML tag repeatedly to a fixed point, so nested or overlapping
  // tags (e.g. <sty<style></style>le>) collapse fully and no `<tag` substring can
  // survive. This also removes <script>/<style>/<sup> tags themselves; their inert
  // text content is harmless here (the output is stored as escaped DB data, never
  // re-rendered as HTML). Footnote text inside <sup> is cleaned by the [n] strips
  // below. Single-tag fixed-point removal is the robust pattern; tag-with-content
  // regexes can be bypassed by unclosed or whitespace-padded end tags.
  do {
    prev = out
    out = out.replace(/<[^>]+>/g, '')
  } while (out !== prev)
  return out
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)) // numeric entities (&#91; → '[')
    .replace(/&#160;|&nbsp;/g, ' ').replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/\[\d+\]/g, '')                         // [1] citation markers
    .replace(/\s*\[[a-z]{1,3}\]\s*/gi, ' ')          // [ca]/[es] interwiki language tags
    .replace(/\s+/g, ' ').trim()
}

// Season/franchise label, not a contestant — e.g. "All Stars 5", "US season 10",
// "UK vs. the World series 1", "Season 3".
const SEASON_LABEL_RE = /^(us |uk )?(all stars|season|series)\s*\d*$|vs\.?\s+the world/i
// A wiki link that points at a season/franchise article, not a queen's page.
const SEASON_ARTICLE_RE = /\(season\s*\d+\)|\bseries\s*\d+\b|all stars|vs\.?\s+the world|^(rupaul's )?drag race[^,]*$/i
function firstLinkTitle(cellHtml) {
  // first /wiki/ link that is an actual article (has title=, not a File:/Help:/cite)
  const m = cellHtml.match(/<a\b[^>]*href="\/wiki\/([^"#:]+)"[^>]*?(?:title="([^"]+)")?[^>]*>/i)
  if (!m) return null
  const title = (m[2] || decodeURIComponent(m[1])).replace(/_/g, ' ')
  if (/^(File|Help|Category|Wikipedia|Template|Special):/i.test(title)) return null
  if (SEASON_ARTICLE_RE.test(title)) return null   // links to a season/franchise page, not a person
  return title
}
function parseTables(html) {
  // returns array of {headers:[], rows:[[cellHtml,...]]}
  const tables = []
  const tableRe = /<table\b[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi
  let tm
  while ((tm = tableRe.exec(html))) {
    const body = tm[1]
    const rows = []
    const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
    let rm
    while ((rm = trRe.exec(body))) {
      const cellRe = /<(t[hd])\b[^>]*>([\s\S]*?)<\/\1>/gi
      const cells = []
      let cm
      while ((cm = cellRe.exec(rm[1]))) cells.push({ tag: cm[1].toLowerCase(), html: cm[2] })
      if (cells.length) rows.push(cells)
    }
    if (!rows.length) continue
    const headerRow = rows[0].every(c => c.tag === 'th') ? rows.shift() : rows[0].some(c => c.tag === 'th') ? rows.shift() : []
    const headers = (headerRow || []).map(c => stripTags(c.html).toLowerCase())
    tables.push({ headers, rows })
  }
  return tables
}
function pickContestantTables(tables) {
  return tables.filter(t =>
    t.headers.some(h => /contestant|entrant|queen/.test(h)) &&
    (t.headers.some(h => /outcome|result|finish/.test(h)) || t.headers.some(h => /hometown|age/.test(h))))
}
function colIndex(headers, re) { return headers.findIndex(h => re.test(h)) }

function franchiseCountry(franchise) {
  for (const [re, c] of COUNTRY_BY_FRANCHISE) if (re.test(franchise)) return c
  return 'United States'
}
function seasonLabel(title, franchise) {
  let m = title.match(/\((?:season|series)\s+(\d+)\)/i) || title.match(/(?:season|series)\s+(\d+)/i)
  if (m) return (/series/i.test(title) ? 'Series ' : 'Season ') + m[1]
  if (/All Stars/i.test(title)) { const n = title.match(/(\d+)/); return 'All Stars' + (n ? ' ' + n[1] : '') }
  if (/vs[.\s]+the world/i.test(title)) { const n = title.match(/season\s+(\d+)/i); return 'vs the World' + (n ? ' ' + n[1] : '') }
  return null
}

async function parseSeasonPage({ title, franchise }) {
  const j = await fetchCached(apiUrl({ action: 'parse', prop: 'text', page: title, redirects: '1' }), 'page_' + title)
  const html = j?.parse?.text
  if (!html || j.__notfound) return []
  const tables = pickContestantTables(parseTables(html))
  if (!tables.length) return []
  const season = seasonLabel(title, franchise)
  const out = []
  for (const t of tables) {
    const ci = colIndex(t.headers, /contestant|entrant|queen/)
    const oi = colIndex(t.headers, /outcome|result|finish/)
    const hi = colIndex(t.headers, /hometown|residence|from/)
    const ai = colIndex(t.headers, /age/)
    for (const row of t.rows) {
      const nameCellIdx = ci >= 0 && ci < row.length ? ci : 0
      const nameCell = row[nameCellIdx]
      if (!nameCell) continue
      const name = stripTags(nameCell.html)
      // keep single-letter stage names (e.g. "Q") but reject empty / punctuation-only cells
      if (!name || !/[a-z0-9]/i.test(name) || /^(contestant|entrant|queen|winner|guest)s?$/i.test(name)) continue
      if (/^total|^episode|^\d+$/i.test(name)) continue
      if (SEASON_LABEL_RE.test(name)) continue   // season header captured as a row
      out.push({
        stage_name: name,
        wikipedia_title: firstLinkTitle(nameCell.html),
        outcome: oi >= 0 && row[oi] ? stripTags(row[oi].html) : null,
        hometown: hi >= 0 && row[hi] ? stripTags(row[hi].html) : null,
        age: ai >= 0 && row[ai] ? stripTags(row[ai].html) : null,
        franchise, season, page: title,
      })
    }
  }
  return out
}

// ---- enrichment ------------------------------------------------------------
async function resolveQids(titles) {
  // pageprops wikibase_item, 50 titles per call
  const map = new Map()
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50)
    const j = await fetchCached(
      apiUrl({ action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1', titles: batch.join('|') }),
      'pp_' + createHash('md5').update(batch.join('|')).digest('hex'))
    const redir = new Map((j?.query?.redirects ?? []).map(r => [r.from, r.to]))
    for (const p of j?.query?.pages ?? []) {
      if (p.pageprops?.wikibase_item) map.set(p.title, p.pageprops.wikibase_item)
    }
    // also key by pre-redirect title
    for (const [from, to] of redir) if (map.has(to)) map.set(from, map.get(to))
  }
  return map
}
async function fetchSummary(title) {
  const j = await fetchCached(REST + encodeURIComponent(title.replace(/ /g, '_')), 'sum_' + title)
  if (!j || j.__notfound || j.type === 'disambiguation') return null
  return { extract: j.extract || null, image: j.thumbnail?.source || j.originalimage?.source || null }
}
async function fetchWikidata(qids) {
  const map = new Map()
  for (let i = 0; i < qids.length; i += 50) {
    const batch = qids.slice(i, i + 50)
    const url = WD + '?' + new URLSearchParams({ action: 'wbgetentities', format: 'json', props: 'claims', ids: batch.join('|') })
    const j = await fetchCached(url, 'wd_' + createHash('md5').update(batch.join('|')).digest('hex'))
    for (const qid of batch) {
      const claims = j?.entities?.[qid]?.claims
      if (!claims) continue
      const dob = claims.P569?.[0]?.mainsnak?.datavalue?.value?.time
      const dod = claims.P570?.[0]?.mainsnak?.datavalue?.value?.time
      const parse = t => { const m = t?.match(/^\+(\d{4})-(\d{2})-(\d{2})/); return m && m[2] !== '00' && m[3] !== '00' ? `${m[1]}-${m[2]}-${m[3]}` : (t?.match(/^\+(\d{4})/) ? null : null) }
      map.set(qid, { birth_date: parse(dob), death_date: parse(dod) })
    }
  }
  return map
}

// ---- record building -------------------------------------------------------
const normKey = s => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/["'`]/g, '').replace(/\s+/g, ' ').trim()
const sha = s => createHash('sha256').update(s).digest('hex')

function buildBio(rec) {
  const appearances = rec.appearances
    .map(a => a.season ? `${a.franchise} (${a.season})` : a.franchise)
  const uniq = [...new Set(appearances)]
  const where = rec.hometown ? ` They are from ${rec.hometown}.` : ''
  const placements = rec.appearances.filter(a => a.outcome && a.season)
    .map(a => `${a.outcome} on ${a.franchise} ${a.season}`)
  const place = placements.length ? ` Placed ${[...new Set(placements)].join('; ')}.` : ''
  const seasons = uniq.length === 1
    ? `competed on ${uniq[0]}`
    : `competed across ${uniq.length} Drag Race seasons (${uniq.join(', ')})`
  return `${rec.stage_name} is a drag performer who ${seasons}.${place}${where}`.trim()
}

async function main() {
  console.log('Discovering franchise season pages…')
  const pages = (await discoverSeasonPages()).slice(0, MAX_PAGES)
  console.log(`  ${pages.length} season pages across ${new Set(pages.map(p => p.franchise)).size} franchises`)

  // 1. parse all contestant rows
  let rows = []
  let n = 0
  for (const pg of pages) {
    const r = await parseSeasonPage(pg)
    rows.push(...r)
    if (++n % 10 === 0) console.log(`  parsed ${n}/${pages.length} pages, ${rows.length} rows so far`)
  }
  console.log(`Parsed ${rows.length} contestant rows.`)

  // 2. merge by normalized stage name
  const byKey = new Map()
  for (const r of rows) {
    const k = normKey(r.stage_name)
    if (!k) continue
    if (!byKey.has(k)) byKey.set(k, {
      stage_name: r.stage_name, key: k, wikipedia_title: r.wikipedia_title,
      hometown: r.hometown, franchise: r.franchise, appearances: [],
    })
    const rec = byKey.get(k)
    if (!rec.wikipedia_title && r.wikipedia_title) rec.wikipedia_title = r.wikipedia_title
    if (!rec.hometown && r.hometown) rec.hometown = r.hometown
    rec.appearances.push({ franchise: r.franchise, season: r.season, outcome: r.outcome })
  }
  const records = [...byKey.values()]
  console.log(`Merged to ${records.length} distinct contestants.`)

  // 3. enrich
  if (!NO_ENRICH) {
    const titles = [...new Set(records.filter(r => r.wikipedia_title).map(r => r.wikipedia_title))]
    console.log(`Resolving ${titles.length} Wikidata QIDs…`)
    const qidMap = await resolveQids(titles)
    const qids = [...new Set([...qidMap.values()])]
    console.log(`Fetching Wikidata claims for ${qids.length} entities…`)
    const wdMap = await fetchWikidata(qids)
    console.log(`Fetching ${titles.length} page summaries…`)
    let s = 0
    for (const r of records) {
      if (!r.wikipedia_title) continue
      r.wikidata_qid = qidMap.get(r.wikipedia_title) || null
      const sum = await fetchSummary(r.wikipedia_title)
      if (sum) { r.extract = sum.extract; r.image_url = sum.image }
      if (r.wikidata_qid && wdMap.has(r.wikidata_qid)) {
        const wd = wdMap.get(r.wikidata_qid)
        r.birth_date = wd.birth_date; r.death_date = wd.death_date
      }
      if (++s % 50 === 0) console.log(`  enriched ${s}/${titles.length}`)
    }
  }

  // 4. build normalized records + staging payloads
  const staging = []
  let pub = 0, draft = 0
  for (const r of records) {
    const bio = (r.extract && r.extract.length > 120) ? r.extract : buildBio(r)
    const hasRealBio = !!(r.extract && r.extract.length > 120)
    const visibility = (hasRealBio && r.image_url) ? 'public' : 'draft'
    if (visibility === 'public') pub++; else draft++
    const norm = {
      name: r.stage_name,
      bio,
      profession: 'drag queen',
      lgbti_connection: 'community_member',
      nationality: franchiseCountry(r.franchise),
      birth_place: r.hometown || null,
      birth_date: r.birth_date || null,
      death_date: r.death_date || null,
      is_living: r.death_date ? false : true,
      image_url: r.image_url || null,
      wikidata_qid: r.wikidata_qid || null,
      external_ids: r.wikidata_qid ? { wikidata: r.wikidata_qid } : {},
      fields: ['Drag'],
      visibility,
      verification_status: 'pending',
    }
    Object.keys(norm).forEach(k => { if (norm[k] === null || norm[k] === undefined) delete norm[k] })
    staging.push({ key: r.key, norm })
  }

  // 5. write outputs — chunks carry ONLY normalized_data; SQL derives the rest
  // (source_entity_id, payload_hash, idempotency_key) server-side to keep payload lean.
  writeFileSync(join(OUT, 'records.ndjson'), staging.map(s => JSON.stringify(s)).join('\n'))
  const CHUNK = 130
  let chunkN = 0
  for (let i = 0; i < staging.length; i += CHUNK) {
    const json = JSON.stringify(staging.slice(i, i + CHUNK).map(s => s.norm))
    const sql = `INSERT INTO public.ingestion_staging
  (raw_data, normalized_data, target_table, entity_type, source_type, source_name,
   source_entity_id, payload_hash, idempotency_key,
   ai_validation_status, dedup_status, enrichment_status, review_status, disposition)
SELECT
  jsonb_build_object('source','wikipedia'), n,
  'personalities', 'personality', 'api', '${SOURCE_NAME}',
  n->>'wikidata_qid',
  encode(extensions.digest(n::text, 'sha256'), 'hex'),
  encode(extensions.digest(
    '${SOURCE_NAME}:' || COALESCE(
      n->>'wikidata_qid',
      regexp_replace(lower(extensions.unaccent(n->>'name')), '[^a-z0-9 ]', '', 'g')
        || ':' || COALESCE(n->>'birth_date','')
    ), 'sha256'), 'hex'),
  'pending', 'pending', 'pending', 'auto', 'pending'
FROM jsonb_array_elements($DRJSON$${json}$DRJSON$::jsonb) AS n
ON CONFLICT DO NOTHING;`
    writeFileSync(join(OUT, `staging-chunk-${String(++chunkN).padStart(3, '0')}.sql`), sql)
  }
  const summary = {
    source_name: SOURCE_NAME, pages: pages.length, rows_parsed: rows.length,
    distinct_contestants: records.length, with_qid: staging.filter(s => s.eid).length,
    with_image: staging.filter(s => s.norm.image_url).length,
    visibility_public: pub, visibility_draft: draft, chunks: chunkN,
    franchises: [...new Set(pages.map(p => p.franchise))].sort(),
  }
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2))
  console.log('\n=== SUMMARY ===')
  console.log(JSON.stringify(summary, null, 2))
  console.log(`\nWrote ${chunkN} SQL chunks + records.ndjson to ${OUT}`)
}

main().catch(e => { console.error(e); process.exit(1) })
