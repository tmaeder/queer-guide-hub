// city-factual-backfill — auto-apply factual enrichment for published cities.
// Pulls a prioritized batch from cities_due_for_refresh(), fetches free sources
// (Wikipedia REST summary, Wikidata claims, OSM Nominatim), fills ONLY empty
// columns (never overwrites curated data), records per-source candidates into
// cities.field_provenance for city-corroboration to fuse, and stamps
// last_refreshed_at. Each source is circuit-broken. No LLM.
//
// Auth: X-Webhook-Secret (cron) or admin/service-role. Body: { batch_limit?, dry_run?, city_ids? }.

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { hasValidWebhookSecret } from '../_shared/webhook-auth.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'

const DEFAULT_BATCH_LIMIT = 120
const STEP = 'city-factual-backfill'
const WP_UA = 'QueerGuideBot/1.0 (https://queer.guide; contact@queer.guide)'
const FETCH_TIMEOUT = 10_000

interface WpSummary { extract: string; thumbnail?: string; lat?: number; lon?: number; qid?: string }

async function fetchJson(url: string, headers: Record<string, string>): Promise<Record<string, unknown> | null> {
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
type WdClaimValue = { mainsnak?: { datavalue?: { value?: { amount?: string; time?: string } | string } } }
type WdClaims = Record<string, WdClaimValue[]>

function parseWdFacts(claims: WdClaims): WdFacts {
  const qty = (p: string): number | undefined => {
    const val = claims[p]?.[0]?.mainsnak?.datavalue?.value
    const amount = typeof val === 'object' ? val?.amount : undefined
    if (amount == null) return undefined
    const n = parseFloat(String(amount).replace(/^\+/, ''))
    return isFinite(n) ? n : undefined
  }
  const out: WdFacts = {}
  const pop = qty('P1082'); if (pop != null) out.population = Math.round(pop)
  const area = qty('P2046'); if (area != null) out.area_km2 = Math.round(area * 100) / 100
  const elev = qty('P2044'); if (elev != null) out.elevation_m = Math.round(elev)
  const tRaw571 = claims['P571']?.[0]?.mainsnak?.datavalue?.value
  const tRaw = typeof tRaw571 === 'object' ? tRaw571?.time : undefined
  if (tRaw) { const y = parseInt(tRaw.slice(1, 5), 10); if (isFinite(y) && y > 0) out.founded_year = y }
  const siteVal = claims['P856']?.[0]?.mainsnak?.datavalue?.value
  const site = typeof siteVal === 'string' ? siteVal : undefined
  if (site && /^https?:\/\//i.test(site)) out.official_website = site
  return out
}

async function fetchWikidata(qid: string): Promise<WdFacts | null> {
  const d = await fetchJson(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(qid)}&props=claims&format=json`,
    { 'User-Agent': WP_UA, Accept: 'application/json' },
  )
  const claims = d?.entities?.[qid]?.claims
  return claims ? parseWdFacts(claims) : null
}

// Fallback for cities whose name doesn't match an English Wikipedia title
// (non-English / ambiguous / disambiguated names). Resolve the Wikidata QID by
// entity search, preferring a settlement-type result that matches the country.
const PLACE_RE = /(capital|city|town|municipality|commune|village|settlement|prefecture|district|county|borough|locality|metropolis|urban)/i
async function fetchWikidataQidBySearch(name: string, country?: string): Promise<string | null> {
  const d = await fetchJson(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&uselang=en&type=item&limit=7&format=json`,
    { 'User-Agent': WP_UA, Accept: 'application/json' },
  )
  const hits = (d?.search ?? []) as Array<{ id: string; description?: string }>
  let placeFallback: string | null = null
  for (const h of hits) {
    const desc = h.description ?? ''
    if (!PLACE_RE.test(desc)) continue
    if (country && desc.toLowerCase().includes(country.toLowerCase())) return h.id  // strong country match
    if (!placeFallback) placeFallback = h.id
  }
  return placeFallback
}

// Given a QID, get the English Wikipedia sitelink title + parsed facts in one call.
async function fetchWdSitelinkAndFacts(qid: string): Promise<{ enwikiTitle?: string; facts: WdFacts } | null> {
  const d = await fetchJson(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(qid)}&props=sitelinks|claims&sitefilter=enwiki&format=json`,
    { 'User-Agent': WP_UA, Accept: 'application/json' },
  )
  const ent = d?.entities?.[qid]
  if (!ent) return null
  return { enwikiTitle: ent.sitelinks?.enwiki?.title, facts: ent.claims ? parseWdFacts(ent.claims) : {} }
}

// Full plaintext article extract by exact title (richer than the REST summary).
async function fetchWikipediaFullExtract(title: string): Promise<string | null> {
  const d = await fetchJson(
    `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(title)}`,
    { 'User-Agent': WP_UA, Accept: 'application/json' },
  )
  const pages = d?.query?.pages
  if (!pages) return null
  for (const k of Object.keys(pages)) {
    const ex = pages[k]?.extract
    if (typeof ex === 'string' && ex.trim().length > 80) return ex.slice(0, 1200)
  }
  return null
}

async function fetchOsmCoords(name: string, country?: string): Promise<{ lat: number; lon: number } | null> {
  const _q = country ? `${name}, ${country}` : name
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
  if (!hasValidWebhookSecret(req, 'CITY_QUALITY_WEBHOOK_SECRET')) {
    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth
  }

  const body = await req.json().catch(() => ({}))
  const batchLimit: number = Math.min(600, body.batch_limit ?? DEFAULT_BATCH_LIMIT)
  const dryRun: boolean = body.dry_run ?? false
  const cityIds: string[] | undefined = body.city_ids

  // Work-list: explicit ids or prioritized batch from the refresh selector.
  let ids: string[]
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
    let status: string
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

      let qid = wp?.qid ?? null
      let wd: WdFacts | null = null
      const co = () => jsonResponse({ processed, updated, circuit_open: true, results }, 200, req)

      // --- Wikidata-search fallback when the English-title path found no description ---
      // (non-English / ambiguous / disambiguated city names).
      const haveDesc = !!update.description || (c.description != null && String(c.description).trim().length >= 40)
      if (!haveDesc) {
        if (!qid) {
          try { qid = await withCircuitBreaker(supabase, 'wikidata.api', () => fetchWikidataQidBySearch(c.name, country)) }
          catch (e) { if (e instanceof CircuitOpenError) return co(); throw e }
        }
        if (qid) {
          let sl: { enwikiTitle?: string; facts: WdFacts } | null = null
          try { sl = await withCircuitBreaker(supabase, 'wikidata.api', () => fetchWdSitelinkAndFacts(qid!)) }
          catch (e) { if (e instanceof CircuitOpenError) return co(); throw e }
          if (sl) {
            wd = sl.facts
            if (sl.enwikiTitle) {
              let rich: string | null = null
              try { rich = await withCircuitBreaker(supabase, 'wikipedia.api', () => fetchWikipediaFullExtract(sl!.enwikiTitle!)) }
              catch (e) { if (e instanceof CircuitOpenError) return co(); throw e }
              if (rich) { addCandidate(prov, 'description', 'wikipedia', rich); update.description = rich }
              let sum: WpSummary | null = null
              try { sum = await fetchWikipedia(sl.enwikiTitle) } catch { /* best-effort */ }
              if (sum?.thumbnail) { addCandidate(prov, 'image_url', 'wikipedia', sum.thumbnail); if (!c.image_url && !c.curated_image_url && !update.image_url) update.image_url = sum.thumbnail }
              if (typeof sum?.lat === 'number' && typeof sum?.lon === 'number') {
                addCandidate(prov, 'coords', 'wikipedia', { lat: sum.lat, lng: sum.lon })
                if ((c.latitude == null || c.longitude == null) && update.latitude == null) { update.latitude = sum.lat; update.longitude = sum.lon }
              }
            }
          }
        }
      }

      // --- Wikidata facts (population, area, elevation, founded, website) ---
      if (!qid) {
        try { qid = await withCircuitBreaker(supabase, 'wikipedia.api', () => fetchQid(country ? `${c.name}, ${country}` : c.name)) }
        catch (e) { if (e instanceof CircuitOpenError) return co(); throw e }
      }
      if (qid && !wd) {
        try { wd = await withCircuitBreaker(supabase, 'wikidata.api', () => fetchWikidata(qid!)) }
        catch (e) { if (e instanceof CircuitOpenError) return co(); throw e }
      }
      if (wd) {
        if (wd.population != null) { addCandidate(prov, 'population', 'wikidata', wd.population); if (c.population == null) update.population = wd.population }
        if (wd.area_km2 != null) { addCandidate(prov, 'area_km2', 'wikidata', wd.area_km2); if (c.area_km2 == null) update.area_km2 = wd.area_km2 }
        if (wd.elevation_m != null) { addCandidate(prov, 'elevation_m', 'wikidata', wd.elevation_m); if (c.elevation_m == null) update.elevation_m = wd.elevation_m }
        if (wd.founded_year != null) { addCandidate(prov, 'founded_year', 'wikidata', wd.founded_year); if (c.founded_year == null) update.founded_year = wd.founded_year }
        if (wd.official_website) { addCandidate(prov, 'official_website', 'wikidata', wd.official_website); if (!c.official_website) update.official_website = wd.official_website }
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
