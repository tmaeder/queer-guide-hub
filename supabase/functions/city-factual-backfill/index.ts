// city-factual-backfill — auto-apply factual enrichment for published cities.
// Pulls a prioritized batch from cities_due_for_refresh(), fetches free sources
// (Wikipedia REST summary, Wikidata claims, OSM Nominatim), fills ONLY empty
// columns (never overwrites curated data), records per-source candidates into
// cities.field_provenance for city-corroboration to fuse, and stamps
// last_refreshed_at. Each source is circuit-broken. No LLM.
//
// Auth: X-Webhook-Secret (cron) or admin/service-role. Body: { batch_limit?, dry_run?, city_ids? }.

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'

const DEFAULT_BATCH_LIMIT = 120
const STEP = 'city-factual-backfill'
const WP_UA = 'QueerGuideBot/1.0 (https://queer.guide; contact@queer.guide)'
const FETCH_TIMEOUT = 10_000

interface WpSummary { extract: string; thumbnail?: string; lat?: number; lon?: number; qid?: string }

async function fetchJson(url: string, headers: Record<string, string>): Promise<any | null> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT)
  try {
    const r = await fetch(url, { headers, signal: ctl.signal })
    if (!r.ok) return null
    return await r.json()
  } catch { return null } finally { clearTimeout(t) }
}

async function fetchWikipedia(query: string): Promise<WpSummary | null> {
  const d = await fetchJson(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
    { 'User-Agent': WP_UA, Accept: 'application/json' },
  )
  if (!d || d.type === 'disambiguation') return null
  return {
    extract: d.extract ?? '',
    thumbnail: d.thumbnail?.source ?? undefined,
    lat: d.coordinates?.lat,
    lon: d.coordinates?.lon,
    qid: d.wikibase_item ?? undefined,
  }
}

// Resolve the Wikidata QID for a Wikipedia title (summary endpoint omits it on some pages).
async function fetchQid(title: string): Promise<string | null> {
  const d = await fetchJson(
    `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&format=json&titles=${encodeURIComponent(title)}`,
    { 'User-Agent': WP_UA, Accept: 'application/json' },
  )
  const pages = d?.query?.pages
  if (!pages) return null
  for (const k of Object.keys(pages)) {
    const qid = pages[k]?.pageprops?.wikibase_item
    if (qid) return qid
  }
  return null
}

interface WdFacts { population?: number; area_km2?: number; elevation_m?: number; founded_year?: number; official_website?: string }

async function fetchWikidata(qid: string): Promise<WdFacts | null> {
  const d = await fetchJson(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(qid)}&props=claims&format=json`,
    { 'User-Agent': WP_UA, Accept: 'application/json' },
  )
  const claims = d?.entities?.[qid]?.claims
  if (!claims) return null
  const qty = (p: string): number | undefined => {
    const v = claims[p]?.[0]?.mainsnak?.datavalue?.value?.amount
    if (v == null) return undefined
    const n = parseFloat(String(v).replace(/^\+/, ''))
    return isFinite(n) ? n : undefined
  }
  const out: WdFacts = {}
  const pop = qty('P1082'); if (pop != null) out.population = Math.round(pop)
  const area = qty('P2046'); if (area != null) out.area_km2 = Math.round(area * 100) / 100
  const elev = qty('P2044'); if (elev != null) out.elevation_m = Math.round(elev)
  const tRaw = claims['P571']?.[0]?.mainsnak?.datavalue?.value?.time as string | undefined
  if (tRaw) { const y = parseInt(tRaw.slice(1, 5), 10); if (isFinite(y) && y > 0) out.founded_year = y }
  const site = claims['P856']?.[0]?.mainsnak?.datavalue?.value
  if (typeof site === 'string' && /^https?:\/\//i.test(site)) out.official_website = site
  return out
}

async function fetchOsmCoords(name: string, country?: string): Promise<{ lat: number; lon: number } | null> {
  const q = country ? `${name}, ${country}` : name
  const d = await fetchJson(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&city=${encodeURIComponent(name)}${country ? `&country=${encodeURIComponent(country)}` : ''}`,
    { 'User-Agent': WP_UA, Accept: 'application/json' },
  )
  const hit = Array.isArray(d) && d[0]
  if (hit && hit.lat && hit.lon) return { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon) }
  return null
}

type Prov = Record<string, { candidates: { source: string; value: unknown }[] }>
function addCandidate(prov: Prov, field: string, source: string, value: unknown) {
  if (value == null) return
  if (!prov[field]) prov[field] = { candidates: [] }
  const existing = prov[field].candidates.filter(c => c.source !== source)
  existing.push({ source, value })
  prov[field].candidates = existing
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  const secret = Deno.env.get('CITY_QUALITY_WEBHOOK_SECRET')
  const provided = req.headers.get('X-Webhook-Secret')
  if (!(secret && provided && provided === secret)) {
    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth
  }

  const body = await req.json().catch(() => ({}))
  const batchLimit: number = Math.min(600, body.batch_limit ?? DEFAULT_BATCH_LIMIT)
  const dryRun: boolean = body.dry_run ?? false
  const cityIds: string[] | undefined = body.city_ids

  // Work-list: explicit ids or prioritized batch from the refresh selector.
  let ids: string[] = []
  if (cityIds?.length) {
    ids = cityIds
  } else {
    const { data: due, error: dueErr } = await supabase.rpc('cities_due_for_refresh', { p_limit: batchLimit })
    if (dueErr) return jsonResponse({ error: dueErr.message, success: false }, 500, req)
    ids = (due ?? []).map((r: { id: string }) => r.id)
  }
  if (!ids.length) return jsonResponse({ processed: 0, message: 'nothing due' }, 200, req)

  const { data: cities, error } = await supabase
    .from('cities')
    .select('id, name, slug, latitude, longitude, description, image_url, curated_image_url, population, area_km2, elevation_m, founded_year, official_website, field_provenance, country_id, countries(name)')
    .in('id', ids)
    .is('duplicate_of_id', null)
  if (error) return jsonResponse({ error: error.message, success: false }, 500, req)

  let processed = 0, updated = 0, skipped = 0
  const results: Array<Record<string, unknown>> = []

  for (const c of cities ?? []) {
    const started = Date.now()
    const country = (c.countries as { name?: string } | null)?.name
    let status = 'skipped'
    try {
      const prov: Prov = { ...(c.field_provenance as Prov ?? {}) }
      const update: Record<string, unknown> = {}

      // --- Wikipedia (description, image, coords) ---
      let wp: WpSummary | null = null
      try {
        wp = await withCircuitBreaker(supabase, 'wikipedia.api',
          () => fetchWikipedia(country ? `${c.name}, ${country}` : c.name))
        if (!wp?.extract) wp = await fetchWikipedia(c.name)
      } catch (e) { if (e instanceof CircuitOpenError) return jsonResponse({ processed, updated, circuit_open: 'wikipedia.api', results }, 200, req); throw e }

      if (wp?.extract) {
        addCandidate(prov, 'description', 'wikipedia', wp.extract)
        if (!c.description || String(c.description).trim().length < 40) update.description = wp.extract
      }
      if (wp?.thumbnail) {
        addCandidate(prov, 'image_url', 'wikipedia', wp.thumbnail)
        if (!c.image_url && !c.curated_image_url) update.image_url = wp.thumbnail
      }
      if (typeof wp?.lat === 'number' && typeof wp?.lon === 'number') {
        addCandidate(prov, 'coords', 'wikipedia', { lat: wp.lat, lng: wp.lon })
        if (c.latitude == null || c.longitude == null) { update.latitude = wp.lat; update.longitude = wp.lon }
      }

      // --- Wikidata (population, area, elevation, founded, website) ---
      let qid = wp?.qid ?? null
      if (!qid) {
        try { qid = await withCircuitBreaker(supabase, 'wikipedia.api', () => fetchQid(country ? `${c.name}, ${country}` : c.name)) }
        catch (e) { if (e instanceof CircuitOpenError) return jsonResponse({ processed, updated, circuit_open: 'wikipedia.api', results }, 200, req); throw e }
      }
      if (qid) {
        let wd: WdFacts | null = null
        try { wd = await withCircuitBreaker(supabase, 'wikidata.api', () => fetchWikidata(qid!)) }
        catch (e) { if (e instanceof CircuitOpenError) return jsonResponse({ processed, updated, circuit_open: 'wikidata.api', results }, 200, req); throw e }
        if (wd) {
          if (wd.population != null) { addCandidate(prov, 'population', 'wikidata', wd.population); if (c.population == null) update.population = wd.population }
          if (wd.area_km2 != null) { addCandidate(prov, 'area_km2', 'wikidata', wd.area_km2); if (c.area_km2 == null) update.area_km2 = wd.area_km2 }
          if (wd.elevation_m != null) { addCandidate(prov, 'elevation_m', 'wikidata', wd.elevation_m); if (c.elevation_m == null) update.elevation_m = wd.elevation_m }
          if (wd.founded_year != null) { addCandidate(prov, 'founded_year', 'wikidata', wd.founded_year); if (c.founded_year == null) update.founded_year = wd.founded_year }
          if (wd.official_website) { addCandidate(prov, 'official_website', 'wikidata', wd.official_website); if (!c.official_website) update.official_website = wd.official_website }
        }
      }

      // --- OSM coords fallback (only if still missing) ---
      if ((c.latitude == null || c.longitude == null) && update.latitude == null) {
        let osm: { lat: number; lon: number } | null = null
        try { osm = await withCircuitBreaker(supabase, 'osm.nominatim', () => fetchOsmCoords(c.name, country)) }
        catch (e) { if (e instanceof CircuitOpenError) { /* skip coords, continue */ } else throw e }
        if (osm) { addCandidate(prov, 'coords', 'osm', { lat: osm.lat, lng: osm.lon }); update.latitude = osm.lat; update.longitude = osm.lon }
      }

      const fieldsFilled = Object.keys(update)
      update.field_provenance = prov
      update.last_refreshed_at = new Date().toISOString()

      if (!dryRun) {
        await supabase.from('cities').update(update).eq('id', c.id)
        await supabase.from('city_quality_signals').insert({
          city_id: c.id, signal_type: 'enrichment',
          value: Math.min(1, fieldsFilled.length / 6),
          source: STEP, details: { filled: fieldsFilled, sources: { wikipedia: !!wp?.extract, wikidata: !!qid } },
        })
      }
      status = fieldsFilled.length ? 'done' : 'skipped'
      if (fieldsFilled.length) updated++; else skipped++
      results.push({ id: c.id, name: c.name, filled: fieldsFilled })
    } catch (e) {
      status = 'failed'
      results.push({ id: c.id, status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
    processed++
    if (!dryRun) {
      await supabase.from('enrichment_log').insert({
        entity_type: 'city', entity_id: c.id, step: STEP, status, duration_ms: Date.now() - started,
      }).then(() => {}, () => {})
    }
  }

  return jsonResponse({ processed, updated, skipped, dry_run: dryRun, results }, 200, req)
})
