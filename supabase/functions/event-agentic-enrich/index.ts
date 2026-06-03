// event-agentic-enrich — the moat. For thin / low-trust upcoming events, fetch the
// event's own source page, extract high-value LGBTQ+ travel fields (accessibility,
// target groups, age/dress policy, safety context, lineup, real description) grounded
// in that page, and apply hybrid-by-confidence: high confidence auto-fills empty event
// fields; low confidence routes to triage (needs_attention=true) without overwriting.
// LLM-gated: circuit-broken + per-day cap. Cheap-first: only thin/low-trust events.
//
// Auth: X-Webhook-Secret (cron) or admin/service-role. Body: { batch_limit?, dry_run?, event_ids?, daily_cap? }.

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { researchEnrichEventFromPage, type EventMoatEnrichment } from '../_shared/ai-enrichment.ts'

const DEFAULT_BATCH_LIMIT = 5
const DEFAULT_DAILY_CAP = 50
const TRUST_CEILING = 40            // only enrich events scoring below this
const GET_TIMEOUT = 10_000
const MAX_BODY_BYTES = 500_000
const AUTO_APPLY_CONFIDENCE = 0.8
const STEP = 'agentic-enrich'

function normalizeUrl(url: string): string {
  const t = (url ?? '').trim()
  return t && !/^https?:\/\//i.test(t) ? `https://${t}` : t
}

async function fetchText(rawUrl: string): Promise<string | null> {
  const url = normalizeUrl(rawUrl)
  if (!url) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GET_TIMEOUT)
  try {
    const resp = await fetch(url, {
      method: 'GET', signal: controller.signal, redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QueerGuide-EventEnrich/1.0)', 'Accept': 'text/html,*/*' },
    })
    if (!resp.ok || !resp.body) return null
    const reader = resp.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (total < MAX_BODY_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value); total += value.length
    }
    reader.cancel().catch(() => {})
    const len = chunks.reduce((n, c) => n + c.length, 0)
    const buf = new Uint8Array(len); let off = 0
    for (const c of chunks) { buf.set(c, off); off += c.length }
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buf)
    return htmlToText(html)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&#39;/g, "'").replace(/&quot;/gi, '"').replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

// Non-empty array helper.
function arr(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const out = v.filter(x => typeof x === 'string' && x.trim()).map(x => (x as string).trim())
  return out.length ? out : null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  const secret = Deno.env.get('EVENT_QUALITY_WEBHOOK_SECRET')
  const provided = req.headers.get('X-Webhook-Secret')
  if (!(secret && provided && provided === secret)) {
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

  // Select thin / low-trust upcoming events.
  let query = supabase
    .from('events')
    .select('id, title, description, city, country, country_id, venue_name, website, ticket_url, accessibility_attributes, target_groups, age_restriction, trust_score, lgbti_relevance_score, enrichment_status')
    .is('duplicate_of_id', null)
  if (eventIds?.length) {
    query = query.in('id', eventIds)
  } else {
    query = query
      .eq('status', 'active')
      .gt('start_date', new Date().toISOString())
      .lt('trust_score', TRUST_CEILING)
      .or('website.not.is.null,ticket_url.not.is.null')
      .order('trust_score', { ascending: true })
      .limit(remaining)
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
      const pageText = target ? await fetchText(target) : null
      if (!pageText) { skipped++; results.push({ id: ev.id, status: 'no_page' }); await logStep(supabase, ev.id, status, started, dryRun); continue }

      // Destination safety context.
      let safetyContext: string | undefined
      if (ev.country_id) {
        const { data: c } = await supabase.from('countries').select('name, equality_score, lgbt_legal_status').eq('id', ev.country_id).maybeSingle()
        if (c) safetyContext = `${c.name}: equality_score=${c.equality_score ?? 'n/a'}, legal_status=${c.lgbt_legal_status ?? 'n/a'}`
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
