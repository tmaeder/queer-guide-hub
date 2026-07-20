// event-agentic-enrich — the moat. For thin / low-trust upcoming events, fetch the
// event's own source page, extract high-value LGBTQ+ travel fields (accessibility,
// target groups, age/dress policy, safety context, lineup, real description) grounded
// in that page, and apply hybrid-by-confidence: high confidence auto-fills empty event
// fields; low confidence routes to triage (needs_attention=true) without overwriting.
// LLM-gated: circuit-broken + per-day cap. Cheap-first: only thin/low-trust events.
//
// Phase 4 extraction step: clean_title (flyer-title cleanup, >= 0.9 auto-applies after
// preserving the original in events.raw_title), extracted_venue_name/address (fill
// EMPTY fields only — venue LINKING is the SQL RPC link_event_venues, not this job),
// extracted_date (mismatch vs start_date > 1 day → review_queue row, never auto-fixed).
// Selection is ACTIVE events only (start_date >= now()-1y OR NULL) via the
// events_needing_moat_enrich selector (migration 20260716211500).
//
// Auth: X-Webhook-Secret (cron) or admin/service-role. Body: { batch_limit?, dry_run?, event_ids?, daily_cap? }.

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { hasValidWebhookSecret } from '../_shared/webhook-auth.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { fetchPageText } from '../_shared/enrich-harness.ts'
import { researchEnrichEventFromPage, type EventMoatEnrichment } from '../_shared/ai-enrichment.ts'

const DEFAULT_BATCH_LIMIT = 8
const DEFAULT_DAILY_CAP = 60        // drain untouched URL-events once each (self-
                                    // terminating via the not-recently-attempted
                                    // selector). Moat arrays rarely appear on source
                                    // pages, so this enriches description/safety/
                                    // lineup, not accessibility/target_groups.
const GET_TIMEOUT = 10_000
const MAX_BODY_BYTES = 500_000
const AUTO_APPLY_CONFIDENCE = 0.8
const TITLE_APPLY_CONFIDENCE = 0.9  // flyer-title cleanup + extracted venue/address need higher confidence
const DATE_MISMATCH_TOLERANCE_DAYS = 1  // ignore timezone/off-by-one noise
const STEP = 'agentic-enrich'

const fetchEventPage = (url: string) =>
  fetchPageText(url, {
    userAgent: 'Mozilla/5.0 (compatible; QueerGuide-EventEnrich/1.0)',
    maxBytes: MAX_BODY_BYTES,
    timeoutMs: GET_TIMEOUT,
  })

// Non-empty array helper.
function arr(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const out = v.filter(x => typeof x === 'string' && x.trim()).map(x => (x as string).trim())
  return out.length ? out : null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  if (!hasValidWebhookSecret(req, 'EVENT_QUALITY_WEBHOOK_SECRET')) {
    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth
  }

  const body = await req.json().catch(() => ({}))
  const batchLimit: number = body.batch_limit ?? DEFAULT_BATCH_LIMIT
  const dailyCap: number = body.daily_cap ?? DEFAULT_DAILY_CAP
  const dryRun: boolean = body.dry_run ?? false
  const eventIds: string[] | undefined = body.event_ids

  // Daily cap — count successful enrichments today.
  const since = new Date(); since.setUTCHours(0, 0, 0, 0)
  const { count: doneToday } = await supabase
    .from('enrichment_log').select('id', { count: 'exact', head: true })
    .eq('step', STEP).eq('status', 'done').gte('created_at', since.toISOString())
  if (!eventIds?.length && (doneToday ?? 0) >= dailyCap) {
    return jsonResponse({ enriched: 0, capped: true, done_today: doneToday, daily_cap: dailyCap }, 200, req)
  }
  const remaining = eventIds?.length ? batchLimit : Math.min(batchLimit, dailyCap - (doneToday ?? 0))

  // Select events still missing a moat field (accessibility or target_groups)
  // that have a per-event URL to ground extraction in. Upcoming first, then
  // recent past. Excludes the shared WNBR homepage (no per-event moat info).
  let query = supabase
    .from('events')
    .select('id, title, raw_title, start_date, address, field_provenance, description, city, country, country_id, venue_name, website, ticket_url, accessibility_attributes, target_groups, age_restriction, trust_score, lgbti_relevance_score, enrichment_status')
    .is('duplicate_of_id', null)
  if (eventIds?.length) {
    query = query.in('id', eventIds)
  } else {
    // Empty-array predicates can't be expressed in PostgREST, so the SQL
    // selector returns the ids (missing accessibility or target_groups, has a
    // per-event URL, not the WNBR homepage, upcoming-first).
    const { data: ids, error: selErr } = await supabase.rpc('events_needing_moat_enrich', { p_limit: remaining })
    if (selErr) return jsonResponse({ error: selErr.message, success: false }, 500, req)
    const idList = (ids ?? []).map((r: { id: string }) => r.id)
    if (!idList.length) return jsonResponse({ enriched: 0, message: 'no thin events to enrich' }, 200, req)
    query = query.in('id', idList)
  }
  const { data: events, error } = await query
  if (error) return jsonResponse({ error: error.message, success: false }, 500, req)
  if (!events?.length) return jsonResponse({ enriched: 0, message: 'no thin events to enrich' }, 200, req)

  let enriched = 0, flagged = 0, skipped = 0
  const results: Array<Record<string, unknown>> = []

  for (const ev of events) {
    const started = Date.now()
    const target = ev.website || ev.ticket_url
    let status = 'skipped'
    try {
      const pageText = target ? await fetchEventPage(target) : null
      if (!pageText) { skipped++; results.push({ id: ev.id, status: 'no_page' }); await logStep(supabase, ev.id, status, started, dryRun); continue }

      // Destination safety context. Legality is derived from the canonical
      // lgbti_criminalization jsonb (the legacy lgbt_legal_status text column was
      // dropped — M-5); `legal: false` marks a criminalizing destination.
      let safetyContext: string | undefined
      if (ev.country_id) {
        const { data: c } = await supabase.from('countries').select('name, equality_score, lgbti_criminalization').eq('id', ev.country_id).maybeSingle()
        if (c) {
          const crim = (c.lgbti_criminalization ?? {}) as Record<string, unknown>
          const legalStatus = crim.legal === false
            ? `criminalized${typeof crim.penalty === 'string' && crim.penalty ? ` (${crim.penalty})` : ''}`
            : crim.legal === true ? 'legal' : 'n/a'
          safetyContext = `${c.name}: equality_score=${c.equality_score ?? 'n/a'}, legal_status=${legalStatus}`
        }
      }

      let ai: EventMoatEnrichment | null = null
      try {
        ai = await withCircuitBreaker(supabase, 'llm.openai.agentic-enrich', () =>
          researchEnrichEventFromPage(supabase, {
            title: ev.title, city: ev.city, country: ev.country, venue_name: ev.venue_name,
            existingDescription: ev.description, pageText, safetyContext,
          }))
      } catch (e) {
        if (e instanceof CircuitOpenError) {
          return jsonResponse({ enriched, flagged, skipped, circuit_open: true, results }, 200, req)
        }
        throw e
      }
      if (!ai) { skipped++; results.push({ id: ev.id, status: 'no_ai' }); await logStep(supabase, ev.id, status, started, dryRun); continue }

      const confidence = typeof ai.confidence === 'number' ? ai.confidence : 0.5
      const highConf = confidence >= AUTO_APPLY_CONFIDENCE

      // Build the auto-apply update — only fill EMPTY fields, never overwrite curated data.
      const update: Record<string, unknown> = {}
      if (highConf) {
        if (ai.description && (!ev.description || ev.description.length < 80)) update.description = ai.description
        if (arr(ai.accessibility_attributes) && (!ev.accessibility_attributes?.length)) update.accessibility_attributes = arr(ai.accessibility_attributes)
        if (ai.accessibility_notes) update.accessibility_notes = ai.accessibility_notes
        if (arr(ai.target_groups) && (!ev.target_groups?.length)) update.target_groups = arr(ai.target_groups)
        if (ai.age_restriction && !ev.age_restriction) update.age_restriction = ai.age_restriction
        if (typeof ai.lgbtq_relevance_score === 'number' && ev.lgbti_relevance_score == null)
          update.lgbti_relevance_score = Math.max(0, Math.min(1, ai.lgbtq_relevance_score))
      }
      // Flyer-title cleanup + page-grounded venue/address — jsonb field_provenance
      // per the event truth-loop convention ({field: {value, confidence, source}}).
      const prov: Record<string, unknown> = { ...((ev.field_provenance as Record<string, unknown>) ?? {}) }
      let provChanged = false
      if (confidence >= TITLE_APPLY_CONFIDENCE) {
        const cleanTitle = typeof ai.clean_title === 'string' ? ai.clean_title.trim() : ''
        if (cleanTitle && cleanTitle !== ev.title) {
          // Preserve the original flyer title FIRST (only once — never overwrite raw_title).
          if (ev.raw_title == null) update.raw_title = ev.title
          update.title = cleanTitle
          prov.title = { value: cleanTitle, confidence, source: 'event-agentic-enrich', cleaned_at: new Date().toISOString() }
          provChanged = true
        }
        // Fill EMPTY venue_name/address only (never overwrite; linking itself is the
        // SQL RPC link_event_venues' job — this just feeds its name+city matcher).
        const exVenue = typeof ai.extracted_venue_name === 'string' ? ai.extracted_venue_name.trim() : ''
        if (exVenue && !ev.venue_name) {
          update.venue_name = exVenue
          prov.venue_name = { value: exVenue, confidence, source: 'event-agentic-enrich' }
          provChanged = true
        }
        const exAddr = typeof ai.extracted_address === 'string' ? ai.extracted_address.trim() : ''
        if (exAddr && !ev.address) {
          update.address = exAddr
          prov.address = { value: exAddr, confidence, source: 'event-agentic-enrich' }
          provChanged = true
        }
      }
      if (provChanged) update.field_provenance = prov

      // extracted_date vs start_date mismatch → review queue. NEVER auto-fix dates.
      let dateMismatch = false
      const exDate = typeof ai.extracted_date === 'string' ? ai.extracted_date.trim().slice(0, 10) : ''
      if (/^\d{4}-\d{2}-\d{2}$/.test(exDate) && ev.start_date) {
        const diffDays = Math.abs(new Date(`${exDate}T00:00:00Z`).getTime() - new Date(ev.start_date).getTime()) / 86_400_000
        if (diffDays > DATE_MISMATCH_TOLERANCE_DAYS) {
          dateMismatch = true
          if (!dryRun) {
            // Generic review_queue (there is no event_review_queue); dedupe pending rows.
            const { data: openRow } = await supabase
              .from('review_queue').select('id')
              .eq('entity_type', 'event').eq('entity_id', ev.id)
              .eq('review_type', 'date_mismatch').eq('status', 'pending')
              .limit(1).maybeSingle()
            if (!openRow) {
              await supabase.from('review_queue').insert({
                entity_type: 'event', entity_id: ev.id, review_type: 'date_mismatch', status: 'pending',
                details: { start_date: ev.start_date, extracted_date: exDate, confidence, source: 'event-agentic-enrich', page: target },
              })
            }
          }
        }
      }

      // Always stash the full extraction (incl. safety_notes/dress_code/lineup) for audit + admin.
      const enrichmentStatus = { ...(ev.enrichment_status ?? {}), agentic: { at: new Date().toISOString(), confidence, ...ai } }
      update.enrichment_status = enrichmentStatus
      update.last_verified_at = new Date().toISOString()
      if (!highConf) update.needs_attention = true

      if (!dryRun) {
        await supabase.from('events').update(update).eq('id', ev.id)
        await supabase.from('event_quality_signals').insert({
          event_id: ev.id, signal_type: 'enrichment', value: Math.round(confidence * 10000) / 10000,
          source: 'event-agentic-enrich', details: { applied: highConf, date_mismatch: dateMismatch, fields: Object.keys(update).filter(k => !['enrichment_status', 'last_verified_at', 'needs_attention', 'field_provenance'].includes(k)) },
        })
      }
      status = 'done'
      if (highConf) enriched++; else flagged++
      results.push({ id: ev.id, status: highConf ? 'applied' : 'flagged', confidence, fields: Object.keys(update).length, title_cleaned: 'title' in update, date_mismatch: dateMismatch })
    } catch (e) {
      status = 'failed'
      results.push({ id: ev.id, status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
    await logStep(supabase, ev.id, status, started, dryRun)
  }

  return jsonResponse({ enriched, flagged, skipped, dry_run: dryRun, results }, 200, req)
})

async function logStep(supabase: ReturnType<typeof getServiceClient>, eventId: string, status: string, started: number, dryRun: boolean) {
  if (dryRun) return
  await supabase.from('enrichment_log').insert({
    entity_type: 'event', entity_id: eventId, step: STEP, status, duration_ms: Date.now() - started,
  }).then(() => {}, () => {})
}
