// venue-accessibility-osm — coordinate-keyed OSM accessibility enrichment.
//
// OSM is SATURATED as a discovery source: the last five nightly `vn_fill_osm`
// runs each fetched items_total 120 and skipped all 120 as already-known, and
// only 200 venue_sources rows are OSM at all. The value is not in finding more
// venues; it is in asking OSM about the 20,600 geocoded venues we already hold.
// So this inverts the direction — query BY COORDINATE for a venue we know.
//
// WHAT MAKES A CLAIM SAFE TO WRITE
// --------------------------------
//  1. The endpoint answered a planet control query at startup (regional-extract
//     trap), and its per-venue response was not a remark-bearing timeout.
//  2. The element is identified by an OSM id we already hold, or by a NAME match
//     inside 60 m. Proximity alone never attributes an access claim — a wrong
//     one strands a disabled person at a door they cannot get through.
//  3. Two same-named candidates BLOCK rather than guess.
//  4. A disagreement with what the venue already says keeps the NEGATIVE and
//     opens a review row; it is never silently merged.
//
// Nothing here is inferred from prose. LLM-extracted accessibility stays in
// amenity-truth-backfill and stays review-gated — that asymmetry is deliberate.
//
// Auth: X-Webhook-Secret (cron) or admin/service-role. Idempotent; no-op safe.
// Body: { batch_limit?, dry_run?, venue_ids?, radius_m? }

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { hasValidWebhookSecret } from '../_shared/webhook-auth.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { loadAmenityVocabulary } from '../_shared/amenity-normalize.ts'
import { osmAccessibility } from '../_shared/osm-accessibility.ts'
import {
  CONTROL_QUERY,
  OVERPASS_ENDPOINTS,
  buildAroundQuery,
  classifyOverpassResponse,
  isPlanetControlResult,
  pickMatchingElement,
  type OverpassElement,
} from '../_shared/overpass.ts'
import { decideField, VENUE_FIELDS } from '../_shared/venue-consensus.ts'
import { resolveContradictions } from '../_shared/accessibility-vocab.ts'

const STEP = 'venue-accessibility-osm'
const AUTOMATION_SLUG = 'venue_accessibility_osm'
const UA = 'QueerGuideBot/1.0 (https://queer.guide; contact@queer.guide)'
const DEFAULT_RADIUS_M = 60
const PER_CALL_MS = 60_000
// The edge wall is 546s. Stop well inside it so the run always gets to write its
// summary — a run that dies mid-batch leaves no record of what it probed.
const WALL_CLOCK_MS = 240_000
// OSM asks for one request per second from bulk consumers. This is a policy
// obligation, not a tuning knob: do not parallelise around it.
const POLITENESS_MS = 1_100

const ACCESS_SPEC = VENUE_FIELDS.find((f) => f.field === 'accessibility_attributes')!

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface VenueRow {
  id: string
  name: string
  latitude: number
  longitude: number
  accessibility_attributes: string[] | null
  osm_ref: string | null
}

/** POST one query to a specific mirror and classify the answer. */
async function askOverpass(endpoint: string, query: string) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(PER_CALL_MS),
  })
  const body = await res.json().catch(() => null)
  return { verdict: classifyOverpassResponse(res.status, body), body, status: res.status }
}

/**
 * Drop every endpoint that cannot answer for the whole planet, BEFORE the run.
 * Nothing in a regional extract's response identifies it as one, so this is the
 * only place the distinction can be made.
 */
async function probeEndpoints(): Promise<{ healthy: string[]; probe: Record<string, string> }> {
  const healthy: string[] = []
  const probe: Record<string, string> = {}
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body: `data=${encodeURIComponent(CONTROL_QUERY)}`,
        signal: AbortSignal.timeout(PER_CALL_MS),
      })
      const body = await res.json().catch(() => null)
      if (isPlanetControlResult(res.status, body)) {
        healthy.push(endpoint)
        probe[endpoint] = 'planet'
      } else {
        probe[endpoint] = classifyOverpassResponse(res.status, body)
      }
    } catch (e) {
      probe[endpoint] = `unreachable: ${e instanceof Error ? e.message : e}`
    }
    await sleep(POLITENESS_MS)
  }
  return { healthy, probe }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  if (!hasValidWebhookSecret(req, 'AMENITY_QUALITY_WEBHOOK_SECRET')) {
    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth
  }

  const body = await req.json().catch(() => ({}))
  const batchLimit: number = body.batch_limit ?? 25
  const dryRun: boolean = body.dry_run ?? false
  const radiusM: number = body.radius_m ?? DEFAULT_RADIUS_M
  const venueIds: string[] | undefined = body.venue_ids
  const runStarted = new Date()
  const deadline = Date.now() + WALL_CLOCK_MS

  // --- work list -------------------------------------------------------------
  let venues: VenueRow[]
  if (venueIds?.length) {
    const { data, error } = await supabase.rpc('venues_osm_accessibility_by_id', { p_ids: venueIds })
    if (error) return jsonResponse({ error: error.message, success: false }, 500, req)
    venues = (data ?? []) as VenueRow[]
  } else {
    const { data, error } = await supabase.rpc('venues_due_for_osm_accessibility', { p_limit: batchLimit })
    if (error) return jsonResponse({ error: error.message, success: false }, 500, req)
    venues = (data ?? []) as VenueRow[]
  }
  if (!venues.length) {
    if (!venueIds?.length) await recordRun(supabase, runStarted, { processed: 0, message: 'no venues due' })
    return jsonResponse({ processed: 0, message: 'no venues due' }, 200, req)
  }

  // --- endpoint health -------------------------------------------------------
  const { healthy, probe } = await probeEndpoints()
  if (healthy.length === 0) {
    // Every mirror failed the control query. Write NOTHING and stamp NOTHING —
    // an outage is absence of evidence, and recording it as evidence of absence
    // would permanently write off every venue in this batch.
    await recordRun(supabase, runStarted, { processed: 0, endpoints_unhealthy: true, probe, status: 'error' })
    return jsonResponse({ processed: 0, endpoints_unhealthy: true, probe }, 200, req)
  }

  const vocab = await loadAmenityVocabulary(supabase, true)
  let endpointIdx = 0

  let probed = 0, matched = 0, applied = 0, conflicted = 0, unknown = 0
  const results: Array<Record<string, unknown>> = []

  for (const v of venues) {
    if (Date.now() > deadline) break
    const started = Date.now()

    // ---- fetch ----
    let elements: OverpassElement[] | null = null
    let verdict = 'unknown'
    try {
      const query = buildAroundQuery(v.latitude, v.longitude, radiusM)
      // Two attempts, rotating the mirror. `busy` is normal under load and must
      // not be filed as a breaker failure; only a genuinely broken call is.
      for (let attempt = 0; attempt < 2 && elements === null; attempt++) {
        const endpoint = healthy[endpointIdx++ % healthy.length]
        const r = await withCircuitBreaker(supabase, 'osm.overpass', async () => {
          const out = await askOverpass(endpoint, query)
          // Only a transport/4xx error counts against the circuit. A busy mirror
          // and a query timeout are both "ask again later", not "this API is
          // broken" — filing them would trip the breaker on any burst.
          if (out.verdict === 'error') throw new Error(`overpass ${endpoint} HTTP ${out.status}`)
          return out
        })
        verdict = r.verdict
        if (r.verdict === 'ok' || r.verdict === 'regional') {
          elements = ((r.body as { elements?: OverpassElement[] })?.elements ?? []) as OverpassElement[]
        } else {
          await sleep(1_500 * (attempt + 1))
        }
      }
    } catch (e) {
      if (e instanceof CircuitOpenError) {
        await recordRun(supabase, runStarted, { processed: results.length, circuit_open: true, probe, status: 'error' })
        return jsonResponse({ processed: results.length, circuit_open: true, results }, 200, req)
      }
      verdict = 'error'
    }
    probed++

    // A timeout or a dead call is UNKNOWN. Stamp it as retryable rather than
    // recording "this venue has no accessibility data" — that is the logo.dev
    // mistake, where a dead token wrote off 6,498 venues as "not indexed".
    if (elements === null) {
      unknown++
      if (!dryRun) await stamp(supabase, v.id, { state: 'unknown', verdict })
      results.push({ id: v.id, name: v.name, state: 'unknown', verdict })
      await sleep(POLITENESS_MS)
      continue
    }

    // ---- identify ----
    const pick = pickMatchingElement(elements, v.name, v.osm_ref)
    if (!pick.element) {
      if (!dryRun) {
        await stamp(supabase, v.id, { state: pick.reason === 'ambiguous' ? 'ambiguous' : 'none' })
        // Two same-named features inside 60 m is a real thing a human should
        // look at; "nothing mapped here" is not.
        if (pick.reason === 'ambiguous') {
          await supabase.from('venues').update({ needs_attention: true }).eq('id', v.id)
        }
      }
      results.push({ id: v.id, name: v.name, state: pick.reason, candidates: elements.length })
      await sleep(POLITENESS_MS)
      continue
    }
    matched++

    // ---- map + default-reject against the controlled vocabulary ----
    const osmSlugs = osmAccessibility(pick.element.tags ?? {}).filter((s) => vocab.accessibility.has(s))
    if (osmSlugs.length === 0) {
      if (!dryRun) await stamp(supabase, v.id, { state: 'none', matched: `${pick.element.type}/${pick.element.id}` })
      results.push({ id: v.id, name: v.name, state: 'none', matched: true })
      await sleep(POLITENESS_MS)
      continue
    }

    // ---- vote against what the venue already says ----
    const existing = (v.accessibility_attributes ?? []).filter((s) => vocab.accessibility.has(s))
    const decision = decideField(ACCESS_SPEC, [
      { source: 'osm', value: osmSlugs },
      { source: 'existing', value: existing },
    ])!
    const winner = (decision.winner as string[]) ?? []
    const conflict = resolveContradictions([...osmSlugs, ...existing])
    const hasConflict = conflict.conflicts.length > 0
    if (hasConflict) conflicted++

    const changed = JSON.stringify([...winner].sort()) !== JSON.stringify([...existing].sort())

    if (!dryRun) {
      const update: Record<string, unknown> = {
        accessibility_attributes: [...winner].sort(),
        last_refreshed_at: new Date().toISOString(),
      }
      // The conflict is resolved (the negative survives) AND flagged. Resolving
      // it silently would drop the evidence that two sources disagree about a
      // door, which is exactly what a person needs to see.
      if (hasConflict) update.needs_attention = true
      await supabase.from('venues').update(update).eq('id', v.id)

      await supabase.from('venue_field_provenance').upsert({
        venue_id: v.id,
        field: 'accessibility_attributes',
        source: 'osm',
        value: osmSlugs,
        confidence: decision.confidence,
        is_winning: decision.winningSource === 'osm',
        observed_at: new Date().toISOString(),
      }, { onConflict: 'venue_id,field,source' }).then(() => {}, () => {})

      if (hasConflict) {
        await supabase.from('venue_review_queue').delete()
          .eq('venue_id', v.id).eq('field', 'accessibility_attributes').eq('status', 'open')
        await supabase.from('venue_review_queue').insert({
          venue_id: v.id,
          field: 'accessibility_attributes',
          proposed_value: { value: [...winner].sort(), osm: osmSlugs, existing, dropped: conflict.dropped },
          citations: [{
            source: 'openstreetmap',
            quote: `${pick.element.type}/${pick.element.id}`,
            url: `https://www.openstreetmap.org/${pick.element.type}/${pick.element.id}`,
          }],
          confidence: decision.confidence,
          model: 'osm',
          status: 'open',
        }).then(() => {}, () => {})
      }

      await stamp(supabase, v.id, {
        state: 'found',
        matched: `${pick.element.type}/${pick.element.id}`,
        slugs: osmSlugs,
        conflict: hasConflict ? conflict.conflicts : undefined,
      })
      await supabase.from('enrichment_log').insert({
        entity_type: 'venue', entity_id: v.id, step: STEP, status: 'done', duration_ms: Date.now() - started,
      }).then(() => {}, () => {})
    }

    if (changed) applied++
    results.push({
      id: v.id, name: v.name, state: 'found', osm: osmSlugs,
      applied: [...winner].sort(), conflict: hasConflict ? conflict.conflicts : undefined,
    })
    await sleep(POLITENESS_MS)
  }

  if (!dryRun && !venueIds?.length) {
    await recordRun(supabase, runStarted, { processed: probed, matched, applied, conflicted, unknown, probe })
  }
  return jsonResponse({
    processed: probed, matched, applied, conflicted, unknown,
    dry_run: dryRun, endpoints: probe, results,
  }, 200, req)
})

/** Stamp the probe outcome on the venue so the selector round-robins forward.
 *  Stamped on EVERY visit including a miss — an unstamped miss makes the same
 *  unfillable venue the permanent head of the queue (city-fields selector, 36
 *  days of filling nothing). `unknown` stays retryable via an attempt counter. */
async function stamp(
  supabase: ReturnType<typeof getServiceClient>,
  venueId: string,
  detail: Record<string, unknown>,
) {
  await supabase.rpc('stamp_venue_osm_accessibility', {
    p_venue_id: venueId,
    p_detail: { ...detail, at: new Date().toISOString() },
  }).then(() => {}, () => {})
}

async function recordRun(
  supabase: ReturnType<typeof getServiceClient>,
  startedAt: Date,
  summary: Record<string, unknown>,
) {
  const { data: a } = await supabase
    .from('admin_automations').select('id').eq('slug', AUTOMATION_SLUG).maybeSingle()
  await supabase.from('admin_automation_runs').insert({
    automation_id: a?.id ?? null,
    automation_slug: AUTOMATION_SLUG,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    status: summary.status === 'error' ? 'error' : 'success',
    items_examined: (summary.processed as number) ?? 0,
    items_changed: (summary.applied as number) ?? 0,
    summary,
  }).then(() => {}, () => {})
  await supabase.from('admin_automations')
    .update({ last_run_at: startedAt.toISOString(), last_run_status: summary.status === 'error' ? 'error' : 'success' })
    .eq('slug', AUTOMATION_SLUG).then(() => {}, () => {})
}
