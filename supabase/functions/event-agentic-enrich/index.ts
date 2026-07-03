// event-agentic-enrich — the moat. For thin / low-trust upcoming events, fetch the
// event's own source page, extract high-value LGBTQ+ travel fields (accessibility,
// target groups, age/dress policy, safety context, lineup, real description) grounded
// in that page, and apply hybrid-by-confidence: high confidence auto-fills empty event
// fields; low confidence routes to triage (needs_attention=true) without overwriting.
// LLM-gated: circuit-broken + per-day cap. Cheap-first: only thin/low-trust events.
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
    .select('id, title, description, city, country, country_id, venue_name, website, ticket_url, accessibility_attributes, target_groups, age_restriction, trust_score, lgbti_relevance_score, enrichment_status')
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
      // Always stash the full extraction (incl. safety_notes/dress_code/lineup) for audit + admin.
      const enrichmentStatus = { ...(ev.enrichment_status ?? {}), agentic: { at: new Date().toISOString(), confidence, ...ai } }
      update.enrichment_status = enrichmentStatus
      update.last_verified_at = new Date().toISOString()
      if (!highConf) update.needs_attention = true

      if (!dryRun) {
        await supabase.from('events').update(update).eq('id', ev.id)
        await supabase.from('event_quality_signals').insert({
          event_id: ev.id, signal_type: 'enrichment', value: Math.round(confidence * 10000) / 10000,
          source: 'event-agentic-enrich', details: { applied: highConf, fields: Object.keys(update).filter(k => k !== 'enrichment_status' && k !== 'last_verified_at' && k !== 'needs_attention') },
        })
      }
      status = 'done'
      if (highConf) enriched++; else flagged++
      results.push({ id: ev.id, status: highConf ? 'applied' : 'flagged', confidence, fields: Object.keys(update).length })
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
