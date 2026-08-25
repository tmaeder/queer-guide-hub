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
/** Beyond two, P2936 is an inventory of languages spoken, not the local language. */
const P2936_MAX_FALLBACK = 2
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
  // P37 (official language) is primary; P2936 ("language used") is a fallback
  // ONLY when it names at most two languages.
  //
  // Measured over the 63 rows this fallback produced: every wrong answer had
  // three or more values, because at that length P2936 is an inventory of
  // minority / indigenous / historical languages rather than the lingua franca —
  //   Jerusalem   -> "Yevanic, Lishana Deni, Biblical Hebrew"
  //   Delhi       -> "Punjabi, Bauria, Central Tibetan"
  //   Kaohsiung   -> "Saaroa, Kanakanavu, Rukai"
  //   Mexico City -> "Tilapa Otomi, Tilantongo Mixtec, Copala Triqui"
  // while the one- and two-value results were right (Manila -> Tagalog,
  // Montevideo -> Spanish, Marseille -> French). A city whose P37 is absent or an
  // unknown-value snak and whose P2936 is long keeps an empty column.
  const langs = qidsOf(currentStatements(claims.P37), MAX_LANGUAGES)
  if (langs.length) {
    out.refs.local_language = langs
  } else {
    const used = qidsOf(currentStatements(claims.P2936), MAX_LANGUAGES)
    out.refs.local_language = used.length <= P2936_MAX_FALLBACK ? used : []
  }
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

// ---------------------------------------------------------------- capital scope

const MAX_CAPITAL_ROWS = 400

/**
 * P1376 ("capital of") per city, with the two facts needed to tell a
 * Landeshauptstadt from a Bundeshauptstadt from a county seat.
 *
 * P1376 alone is not enough and flagging on it would be wrong twice over:
 * Berlin is the capital OF GERMANY (national, not regional), and plenty of
 * towns are the capital of a district or county, which is not what this column
 * means. So each target carries two booleans:
 *
 *   ?isCountry      — the target is this city's own P17, i.e. the national case.
 *   ?isCountryClass — the target is a country / sovereign state by class. Needed
 *                     for dependent territories, where the city's P17 is the
 *                     parent state (United Kingdom) while P1376 points at the
 *                     territory (Gibraltar); without this the national case
 *                     would be misread as regional.
 *   ?isFirstLevel   — the target is a first-level administrative country
 *                     subdivision (Q10864048): Bundesland, US state, région,
 *                     provincia. This is the corroborating signal that keeps
 *                     district capitals out.
 *   ?sameCountry    — the target belongs to the same country as the city. The
 *                     second independent signal the regional arm requires, so a
 *                     P1376 pointing across a border cannot publish a flag.
 *
 * Former capitals are excluded in the query rather than after it, in TWO
 * different senses, and the second one was found by running this against live
 * WDQS rather than reasoning about it:
 *
 *   - The STATEMENT ended. A P582 (end time) qualifier means the city used to be
 *     the capital (Bonn, Rio de Janeiro), and deprecated rank is how Wikidata
 *     retracts a wrong claim without deleting it. Same guards
 *     `currentStatements()` applies on the wbgetentities path.
 *   - The UNIT ended. This is the one that bites: Cologne is the capital of the
 *     Electorate of Cologne, which is a first-level subdivision by class and
 *     carries no end qualifier on the statement — it simply stopped existing in
 *     1803. Measured live, that single row would have published Cologne as a
 *     Landeshauptstadt, which it is not (Düsseldorf is). Munich had the same
 *     shape twice over, via the Kingdom and the Electorate of Bavaria.
 *     `wdt:P576` (dissolved/abolished) is what removes them.
 *
 * MEASURED AND REJECTED: also reading the inverse direction, `?unit wdt:P36
 * ?city` ("capital"). The hypothesis was that some countries model the relation
 * only on the subdivision, which would lose every US state capital. It does not
 * hold — Boston carries P1376 to Massachusetts and Austin to Texas — and the
 * union costs real noise: Barcelona picks up four extra units through P36 alone
 * (Captaincy General of Catalonia, Corregimiento of Barcelona, Región Militar
 * Pirenaica Oriental, and an association), which is row budget spent to change
 * no answer. Two cities that looked like coverage gaps in that measurement,
 * Sacramento and Albany, turned out to be WRONG QIDs in our own `cities` table
 * (the stored "Albany" QID is Albany, Texas), not a Wikidata gap.
 *
 * The two `wdt:P279*` walks are the one measured risk here — the transitive form
 * over P131 was HTTP 500 at 60s for this endpoint. These walk from a handful of
 * already-bound targets rather than from every city, and the call sits behind
 * the `wikidata.sparql` breaker, so a regression degrades to "not resolved"
 * rather than to a wrong flag.
 */
export function capitalQuery(qids: string[]): string {
  return `SELECT ?city ?unit ?unitLabel ?isCountry ?isCountryClass ?isFirstLevel ?sameCountry WHERE {
  VALUES ?city { ${qidValues(qids)} }
  ?city p:P1376 ?st .
  ?st ps:P1376 ?unit .
  FILTER NOT EXISTS { ?st pq:P582 ?ended }
  FILTER NOT EXISTS { ?st wikibase:rank wikibase:DeprecatedRank }
  FILTER NOT EXISTS { ?unit wdt:P576 ?dissolved }
  BIND(EXISTS { ?city wdt:P17 ?unit } AS ?isCountry)
  BIND(EXISTS { ?unit wdt:P31/wdt:P279* wd:Q6256 } AS ?isCountryClass)
  BIND(EXISTS { ?unit wdt:P31/wdt:P279* wd:Q10864048 } AS ?isFirstLevel)
  BIND(EXISTS { ?city wdt:P17 ?cc . ?unit wdt:P17 ?cc } AS ?sameCountry)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT ${MAX_CAPITAL_ROWS}`
}

export interface CapitalPick {
  /** The city is the capital of a country or dependent territory. */
  national: boolean
  /** The city is the capital of a first-level subdivision. */
  regional: boolean
  /** Label of that subdivision — the evidence for `regional`, null when false. */
  regionOf?: string
  /** Every P1376 target seen, for provenance. Includes the ones that were rejected. */
  units: string[]
}

const asBool = (v?: string) => v === 'true' || v === '1'

/**
 * Fold the SPARQL rows into one verdict per city.
 *
 * A city with P1376 statements that qualify for NEITHER arm resolves to
 * `{national:false, regional:false}` — that is a real negative finding (Wikidata
 * says this place is the capital of a district, say), not a missing answer. A
 * city that appears in no row at all simply is not in the map, and the caller
 * must treat that as "Wikidata knows of no capital role", which is also a
 * negative finding rather than a gap. The gap case — no QID to ask about — never
 * reaches this function.
 */
export function pickCapitals(bindings: SparqlBinding[]): Map<string, CapitalPick> {
  const out = new Map<string, CapitalPick>()
  for (const b of bindings) {
    const city = qidFromUri(b.city?.value)
    const unit = qidFromUri(b.unit?.value)
    if (!city || !unit) continue

    const cur = out.get(city) ?? { national: false, regional: false, units: [] }
    if (!cur.units.includes(unit)) cur.units.push(unit)

    const isNational = asBool(b.isCountry?.value) || asBool(b.isCountryClass?.value)
    if (isNational) {
      cur.national = true
    } else if (asBool(b.isFirstLevel?.value) && asBool(b.sameCountry?.value)) {
      const label = (b.unitLabel?.value ?? '').trim()
      cur.regional = true
      // The label service echoes the QID when there is no English label. Keep the
      // flag — the classification held — but do not publish "Q1221156" as a
      // region name. Among several units the first alphabetically wins, so the
      // answer does not depend on SPARQL row order.
      if (label && !/^Q[1-9][0-9]*$/.test(label)) {
        cur.regionOf = cur.regionOf && cur.regionOf < label ? cur.regionOf : label
      }
    }
    out.set(city, cur)
  }
  return out
}

// --------------------------------------------------------------- city names
//
// Alias harvesting. This is the only source that can teach the resolver that
// "Kapstadt" and "Cape Town" are one place: `merge_cities` mints an alias for
// every name it drops, but that only ever covers names somebody already noticed
// and merged (207 of 210 on production), and it can never cover a name that has
// not been typed yet. Wikidata carries them all as labels and altLabels.
//
// It costs ZERO extra requests. `fetchEntity` already calls wbgetentities for
// claims and the enwiki sitelink; `labels` and `aliases` ride along in the same
// response, so this is a change to a query string, not a new API dependency.
//
// MONOLINGUAL PROPERTIES GO THROUGH bestStatement like everything else in this
// file -- P1448 (official name), P1705 (native label) and P1813 (short name)
// are ordinary statements and can be deprecated, which is how Wikidata retracts
// a wrong name. Reading array position would resurrect exactly those.
//
// A SITELINK TITLE IS ONLY USABLE AFTER ITS DISAMBIGUATOR IS REMOVED, and only
// when the disambiguator is parenthetical: "Bern (Stadt)" -> "Bern" is the same
// place, but "Washington, D.C." -> "Washington" is a DIFFERENT and famously
// ambiguous one, and an alias is a claim of identity. Comma-qualified titles are
// therefore dropped rather than trimmed.

export interface CityNameAlias {
  alias: string
  locale: string | null
  source: 'label' | 'altlabel' | 'official' | 'native' | 'short' | 'sitelink'
}

export interface WdLabels { [lang: string]: { language?: string; value?: string } }
export interface WdAliases { [lang: string]: Array<{ language?: string; value?: string }> }
export interface WdSitelinks { [site: string]: { title?: string } }

/** Languages worth harvesting: the platform's own 11 plus the scripts this
 *  corpus already contains as primary city names. */
export const CITY_NAME_LANGS = [
  'en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'ja', 'zh',
  'el', 'ko', 'he', 'ar', 'uk', 'sr', 'ka', 'th', 'hy',
]

export const CITY_NAME_SITES = CITY_NAME_LANGS.map(l => `${l}wiki`)

const MAX_CITY_ALIASES = 40
const PAREN_RE = /\s*\([^)]*\)\s*$/

function cleanAlias(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.replace(PAREN_RE, '').trim()
  // 2 chars is the floor a meaningful place name can occupy in any script
  // ("Ny", "Ur"); below that a match would be noise, and city_canonical_key
  // keeps punctuation so a 1-char value is almost always a parse artifact.
  if (s.length < 2 || s.length > 120) return null
  if (s.includes(',')) return null   // see header: a comma qualifier is not a synonym
  if (/https?:\/\//i.test(s)) return null
  return s
}

/**
 * Every name Wikidata knows for this entity, deduplicated case-insensitively,
 * capped. The cap is a guard against a handful of entities with dozens of
 * historical spellings, not a quality judgement -- the DB is the real filter,
 * since city_aliases.alias_key is generated and uniquely indexed per city.
 */
export function parseCityNames(
  claims: Claims,
  labels?: WdLabels,
  aliases?: WdAliases,
  sitelinks?: WdSitelinks,
): CityNameAlias[] {
  const out: CityNameAlias[] = []
  const seen = new Set<string>()

  const push = (raw: unknown, locale: string | null, source: CityNameAlias['source']) => {
    const alias = cleanAlias(raw)
    if (!alias) return
    const k = alias.toLowerCase()
    if (seen.has(k)) return
    seen.add(k)
    out.push({ alias, locale, source })
  }

  for (const lang of CITY_NAME_LANGS) {
    push(labels?.[lang]?.value, lang, 'label')
  }
  for (const lang of CITY_NAME_LANGS) {
    for (const a of aliases?.[lang] ?? []) push(a?.value, lang, 'altlabel')
  }

  // Monolingual-text claims carry their own language tag.
  const mono = (p: string, source: CityNameAlias['source']) => {
    const v = valueOf(bestStatement(claims[p])?.mainsnak) as { text?: string; language?: string } | string | undefined
    if (typeof v === 'string') push(v, null, source)
    else if (v && typeof v === 'object') push(v.text, v.language ?? null, source)
  }
  mono('P1448', 'official')
  mono('P1705', 'native')
  mono('P1813', 'short')

  for (const lang of CITY_NAME_LANGS) {
    push(sitelinks?.[`${lang}wiki`]?.title, lang, 'sitelink')
  }

  return out.slice(0, MAX_CITY_ALIASES)
}
