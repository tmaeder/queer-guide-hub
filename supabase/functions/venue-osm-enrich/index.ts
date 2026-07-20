// venue-osm-enrich — Nominatim lookup for verified / high-quality venues that
// are missing coordinates (and, via extratags, a website). Free API, strict
// etiquette: sequential requests, 1.1s apart, identifying User-Agent, small
// batches (pg_cron trickle lane). Overpass (contact:*/addr:* tags) is a
// deliberate follow-up — this function stays Nominatim-only to keep the rate
// budget and failure modes simple.
//
// Confidence: when the Nominatim display_name contains the venue name
// (case-insensitive) the match is treated as exact → 0.92 (auto-apply per the
// shared threshold); anything else queues to venue_review_queue. Auto-applied
// values get venue_field_provenance (source 'osm') + a venue_quality_signals
// row. enrichment_status.osm_lookup = {at, outcome} is stamped even on
// failure, so reruns skip venues looked up <90 days ago.
//
// Auth: X-Internal-Secret (cron/dispatcher) or admin. Body: { limit?, dry_run?, daily_cap? }.

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { countDoneToday, normalizeUrl } from '../_shared/enrich-harness.ts'
import { determineAction } from '../_shared/confidence-scoring.ts'

const STEP = 'venue-osm-enrich'
const DEFAULT_LIMIT = 30
const DEFAULT_DAILY_CAP = 500
const RECRAWL_DAYS = 90
const NOMINATIM_SLEEP_MS = 1_100
const GET_TIMEOUT = 10_000
const EXACT_MATCH_CONFIDENCE = 0.92
const FUZZY_MATCH_CONFIDENCE = 0.7
const UA = 'QueerGuideBot/1.0 (contact@queer.guide)'

interface NominatimResult {
  lat?: string
  lon?: string
  class?: string
  type?: string
  display_name?: string
  extratags?: Record<string, string> | null
}

async function nominatimSearch(name: string, city: string): Promise<NominatimResult | null> {
  const q = encodeURIComponent(`${name}, ${city}`)
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&extratags=1&q=${q}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GET_TIMEOUT)
  try {
    const r = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA, Accept: 'application/json' } })
    if (!r.ok) return null
    const d = await r.json()
    return Array.isArray(d) && d.length ? d[0] as NominatimResult : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// City-level results are useless as venue coordinates.
function isPlausibleVenueHit(r: NominatimResult): boolean {
  return r.class !== 'boundary' && r.type !== 'administrative'
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  const auth = await requireInternalOrAdmin(req, supabase)
  if (auth instanceof Response) return auth

  const body = await req.json().catch(() => ({}))
  const limit: number = body.limit ?? DEFAULT_LIMIT
  const dailyCap: number = body.daily_cap ?? DEFAULT_DAILY_CAP
  const dryRun: boolean = body.dry_run ?? false

  const doneToday = await countDoneToday(supabase, STEP)
  if (doneToday >= dailyCap) {
    return jsonResponse({ items_processed: 0, capped: true, done_today: doneToday, daily_cap: dailyCap }, 200, req)
  }
  const remaining = Math.min(limit, dailyCap - doneToday)

  // Over-fetch, then drop venues looked up <90 days ago in JS (the stamp lives
  // inside enrichment_status jsonb). Two .or() filters AND together.
  const { data: rows, error } = await supabase
    .from('venues')
    .select('id, name, city, website, latitude, longitude, verified, quality_score, enrichment_status')
    .is('duplicate_of_id', null)
    .or('latitude.is.null,website.is.null')
    .or('verified.eq.true,quality_score.gte.60')
    .order('quality_score', { ascending: false, nullsFirst: false })
    .limit(Math.min(remaining * 4, 200))
  if (error) return jsonResponse({ error: error.message, success: false }, 500, req)

  const cutoff = Date.now() - RECRAWL_DAYS * 86_400_000
  const venues = (rows ?? []).filter(v => {
    const at = ((v.enrichment_status ?? {}) as Record<string, { at?: string }>).osm_lookup?.at
    return !at || new Date(at).getTime() < cutoff
  }).slice(0, remaining)
  if (!venues.length) return jsonResponse({ items_processed: 0, message: 'no venues due for OSM lookup' }, 200, req)

  let applied = 0, queued = 0, skipped = 0
  const results: Array<Record<string, unknown>> = []

  for (let i = 0; i < venues.length; i++) {
    const v = venues[i]
    const started = Date.now()
    let logStatus = 'skipped'
    let outcome = 'error'
    try {
      const hit = await nominatimSearch(v.name, v.city)
      if (!hit || !isPlausibleVenueHit(hit)) {
        outcome = hit ? 'implausible_hit' : 'no_result'
        skipped++
        results.push({ id: v.id, name: v.name, status: outcome })
        await stamp(supabase, v, outcome, dryRun)
        await logStep(supabase, v.id, logStatus, started, dryRun)
        continue
      }

      const exact = (hit.display_name ?? '').toLowerCase().includes(v.name.toLowerCase())
      const confidence = exact ? EXACT_MATCH_CONFIDENCE : FUZZY_MATCH_CONFIDENCE
      const auto = determineAction(confidence) === 'auto_correct'

      const lat = Number(hit.lat), lng = Number(hit.lon)
      const geoValid = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)
      const osmWebsite = normalizeUrl(hit.extratags?.['contact:website'] ?? hit.extratags?.website ?? '')

      const proposals: Array<{ field: 'geo' | 'website'; value: Record<string, unknown> }> = []
      if (v.latitude == null && geoValid) proposals.push({ field: 'geo', value: { lat, lng } })
      if (v.website == null && osmWebsite) proposals.push({ field: 'website', value: { value: osmWebsite } })

      if (!proposals.length) {
        outcome = 'nothing_usable'
        skipped++
        results.push({ id: v.id, name: v.name, status: outcome })
        await stamp(supabase, v, outcome, dryRun)
        await logStep(supabase, v.id, logStatus, started, dryRun)
        continue
      }

      outcome = auto ? 'applied' : 'queued'
      if (dryRun) {
        results.push({
          id: v.id, name: v.name, status: 'dry_run', confidence, exact_name_match: exact,
          would: auto ? 'apply' : 'queue',
          proposals: proposals.map(p => ({ field: p.field, ...p.value })),
        })
        if (auto) applied++; else queued++
      } else {
        const at = new Date().toISOString()
        if (auto) {
          const update: Record<string, unknown> = {
            enrichment_status: { ...(v.enrichment_status ?? {}), osm_lookup: { at, outcome } },
          }
          for (const p of proposals) {
            if (p.field === 'geo') { update.latitude = lat; update.longitude = lng }
            else update.website = osmWebsite
          }
          await supabase.from('venues').update(update).eq('id', v.id)
          for (const p of proposals) {
            await supabase.from('venue_field_provenance').upsert({
              venue_id: v.id, field: p.field,
              value: { ...p.value, display_name: hit.display_name, at },
              source: 'osm', confidence, is_winning: true, observed_at: at,
            }, { onConflict: 'venue_id,field,source' })
          }
          applied++
        } else {
          for (const p of proposals) {
            await supabase.from('venue_review_queue').delete().eq('venue_id', v.id).eq('field', p.field).eq('status', 'open')
            await supabase.from('venue_review_queue').insert({
              venue_id: v.id, field: p.field,
              proposed_value: { ...p.value, display_name: hit.display_name },
              citations: [{ source: 'https://nominatim.openstreetmap.org' }],
              confidence, model: null, status: 'open',
            })
          }
          await supabase.from('venues').update({
            needs_attention: true,
            enrichment_status: { ...(v.enrichment_status ?? {}), osm_lookup: { at, outcome } },
          }).eq('id', v.id)
          queued++
        }
        await supabase.from('venue_quality_signals').insert({
          venue_id: v.id, signal_type: 'enrichment', value: Math.round(confidence * 10000) / 10000,
          source: STEP,
          details: { fields: proposals.map(p => p.field), auto, exact_name_match: exact },
        })
      }

      logStatus = 'done'
      results.push({ id: v.id, name: v.name, outcome, confidence, fields: proposals.map(p => p.field) })
    } catch (e) {
      logStatus = 'failed'
      results.push({ id: v.id, status: 'error', error: e instanceof Error ? e.message : String(e) })
      await stamp(supabase, v, 'error', dryRun)
    }
    await logStep(supabase, v.id, logStatus, started, dryRun)
    if (i < venues.length - 1) await sleep(NOMINATIM_SLEEP_MS)
  }

  return jsonResponse({ items_processed: results.length, applied, queued, skipped, dry_run: dryRun, results }, 200, req)
})

async function stamp(
  supabase: ReturnType<typeof getServiceClient>,
  v: { id: string; enrichment_status?: unknown },
  outcome: string,
  dryRun: boolean,
) {
  if (dryRun) return
  await supabase.from('venues').update({
    enrichment_status: { ...((v.enrichment_status ?? {}) as Record<string, unknown>), osm_lookup: { at: new Date().toISOString(), outcome } },
  }).eq('id', v.id).then(() => {}, () => {})
}

async function logStep(supabase: ReturnType<typeof getServiceClient>, venueId: string, status: string, started: number, dryRun: boolean) {
  if (dryRun) return
  await supabase.from('enrichment_log').insert({
    entity_type: 'venue', entity_id: venueId, step: STEP, status, duration_ms: Date.now() - started,
  }).then(() => {}, () => {})
}
