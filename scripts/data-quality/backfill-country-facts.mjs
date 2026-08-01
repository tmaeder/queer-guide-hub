#!/usr/bin/env node
// One-shot backfill for the country fact columns that no enrichment pass has ever
// touched. Before this ran, 15 columns the admin form exposes were 100% empty on
// all 250 rows (calling_code, internet_tld, driving_side, national_day,
// national_anthem, major_religions, climate_zones, natural_resources,
// unesco_sites, major_industries, exports, imports, major_airports,
// national_symbols, visa_requirements) and several more were mostly empty.
//
// `pipeline-enrich-country-stats` covers only the 4 World Bank stats and
// `pipeline-enrich-country-editorial` only prose, so nothing else fills these.
// Do NOT drive target selection off `content_completeness_score` — its weights
// ignore every column below (avg 92, nothing under 70), so it reports full marks
// on rows that are empty.
//
// Sources — all free, key-less, verified before this script was written:
//   S1 dr5hn/countries-states-cities-database  calling_code, tld, currency, timezone, capital
//   S2 mledoze/countries                       languages
//   S3 OurAirports airports.csv                airport_codes, major_airports
//   S4 Wikidata SPARQL                         driving_side (P1622), HDI (P1081), FIPS (P901)
//   S5 CIA World Factbook JSON                 the 10 prose fields + stat fallbacks
//
// Source traps worth keeping:
//   - Factbook filenames are FIPS 10-4 codes, not ISO (Germany = europe/gm.json).
//     The region folder comes from one GitHub tree call; FIPS↔ISO2 from S4 P901.
//   - WDQS 502s on heavy queries. Keep the SPARQL lean and send a real UA.
//   - UNESCO's own list XML (whc.unesco.org/en/list/xml/) 403s — the Factbook
//     "National heritage" field is the replacement.
//   - mledoze at master dropped `car`, `population` and `timezones`; only take
//     `languages` from it.
//
// Writes are fill-if-empty. The one exception is the 4 World Bank stats, which
// are overwritten only where enrichment_status marks them terminally
// `data_unavailable` — Factbook covers territories the World Bank omits.
//
// Auth: Supabase personal access token (Management API). On macOS the CLI token
// is read from the keychain automatically; otherwise set SUPABASE_PAT.
//
// Usage:
//   node scripts/data-quality/backfill-country-facts.mjs --dry-run
//   node scripts/data-quality/backfill-country-facts.mjs --codes DE,TH,PR
//   node scripts/data-quality/backfill-country-facts.mjs --batch 25
//   node scripts/data-quality/backfill-country-facts.mjs --only exports,imports

import { execFileSync } from 'node:child_process'

const PROJECT = 'xqeacpakadqfxjxjcewc'
const UA = 'QueerGuideBackfill/1.0 (https://queer.guide; data-quality)'

const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const val = (n) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : undefined)
const DRY_RUN = flag('--dry-run')
const BATCH = Number(val('--batch')) || 25
const ONLY = val('--only')?.split(',').map((s) => s.trim()).filter(Boolean)
// Escape hatch for re-deriving a column after a parser fix. Everything else
// stays strictly fill-if-empty.
const FORCE = new Set(val('--force')?.split(',').map((s) => s.trim()).filter(Boolean) ?? [])
const CODES = val('--codes')?.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)

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
  if (!res.ok) throw new Error(`mgmt API ${res.status}: ${(await res.text()).slice(0, 400)}`)
  return res.json()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`${res.status}`)
      return await res.json()
    } catch (e) {
      if (i === tries - 1) throw e
      await sleep(1500 * (i + 1))
    }
  }
}

// ---------------------------------------------------------------- text helpers

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&ldquo;': '"', '&rdquo;': '"', '&lsquo;': "'", '&rsquo;': "'", '&nbsp;': ' ', '&ndash;': '–', '&mdash;': '—' }

/** Factbook values are HTML-ish prose fragments; flatten to plain text. */
function plain(s) {
  if (typeof s !== 'string') return ''
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Strip the trailing "(2023 est.)" / "(2022)" vintage marker Factbook appends. */
const stripVintage = (s) => s.replace(/\s*\((?:\d{4}[^)]*|[^)]*est\.?)\)\s*$/i, '').trim()

/**
 * Split a Factbook commodity/resource list into clean array items. Both `,` and
 * `;` are used as separators depending on the entry (Puerto Rico's natural
 * resources are semicolon-separated), and parenthesised asides must not split.
 */
function listSplit(text) {
  return plain(text)
    .split(/[,;](?![^(]*\))/)
    .map((s) => stripVintage(s).replace(/^(and|other)\s+/i, '').replace(/[;.]+$/, '').trim())
    .filter((s) => s && s.length > 1 && s.length <= 140 && !/^note\b/i.test(s))
}

/** Religions arrive as "Roman Catholic 56%, Protestant 33% (largely Pentecostal)". */
function parseReligions(text) {
  return listSplit(text)
    // Parenthetical asides first — otherwise the trailing-percent strip below
    // never sees the "33%" hiding behind "(largely Pentecostal)".
    .map((s) => s.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*[<>~]?\s*[\d.]+\s*%?\s*$/, '').trim())
    // Some entries carry head-counts rather than percentages ("Jewish
    // 3,000-4,000"); the comma split shreds those into numeric debris like
    // "000-". A religion name always starts with a letter.
    .filter((s) => /^[A-Za-z]/.test(s) && /[A-Za-z]{3}/.test(s))
    .filter((s) => !/^(none|unspecified|other|unaffiliated|atheist|agnostic|non-?religious|no religion|unknown|folk|approx)/i.test(s))
    .slice(0, 12)
}

/**
 * Government type is a single fact, but Factbook appends qualifiers and a
 * "note - ..." tail after semicolons. Keep the leading clause.
 */
function parseGovernment(text) {
  const t = plain(text).split(/;\s*(?=note\b)|;/)[0].trim()
  if (t.length <= 200) return t
  return `${t.slice(0, 197).replace(/\s+\S*$/, '')}…`
}

// Factbook's Climate value is a prose sentence, not a list — comma-splitting it
// yields fragments like "cool" and "cloudy". Map it onto a small controlled
// vocabulary instead so the column stays facetable.
const CLIMATE_VOCAB = [
  ['tropical', /\btropical\b/i], ['subtropical', /\bsub-?tropical\b/i],
  ['monsoon', /\bmonsoon(al)?\b/i], ['arid', /\b(arid|desert)\b/i],
  ['semiarid', /\b(semi-?arid|steppe)\b/i], ['mediterranean', /\bmediterranean\b/i],
  ['temperate', /\btemperate\b/i], ['oceanic', /\b(oceanic|maritime|marine)\b/i],
  ['continental', /\bcontinental\b/i], ['alpine', /\b(alpine|highland|montane)\b/i],
  ['polar', /\b(polar|arctic|antarctic|tundra|subarctic)\b/i],
  ['equatorial', /\bequatorial\b/i], ['savanna', /\bsavann?ah?\b/i],
  ['humid', /\bhumid\b/i], ['dry', /\b(dry|semi-?desert)\b/i],
]
function parseClimate(text) {
  const t = plain(text)
  if (!t) return []
  const zones = CLIMATE_VOCAB.filter(([, re]) => re.test(t)).map(([z]) => z)
  // "humid"/"dry" are modifiers — only useful alongside a real zone.
  const core = zones.filter((z) => z !== 'humid' && z !== 'dry')
  return core.length ? zones.slice(0, 6) : zones.slice(0, 6)
}

/** "Museumsinsel, Berlin (c); Speyer Cathedral (c); ..." → site names. */
function parseUnesco(text) {
  return plain(text)
    .split(';')
    .map((s) => s.replace(/\s*\([cnm]\)\s*$/i, '').trim())
    .filter((s) => s && s.length > 2 && s.length <= 160)
    .slice(0, 60)
}

/** "$4.456 trillion (2023 est.)" → 4456000000000 */
function parseMoney(text) {
  const t = plain(text).replace(/,/g, '')
  const m = t.match(/\$\s*([\d.]+)\s*(trillion|billion|million|thousand)?/i)
  if (!m) return null
  const scale = { trillion: 1e12, billion: 1e9, million: 1e6, thousand: 1e3 }[(m[2] || '').toLowerCase()] ?? 1
  const v = parseFloat(m[1]) * scale
  return Number.isFinite(v) && v > 0 ? Math.round(v) : null
}

function parsePercent(text) {
  const m = plain(text).match(/([\d.]+)\s*%/)
  if (!m) return null
  const v = parseFloat(m[1])
  return v > 0 && v <= 100 ? Math.round(v * 100) / 100 : null
}

function parseYears(text) {
  const m = plain(text).match(/([\d.]+)\s*years/i)
  if (!m) return null
  const v = parseFloat(m[1])
  return v > 20 && v < 120 ? Math.round(v * 10) / 10 : null
}

/**
 * Factbook nests values three different ways: `{text}`, `{"total population":
 * {text}}`, and — for the economic series — year-keyed siblings with no `text`
 * at the parent at all (`{"Real GDP per capita 2024": {text}, "... 2023": …}`).
 * Miss the third shape and every GDP-per-capita lookup silently returns ''.
 */
function fbText(node, ...path) {
  let x = node
  for (const k of path) {
    if (!x || typeof x !== 'object') return ''
    x = x[k]
  }
  if (typeof x === 'string') return x
  if (!x || typeof x !== 'object') return ''
  if (typeof x.text === 'string') return x.text

  const years = Object.keys(x)
    .map((k) => [k, Number(k.match(/(\d{4})\s*$/)?.[1])])
    .filter(([, y]) => Number.isFinite(y))
    .sort((a, b) => b[1] - a[1])
  for (const [k] of years) {
    const t = x[k]?.text
    if (typeof t === 'string' && t) return t
  }
  return ''
}

// ------------------------------------------------------------------- SQL utils

const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const qArr = (a) => (a.length ? `ARRAY[${a.map(q).join(',')}]::text[]` : 'NULL')
const qJson = (o) => `${q(JSON.stringify(o))}::jsonb`

const isEmpty = (v) =>
  v === null || v === undefined || v === '' ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)

// ------------------------------------------------------------------- S1 .. S5

async function loadBulk() {
  console.log('fetching bulk sources…')

  const [dr5hn, mledoze] = await Promise.all([
    getJson('https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/countries.json'),
    getJson('https://raw.githubusercontent.com/mledoze/countries/master/countries.json'),
  ])
  const S1 = new Map(dr5hn.map((c) => [c.iso2, c]))
  const S2 = new Map(mledoze.map((c) => [c.cca2, c]))
  console.log(`  S1 dr5hn ${S1.size}   S2 mledoze ${S2.size}`)

  // S3 — OurAirports. 12 MB CSV; keep only scheduled-service IATA airports.
  const csv = await (await fetch('https://davidmegginson.github.io/ourairports-data/airports.csv', { headers: { 'User-Agent': UA } })).text()
  const S3 = new Map()
  {
    const rows = parseCsv(csv)
    const head = rows[0]
    const ix = Object.fromEntries(head.map((h, i) => [h, i]))
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]
      const iata = r[ix.iata_code]
      const type = r[ix.type]
      if (!iata || r[ix.scheduled_service] !== 'yes') continue
      if (type !== 'large_airport' && type !== 'medium_airport') continue
      const cc = r[ix.iso_country]
      if (!S3.has(cc)) S3.set(cc, [])
      S3.get(cc).push({ iata, type, name: r[ix.name] })
    }
    // OurAirports carries no traffic figures, and `large_airport` + alphabetical
    // puts Albany ahead of JFK for the US. Wikidata P3872 (passengers per year)
    // supplies the missing ranking signal, joined on IATA.
    const pax = await loadAirportTraffic()
    for (const list of S3.values()) {
      for (const ap of list) ap.pax = pax.get(ap.iata) ?? 0
      list.sort((a, b) =>
        b.pax - a.pax ||
        (a.type === b.type ? 0 : a.type === 'large_airport' ? -1 : 1) ||
        a.iata.localeCompare(b.iata))
    }
  }
  console.log(`  S3 ourairports ${S3.size} countries`)

  // S4 — one lean Wikidata query. Heavier shapes 502 on WDQS.
  const S4 = await loadWikidata()
  console.log(`  S4 wikidata ${S4.size} countries`)

  // S5 index — factbook paths are FIPS codes inside region folders.
  const tree = await getJson('https://api.github.com/repos/factbook/factbook.json/git/trees/master?recursive=1')
  const S5paths = new Map()
  for (const node of tree.tree || []) {
    const m = node.path.match(/^([a-z-]+)\/([a-z]{2})\.json$/)
    if (m && m[1] !== 'meta') S5paths.set(m[2].toUpperCase(), node.path)
  }
  console.log(`  S5 factbook ${S5paths.size} files`)

  return { S1, S2, S3, S4, S5paths }
}

/** Minimal RFC4180 CSV reader — OurAirports quotes names containing commas. */
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

/** IATA → passengers per year (Wikidata P3872), the airport ranking signal. */
async function loadAirportTraffic() {
  const rows = await sparql('SELECT ?iata (MAX(?p) AS ?pax) WHERE { ?ap wdt:P238 ?iata ; wdt:P3872 ?p . } GROUP BY ?iata')
  const out = new Map()
  for (const r of rows) {
    const v = Number(r.pax?.value)
    if (r.iata?.value && Number.isFinite(v) && v > 0) out.set(r.iata.value, v)
  }
  return out
}

async function loadWikidata() {
  // Two small queries beat one big one — WDQS 502s on anything broad. HDI needs
  // its own pass because P1081 carries one value per year and must be reduced to
  // the latest by P585 client-side (the FILTER NOT EXISTS form does not dedupe).
  const base = `SELECT ?iso2 ?fips ?side WHERE {
    ?c wdt:P297 ?iso2 .
    OPTIONAL { ?c wdt:P901 ?fips }
    OPTIONAL { ?c wdt:P1622 ?s . ?s rdfs:label ?side FILTER(lang(?side)="en") }
  }`
  const hdi = `SELECT ?iso2 ?hdi ?d WHERE {
    ?c wdt:P297 ?iso2 ; p:P1081 ?st .
    ?st ps:P1081 ?hdi ; pq:P585 ?d .
  }`
  const out = new Map()
  const put = (iso, patch) => out.set(iso, { ...(out.get(iso) || {}), ...patch })

  for (const r of await sparql(base)) {
    const iso = r.iso2?.value
    if (!iso) continue
    const cur = out.get(iso) || {}
    put(iso, { fips: r.fips?.value ?? cur.fips, side: r.side?.value ?? cur.side })
  }
  for (const r of await sparql(hdi)) {
    const iso = r.iso2?.value
    const v = parseFloat(r.hdi?.value)
    const d = r.d?.value
    if (!iso || !Number.isFinite(v) || v <= 0 || v >= 1) continue
    const cur = out.get(iso) || {}
    if (!cur.hdiDate || d > cur.hdiDate) put(iso, { hdi: v, hdiDate: d })
  }
  return out
}

async function sparql(query, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`, {
      headers: { Accept: 'application/sparql-results+json', 'User-Agent': UA },
    })
    if (res.ok) return (await res.json()).results.bindings
    if (res.status !== 502 && res.status !== 429 && res.status < 500) throw new Error(`WDQS ${res.status}`)
    await sleep(4000 * (i + 1))
  }
  throw new Error('WDQS unavailable after retries')
}

// ------------------------------------------------------------------ resolution

const ARRAY_COLS = new Set(['languages', 'major_religions', 'climate_zones', 'natural_resources', 'unesco_sites', 'major_industries', 'exports', 'imports', 'airport_codes', 'major_airports'])
const JSON_COLS = new Set(['national_symbols'])

/** Build the fill-if-empty patch for one country. */
function resolve(row, src, fb) {
  const { S1, S2, S3, S4 } = src
  const iso = row.code
  const a = S1.get(iso), b = S2.get(iso), ap = S3.get(iso) || [], w = S4.get(iso) || {}
  const patch = {}, provenance = {}

  const set = (col, value, source) => {
    if (value === null || value === undefined || value === '') return
    if (Array.isArray(value) && value.length === 0) return
    if (!isEmpty(row[col]) && !FORCE.has(col)) return    // fill-if-empty
    if (ONLY && !ONLY.includes(col)) return
    patch[col] = value
    provenance[col] = source
  }

  // --- S1 dr5hn.
  // Uninhabited territories get skipped for currency: dr5hn carries invented
  // codes for them (Antarctica → "AAD"), and a place with no population has no
  // currency to report.
  const uninhabited = !row.population || Number(row.population) === 0
  if (a) {
    if (a.phonecode) set('calling_code', `+${String(a.phonecode).replace(/^\+/, '').split(/[,\s]/)[0]}`, 'dr5hn')
    if (a.tld) set('internet_tld', a.tld, 'dr5hn')
    if (a.currency && !uninhabited) set('currency', a.currency, 'dr5hn')
    if (a.capital) set('capital', a.capital, 'dr5hn')
    const tz = Array.isArray(a.timezones) ? a.timezones[0]?.zoneName : null
    if (tz) set('timezone', tz, 'dr5hn')
  }

  // --- S2 mledoze (languages only; master dropped car/population/timezones)
  if (b?.languages) {
    const langs = Object.values(b.languages).filter(Boolean)
    if (langs.length) set('languages', langs, 'mledoze')
  }

  // --- S3 OurAirports
  if (ap.length) {
    set('airport_codes', ap.slice(0, 12).map((x) => x.iata), 'ourairports')
    const large = ap.filter((x) => x.type === 'large_airport')
    set('major_airports', (large.length ? large : ap).slice(0, 10).map((x) => x.name), 'ourairports')
  }

  // --- S4 Wikidata. driving_side must be exactly left/right: the CHECK
  // constraint has no other escape.
  if (w.side === 'left' || w.side === 'right') set('driving_side', w.side, 'wikidata')
  if (w.hdi) set('human_development_index', Math.round(w.hdi * 1000) / 1000, 'wikidata')

  // --- S5 Factbook
  if (fb) {
    const gov = fb.Government || {}, eco = fb.Economy || {}, geo = fb.Geography || {}, ppl = fb['People and Society'] || {}, com = fb.Communications || {}

    const anthem = plain(fbText(gov, 'National anthem(s)', 'title')).replace(/"\(/, '" (').slice(0, 200)

    set('government_type', parseGovernment(fbText(gov, 'Government type')), 'factbook')
    set('national_day', stripVintage(plain(fbText(gov, 'National holiday'))).slice(0, 200), 'factbook')
    set('national_anthem', anthem, 'factbook')
    set('internet_tld', plain(fbText(com, 'Internet country code')), 'factbook')

    set('major_religions', parseReligions(fbText(ppl, 'Religions')), 'factbook')
    set('climate_zones', parseClimate(fbText(geo, 'Climate')), 'factbook')
    set('natural_resources', listSplit(fbText(geo, 'Natural resources')).slice(0, 30), 'factbook')
    set('unesco_sites', parseUnesco(fbText(gov, 'National heritage', 'selected World Heritage Site locales')), 'factbook')
    set('major_industries', listSplit(fbText(eco, 'Industries')).slice(0, 30), 'factbook')
    set('exports', listSplit(fbText(eco, 'Exports - commodities')).slice(0, 20), 'factbook')
    set('imports', listSplit(fbText(eco, 'Imports - commodities')).slice(0, 20), 'factbook')

    const symbols = listSplit(fbText(gov, 'National symbol(s)')).slice(0, 10)
    const colors = listSplit(fbText(gov, 'National color(s)')).slice(0, 6)
    if (symbols.length || colors.length || anthem) set('national_symbols', { symbols, colors, anthem }, 'factbook')

    // Stat rescue: only for rows the World Bank pass gave up on. Factbook covers
    // territories the World Bank has no series for.
    const parked = (col) => row.enrichment_status?.[col]?.state === 'data_unavailable'
    const rescue = (col, value, guard) => {
      if (value == null || !guard(value)) return
      if (ONLY && !ONLY.includes(col)) return
      if (!isEmpty(row[col])) return
      if (!parked(col)) return
      patch[col] = value
      provenance[col] = 'factbook'
    }
    rescue('gdp_usd', parseMoney(fbText(eco, 'GDP (official exchange rate)')), (v) => v > 0)
    rescue('gdp_per_capita_usd', parseMoney(fbText(eco, 'Real GDP per capita')), (v) => v > 0 && v < 5e6)
    rescue('life_expectancy', parseYears(fbText(ppl, 'Life expectancy at birth', 'total population')), (v) => v > 20 && v < 120)
    rescue('literacy_rate', parsePercent(fbText(ppl, 'Literacy', 'total population')), (v) => v > 0 && v <= 100)
  }

  return { patch, provenance }
}

const FB_BASE = 'https://raw.githubusercontent.com/factbook/factbook.json/master'

/**
 * Resolve a country to its Factbook entry.
 *
 * The primary key is the FIPS 10-4 code from Wikidata P901, but a handful of
 * ISO2 codes resolve to an umbrella entity that carries no FIPS at all —
 * "NL" is the Kingdom of the Netherlands, not the constituent country. For
 * those, fall back to treating ISO2 as the FIPS code, but only after the file's
 * own country name agrees with ours: FIPS and ISO2 collide outright (FIPS "AU"
 * is Austria, ISO2 "AU" is Australia), so an unvalidated fallback would file
 * Austria's economy under Australia.
 */
async function loadFactbook(row, src) {
  const fips = src.S4.get(row.code)?.fips
  const path = fips ? src.S5paths.get(fips.toUpperCase()) : null
  if (path) return getJson(`${FB_BASE}/${path}`)

  const guess = src.S5paths.get(row.code.toUpperCase())
  if (!guess) return null
  const fb = await getJson(`${FB_BASE}/${guess}`)
  if (!fb) return null

  const gov = fb.Government || {}
  const names = [
    plain(fbText(gov, 'Country name', 'conventional short form')),
    plain(fbText(gov, 'Country name', 'conventional long form')),
  ].map((n) => n.toLowerCase().replace(/[^a-z]/g, ''))
  const mine = row.name.toLowerCase().replace(/[^a-z]/g, '')
  const ok = names.some((n) => n && (n === mine || n.includes(mine) || mine.includes(n)))
  if (!ok) return null
  console.log(`  ${row.code} ${row.name}: no FIPS on Wikidata, matched factbook ${guess} by name`)
  return fb
}

// ----------------------------------------------------------------------- main

const TRACKED = [
  'calling_code', 'internet_tld', 'driving_side', 'government_type', 'national_day', 'national_anthem',
  'major_religions', 'climate_zones', 'natural_resources', 'unesco_sites', 'major_industries',
  'exports', 'imports', 'airport_codes', 'major_airports', 'national_symbols',
  'capital', 'currency', 'languages', 'timezone', 'human_development_index',
  'gdp_usd', 'gdp_per_capita_usd', 'life_expectancy', 'literacy_rate',
]

async function main() {
  const src = await loadBulk()

  const where = CODES ? `and code in (${CODES.map(q).join(',')})` : ''
  const rows = await sql(`
    select id, code, name, population, enrichment_status, ${TRACKED.join(', ')}
    from public.countries
    where duplicate_of_id is null ${where}
    order by code;`)
  console.log(`\n${rows.length} countries, batch ${BATCH}, dry_run=${DRY_RUN}${ONLY ? `, only=${ONLY.join(',')}` : ''}\n`)

  const filled = Object.fromEntries(TRACKED.map((c) => [c, 0]))
  const missing = Object.fromEntries(TRACKED.map((c) => [c, 0]))
  let noFactbook = 0, overwriteAttempts = 0
  const updates = []

  for (const row of rows) {
    const fb = await loadFactbook(row, src)
    if (!fb) noFactbook++

    const { patch, provenance } = resolve(row, src, fb)

    // Invariant: never overwrite existing data (stats rescue aside, which only
    // targets columns that are themselves empty).
    for (const col of Object.keys(patch)) if (!isEmpty(row[col]) && !FORCE.has(col)) overwriteAttempts++

    const status = { ...(row.enrichment_status || {}) }
    const at = new Date().toISOString()
    for (const [col, source] of Object.entries(provenance)) {
      status[col] = { state: 'resolved', source, at }
      filled[col]++
    }
    // Fields still empty after every source get an explicit terminal state so
    // future audits see a decision, not a silent null.
    for (const col of TRACKED) {
      if (!isEmpty(patch[col]) || !isEmpty(row[col])) continue
      if (ONLY && !ONLY.includes(col)) continue
      missing[col]++
      if (status[col]?.state === 'resolved') continue
      status[col] = { state: 'data_unavailable', source: fb ? 'factbook' : 'none', reason: fb ? 'absent_in_sources' : 'no_factbook_entry', at }
    }
    if (!ONLY && isEmpty(row.visa_requirements) && status.visa_requirements?.state !== 'resolved') {
      status.visa_requirements = { state: 'data_unavailable', source: 'none', reason: 'no_free_source', at }
    }

    const sets = Object.entries(patch).map(([col, v]) =>
      ARRAY_COLS.has(col) ? `${col} = ${qArr(v)}`
      : JSON_COLS.has(col) ? `${col} = ${qJson(v)}`
      : typeof v === 'number' ? `${col} = ${v}`
      : `${col} = ${q(v)}`)
    sets.push(`enrichment_status = ${qJson(status)}`)
    updates.push(`update public.countries set ${sets.join(', ')} where id = ${q(row.id)};`)

    if (DRY_RUN && Object.keys(patch).length) {
      console.log(`${row.code} ${row.name}`)
      for (const [col, v] of Object.entries(patch)) {
        const s = Array.isArray(v) ? `[${v.length}] ${v.slice(0, 4).join(' | ')}` : typeof v === 'object' ? JSON.stringify(v) : v
        console.log(`   ${col.padEnd(24)} ${String(s).slice(0, 110)}`)
      }
    }
  }

  if (!DRY_RUN) {
    // Country writes fire the search_documents sync trigger (~55 ms/row) and a
    // Management API statement timeout rolls the whole batch back — keep batches
    // small rather than sending one giant statement.
    for (let i = 0; i < updates.length; i += BATCH) {
      const chunk = updates.slice(i, i + BATCH)
      await sql(chunk.join('\n'))
      process.stdout.write(`\r  wrote ${Math.min(i + BATCH, updates.length)}/${updates.length}`)
    }
    console.log('')
  }

  console.log('\ncolumn                     filled   still empty')
  for (const c of TRACKED) {
    if (ONLY && !ONLY.includes(c)) continue
    console.log(`  ${c.padEnd(26)} ${String(filled[c]).padStart(4)}   ${String(missing[c]).padStart(9)}`)
  }
  console.log(`\n${rows.length} countries · ${noFactbook} without a Factbook entry · ${overwriteAttempts} overwrite attempts (must be 0)`)
  if (DRY_RUN) console.log('DRY RUN — nothing written.')
}

main().catch((e) => { console.error(e); process.exit(1) })
