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
//     serving the city (P931 + P238) and universities located in it. WDQS is
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
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { cityNameCandidates } from '../_shared/city-name-normalize.ts'
import {
  airportQuery, applyLabels, parseCityFacts, pickAirports, pickUniversities,
  resolveLabels, sparqlUrl, universityQuery,
  type AirportPick, type Claims, type CityWdFacts, type Json, type SparqlBinding,
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

// deno-lint-ignore no-explicit-any
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

async function fetchEntity(qid: string): Promise<{ claims: Claims; enwikiTitle?: string } | null> {
  const d = await fetchJson(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(qid)}` +
    `&props=claims|sitelinks&sitefilter=enwiki&format=json`,
  )
  const ent = (d?.entities as Record<string, { claims?: Claims; sitelinks?: { enwiki?: { title?: string } } }> | undefined)?.[qid]
  if (!ent) return null
  return { claims: ent.claims ?? {}, enwikiTitle: ent.sitelinks?.enwiki?.title }
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
  field_provenance: Prov | null; enrichment_status: Status | null
  wikidata_qid: string | null; wikipedia_title: string | null
  country_id: string | null; countries: { name?: string } | null
}

const CITY_COLUMNS =
  'id, name, slug, latitude, longitude, description, image_url, curated_image_url, ' +
  'population, area_km2, elevation_m, founded_year, official_website, postal_codes, area_codes, ' +
  'sister_cities, economy_sectors, universities, local_language, mayor, climate_type, ' +
  'airport_codes, major_airport_code, transportation_info, ' +
  'field_provenance, enrichment_status, wikidata_qid, wikipedia_title, country_id, countries(name)'

const isEmptyArr = (a: unknown[] | null | undefined) => !a || a.length === 0

// ------------------------------------------------------------------ entry

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  if (!hasValidWebhookSecret(req, 'CITY_QUALITY_WEBHOOK_SECRET')) {
    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth
  }

  const body = await req.json().catch(() => ({})) as {
    phase?: string; batch_limit?: number; dry_run?: boolean; city_ids?: string[]; scope?: string
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
    const { data: due, error: dueErr } = await supabase.rpc('cities_due_for_refresh', {
      p_limit: batchLimit, p_scope: scope,
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
    ? await runSparqlPhase(supabase, req, rows, dryRun)
    : await runLinkPhase(supabase, req, rows, dryRun)
})

// ------------------------------------------------------------------ phase: link

async function runLinkPhase(supabase: Db, req: Request, rows: CityRow[], dryRun: boolean): Promise<Response> {
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
  let processed = 0, updated = 0, skipped = 0, failed = 0
  const results: Array<Record<string, unknown>> = []

  for (const c of rows) {
    const started = Date.now()
    let status = 'skipped'
    let missReason: string | null = null
    let filled: string[] = []

    try {
      const prov: Prov = { ...(c.field_provenance ?? {}) }
      const state: Status = { ...(c.enrichment_status ?? {}) }
      const update: Record<string, unknown> = {}
      const rankFixed: string[] = []
      const country = c.countries?.name ?? null

      // --- 1. QID: cached, or resolved from cleaned name candidates -------
      let qid = c.wikidata_qid
      let enwikiTitle = c.wikipedia_title
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

      // --- 4. Group-A columns, empty-only --------------------------------
      if (facts) {
        if (facts.population != null) {
          addCandidate(prov, 'population', 'wikidata', facts.population)
          if (c.population == null) update.population = facts.population
          else if (applyRankFix('population', c.population, facts.population, prov, update)) rankFixed.push('population')
        }
        if (facts.area_km2 != null) {
          addCandidate(prov, 'area_km2', 'wikidata', facts.area_km2)
          if (c.area_km2 == null) update.area_km2 = facts.area_km2
          else if (applyRankFix('area_km2', c.area_km2, facts.area_km2, prov, update)) rankFixed.push('area_km2')
        }
        if (facts.elevation_m != null) {
          addCandidate(prov, 'elevation_m', 'wikidata', facts.elevation_m)
          if (c.elevation_m == null) update.elevation_m = facts.elevation_m
          else if (applyRankFix('elevation_m', c.elevation_m, facts.elevation_m, prov, update)) rankFixed.push('elevation_m')
        }
        if (facts.founded_year != null) {
          addCandidate(prov, 'founded_year', 'wikidata', facts.founded_year)
          if (c.founded_year == null) update.founded_year = facts.founded_year
        }
        if (facts.official_website) {
          addCandidate(prov, 'official_website', 'wikidata', facts.official_website)
          if (!c.official_website) update.official_website = facts.official_website
        }

        // Columns that were at literal 0% before this change.
        if (facts.postal_codes?.length) {
          addCandidate(prov, 'postal_codes', 'wikidata', facts.postal_codes)
          if (isEmptyArr(c.postal_codes)) update.postal_codes = facts.postal_codes
          markResolved(state, 'postal_codes', 'wikidata')
        } else bumpMiss(state, 'postal_codes', 'wikidata')

        if (facts.area_codes?.length) {
          addCandidate(prov, 'area_codes', 'wikidata', facts.area_codes)
          if (isEmptyArr(c.area_codes)) update.area_codes = facts.area_codes
          markResolved(state, 'area_codes', 'wikidata')
        } else bumpMiss(state, 'area_codes', 'wikidata')

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
          if (isEmptyArr(c.sister_cities)) update.sister_cities = named.sister_cities
          markResolved(state, 'sister_cities', 'wikidata')
        } else bumpMiss(state, 'sister_cities', 'wikidata')

        if (named.local_language) {
          addCandidate(prov, 'local_language', 'wikidata', named.local_language)
          if (!c.local_language) update.local_language = named.local_language
          markResolved(state, 'local_language', 'wikidata')
        } else bumpMiss(state, 'local_language', 'wikidata')

        if (named.mayor) {
          addCandidate(prov, 'mayor', 'wikidata', named.mayor)
          if (!c.mayor) update.mayor = named.mayor
          markResolved(state, 'mayor', 'wikidata')
        } else {
          // Expected for most cities: every P6 statement carries an end date, and
          // an ended term must never be published as the current mayor.
          bumpMiss(state, 'mayor', 'wikidata')
        }

        if (named.climate_type) {
          addCandidate(prov, 'climate_type', 'wikidata', named.climate_type)
          if (!c.climate_type) update.climate_type = named.climate_type
          markResolved(state, 'climate_type', 'wikidata')
        } else bumpMiss(state, 'climate_type', 'wikidata')

        if (named.economy_sectors?.length) {
          addCandidate(prov, 'economy_sectors', 'wikidata', named.economy_sectors)
          if (isEmptyArr(c.economy_sectors)) update.economy_sectors = named.economy_sectors
          markResolved(state, 'economy_sectors', 'wikidata')
        } else bumpMiss(state, 'economy_sectors', 'wikidata')
      }

      filled = Object.keys(update).filter(k => k !== 'wikidata_qid' && k !== 'wikipedia_title')

      // --- 5. Write. Never a no-op UPDATE. -------------------------------
      // The old code stamped last_refreshed_at unconditionally, so ~90 cities a
      // day each paid a spine upsert + profile upsert + HNSW delete/insert just
      // to record that nothing had happened.
      const stateChanged = JSON.stringify(state) !== JSON.stringify(c.enrichment_status ?? {})
      const hasWrite = Object.keys(update).length > 0 || stateChanged

      if (hasWrite && !dryRun) {
        update.field_provenance = prov
        update.enrichment_status = state
        update.last_refreshed_at = new Date().toISOString()
        const { error: upErr } = await supabase.from('cities').update(update).eq('id', c.id)
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
      missReason = (e instanceof Error ? e.message : String(e)).slice(0, 200)
      results.push({ id: c.id, name: c.name, status: 'error', error: missReason })
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

  return jsonResponse({ phase: 'link', processed, updated, skipped, failed, dry_run: dryRun, results }, 200, req)
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

async function runSparqlPhase(supabase: Db, req: Request, rows: CityRow[], dryRun: boolean): Promise<Response> {
  const byQid = new Map<string, CityRow>()
  for (const r of rows) if (r.wikidata_qid) byQid.set(r.wikidata_qid, r)
  if (!byQid.size) {
    return jsonResponse({ phase: 'sparql', processed: 0, message: 'no linked cities in batch' }, 200, req)
  }

  const airports = new Map<string, AirportPick>()
  const universities = new Map<string, string[]>()
  const qids = [...byQid.keys()]

  try {
    for (let i = 0; i < qids.length; i += SPARQL_CHUNK) {
      const chunk = qids.slice(i, i + SPARQL_CHUNK)
      for (const [q, v] of pickAirports(await runSparql(supabase, airportQuery(chunk)))) airports.set(q, v)
      for (const [q, v] of pickUniversities(await runSparql(supabase, universityQuery(chunk)))) universities.set(q, v)
    }
  } catch (e) {
    if (e instanceof CircuitOpenError) {
      return jsonResponse({ phase: 'sparql', circuit_open: e.apiName, processed: 0 }, 200, req)
    }
    return jsonResponse({ phase: 'sparql', error: (e instanceof Error ? e.message : String(e)) }, 200, req)
  }

  let updated = 0, skipped = 0
  const results: Array<Record<string, unknown>> = []

  for (const [qid, c] of byQid) {
    const started = Date.now()
    const prov: Prov = { ...(c.field_provenance ?? {}) }
    const state: Status = { ...(c.enrichment_status ?? {}) }
    const update: Record<string, unknown> = {}

    const ap = airports.get(qid)
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
        const line = ap.major_airport_code
          ? `${ap.major_airport_code}${ap.labels[0] ? ` — ${ap.labels[0]}` : ''}`
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

    const filled = Object.keys(update)
    const stateChanged = JSON.stringify(state) !== JSON.stringify(c.enrichment_status ?? {})
    if ((filled.length || stateChanged) && !dryRun) {
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
