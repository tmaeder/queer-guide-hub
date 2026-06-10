// amenity-truth-backfill — fills + cleans venue amenities & accessibility.
// Three sources, run per venue in cost order:
//   extract  (free)    re-classify existing amenities+tags+desc into clean canonical
//                      buckets via _shared/amenity-normalize. Auto-applies.
//   places   (deferred) Google Places structured booleans -> slugs. Auto-applies.
//                      No-op until place_ids are resolved (Phase 7); 0 venues have one.
//   llm      (gated)   extract amenities from description, constrained to the vocab.
//                      Amenities auto-apply at >=0.8; ACCESSIBILITY is ALWAYS review-gated.
//
// Default sources = ['extract'] so the routine cron is cheap and never burns LLM.
// Operators pass sources:['extract','llm'] (smaller batch/cap) for LLM enrichment runs.
//
// Auth: X-Webhook-Secret (cron) or admin/service-role. No-op safe; idempotent.
// Body: { batch_limit?, daily_cap?, dry_run?, venue_ids?, sources? }

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { loadAmenityVocabulary, normalizeVenueAmenities, type AmenityVocab } from '../_shared/amenity-normalize.ts'
import { extractVenueAmenitiesFromText } from '../_shared/ai-enrichment.ts'

const STEP = 'amenity-truth-backfill'
const AUTO_APPLY_CONFIDENCE = 0.8

type Source = 'extract' | 'places' | 'llm'

// Google Places v1 boolean field -> { kind, slug }. Ready for Phase 7; unused until
// place_ids exist. accessibilityOptions.* and the serving/seating booleans.
const _PLACES_BOOLEAN_MAP: Record<string, { kind: 'amenity' | 'accessibility'; slug: string }> = {
  'wheelchairAccessibleEntrance': { kind: 'accessibility', slug: 'wheelchair-accessible' },
  'wheelchairAccessibleRestroom': { kind: 'accessibility', slug: 'accessible-restroom' },
  'wheelchairAccessibleParking': { kind: 'accessibility', slug: 'accessible-parking' },
  'outdoorSeating': { kind: 'amenity', slug: 'outdoor-seating' },
  'liveMusic': { kind: 'amenity', slug: 'live-music' },
  'servesBeer': { kind: 'amenity', slug: 'beer' },
  'servesCocktails': { kind: 'amenity', slug: 'cocktails' },
  'servesCoffee': { kind: 'amenity', slug: 'coffee' },
  'servesBreakfast': { kind: 'amenity', slug: 'breakfast' },
  'allowsDogs': { kind: 'amenity', slug: 'pets-allowed' },
  'restroom': { kind: 'amenity', slug: 'food-service' },
}

function uniqSorted(...arrs: (string[] | null | undefined)[]): string[] {
  const s = new Set<string>()
  for (const a of arrs) for (const x of a ?? []) if (x) s.add(x)
  return [...s].sort()
}

interface VenueRow {
  id: string
  name: string
  category: string | null
  description: string | null
  tags: string[] | null
  amenities: string[] | null
  accessibility_attributes: string[] | null
  platform_ids: Record<string, unknown> | null
}

/** Google Places — deferred. Returns empty until place_ids are resolved (Phase 7). */
async function fetchPlacesFeatures(
  _supabase: ReturnType<typeof getServiceClient>,
  placeId: string | null,
): Promise<{ amenities: string[]; accessibility: string[] }> {
  const empty = { amenities: [], accessibility: [] }
  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY')
  if (!placeId || !apiKey) return empty
  // Phase 7: call places.googleapis.com/v1/places/{id} with a field mask over
  // PLACES_BOOLEAN_MAP keys, map true booleans -> slugs. Intentionally inert now.
  return empty
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  const secret = Deno.env.get('AMENITY_QUALITY_WEBHOOK_SECRET')
  const provided = req.headers.get('X-Webhook-Secret')
  if (!(secret && provided && provided === secret)) {
    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth
  }

  const body = await req.json().catch(() => ({}))
  const sources: Source[] = Array.isArray(body.sources) && body.sources.length ? body.sources : ['extract']
  const wantLlm = sources.includes('llm')
  const wantPlaces = sources.includes('places')
  const batchLimit: number = body.batch_limit ?? (wantLlm ? 5 : 25)
  const dailyCap: number = body.daily_cap ?? (wantLlm ? 80 : 600)
  const dryRun: boolean = body.dry_run ?? false
  const venueIds: string[] | undefined = body.venue_ids

  // Daily cap (skipped for explicit venue_ids).
  const since = new Date(); since.setUTCHours(0, 0, 0, 0)
  const { count: doneToday } = await supabase
    .from('enrichment_log').select('id', { count: 'exact', head: true })
    .eq('step', STEP).eq('status', 'done').gte('created_at', since.toISOString())
  if (!venueIds?.length && (doneToday ?? 0) >= dailyCap) {
    return jsonResponse({ processed: 0, capped: true, done_today: doneToday, daily_cap: dailyCap }, 200, req)
  }
  const remaining = venueIds?.length ? batchLimit : Math.min(batchLimit, dailyCap - (doneToday ?? 0))

  // Work-list.
  let venues: VenueRow[]
  if (venueIds?.length) {
    const { data, error } = await supabase
      .from('venues')
      .select('id, name, category, description, tags, amenities, accessibility_attributes, platform_ids')
      .in('id', venueIds)
    if (error) return jsonResponse({ error: error.message, success: false }, 500, req)
    venues = (data ?? []) as VenueRow[]
  } else {
    const { data, error } = await supabase.rpc('venues_due_for_amenity_backfill', { p_limit: remaining })
    if (error) return jsonResponse({ error: error.message, success: false }, 500, req)
    venues = (data ?? []) as VenueRow[]
  }
  if (!venues.length) return jsonResponse({ processed: 0, message: 'no venues due' }, 200, req)

  const vocab: AmenityVocab = await loadAmenityVocabulary(supabase, true)
  const amenitySlugs = [...vocab.amenity]
  const accessibilitySlugs = [...vocab.accessibility]

  let cleaned = 0, filled = 0, gated = 0
  const results: Array<Record<string, unknown>> = []

  for (const v of venues) {
    const started = Date.now()
    let status = 'skipped'
    try {
      // --- Source 1: extract (free, auto-apply) ---
      const ex = normalizeVenueAmenities(
        { amenities: v.amenities, tags: v.tags, description: v.description, category: v.category },
        vocab,
      )
      let nextAmenities = ex.amenities
      let nextAccessibility = uniqSorted(v.accessibility_attributes, ex.accessibility)
      const nextTags = uniqSorted(v.tags, ex.queerTags)
      let verified = false
      const provenance: Array<{ field: string; source: string; value: string[]; confidence: number }> = [
        { field: 'amenities', source: 'existing', value: ex.amenities, confidence: 0.95 },
      ]

      // --- Source 2: places (deferred, auto-apply) ---
      if (wantPlaces) {
        const placeId = (v.platform_ids?.google as string | undefined) ?? null
        const pf = await fetchPlacesFeatures(supabase, placeId)
        if (pf.amenities.length || pf.accessibility.length) {
          nextAmenities = uniqSorted(nextAmenities, pf.amenities)
          nextAccessibility = uniqSorted(nextAccessibility, pf.accessibility)
          verified = true
          provenance.push({ field: 'amenities', source: 'google', value: pf.amenities, confidence: 0.9 })
          if (pf.accessibility.length) provenance.push({ field: 'accessibility_attributes', source: 'google', value: pf.accessibility, confidence: 0.9 })
        }
      }

      // --- Source 3: llm (amenities auto >=0.8; accessibility ALWAYS review-gated) ---
      const gatedProposals: { field: string; value: unknown; cite: unknown[]; confidence: number }[] = []
      let llmConfidence: number | null = null
      if (wantLlm && (v.description ?? '').trim().length >= 80) {
        let ai
        try {
          ai = await withCircuitBreaker(supabase, 'llm.openai.amenity-extract', () =>
            extractVenueAmenitiesFromText(supabase, {
              name: v.name, category: v.category, description: v.description, tags: v.tags,
              canonicalAmenities: amenitySlugs, canonicalAccessibility: accessibilitySlugs,
            }))
        } catch (e) {
          if (e instanceof CircuitOpenError) return jsonResponse({ cleaned, filled, gated, circuit_open: true, results }, 200, req)
          throw e
        }
        if (ai) {
          llmConfidence = ai.confidence ?? 0.5
          const citations = ai.citations ?? []
          if ((ai.confidence ?? 0) >= AUTO_APPLY_CONFIDENCE && ai.amenities?.length) {
            nextAmenities = uniqSorted(nextAmenities, ai.amenities)
            provenance.push({ field: 'amenities', source: 'llm', value: ai.amenities, confidence: ai.confidence ?? 0.8 })
          }
          if (ai.accessibility_attributes?.length) {
            gatedProposals.push({ field: 'accessibility_attributes', value: { value: ai.accessibility_attributes }, cite: citations, confidence: ai.confidence ?? 0.5 })
          }
          if (ai.accessibility_notes) {
            gatedProposals.push({ field: 'accessibility_notes', value: { value: ai.accessibility_notes }, cite: citations, confidence: ai.confidence ?? 0.5 })
          }
        }
      }

      const droppedCount = ex.dropped.length
      const amenitiesChanged = JSON.stringify(nextAmenities) !== JSON.stringify((v.amenities ?? []).slice().sort())
      const accessibilityChanged = JSON.stringify(nextAccessibility) !== JSON.stringify((v.accessibility_attributes ?? []).slice().sort())

      if (!dryRun) {
        const update: Record<string, unknown> = {
          amenities: nextAmenities,
          accessibility_attributes: nextAccessibility,
          tags: nextTags,
          last_refreshed_at: new Date().toISOString(),
        }
        if (verified) update.amenities_verified = true
        if (gatedProposals.length) update.needs_attention = true
        await supabase.from('venues').update(update).eq('id', v.id)

        // Provenance (idempotent on venue_id,field,source).
        for (const p of provenance) {
          if (!p.value.length) continue
          await supabase.from('venue_field_provenance').upsert({
            venue_id: v.id, field: p.field, source: p.source, value: p.value, confidence: p.confidence, is_winning: true,
          }, { onConflict: 'venue_id,field,source' }).then(() => {}, () => {})
        }

        // Review-gate LLM accessibility (delete-then-insert the single open row per field).
        for (const g of gatedProposals) {
          await supabase.from('venue_review_queue').delete().eq('venue_id', v.id).eq('field', g.field).eq('status', 'open')
          await supabase.from('venue_review_queue').insert({
            venue_id: v.id, field: g.field, proposed_value: g.value,
            citations: g.cite, confidence: g.confidence, model: 'llm', status: 'open',
          }).then(() => {}, () => {})
        }

        // Quality signal (bounded — one row per processed venue).
        const coverage = Math.min(1, nextAmenities.length / 5)
        await supabase.from('venue_quality_signals').insert({
          venue_id: v.id, signal_type: 'amenity_coverage', value: Math.round(coverage * 10000) / 10000,
          source: STEP, details: { amenities: nextAmenities.length, accessibility: nextAccessibility.length, dropped: droppedCount, gated: gatedProposals.map(g => g.field), llm_confidence: llmConfidence },
        }).then(() => {}, () => {})
      }

      status = 'done'
      if (droppedCount > 0 || amenitiesChanged) cleaned++
      if (amenitiesChanged && nextAmenities.length > (v.amenities?.length ?? 0)) filled++
      if (gatedProposals.length) gated++
      results.push({ id: v.id, name: v.name, amenities: nextAmenities.length, accessibility: nextAccessibility.length, dropped: droppedCount, gated: gatedProposals.map(g => g.field), accessibility_changed: accessibilityChanged })
    } catch (e) {
      status = 'failed'
      results.push({ id: v.id, status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
    await logStep(supabase, v.id, status, started, dryRun)
  }

  return jsonResponse({ processed: venues.length, cleaned, filled, gated, dry_run: dryRun, sources, results }, 200, req)
})

async function logStep(supabase: ReturnType<typeof getServiceClient>, venueId: string, status: string, started: number, dryRun: boolean) {
  if (dryRun) return
  await supabase.from('enrichment_log').insert({
    entity_type: 'venue', entity_id: venueId, step: STEP, status, duration_ms: Date.now() - started,
  }).then(() => {}, () => {})
}
