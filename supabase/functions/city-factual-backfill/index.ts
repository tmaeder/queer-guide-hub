// city-factual-backfill — free structured enrichment for cities.
//
// Two phases, selected by body.phase:
//
//   'link' (default) — per city: resolve/reuse a Wikidata QID, then read every
//     group-A field out of the ONE wbgetentities response (population, area,
//     elevation, inception, website, postal codes, area codes, sister cities,
//     official language, current mayor, Köppen climate, industry) plus the
//     English Wikipedia extract/image/coords via the cached sitelink title.
//
//   'sparql' — batched reverse lookups a claim read cannot answer: airports
//     serving the city (P931 + P238), universities located in it, and the
//     capital role (P1376, classified into national vs first-level-regional).
//     WDQS is
//     slow and flaky (measured HTTP 500 at 60s on transitive queries, and a 502
//     under load), so it has its own circuit breaker and never runs inside the
//     per-city loop.
//
// Fills EMPTY columns only. The single exception is documented at applyRankFix.
//
// Auth: X-Webhook-Secret (cron) or admin/service-role.
// Body: { phase?, batch_limit?, dry_run?, city_ids?, scope? }

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { hasValidWebhookSecret } from '../_shared/webhook-auth.ts'
import { safeErrCode } from '../_shared/safe-error.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { cityNameCandidates } from '../_shared/city-name-normalize.ts'
import {
  airportQuery, applyLabels, capitalQuery, parseCityFacts, parseCityNames, pickAirports,
  pickCapitals, pickUniversities, resolveLabels, sparqlUrl, universityQuery,
  CITY_NAME_LANGS, CITY_NAME_SITES,
  type AirportPick, type CapitalPick, type Claims, type CityNameAlias, type CityWdFacts,
  type Json, type SparqlBinding, type WdAliases, type WdLabels, type WdSitelinks,
} from '../_shared/wikidata-city.ts'

const DEFAULT_BATCH_LIMIT = 40
// 300 is the repo-wide ceiling for city writes: one cities UPDATE fans out
// through trg_sync_geo_spine into geo_places + a ~40-column geo_city_profiles
// upsert and a search_documents delete+insert (HNSW index maintenance).
const MAX_BATCH_LIMIT = 300
const SPARQL_CHUNK = 12
const MAX_LINK_ATTEMPTS = 3
const STEP = 'city-factual-backfill'
const WP_UA = 'QueerGuideBot/1.0 (https://queer.guide; contact@queer.guide)'
const FETCH_TIMEOUT = 10_000
const SPARQL_TIMEOUT = 45_000

// The Supabase client's generated types are not available to edge functions.
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

// ------------------------------------------------------------------ fetch

async function fetchJson(url: string, timeout = FETCH_TIMEOUT, accept = 'application/json'): Promise<Json | null> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeout)
  try {
    const r = await fetch(url, { headers: { 'User-Agent': WP_UA, Accept: accept }, signal: ctl.signal })
    if (!r.ok) return null
    return await r.json() as Json
  } catch { return null } finally { clearTimeout(t) }
}

const wdFetch = (url: string) => fetchJson(url)

// Codes this function throws itself and is willing to expose. Anything else
// reaching a catch is either a driver/DB message (the cities UPDATE below
// rethrows a Postgres error) or a runtime fault whose text can carry schema
// names — neither belongs in an HTTP body (CWE-209). `wdqs_request_failed` must
// survive verbatim: the operator driver matches /wdqs|sparql|timeout|fetch/ on
// it to decide whether a batch failure is a degraded upstream (back off) or a
// real bug (stop the sweep).
const SAFE_ERROR_CODES = new Set(['wdqs_request_failed'])

const errCode = (e: unknown) => safeErrCode(e, SAFE_ERROR_CODES, STEP)

interface WpSummary { extract?: string; thumbnail?: string; lat?: number; lon?: number }

async function fetchWikipediaSummary(title: string): Promise<WpSummary | null> {
  const d = await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
  if (!d || d.type === 'disambiguation') return null
  const thumb = d.thumbnail as { source?: string } | undefined
  const coords = d.coordinates as { lat?: number; lon?: number } | undefined
  return {
    extract: typeof d.extract === 'string' ? d.extract : undefined,
    thumbnail: thumb?.source,
    lat: coords?.lat,
    lon: coords?.lon,
  }
}

/** Full plaintext intro — richer than the REST summary. */
async function fetchWikipediaExtract(title: string): Promise<string | null> {
  const d = await fetchJson(
    `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1` +
    `&redirects=1&format=json&titles=${encodeURIComponent(title)}`,
  )
  const pages = (d?.query as { pages?: Record<string, { extract?: string }> } | undefined)?.pages
  for (const k of Object.keys(pages ?? {})) {
    const ex = pages![k]?.extract
    if (typeof ex === 'string' && ex.trim().length > 80) return ex.slice(0, 1200)
  }
  return null
}

/**
 * Resolve a city to a QID by entity search.
 *
 * The ladder deliberately starts at Wikidata, not at a Wikipedia title lookup.
 * The title endpoint is exactly what 404s on the import residue
 * ("Kapstadt, Südafrika"); wbsearchentities with language=en resolves German
 * exonyms and returns English descriptions this matcher understands.
 */
const PLACE_RE = /(capital|city|town|municipality|commune|village|settlement|prefecture|district|county|borough|locality|metropolis|urban)/i

async function searchQid(query: string, country?: string | null): Promise<string | null> {
  const d = await fetchJson(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}` +
    `&language=en&uselang=en&type=item&limit=7&format=json`,
  )
  const hits = (d?.search ?? []) as Array<{ id: string; description?: string }>
  let fallback: string | null = null
  for (const h of hits) {
    const desc = h.description ?? ''
    if (!PLACE_RE.test(desc)) continue
    if (country && desc.toLowerCase().includes(country.toLowerCase())) return h.id  // strong match
    if (!fallback) fallback = h.id
  }
  return fallback
}

/**
 * One request, and since 2026-08-25 it also carries the NAMES.
 *
 * `props` gained `labels|aliases` and `sitefilter` widened from enwiki to the
 * harvest languages. That is a query-string change with no extra round trip and
 * no new rate-limit exposure -- the response was already being fetched for
 * claims and the enwiki title. It is what fills `city_aliases`, and
 * `city_aliases` is what lets `city_resolve_or_create` know that Kapstadt is
 * Cape Town before a second row gets created.
 */
async function fetchEntity(qid: string): Promise<
  { claims: Claims; enwikiTitle?: string; names: CityNameAlias[] } | null
> {
  const d = await fetchJson(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(qid)}` +
    `&props=claims|sitelinks|labels|aliases` +
    `&languages=${CITY_NAME_LANGS.join('|')}` +
    `&sitefilter=${['enwiki', ...CITY_NAME_SITES].join('|')}&format=json`,
  )
  const ent = (d?.entities as Record<string, {
    claims?: Claims
    labels?: WdLabels
    aliases?: WdAliases
    sitelinks?: WdSitelinks
  }> | undefined)?.[qid]
  if (!ent) return null
  return {
    claims: ent.claims ?? {},
    enwikiTitle: ent.sitelinks?.enwiki?.title,
    names: parseCityNames(ent.claims ?? {}, ent.labels, ent.aliases, ent.sitelinks),
  }
}

/**
 * Write harvested names to city_aliases.
 *
 * Fill-only: `ignoreDuplicates` leans on the pre-existing unique index
 * (city_id, alias_key) so a re-visit is a no-op rather than a rewrite, and a
 * curated or merge-minted alias is never overwritten by a Wikidata label.
 *
 * A failure here is logged and swallowed on purpose. The aliases are an
 * optimisation for a LATER write's resolution; losing a batch of them costs a
 * repeat harvest, whereas letting the error propagate would abandon the facts
 * this run already fetched for the city itself.
 */
async function writeCityAliases(
  supabase: Db,
  cityId: string,
  cityName: string,
  names: CityNameAlias[],
): Promise<number> {
  const own = cityName.trim().toLowerCase()
  const rows = names
    .filter(n => n.alias.toLowerCase() !== own)
    .map(n => ({ city_id: cityId, alias: n.alias, locale: n.locale }))
  if (rows.length === 0) return 0
  const { error } = await supabase
    .from('city_aliases')
    .upsert(rows, { onConflict: 'city_id,alias_key', ignoreDuplicates: true })
  if (error) {
    console.warn(`[city-factual-backfill] alias write failed for ${cityId}: ${error.message}`)
    return 0
  }
  return rows.length
}

// ------------------------------------------------------------------ state

type Prov = Record<string, { candidates?: { source: string; value: unknown }[]; value?: unknown; sources?: string[] }>

function addCandidate(prov: Prov, field: string, source: string, value: unknown) {
  if (value == null) return
  const entry = prov[field] ?? {}
  const kept = (entry.candidates ?? []).filter(c => c.source !== source)
  kept.push({ source, value })
  prov[field] = { ...entry, candidates: kept }
}

interface FieldState {
  state: 'pending' | 'resolved' | 'data_unavailable'
  source?: string; attempts?: number; at: string; qid?: string
  /**
   * Findings that belong to the probe rather than to a column. `capital_scope`
   * uses it to record that Wikidata called this city a NATIONAL capital: that is
   * worth keeping visible, but it must never reach `is_capital`, whose source of
   * truth is `countries.capital` and whose single writer stays the repair path.
   */
  detail?: Record<string, unknown>
}
type Status = Record<string, FieldState>

/**
 * Terminal-sentinel bookkeeping, ported from pipeline-enrich-country-stats.
 * After MAX_LINK_ATTEMPTS misses a key flips to 'data_unavailable', which
 * cities_due_for_refresh excludes. That is what stops the ~545-city carousel
 * which re-visited the same unresolvable rows for 36 days.
 */
function bumpMiss(status: Status, key: string, source: string): void {
  if (status[key]?.state === 'resolved') return
  const attempts = (status[key]?.attempts ?? 0) + 1
  status[key] = {
    state: attempts >= MAX_LINK_ATTEMPTS ? 'data_unavailable' : 'pending',
    source, attempts, at: new Date().toISOString(),
  }
}
function markResolved(status: Status, key: string, source: string, qid?: string): void {
  status[key] = { state: 'resolved', source, at: new Date().toISOString(), ...(qid ? { qid } : {}) }
}

/**
 * True when this engine is the only thing that ever wrote the field, so it is
 * safe for the engine to correct it. A field with any other source — or with a
 * value that no longer matches what provenance recorded — has been curated since
 * and must be left alone.
 */
function ourWikidataValue(prov: Prov, field: string, current: unknown): boolean {
  const entry = prov[field]
  if (!entry) return false
  const sources = entry.sources ?? entry.candidates?.map(c => c.source) ?? []
  if (!sources.length || !sources.every(s => s === 'wikidata' || s === 'wikidata.sparql')) return false
  if (current == null) return true
  // `value` is only present after city-corroboration has fused the candidates;
  // on a fresh row the recorded value lives in candidates[]. Checking only
  // `entry.value` made this always false, so the relink repair silently did
  // nothing (Buenos Aires kept the wrong mayor after its QID was corrected).
  const recorded = entry.value !== undefined
    ? entry.value
    : entry.candidates?.find(c => c.source === 'wikidata' || c.source === 'wikidata.sparql')?.value
  if (recorded === undefined) return false
  return JSON.stringify(recorded) === JSON.stringify(current)
}

/**
 * The one sanctioned overwrite of a non-empty column.
 *
 * The old parser read claims[P][0] — array position, not rank — so every
 * population/area/elevation this function ever wrote came from an arbitrary
 * statement (Cape Town got 433,688 instead of the preferred 3,776,313; Paris
 * 2,145,906 instead of 2,103,778). Correct such a value only when provenance
 * proves WE wrote it from Wikidata AND the column still holds exactly that
 * value, i.e. nobody has curated it since. Anything else is left alone.
 */
function applyRankFix(
  field: 'population' | 'area_km2' | 'elevation_m',
  current: number | null | undefined,
  fresh: number | undefined,
  prov: Prov,
  update: Record<string, unknown>,
): boolean {
  if (fresh == null || current == null) return false
  const entry = prov[field]
  const sources = entry?.sources ?? entry?.candidates?.map(c => c.source) ?? []
  if (!sources.length || !sources.every(s => s === 'wikidata')) return false
  if (entry?.value == null || Number(entry.value) !== Number(current)) return false  // human-edited since
  if (Number(current) === Number(fresh)) return false
  update[field] = fresh
  return true
}

// ------------------------------------------------------------------ rows

interface CityRow {
  id: string; name: string; slug: string | null
  latitude: number | null; longitude: number | null
  description: string | null; image_url: string | null; curated_image_url: string | null
  population: number | null; area_km2: number | null; elevation_m: number | null
  founded_year: number | null; official_website: string | null
  postal_codes: string[] | null; area_codes: string[] | null; sister_cities: string[] | null
  economy_sectors: string[] | null; universities: string[] | null
  local_language: string | null; mayor: string | null; climate_type: string | null
  airport_codes: string[] | null; major_airport_code: string | null
  transportation_info: Record<string, unknown> | null
  is_regional_capital: boolean | null; capital_of_region: string | null
  field_provenance: Prov | null; enrichment_status: Status | null
  wikidata_qid: string | null; wikipedia_title: string | null
  country_id: string | null; countries: { name?: string } | null
}

const CITY_COLUMNS =
  'id, name, slug, latitude, longitude, description, image_url, curated_image_url, ' +
  'population, area_km2, elevation_m, founded_year, official_website, postal_codes, area_codes, ' +
  'sister_cities, economy_sectors, universities, local_language, mayor, climate_type, ' +
  'airport_codes, major_airport_code, transportation_info, ' +
  'is_regional_capital, capital_of_region, ' +
  'field_provenance, enrichment_status, wikidata_qid, wikipedia_title, country_id, countries(name)'

/**
 * An array counts as empty when it holds nothing usable, not merely when it has
 * zero length. 236 of the 326 rows with `airport_codes` hold exactly `[null]` —
 * residue from an older import. A plain length check treats those as populated,
 * so they would never be repaired and would keep rendering as a blank chip.
 */
const isEmptyArr = (a: unknown[] | null | undefined) =>
  !a || a.every(v => v == null || String(v).trim() === '')


// ------------------------------------------------------------------ entry

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  if (!hasValidWebhookSecret(req, 'CITY_QUALITY_WEBHOOK_SECRET')) {
    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth
  }

  const body = await req.json().catch(() => ({})) as {
    phase?: string; batch_limit?: number; dry_run?: boolean; city_ids?: string[]
    scope?: string; relink?: boolean
  }
  const phase = body.phase === 'sparql' ? 'sparql' : 'link'
  const batchLimit = Math.min(MAX_BATCH_LIMIT, Math.max(1, body.batch_limit ?? DEFAULT_BATCH_LIMIT))
  const dryRun = body.dry_run ?? false
  const scope = ['content_first', 'content_only', 'all'].includes(body.scope ?? '')
    ? body.scope! : 'content_first'

  let ids: string[]
  if (body.city_ids?.length) {
    ids = body.city_ids.slice(0, MAX_BATCH_LIMIT)
  } else {
    // The sparql phase can only work on cities that already have a QID, but the
    // selector doesn't know that and interleaves unlinked rows — a batch of 24
    // was yielding 9 usable cities. Over-fetch and let the phase filter.
    const selectLimit = phase === 'sparql' ? Math.min(1000, batchLimit * 4) : batchLimit
    const { data: due, error: dueErr } = await supabase.rpc('cities_due_for_refresh', {
      p_limit: selectLimit, p_scope: scope,
    })
    if (dueErr) return jsonResponse({ error: dueErr.message, success: false }, 500, req)
    ids = ((due ?? []) as { id: string }[]).map(r => r.id)
  }
  if (!ids.length) return jsonResponse({ processed: 0, message: 'nothing due', phase }, 200, req)

  const { data: cities, error } = await supabase
    .from('cities').select(CITY_COLUMNS).in('id', ids).is('duplicate_of_id', null)
  if (error) return jsonResponse({ error: error.message, success: false }, 500, req)
  const rows = (cities ?? []) as unknown as CityRow[]

  return phase === 'sparql'
    ? await runSparqlPhase(supabase, req, rows, dryRun, batchLimit)
    : await runLinkPhase(supabase, req, rows, dryRun, body.relink ?? false)
})

// ------------------------------------------------------------------ phase: link

async function runLinkPhase(
  supabase: Db, req: Request, rows: CityRow[], dryRun: boolean, relink: boolean,
): Promise<Response> {
  // Country + region names power the suspect-name heuristic: "Indonesien" and
  // "Baskenland" are filed as cities but are not places this engine can enrich.
  const knownPlaceNames = new Set<string>()
  for (const table of ['countries', 'regions']) {
    const { data } = await supabase.from(table).select('name')
    for (const r of (data ?? []) as { name: string | null }[]) {
      if (r.name) knownPlaceNames.add(r.name.toLowerCase())
    }
  }

  const labelCache = new Map<string, string>()
  let processed = 0, updated = 0, skipped = 0, failed = 0, aliasesWritten = 0
  const results: Array<Record<string, unknown>> = []

  for (const c of rows) {
    const started = Date.now()
    let status: string
    let missReason: string | null = null

    try {
      const prov: Prov = { ...(c.field_provenance ?? {}) }
      // Staleness must be judged against provenance as it was BEFORE this run.
      // addCandidate() rewrites prov[field] with the freshly-fetched value, and
      // it runs before the write guard — so reading `prov` there compared the NEW
      // value against the OLD column and concluded a human had curated it.
      // Buenos Aires kept "Gregory Habib" while its own provenance already said
      // "Jorge Macri".
      const provBefore: Prov = JSON.parse(JSON.stringify(c.field_provenance ?? {}))
      const state: Status = { ...(c.enrichment_status ?? {}) }
      const update: Record<string, unknown> = {}
      const rankFixed: string[] = []
      const country = c.countries?.name ?? null

      // --- 1. QID: cached, or resolved from cleaned name candidates -------
      // `relink` ignores the cache and re-resolves. Needed after a resolver bug:
      // the cache is what makes a repeat visit cheap, so without an override a
      // wrong QID would be sticky forever.
      let qid = relink ? null : c.wikidata_qid
      let enwikiTitle = relink ? null : c.wikipedia_title
      const cand = cityNameCandidates(c.name, { country, knownPlaceNames })

      if (!qid) {
        if (cand.suspect) {
          bumpMiss(state, 'wikidata_link', 'name')
          missReason = `suspect_name:${cand.suspectReason}`
        } else {
          for (const q of cand.queries) {
            const hit = await withCircuitBreaker(supabase, 'wikidata.api', () => searchQid(q, country))
            if (hit) { qid = hit; break }
          }
          if (!qid) {
            bumpMiss(state, 'wikidata_link', 'wikidata')
            missReason = `no_qid_candidates:${cand.queries.join(' | ')}`.slice(0, 200)
          }
        }
      }

      // --- 2. Claims + sitelink (ONE request when the QID is cached) ------
      let facts: CityWdFacts | null = null
      if (qid) {
        const ent = await withCircuitBreaker(supabase, 'wikidata.api', () => fetchEntity(qid!))
        if (!ent) {
          bumpMiss(state, 'wikidata_link', 'wikidata')
          missReason ??= 'wikidata_entity_missing'
        } else {
          facts = parseCityFacts(ent.claims)
          enwikiTitle = ent.enwikiTitle ?? enwikiTitle
          markResolved(state, 'wikidata_link', 'wikidata', qid)
          if (c.wikidata_qid !== qid) update.wikidata_qid = qid
          if (enwikiTitle && c.wikipedia_title !== enwikiTitle) update.wikipedia_title = enwikiTitle
          // Names ride in the same response. Written immediately rather than
          // batched with `update`: they go to a different table, they are
          // fill-only, and they must survive a later failure in this city's own
          // column write -- an alias is useful to the NEXT city that gets
          // created, not to this row.
          if (!dryRun && ent.names.length > 0) {
            aliasesWritten += await writeCityAliases(supabase, c.id, c.name, ent.names)
          }
        }
      }

      // --- 3. Wikipedia, always BY CACHED TITLE, never by cities.name -----
      if (enwikiTitle) {
        const summary = await withCircuitBreaker(supabase, 'wikipedia.api', () => fetchWikipediaSummary(enwikiTitle!))
        const rich = (!c.description || c.description.trim().length < 200)
          ? await withCircuitBreaker(supabase, 'wikipedia.api', () => fetchWikipediaExtract(enwikiTitle!))
          : null
        const extract = rich ?? summary?.extract
        if (extract) {
          addCandidate(prov, 'description', 'wikipedia', extract)
          if (!c.description || c.description.trim().length < 40) update.description = extract
        }
        if (summary?.thumbnail) {
          addCandidate(prov, 'image_url', 'wikipedia', summary.thumbnail)
          if (!c.image_url && !c.curated_image_url) update.image_url = summary.thumbnail
        }
        if (typeof summary?.lat === 'number' && typeof summary?.lon === 'number') {
          addCandidate(prov, 'coords', 'wikipedia', { lat: summary.lat, lng: summary.lon })
          if (c.latitude == null || c.longitude == null) {
            update.latitude = summary.lat
            update.longitude = summary.lon
          }
        }
      } else if (qid) {
        bumpMiss(state, 'wikipedia_page', 'wikipedia')
      }

      // On a relink, every value THIS ENGINE wrote from Wikidata is re-derived —
      // not just when the QID changes. Buenos Aires is why: its mayor was written
      // while the row pointed at an unrelated Córdoba town, and by the time the
      // QID had been corrected to Q1486 the "entity changed" test no longer fired,
      // so the wrong mayor survived the repair. Provenance still gates it, so a
      // human-curated value is never touched.
      const stale = (field: string, current: unknown) =>
        relink && ourWikidataValue(provBefore, field, current)

      /**
       * A field we own that the correct entity has no value for must be CLEARED,
       * not left holding the old answer. Without this a relink can only replace,
       * never retract.
       */
      const clearIfStale = (field: string, current: unknown, fresh: unknown) => {
        if (fresh == null && current != null && stale(field, current)) update[field] = null
      }

      // --- 4. Group-A columns, empty-only --------------------------------
      if (facts) {
        if (facts.population != null) {
          addCandidate(prov, 'population', 'wikidata', facts.population)
          if (c.population == null || stale('population', c.population)) update.population = facts.population
          else if (applyRankFix('population', c.population, facts.population, provBefore, update)) rankFixed.push('population')
        }
        if (facts.area_km2 != null) {
          addCandidate(prov, 'area_km2', 'wikidata', facts.area_km2)
          if (c.area_km2 == null || stale('area_km2', c.area_km2)) update.area_km2 = facts.area_km2
          else if (applyRankFix('area_km2', c.area_km2, facts.area_km2, provBefore, update)) rankFixed.push('area_km2')
        }
        if (facts.elevation_m != null) {
          addCandidate(prov, 'elevation_m', 'wikidata', facts.elevation_m)
          if (c.elevation_m == null || stale('elevation_m', c.elevation_m)) update.elevation_m = facts.elevation_m
          else if (applyRankFix('elevation_m', c.elevation_m, facts.elevation_m, provBefore, update)) rankFixed.push('elevation_m')
        }
        if (facts.founded_year != null) {
          addCandidate(prov, 'founded_year', 'wikidata', facts.founded_year)
          if (c.founded_year == null || stale('founded_year', c.founded_year)) update.founded_year = facts.founded_year
        }
        if (facts.official_website) {
          addCandidate(prov, 'official_website', 'wikidata', facts.official_website)
          if (!c.official_website || stale('official_website', c.official_website)) update.official_website = facts.official_website
        }

        // Columns that were at literal 0% before this change.
        if (facts.postal_codes?.length) {
          addCandidate(prov, 'postal_codes', 'wikidata', facts.postal_codes)
          if (isEmptyArr(c.postal_codes) || stale('postal_codes', c.postal_codes)) update.postal_codes = facts.postal_codes
          markResolved(state, 'postal_codes', 'wikidata')
        } else { clearIfStale('postal_codes', c.postal_codes, undefined); bumpMiss(state, 'postal_codes', 'wikidata') }

        if (facts.area_codes?.length) {
          addCandidate(prov, 'area_codes', 'wikidata', facts.area_codes)
          if (isEmptyArr(c.area_codes) || stale('area_codes', c.area_codes)) update.area_codes = facts.area_codes
          markResolved(state, 'area_codes', 'wikidata')
        } else { clearIfStale('area_codes', c.area_codes, undefined); bumpMiss(state, 'area_codes', 'wikidata') }

        // QID-valued fields resolve their labels in one batched call.
        const refQids = [
          ...facts.refs.sister_cities, ...facts.refs.local_language, ...facts.refs.mayor,
          ...facts.refs.climate_type, ...facts.refs.economy_sectors,
        ]
        const labels = refQids.length
          ? await withCircuitBreaker(supabase, 'wikidata.api', () => resolveLabels(wdFetch, refQids, labelCache))
          : new Map<string, string>()
        const named = applyLabels(facts.refs, labels)

        if (named.sister_cities?.length) {
          addCandidate(prov, 'sister_cities', 'wikidata', named.sister_cities)
          if (isEmptyArr(c.sister_cities) || stale('sister_cities', c.sister_cities)) update.sister_cities = named.sister_cities
          markResolved(state, 'sister_cities', 'wikidata')
        } else { clearIfStale('sister_cities', c.sister_cities, undefined); bumpMiss(state, 'sister_cities', 'wikidata') }

        if (named.local_language) {
          addCandidate(prov, 'local_language', 'wikidata', named.local_language)
          if (!c.local_language || stale('local_language', c.local_language)) update.local_language = named.local_language
          markResolved(state, 'local_language', 'wikidata')
        } else { clearIfStale('local_language', c.local_language, undefined); bumpMiss(state, 'local_language', 'wikidata') }

        if (named.mayor) {
          addCandidate(prov, 'mayor', 'wikidata', named.mayor)
          if (!c.mayor || stale('mayor', c.mayor)) update.mayor = named.mayor
          markResolved(state, 'mayor', 'wikidata')
        } else {
          // Expected for most cities: every P6 statement carries an end date, and
          // an ended term must never be published as the current mayor.
          clearIfStale('mayor', c.mayor, undefined)
          bumpMiss(state, 'mayor', 'wikidata')
        }

        if (named.climate_type) {
          addCandidate(prov, 'climate_type', 'wikidata', named.climate_type)
          if (!c.climate_type || stale('climate_type', c.climate_type)) update.climate_type = named.climate_type
          markResolved(state, 'climate_type', 'wikidata')
        } else { clearIfStale('climate_type', c.climate_type, undefined); bumpMiss(state, 'climate_type', 'wikidata') }

        if (named.economy_sectors?.length) {
          addCandidate(prov, 'economy_sectors', 'wikidata', named.economy_sectors)
          if (isEmptyArr(c.economy_sectors) || stale('economy_sectors', c.economy_sectors)) update.economy_sectors = named.economy_sectors
          markResolved(state, 'economy_sectors', 'wikidata')
        } else { clearIfStale('economy_sectors', c.economy_sectors, undefined); bumpMiss(state, 'economy_sectors', 'wikidata') }
      }

      // The QID/title cache is infrastructure, not a data fill — excluding it
      // keeps `updated` an honest count of columns a reader would notice.
      const filled = Object.keys(update).filter(k => k !== 'wikidata_qid' && k !== 'wikipedia_title')

      // --- 5. Write -------------------------------------------------------
      // last_refreshed_at is stamped on EVERY visit, even when nothing was
      // filled. It is not bookkeeping — it is the selector's round-robin cursor
      // (cities_due_for_refresh orders by last_refreshed_at ASC NULLS FIRST). An
      // earlier revision skipped the write when no column changed, to save the
      // spine + profile upsert and the search_documents HNSW churn; that turned
      // every unfillable city into a permanent queue-head and the sweep stalled
      // at 0 updated per batch. The real saving is the terminal sentinel, which
      // removes exhausted cities from the pool altogether.
      if (!dryRun) {
        update.field_provenance = prov
        update.enrichment_status = state
        update.last_refreshed_at = new Date().toISOString()
        let { error: upErr } = await supabase.from('cities').update(update).eq('id', c.id)

        // Two live cities resolving to the same Wikidata entity — caught by
        // uq_cities_wikidata_qid. In practice these are duplicate ROWS for one
        // real city ("Athen"/"Athens", "Distrito Federal"/"Mexico City"), so the
        // facts are correct for both and worth keeping; only the unique QID can
        // be held by one row. Verified on the live conflicts: Athens→Haris
        // Doukas, Ghent→Mathias De Clercq, Freiburg→Martin Horn are all right.
        // Flag the row — the collision is a genuine duplicate signal for dedup.
        if (upErr && /uq_cities_wikidata_qid/.test(upErr.message)) {
          delete update.wikidata_qid
          state.wikidata_link = {
            state: 'pending', source: 'wikidata', at: new Date().toISOString(), qid: qid ?? undefined,
          }
          update.enrichment_status = { ...state, qid_conflict: { qid, at: new Date().toISOString() } }
          update.needs_attention = true
          ;({ error: upErr } = await supabase.from('cities').update(update).eq('id', c.id))
          missReason = `qid_conflict:${qid}`
        }
        if (upErr) throw new Error(upErr.message)
        await supabase.from('city_quality_signals').insert({
          city_id: c.id, signal_type: 'enrichment',
          value: Math.min(1, filled.length / 8),
          source: STEP,
          details: { filled, qid, wikipedia: !!enwikiTitle, wikidata: !!facts, rank_fixed: rankFixed },
        }).then(() => {}, () => {})
      }

      if (filled.length) { status = 'done'; updated++ }
      else {
        status = 'skipped'; skipped++
        missReason ??= qid ? 'no_empty_fields' : 'unresolved'
      }
      results.push({ id: c.id, name: c.name, qid, filled, rank_fixed: rankFixed, reason: missReason })
    } catch (e) {
      if (e instanceof CircuitOpenError) {
        return jsonResponse({ processed, updated, skipped, failed, circuit_open: e.apiName, results }, 200, req)
      }
      status = 'failed'; failed++
      // enrichment_log is service-role-only and is the durable diagnostic
      // record, so it keeps the raw text; the HTTP body gets the safe code.
      missReason = (e instanceof Error ? e.message : String(e)).slice(0, 200)
      results.push({ id: c.id, name: c.name, status: 'error', error: errCode(e) })
    }

    processed++
    if (!dryRun) {
      // Every non-done outcome now carries a machine-readable reason. The old
      // code wrote a bare `skipped`, which is why 2,921 identical rows over 30
      // days were indistinguishable from "already complete".
      await supabase.from('enrichment_log').insert({
        entity_type: 'city', entity_id: c.id, step: STEP, status,
        error_message: status === 'done' ? null : missReason,
        duration_ms: Date.now() - started,
      }).then(() => {}, () => {})
    }
  }

  return jsonResponse({ phase: 'link', processed, updated, skipped, failed, aliases_written: aliasesWritten, dry_run: dryRun, results }, 200, req)
}

// ------------------------------------------------------------------ phase: sparql

async function runSparql(supabase: Db, query: string): Promise<SparqlBinding[]> {
  const d = await withCircuitBreaker(supabase, 'wikidata.sparql', async () => {
    const r = await fetchJson(sparqlUrl(query), SPARQL_TIMEOUT, 'application/sparql-results+json')
    if (!r) throw new Error('wdqs_request_failed')
    return r
  })
  return (d?.results as { bindings?: SparqlBinding[] } | undefined)?.bindings ?? []
}

/**
 * Drop every code that public.airport_service does not vouch for. Returns
 * undefined when nothing survives, so the caller records a miss rather than a
 * resolution -- a city whose only P931 result is a railway station has not been
 * answered, and must stay eligible for a later pass.
 */
function gateAirports(ap: AirportPick | undefined, gate: Map<string, string>): AirportPick | undefined {
  if (!ap) return undefined
  const airport_codes = ap.airport_codes.filter(c => gate.has(c))
  if (!airport_codes.length) return undefined
  const major_airport_code = ap.major_airport_code && gate.has(ap.major_airport_code)
    ? ap.major_airport_code
    : undefined
  return { airport_codes, major_airport_code, labels: airport_codes.map(c => gate.get(c) ?? '') }
}

async function runSparqlPhase(
  supabase: Db, req: Request, rows: CityRow[], dryRun: boolean, cap: number,
): Promise<Response> {
  // rows is over-fetched (see selectLimit); take the first `cap` linked cities.
  const byQid = new Map<string, CityRow>()
  for (const r of rows) {
    if (!r.wikidata_qid || byQid.has(r.wikidata_qid)) continue
    if (byQid.size >= cap) break
    byQid.set(r.wikidata_qid, r)
  }
  if (!byQid.size) {
    return jsonResponse({ phase: 'sparql', processed: 0, message: 'no linked cities in batch' }, 200, req)
  }

  const airports = new Map<string, AirportPick>()
  const universities = new Map<string, string[]>()
  const capitals = new Map<string, CapitalPick>()
  const qids = [...byQid.keys()]

  try {
    for (let i = 0; i < qids.length; i += SPARQL_CHUNK) {
      const chunk = qids.slice(i, i + SPARQL_CHUNK)
      for (const [q, v] of pickAirports(await runSparql(supabase, airportQuery(chunk)))) airports.set(q, v)
      for (const [q, v] of pickUniversities(await runSparql(supabase, universityQuery(chunk)))) universities.set(q, v)
      for (const [q, v] of pickCapitals(await runSparql(supabase, capitalQuery(chunk)))) capitals.set(q, v)
    }
  } catch (e) {
    if (e instanceof CircuitOpenError) {
      return jsonResponse({ phase: 'sparql', circuit_open: e.apiName, processed: 0 }, 200, req)
    }
    return jsonResponse({ phase: 'sparql', error: errCode(e) }, 200, req)
  }

  // P931 ("place served by transport hub") says nothing about passenger traffic,
  // so on its own it wrote rail stations (Boston ZTO), heliports (Algeciras AEI),
  // closed airports (Berlin SXF) and GA fields (Houston EFD) into
  // cities.airport_codes -- 27% of the corpus, measured 2026-08-25. Every code
  // is checked against public.airport_service (OurAirports, scheduled passenger
  // service only) before it is written. The table also supplies the airport name,
  // which is more reliable than the Wikidata label and is positionally safe.
  const gate = new Map<string, string>()
  const seenCodes = [...new Set([...airports.values()].flatMap(a => a.airport_codes))]
  if (seenCodes.length) {
    const { data: gateRows, error: gateErr } = await supabase
      .from('airport_service').select('iata_code, name').in('iata_code', seenCodes)
    // Fail CLOSED: an unreadable gate must not be treated as "everything passes".
    if (gateErr) return jsonResponse({ phase: 'sparql', error: 'airport_gate_unavailable', processed: 0 }, 200, req)
    for (const g of (gateRows ?? []) as Array<{ iata_code: string; name: string }>) gate.set(g.iata_code, g.name)
  }

  let updated = 0, skipped = 0
  const results: Array<Record<string, unknown>> = []

  for (const [qid, c] of byQid) {
    const started = Date.now()
    const prov: Prov = { ...(c.field_provenance ?? {}) }
    const state: Status = { ...(c.enrichment_status ?? {}) }
    const update: Record<string, unknown> = {}

    const ap = gateAirports(airports.get(qid), gate)
    if (ap?.airport_codes.length) {
      addCandidate(prov, 'airport_codes', 'wikidata.sparql', ap.airport_codes)
      if (isEmptyArr(c.airport_codes)) update.airport_codes = ap.airport_codes
      if (ap.major_airport_code) {
        addCandidate(prov, 'major_airport_code', 'wikidata.sparql', ap.major_airport_code)
        if (!c.major_airport_code) update.major_airport_code = ap.major_airport_code
      }
      // transportation_info carries ONLY what we actually know: the airports.
      // No "well-connected bus network" — that has no source and would be
      // invention. CityTravelTab renders every key of this object as a visible
      // label/value row, so provenance lives in field_provenance, not in here.
      if (!c.transportation_info || Object.keys(c.transportation_info).length === 0) {
        const majorName = ap.major_airport_code ? gate.get(ap.major_airport_code) : undefined
        const line = ap.major_airport_code
          ? `${ap.major_airport_code}${majorName ? ` — ${majorName}` : ''}`
          : ap.airport_codes.join(', ')
        update.transportation_info = { airports: line }
        addCandidate(prov, 'transportation_info', 'wikidata.sparql', update.transportation_info)
      }
      markResolved(state, 'airports', 'wikidata.sparql', qid)
    } else {
      bumpMiss(state, 'airports', 'wikidata.sparql')
    }

    const uni = universities.get(qid)
    if (uni?.length) {
      addCandidate(prov, 'universities', 'wikidata.sparql', uni)
      if (isEmptyArr(c.universities)) update.universities = uni
      markResolved(state, 'universities', 'wikidata.sparql', qid)
    } else {
      bumpMiss(state, 'universities', 'wikidata.sparql')
    }

    // Capital scope. Unlike every other field here this one is NOT fill-if-empty,
    // because `is_regional_capital` is NOT NULL DEFAULT false and an unprobed row
    // is therefore indistinguishable from a probed negative. The state key
    // `capital_scope` carries that distinction instead, and it is what decides
    // whether this is a first write or a correction.
    //
    // Every city in this batch was asked (both catch branches above return, so
    // the loop is only reached when all chunks succeeded), so a city absent from
    // `capitals` is a NEGATIVE finding — Wikidata holds no live P1376 for it —
    // not an unanswered one. `bumpMiss` would be wrong here: it would eventually
    // stamp data_unavailable on a city we have a perfectly good answer for.
    const cap = capitals.get(qid)
    const wantRegional = cap?.regional ?? false
    const wantRegionOf = cap?.regionOf ?? null
    // Read the guard BEFORE addCandidate: addCandidate rewrites prov[field] with
    // the fresh value, so a guard read afterwards compares the NEW value against
    // the OLD column and concludes a human curated it. That is the trap that let
    // Buenos Aires keep a wrong mayor through two relink passes.
    const capIsOurs = state.capital_scope?.state !== 'resolved'
      || ourWikidataValue(prov, 'is_regional_capital', c.is_regional_capital ?? false)
    addCandidate(prov, 'is_regional_capital', 'wikidata.sparql', wantRegional)
    if (wantRegionOf) addCandidate(prov, 'capital_of_region', 'wikidata.sparql', wantRegionOf)
    if (capIsOurs) {
      if ((c.is_regional_capital ?? false) !== wantRegional) update.is_regional_capital = wantRegional
      if ((c.capital_of_region ?? null) !== wantRegionOf) update.capital_of_region = wantRegionOf
    }
    // Written as one assignment rather than markResolved + a follow-up mutation,
    // so `detail` does not depend on how the Status index type narrows.
    //
    // `national` is RECORDED, never applied: `is_capital` is derived from
    // `countries.capital` and keeps exactly one writer. A Wikidata disagreement
    // is something to look at, not something to act on automatically.
    state.capital_scope = {
      state: 'resolved',
      source: 'wikidata.sparql',
      at: new Date().toISOString(),
      qid,
      detail: {
        national: cap?.national ?? false,
        regional: wantRegional,
        units: cap?.units ?? [],
      },
    }

    const filled = Object.keys(update)
    // Stamp last_refreshed_at on every visit — see the note in runLinkPhase; it
    // is the selector's cursor, not bookkeeping.
    if (!dryRun) {
      update.field_provenance = prov
      update.enrichment_status = state
      update.last_refreshed_at = new Date().toISOString()
      await supabase.from('cities').update(update).eq('id', c.id)
      await supabase.from('enrichment_log').insert({
        entity_type: 'city', entity_id: c.id, step: `${STEP}:sparql`,
        status: filled.length ? 'done' : 'skipped',
        error_message: filled.length ? null : 'no_sparql_results',
        duration_ms: Date.now() - started,
      }).then(() => {}, () => {})
    }
    if (filled.length) updated++; else skipped++
    results.push({ id: c.id, name: c.name, qid, filled })
  }

  return jsonResponse(
    { phase: 'sparql', processed: byQid.size, updated, skipped, dry_run: dryRun, results }, 200, req,
  )
}
