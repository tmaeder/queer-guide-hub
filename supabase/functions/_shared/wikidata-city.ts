// Wikidata claim extraction for cities.
//
// Deliberately separate from wikidata-resolve.ts, which is person-shaped (P31=Q5
// human gate, occupation scoring) and must not be bent into geography.
//
// The reason this file exists is RANK. The previous extractor read
// `claims[P][0]` — the first statement in document order — which is not the
// current value. Verified live:
//   Cape Town P1082: [0] 433,688 (normal)  vs preferred 3,776,313
//   Paris     P1082: [0] 2,145,906         vs preferred 2,103,778
//   NYC       P1082: [0] 8,405,837         vs preferred 8,804,190
// Every population/area/elevation this engine ever wrote used array position.
// bestStatement() fixes that and is applied to the pre-existing fields too.
//
// Group A fields come out of the wbgetentities call the caller already makes —
// zero extra HTTP requests. Group B (airports, universities) needs a reverse
// lookup and therefore WDQS, which is slow and flaky; it runs in its own phase
// behind its own circuit breaker.

export type Json = Record<string, unknown>

export interface Snak {
  snaktype?: string
  datavalue?: { value?: unknown; type?: string }
}
export interface Statement {
  rank?: 'preferred' | 'normal' | 'deprecated'
  mainsnak?: Snak
  qualifiers?: Record<string, Snak[]>
}
export type Claims = Record<string, Statement[]>

// ---------------------------------------------------------------- value readers

function valueOf(s?: Snak): unknown {
  if (!s || s.snaktype !== 'value') return undefined
  return s.datavalue?.value
}
/** Wikidata quantities arrive as { amount: "+3776313", unit: … }. */
function asNumber(v: unknown): number | undefined {
  const raw = typeof v === 'object' && v !== null ? (v as { amount?: string }).amount : v
  if (raw == null) return undefined
  const n = parseFloat(String(raw).replace(/^\+/, ''))
  return Number.isFinite(n) ? n : undefined
}
/** Times arrive as { time: "+2018-10-31T00:00:00Z", precision: … }. */
function asTime(v: unknown): string | undefined {
  const t = typeof v === 'object' && v !== null ? (v as { time?: string }).time : undefined
  return typeof t === 'string' ? t : undefined
}
function asQid(v: unknown): string | undefined {
  const id = typeof v === 'object' && v !== null ? (v as { id?: string }).id : undefined
  return typeof id === 'string' && /^Q[1-9][0-9]*$/.test(id) ? id : undefined
}
function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}
/** "+2018-10-31T00:00:00Z" → epoch ms. Wikidata pads unknown months/days with 00. */
function timeToMs(t?: string): number | undefined {
  if (!t) return undefined
  const m = /^([+-])(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (!m) return undefined
  const sign = m[1] === '-' ? -1 : 1
  const year = sign * parseInt(m[2], 10)
  const month = Math.max(1, parseInt(m[3], 10))
  const day = Math.max(1, parseInt(m[4], 10))
  const ms = Date.UTC(year, month - 1, day)
  return Number.isFinite(ms) ? ms : undefined
}

// ---------------------------------------------------------------- rank + time

/**
 * The statement that represents the CURRENT value:
 * preferred rank wins; among equals the newest P585 (point in time) wins;
 * deprecated statements are never returned.
 */
export function bestStatement(sts?: Statement[]): Statement | null {
  const live = (sts ?? []).filter(s => s.rank !== 'deprecated' && s.mainsnak?.snaktype === 'value')
  if (!live.length) return null
  const preferred = live.filter(s => s.rank === 'preferred')
  const pool = preferred.length ? preferred : live
  let best = pool[0]
  let bestAt = timeToMs(asTime(valueOf(pool[0].qualifiers?.P585?.[0]))) ?? -Infinity
  for (const s of pool.slice(1)) {
    const at = timeToMs(asTime(valueOf(s.qualifiers?.P585?.[0]))) ?? -Infinity
    if (at > bestAt) { best = s; bestAt = at }
  }
  return best
}

/**
 * Statements that have not ended: no P582 (end time) qualifier at all, or one
 * whose date is still in the future.
 *
 * Conservative on purpose: a P582 that is present but unparseable (novalue /
 * somevalue — "ended, date unknown") counts as ENDED. Publishing a former mayor
 * as the current one is a factual error users would notice, so an empty result
 * and a NULL column is the correct outcome. Cape Town, Paris and NYC all carry
 * P580+P582 on every P6 statement.
 */
export function currentStatements(sts?: Statement[]): Statement[] {
  const now = Date.now()
  return (sts ?? []).filter(s => {
    if (s.rank === 'deprecated' || s.mainsnak?.snaktype !== 'value') return false
    const ends = s.qualifiers?.P582
    if (!ends || !ends.length) return true
    return ends.every(e => {
      const ms = timeToMs(asTime(valueOf(e)))
      return ms !== undefined && ms > now
    })
  })
}

// ---------------------------------------------------------------- group A

/** Fields whose Wikidata value is a QID and therefore needs a label lookup. */
export interface CityQidRefs {
  sister_cities: string[]
  local_language: string[]
  mayor: string[]
  climate_type: string[]
  economy_sectors: string[]
}

export interface CityWdFacts {
  population?: number
  area_km2?: number
  elevation_m?: number
  founded_year?: number
  official_website?: string
  postal_codes?: string[]
  area_codes?: string[]
  /** QIDs pending label resolution. */
  refs: CityQidRefs
}

const MAX_POSTAL = 20
const MAX_AREA_CODES = 10
const MAX_SISTER = 25
const MAX_LANGUAGES = 3
const MAX_SECTORS = 8

function uniq(xs: string[]): string[] {
  return [...new Set(xs.map(x => x.trim()).filter(Boolean))]
}

/**
 * Postal codes: prefer values with no P518 ("applies to part") qualifier — those
 * are the city-wide codes. Cape Town has '8001' unqualified and '8000' scoped to
 * a suburb. When EVERY value is scoped (Paris: 75001…75020 per arrondissement)
 * keep them all, because the scoped set is the real answer.
 */
function readPostalCodes(sts?: Statement[]): string[] {
  const live = (sts ?? []).filter(s => s.rank !== 'deprecated')
  const unqualified = live.filter(s => !s.qualifiers?.P518)
  const pool = unqualified.length ? unqualified : live
  const vals = pool.map(s => asString(valueOf(s.mainsnak))).filter((v): v is string => !!v)
  return uniq(vals).sort().slice(0, MAX_POSTAL)
}

function readAreaCodes(sts?: Statement[]): string[] {
  const vals = (sts ?? [])
    .filter(s => s.rank !== 'deprecated')
    .flatMap(s => (asString(valueOf(s.mainsnak)) ?? '').split(/[/,;]/))
    .map(v => v.trim())
    .filter(Boolean)
  return uniq(vals).sort().slice(0, MAX_AREA_CODES)
}

function qidsOf(sts: Statement[], cap: number): string[] {
  return uniq(sts.map(s => asQid(valueOf(s.mainsnak))).filter((q): q is string => !!q)).slice(0, cap)
}

export function parseCityFacts(claims: Claims): CityWdFacts {
  const num = (p: string): number | undefined => asNumber(valueOf(bestStatement(claims[p])?.mainsnak))

  const out: CityWdFacts = {
    refs: { sister_cities: [], local_language: [], mayor: [], climate_type: [], economy_sectors: [] },
  }

  const pop = num('P1082'); if (pop != null) out.population = Math.round(pop)
  const area = num('P2046'); if (area != null) out.area_km2 = Math.round(area * 100) / 100
  const elev = num('P2044'); if (elev != null) out.elevation_m = Math.round(elev)

  const inception = asTime(valueOf(bestStatement(claims.P571)?.mainsnak))
  if (inception) {
    const m = /^([+-])(\d{4})/.exec(inception)
    // BCE foundation years cannot be stored in a positive int column; skip them
    // rather than writing a wrong positive year.
    if (m && m[1] === '+') {
      const y = parseInt(m[2], 10)
      if (Number.isFinite(y) && y > 0) out.founded_year = y
    }
  }

  const site = asString(valueOf(bestStatement(claims.P856)?.mainsnak))
  if (site && /^https?:\/\//i.test(site)) out.official_website = site

  const postal = readPostalCodes(claims.P281); if (postal.length) out.postal_codes = postal
  const areaCodes = readAreaCodes(claims.P473); if (areaCodes.length) out.area_codes = areaCodes

  out.refs.sister_cities = qidsOf(currentStatements(claims.P190), MAX_SISTER)
  // P37 (official language) is the primary; P2936 (language used) is a fallback.
  const langs = qidsOf(currentStatements(claims.P37), MAX_LANGUAGES)
  out.refs.local_language = langs.length ? langs : qidsOf(currentStatements(claims.P2936), MAX_LANGUAGES)
  // Only a mayor who has not left office. Usually empty — that is correct.
  const mayor = bestStatement(currentStatements(claims.P6))
  const mayorQid = asQid(valueOf(mayor?.mainsnak))
  out.refs.mayor = mayorQid ? [mayorQid] : []
  // P2564 = Köppen climate classification. Present on NYC/Tokyo, absent on
  // Paris/Cape Town — partial by nature, with no free per-city fallback.
  const climate = bestStatement(claims.P2564)
  const climateQid = asQid(valueOf(climate?.mainsnak))
  out.refs.climate_type = climateQid ? [climateQid] : []
  out.refs.economy_sectors = qidsOf(currentStatements(claims.P452), MAX_SECTORS)

  return out
}

// ---------------------------------------------------------------- labels

export type FetchJson = (url: string) => Promise<Json | null>

const LABEL_CHUNK = 50

/**
 * Batched QID → English label. wbgetentities accepts 50 pipe-separated ids, so a
 * city with sister cities + a language + a climate class usually costs ONE extra
 * request. The cache is passed in by the caller and shared across a whole batch:
 * sister-city QIDs repeat heavily (Q1017 "Aachen" recurs across European cities),
 * so it warms fast and later cities often cost zero requests.
 */
export async function resolveLabels(
  fetchJson: FetchJson,
  qids: string[],
  cache: Map<string, string>,
): Promise<Map<string, string>> {
  const missing = uniq(qids).filter(q => !cache.has(q))
  for (let i = 0; i < missing.length; i += LABEL_CHUNK) {
    const chunk = missing.slice(i, i + LABEL_CHUNK)
    const d = await fetchJson(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${chunk.join('|')}` +
      `&props=labels&languages=en&format=json`,
    )
    const entities = (d?.entities ?? {}) as Record<string, { labels?: { en?: { value?: string } } }>
    for (const q of chunk) {
      const label = entities[q]?.labels?.en?.value
      // Cache misses too — a QID with no English label must not be re-fetched
      // once per city for the rest of the run.
      cache.set(q, typeof label === 'string' ? label : '')
    }
  }
  const out = new Map<string, string>()
  for (const q of uniq(qids)) {
    const v = cache.get(q)
    if (v) out.set(q, v)
  }
  return out
}

/** Resolve QID refs into the shapes the `cities` columns expect. */
export function applyLabels(refs: CityQidRefs, labels: Map<string, string>): {
  sister_cities?: string[]
  local_language?: string
  mayor?: string
  climate_type?: string
  economy_sectors?: string[]
} {
  const lbl = (qs: string[]) => qs.map(q => labels.get(q)).filter((v): v is string => !!v)
  const out: ReturnType<typeof applyLabels> = {}
  const sisters = lbl(refs.sister_cities)
  if (sisters.length) out.sister_cities = uniq(sisters).sort()
  // Column is singular text; join the official languages for display.
  const langs = lbl(refs.local_language)
  if (langs.length) out.local_language = uniq(langs).join(', ')
  const mayor = lbl(refs.mayor)[0]
  if (mayor) out.mayor = mayor
  const climate = lbl(refs.climate_type)[0]
  if (climate) out.climate_type = climate
  const sectors = lbl(refs.economy_sectors)
  if (sectors.length) out.economy_sectors = uniq(sectors).sort()
  return out
}

// ---------------------------------------------------------------- group B (SPARQL)

export const WDQS_ENDPOINT = 'https://query.wikidata.org/sparql'

export interface SparqlBinding { [k: string]: { value: string } | undefined }

export function sparqlUrl(query: string): string {
  return `${WDQS_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`
}

const qidValues = (qids: string[]) => qids.map(q => `wd:${q}`).join(' ')

/**
 * Airports serving each city. Uses P931 ("place served by transport hub"), NOT
 * P131 — an airport usually sits outside the city's administrative boundary, so
 * a containment query misses it (verified: P931 returns CPT for Cape Town).
 * wikibase:sitelinks is the tiebreaker for which one is the primary airport;
 * measured 2.7s for 12 cities and it picks JFK / LHR / CDG / HND / FCO / MAD
 * correctly.
 */
export function airportQuery(qids: string[]): string {
  return `SELECT ?city ?iata ?apLabel ?sl WHERE {
  VALUES ?city { ${qidValues(qids)} }
  ?ap wdt:P931 ?city ; wdt:P238 ?iata ; wikibase:sitelinks ?sl .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 300`
}

/**
 * Universities/colleges directly located in each city. Direct wdt:P131 only —
 * the transitive P131-star plus P279-star form was measured at HTTP 500 after
 * 60s for three cities, and a single extra hop cost 29s for five. Those that hang
 * off a municipality item rather than the city item are therefore missed; those
 * gaps stay empty rather than being guessed.
 */
export function universityQuery(qids: string[]): string {
  return `SELECT ?city ?xLabel WHERE {
  VALUES ?city { ${qidValues(qids)} }
  VALUES ?t { wd:Q3918 wd:Q875538 wd:Q902104 wd:Q3354859 }
  ?x wdt:P31 ?t ; wdt:P131 ?city .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 600`
}

const qidFromUri = (uri?: string) => uri?.split('/').pop() ?? ''

export interface AirportPick { airport_codes: string[]; major_airport_code?: string; labels: string[] }

const MAX_AIRPORTS = 6
const MAX_UNIVERSITIES = 15

/** Group SPARQL airport rows per city and pick the primary by sitelink count. */
export function pickAirports(bindings: SparqlBinding[]): Map<string, AirportPick> {
  const byCity = new Map<string, { iata: string; label: string; sl: number }[]>()
  for (const b of bindings) {
    const city = qidFromUri(b.city?.value)
    const iata = (b.iata?.value ?? '').trim().toUpperCase()
    if (!city || !/^[A-Z]{3}$/.test(iata)) continue
    const list = byCity.get(city) ?? []
    list.push({ iata, label: b.apLabel?.value ?? '', sl: parseInt(b.sl?.value ?? '0', 10) || 0 })
    byCity.set(city, list)
  }
  const out = new Map<string, AirportPick>()
  for (const [city, list] of byCity) {
    const seen = new Map<string, { iata: string; label: string; sl: number }>()
    for (const a of list) if (!seen.has(a.iata) || seen.get(a.iata)!.sl < a.sl) seen.set(a.iata, a)
    const ranked = [...seen.values()].sort((a, b) => b.sl - a.sl || a.iata.localeCompare(b.iata))
    // An exact tie means we cannot say which is primary (Berlin: TXL 55 / BER 55,
    // and TXL is closed). Fill the array, leave the scalar NULL.
    const decisive = ranked.length === 1 || (ranked.length > 1 && ranked[0].sl > ranked[1].sl)
    out.set(city, {
      airport_codes: ranked.slice(0, MAX_AIRPORTS).map(a => a.iata),
      major_airport_code: decisive ? ranked[0].iata : undefined,
      labels: ranked.slice(0, MAX_AIRPORTS).map(a => a.label).filter(Boolean),
    })
  }
  return out
}

export function pickUniversities(bindings: SparqlBinding[]): Map<string, string[]> {
  const byCity = new Map<string, string[]>()
  for (const b of bindings) {
    const city = qidFromUri(b.city?.value)
    const label = (b.xLabel?.value ?? '').trim()
    // The label service echoes the QID when no English label exists — drop those.
    if (!city || !label || /^Q[1-9][0-9]*$/.test(label)) continue
    byCity.set(city, [...(byCity.get(city) ?? []), label])
  }
  const out = new Map<string, string[]>()
  for (const [city, names] of byCity) out.set(city, uniq(names).sort().slice(0, MAX_UNIVERSITIES))
  return out
}
