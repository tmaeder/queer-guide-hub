// venue-accessibility-osm — coordinate-keyed OSM venue enrichment.
//
// The name is now narrower than the job: it also fills hours, phone, website and
// category. Renaming it would mean moving the registry slug, the cron job and
// the `config.toml` entry together, so the name stays and this comment carries
// the truth.
//
// OSM is SATURATED as a discovery source: the last five nightly `vn_fill_osm`
// runs each fetched items_total 120 and skipped all 120 as already-known, and
// only 200 venue_sources rows are OSM at all. The value is not in finding more
// venues; it is in asking OSM about the 20,600 geocoded venues we already hold.
// So this inverts the direction — query BY COORDINATE for a venue we know.
//
// WHAT ONE MATCH IS WORTH. Proving identity is the expensive and risky half, and
// it was being spent to read a single tag. The same element carries four more
// fields whose gaps dwarf accessibility's (measured 2026-09-04, 26,905 live
// venues): hours 26,279 empty (97.7%), phone 18,796 (70%), website 16,908 (63%),
// category='other' 6,930 (26%). Mapping lives in `_shared/osm-venue-fields.ts`
// and is default-reject throughout.
//
// The two write policies are deliberately DIFFERENT, and the asymmetry is the
// point: accessibility resolves conflicts by keeping the negative, flags the
// venue and opens a review row, because being wrong strands a disabled person at
// a door. The other four are fill-if-empty only — a stored value is never
// touched, and a disagreement is recorded in `venue_field_provenance` without
// raising `needs_attention` or queueing a human.
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
  RETRYABLE_PROBE_VERDICTS,
  buildAroundQuery,
  classifyOverpassResponse,
  isPlanetControlResult,
  pickMatchingElement,
  type OverpassElement,
} from '../_shared/overpass.ts'
import { decideField, VENUE_FIELDS } from '../_shared/venue-consensus.ts'
import { resolveContradictions } from '../_shared/accessibility-vocab.ts'
import {
  osmPhone,
  osmVenueCategory,
  osmWebsite,
  parseOsmOpeningHours,
} from '../_shared/osm-venue-fields.ts'

const STEP = 'venue-accessibility-osm'
const AUTOMATION_SLUG = 'venue_accessibility_osm'
const UA = 'QueerGuideBot/1.0 (https://queer.guide; contact@queer.guide)'
const DEFAULT_RADIUS_M = 60
// A single hung mirror must never be able to consume the whole budget. Measured
// 2026-09-02: a healthy overpass-api.de answers in 1.1s, so 25s is already an
// order of magnitude of headroom, and two of them still fit inside WALL_CLOCK_MS
// with room to write the summary. At the old 60s, two hung calls alone blew the
// budget before any venue was written.
const PER_CALL_MS = 25_000
// THE BINDING LIMIT IS THE GATEWAY, NOT THE EDGE WALL. This said "the edge wall
// is 546s" and budgeted 240s against it; prod disagrees. Measured 2026-09-04,
// four fires in one morning:
//   04:00 / 03:40  504 {"code":"IDLE_TIMEOUT","message":"Request idle timeout limit (150s) reached"}
//   04:20 / 04:40  200, processed 25, applied 2 / 0
// The function itself completed and wrote in every case — the 504 is the gateway
// giving up at 150s while the work was still in flight, so it arrives with
// `timed_out:false` and `status_code:504` and is recorded as `error`. That feeds
// consecutive_failures against auto_pause_threshold=3, which is precisely how
// this job auto-paused itself with nothing wrong with it.
//
// 546s is the CPU/wall ceiling for a function that has already begun streaming a
// response. It is not how long a caller will wait for the first byte. Budget
// against the smaller number.
const WALL_CLOCK_MS = 120_000
// OSM asks for one request per second from bulk consumers. This is a policy
// obligation, not a tuning knob: do not parallelise around it.
const POLITENESS_MS = 1_100

const ACCESS_SPEC = VENUE_FIELDS.find((f) => f.field === 'accessibility_attributes')!

// Bump when the extractor learns a new field, so already-stamped rows whose
// element we matched are re-offered once. The selector pairs this with a
// `matched` check — a stamp with no match has nothing more to give and
// re-probing it just re-derives the same null.
const OSM_FIELDS_V = 2

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface VenueRow {
  id: string
  name: string
  latitude: number
  longitude: number
  accessibility_attributes: string[] | null
  osm_ref: string | null
  // Widened extraction reads these to decide fill-if-empty. They are NOT
  // targets to overwrite.
  hours: unknown
  phone: string | null
  website: string | null
  category: string | null
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
async function probeEndpoints(
  deadline: number,
): Promise<{ healthy: string[]; probe: Record<string, string>; allBusy: boolean }> {
  const healthy: string[] = []
  const probe: Record<string, string> = {}
  for (const endpoint of OVERPASS_ENDPOINTS) {
    // The probe shares one budget with the work. Without this the probe alone
    // could spend the entire wall clock and the run would return having looked
    // at zero venues — which reads as "upstream is down" rather than "we never
    // asked", the exact confusion this file's endpoint-ordering comment below
    // was written to prevent.
    if (Date.now() > deadline) {
      probe[endpoint] = 'unprobed (wall clock exhausted during probe)'
      continue
    }
    // STOP AT THE FIRST HEALTHY MIRROR. One planet endpoint is all a run needs,
    // and probing the rest is not free: measured 2026-09-02, overpass-api.de
    // answered in 1.1s while kumi.systems hung to the full timeout. Probing
    // every endpoint × 2 attempts × PER_CALL_MS spends up to ~100s of a 120s
    // wall clock before the first venue is even looked at — a self-inflicted
    // starvation that looks exactly like the upstream being down.
    if (healthy.length > 0) {
      probe[endpoint] = 'unprobed (a healthy mirror was already found)'
      continue
    }
    // TWO attempts. Measured 2026-09-02: overpass-api.de answered 504 and then
    // 200 to the identical control query seconds later, and both mirrors 504'd
    // in the same window. A single-shot probe against an endpoint that flaps
    // like that condemns a healthy mirror for the whole run — and the first
    // live stall of this job was exactly that (one fire wrote nothing).
    for (let attempt = 0; attempt < 2; attempt++) {
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
          break
        }
        const verdict = classifyOverpassResponse(res.status, body)
        probe[endpoint] = verdict
        // `regional` is a property of the endpoint, not of this moment — a
        // retry cannot change it, so condemn immediately.
        if (!RETRYABLE_PROBE_VERDICTS.has(verdict)) break
      } catch (e) {
        probe[endpoint] = `unreachable: ${e instanceof Error ? e.message : e}`
      }
      await sleep(POLITENESS_MS)
    }
    await sleep(POLITENESS_MS)
  }
  // Distinguish "every mirror is momentarily overloaded" from "every mirror is
  // wrong". The first is upstream weather and must not be reported as our
  // failure; the second is a real misconfiguration.
  const verdicts = Object.values(probe)
  const allBusy = healthy.length === 0 &&
    verdicts.length > 0 &&
    verdicts.every((v) => v === 'busy' || v === 'timeout' || v.startsWith('unreachable'))
  return { healthy, probe, allBusy }
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
  const { healthy, probe, allBusy } = await probeEndpoints(deadline)
  if (healthy.length === 0) {
    // Every mirror failed the control query. Write NOTHING and stamp NOTHING —
    // an outage is absence of evidence, and recording it as evidence of absence
    // would permanently write off every venue in this batch.
    //
    // A BUSY UPSTREAM IS NOT OUR FAILURE, and filing it as one is how this job
    // takes itself down. `recordRun(status:'error')` feeds consecutive_failures,
    // auto_pause_threshold is 3, and auto-pause sets enabled=false while its
    // own success branch later resets the counter — so a falsely-paused row
    // ends up reading exactly like a deliberate retirement.
    //
    // This is the same rule the per-venue path already applies (a 429 or a
    // query timeout is "ask again later", not "this API is broken"); it was
    // simply missing one level up. Observed live 2026-09-02: both mirrors 504'd
    // in one window, the 17:00 fire wrote nothing and recorded an error, and
    // only the 17:20 success reset the counter before it reached 3.
    // ...but "never our failure" would make a PERMANENT Overpass outage read
    // green forever while writing nothing, which is the green-but-idle class
    // this repo keeps getting bitten by. So transient busyness is a success and
    // a SUSTAINED run of it escalates: if the last 5 runs were all upstream-busy
    // too, this one is an error. At */20 that is ~2h of continuous outage before
    // the job goes red, and ~3h before auto-pause — long past transient.
    let escalate = false
    if (allBusy) {
      const { data: recent } = await supabase
        .from('admin_automation_runs')
        .select('summary')
        .eq('automation_slug', AUTOMATION_SLUG)
        .order('started_at', { ascending: false })
        .limit(5)
      escalate = (recent?.length ?? 0) >= 5 &&
        recent!.every((r) => (r.summary as Record<string, unknown> | null)?.upstream_busy === true)
    }
    const status = allBusy && !escalate ? 'success' : 'error'
    await recordRun(supabase, runStarted, {
      processed: 0, endpoints_unhealthy: true, upstream_busy: allBusy, escalated: escalate, probe, status,
    })
    return jsonResponse({
      processed: 0, endpoints_unhealthy: true, upstream_busy: allBusy, escalated: escalate, probe,
    }, 200, req)
  }

  const vocab = await loadAmenityVocabulary(supabase, true)
  let endpointIdx = 0

  let probed = 0, matched = 0, applied = 0, conflicted = 0, unknown = 0
  // Widened-field counters. Reported per field because a single total cannot
  // distinguish "hours are landing" from "only websites are landing", and the
  // whole point of Wave 1 is the 97.7% hours gap.
  let fieldsFilled = 0
  const filledByField: Record<string, number> = {}
  const disagreedByField: Record<string, number> = {}
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
          // The breaker here guards TRANSPORT health, and only a transport error
          // or a 4xx counts against it. A busy mirror (429/5xx) and a query
          // timeout are both "ask again later", not "this API is broken" —
          // filing them would trip the circuit on any burst, which is the same
          // misclassification that made a pg_net `timed_out` nearly auto-pause
          // the core dispatcher.
          //
          // The consequence, stated rather than hidden: because those verdicts
          // do not throw, withCircuitBreaker records a SUCCESS for them. So a
          // mirror that 504s forever will not open the circuit. What bounds that
          // case is not the breaker but the per-venue `unknown` attempt counter
          // in stamp_venue_osm_accessibility, which gives up after 3 tries.
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
    const tags = pick.element.tags ?? {}
    const osmRef = `${pick.element.type}/${pick.element.id}`

    // ---- widened fields (hours / phone / website / category) ----
    // Computed BEFORE the accessibility branch. Previously a matched element
    // with no `wheelchair` tag hit the early `continue` below and its
    // opening_hours, phone and website were discarded — which is 97.7%, 70% and
    // 63% of the corpus respectively, thrown away after paying for the match.
    const extra = widenedFields(tags, v)
    if (extra.filled.length) fieldsFilled += extra.filled.length
    for (const f of extra.filled) filledByField[f] = (filledByField[f] ?? 0) + 1
    for (const f of extra.disagreed) disagreedByField[f] = (disagreedByField[f] ?? 0) + 1

    if (!dryRun && extra.provenance.length) {
      // Recorded even when nothing was written, so a disagreement is queryable
      // instead of merely counted, and so the consensus engine has a second
      // voter for these fields later.
      await supabase.from('venue_field_provenance').upsert(
        extra.provenance.map((p) => ({
          venue_id: v.id,
          field: p.field,
          source: 'osm',
          value: p.value,
          confidence: 0.8,
          is_winning: extra.filled.includes(p.field),
          observed_at: new Date().toISOString(),
        })),
        { onConflict: 'venue_id,field,source' },
      ).then(() => {}, () => {})
    }

    // ---- map + default-reject against the controlled vocabulary ----
    const osmSlugs = osmAccessibility(tags).filter((s) => vocab.accessibility.has(s))
    if (osmSlugs.length === 0) {
      if (!dryRun) {
        if (Object.keys(extra.update).length) {
          await supabase.from('venues')
            .update({ ...extra.update, last_refreshed_at: new Date().toISOString() })
            .eq('id', v.id)
        }
        await stamp(supabase, v.id, {
          state: 'none',
          matched: osmRef,
          filled: extra.filled.length ? extra.filled : undefined,
        })
      }
      results.push({
        id: v.id, name: v.name, state: 'none', matched: true,
        filled: extra.filled, disagreed: extra.disagreed,
      })
      await sleep(POLITENESS_MS)
      continue
    }

    // ---- vote against what the venue already says ----
    const existing = (v.accessibility_attributes ?? []).filter((s) => vocab.accessibility.has(s))
    const decision = decideField(ACCESS_SPEC, [
      { source: 'osm', value: osmSlugs },
      { source: 'existing', value: existing },
    ])!
    // The write gate is the CONFLICT, not decision.action. A venue starts with
    // an empty column, so a first read is always single-source and always scores
    // below the 0.85 auto-commit threshold — gating on confidence would mean
    // nothing was ever written. OSM tags are a mapper's structured observation,
    // the same category as the Google Places booleans amenity-truth-backfill
    // auto-applies; it is LLM-INFERRED accessibility that stays review-gated,
    // and that path is not this one.
    const winner = (decision.winner as string[]) ?? []
    const conflict = resolveContradictions([...osmSlugs, ...existing])
    const hasConflict = conflict.conflicts.length > 0
    if (hasConflict) conflicted++

    const changed = JSON.stringify([...winner].sort()) !== JSON.stringify([...existing].sort())

    if (!dryRun) {
      const update: Record<string, unknown> = {
        // The widened fields ride along in the SAME statement. A second UPDATE
        // would double this venue's pass through trg_search_documents_venue,
        // which is the batch-cost discipline the rest of the pipeline is sized
        // against.
        ...extra.update,
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
        matched: osmRef,
        slugs: osmSlugs,
        filled: extra.filled.length ? extra.filled : undefined,
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
      filled: extra.filled, disagreed: extra.disagreed,
    })
    await sleep(POLITENESS_MS)
  }

  const summary = {
    processed: probed, matched, applied, conflicted, unknown,
    // `applied` counts accessibility only, so on its own it reads 0 for a run
    // that filled 20 sets of opening hours. Report the widened work separately
    // rather than folding it in — a rate per field is what tells you whether the
    // job is working, and a status alone cannot.
    fields_filled: fieldsFilled,
    filled_by_field: filledByField,
    disagreed_by_field: disagreedByField,
    probe,
  }
  if (!dryRun && !venueIds?.length) {
    await recordRun(supabase, runStarted, summary)
  }
  return jsonResponse({
    processed: probed, matched, applied, conflicted, unknown,
    fields_filled: fieldsFilled, filled_by_field: filledByField,
    disagreed_by_field: disagreedByField,
    dry_run: dryRun, endpoints: probe, results,
  }, 200, req)
})

/** Stamp the probe outcome on the venue so the selector round-robins forward.
 *  Stamped on EVERY visit including a miss — an unstamped miss makes the same
 *  unfillable venue the permanent head of the queue (city-fields selector, 36
 *  days of filling nothing). `unknown` stays retryable via an attempt counter. */
/**
 * Map the matched element's remaining tags onto venue columns.
 *
 * FILL-IF-EMPTY, ALWAYS. An OSM value may fill a NULL and may never replace a
 * stored one. A disagreement is RECORDED in `venue_field_provenance` and
 * reported in the run summary, but it does not write, does not raise
 * `needs_attention` and does not open a review row.
 *
 * That is a deliberate asymmetry with the accessibility path below, which does
 * all three. Accessibility is a safety claim where being wrong strands somebody
 * at a door. A website that differs from ours by a trailing slash is not, and
 * queueing thousands of those teaches reviewers to rubber-stamp — the failure
 * the tag-relation queue already demonstrated at ~19% precision.
 */
function widenedFields(tags: Record<string, string>, v: VenueRow) {
  const update: Record<string, unknown> = {}
  const provenance: Array<{ field: string; value: unknown }> = []
  const filled: string[] = []
  const disagreed: string[] = []

  const consider = (field: string, osmValue: unknown, isEmpty: boolean, equal: boolean) => {
    if (osmValue === null || osmValue === undefined) return
    provenance.push({ field, value: osmValue })
    if (isEmpty) {
      update[field] = osmValue
      filled.push(field)
    } else if (!equal) {
      disagreed.push(field)
    }
  }

  // `{}` is stored on 17 rows and carries no schedule. Treat it as empty rather
  // than as a value worth protecting.
  const storedHours = v.hours && typeof v.hours === 'object' ? v.hours as Record<string, unknown> : null
  const hoursEmpty = !storedHours || Object.keys(storedHours).length === 0
  const osmHours = parseOsmOpeningHours(tags.opening_hours)
  consider('hours', osmHours, hoursEmpty, false)

  const phone = osmPhone(tags)
  consider('phone', phone, !v.phone?.trim(), phone === v.phone)

  const site = osmWebsite(tags)
  // Compare on the normalised form so http/https and a trailing slash are not
  // reported as a disagreement.
  const storedSite = v.website ? osmWebsite({ website: v.website }) : null
  consider('website', site, !v.website?.trim(), site === storedSite)

  // Category may only move OFF `other`. A curated value is never reconsidered:
  // OSM's generic feature tag has no idea this is a queer venue.
  const cat = osmVenueCategory(tags)
  const catEmpty = !v.category || v.category === 'other'
  consider('category', cat, catEmpty, cat === v.category)

  return { update, provenance, filled, disagreed }
}

async function stamp(
  supabase: ReturnType<typeof getServiceClient>,
  venueId: string,
  detail: Record<string, unknown>,
) {
  // `v` is stamped here rather than at each call site so a new branch cannot
  // forget it and quietly become permanently un-re-offerable.
  await supabase.rpc('stamp_venue_osm_accessibility', {
    p_venue_id: venueId,
    p_detail: { ...detail, v: OSM_FIELDS_V, at: new Date().toISOString() },
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
