// city-agentic-enrich — the queer moat. For thin / low-completeness cities, fetch
// grounding sources (Wikipedia extract + official site) and extract queer-aware
// travel fields. Hybrid-by-confidence for NARRATIVE fields (auto-fill empty cols at
// >=0.8). SAFETY-SENSITIVE fields (lgbt_friendly_rating, safety_notes, editorial_hook)
// are ALWAYS routed to city_review_queue — never auto-published — and the rating is
// only queued when backed by citations. LLM-gated: circuit-broken + per-day cap.
//
// Auth: X-Webhook-Secret (cron) or admin/service-role. Body: { batch_limit?, dry_run?, city_ids?, daily_cap? }.

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { researchEnrichCityFromSources, type CityMoatEnrichment } from '../_shared/ai-enrichment.ts'

const DEFAULT_BATCH_LIMIT = 5
const DEFAULT_DAILY_CAP = 120
const COMPLETENESS_CEILING = 70     // only enrich cities below this
const STEP = 'city-agentic-enrich'
const AUTO_APPLY_CONFIDENCE = 0.8
const GET_TIMEOUT = 10_000
const MAX_BODY_BYTES = 400_000
const WP_UA = 'QueerGuideBot/1.0 (https://queer.guide; contact@queer.guide)'
const GATED_FIELDS = ['lgbt_friendly_rating', 'safety_notes', 'editorial_hook'] as const

function normalizeUrl(u: string): string { const t = (u ?? '').trim(); return t && !/^https?:\/\//i.test(t) ? `https://${t}` : t }

async function fetchText(rawUrl: string): Promise<string | null> {
  const url = normalizeUrl(rawUrl); if (!url) return null
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), GET_TIMEOUT)
  try {
    const r = await fetch(url, { method: 'GET', signal: ctl.signal, redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QueerGuide-CityEnrich/1.0)', Accept: 'text/html,*/*' } })
    if (!r.ok || !r.body) return null
    const reader = r.body.getReader(); const chunks: Uint8Array[] = []; let total = 0
    while (total < MAX_BODY_BYTES) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); total += value.length }
    reader.cancel().catch(() => {})
    const buf = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0)); let off = 0
    for (const c of chunks) { buf.set(c, off); off += c.length }
    return htmlToText(new TextDecoder('utf-8', { fatal: false }).decode(buf))
  } catch { return null } finally { clearTimeout(timer) }
}
function htmlToText(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&#39;/g, "'").replace(/&quot;/gi, '"').replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ').trim()
}
// Full-text plaintext extract (not just the lead paragraph) so the model has
// real material to ground queer-relevant fields on.
async function fetchWikipediaExtract(query: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(query)}`
    const r = await fetch(url, { headers: { 'User-Agent': WP_UA, Accept: 'application/json' } })
    if (!r.ok) return null
    const d = await r.json()
    const pages = d?.query?.pages
    if (!pages) return null
    for (const k of Object.keys(pages)) {
      const ex = pages[k]?.extract
      if (typeof ex === 'string' && ex.trim().length > 120) return ex
    }
    return null
  } catch { return null }
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
  const batchLimit: number = body.batch_limit ?? DEFAULT_BATCH_LIMIT
  const dailyCap: number = body.daily_cap ?? DEFAULT_DAILY_CAP
  const dryRun: boolean = body.dry_run ?? false
  const cityIds: string[] | undefined = body.city_ids

  const since = new Date(); since.setUTCHours(0, 0, 0, 0)
  const { count: doneToday } = await supabase
    .from('enrichment_log').select('id', { count: 'exact', head: true })
    .eq('step', STEP).eq('status', 'done').gte('created_at', since.toISOString())
  if (!cityIds?.length && (doneToday ?? 0) >= dailyCap) {
    return jsonResponse({ enriched: 0, capped: true, done_today: doneToday, daily_cap: dailyCap }, 200, req)
  }
  const remaining = cityIds?.length ? batchLimit : Math.min(batchLimit, dailyCap - (doneToday ?? 0))

  let query = supabase
    .from('cities')
    .select('id, name, slug, region_name, description, best_time_to_visit, local_customs, official_website, completeness_score, enrichment_status, country_id, countries(name, equality_score, lgbti_criminalization)')
    .is('duplicate_of_id', null)
  if (cityIds?.length) {
    query = query.in('id', cityIds)
  } else {
    query = query
      .not('slug', 'like', 'tmp-%')
      .lt('completeness_score', COMPLETENESS_CEILING)
      .order('completeness_score', { ascending: true })
      .limit(remaining)
  }
  const { data: cities, error } = await query
  if (error) return jsonResponse({ error: error.message, success: false }, 500, req)
  if (!cities?.length) return jsonResponse({ enriched: 0, message: 'no thin cities to enrich' }, 200, req)

  let enriched = 0, gated = 0, skipped = 0
  const results: Array<Record<string, unknown>> = []

  for (const c of cities) {
    const started = Date.now()
    let status = 'skipped'
    try {
      // Grounding sources: Wikipedia extract + official site page.
      const country = (c.countries as { name?: string } | null)?.name
      const sources: { url: string; text: string }[] = []
      let wpExtract = country ? await fetchWikipediaExtract(`${c.name}, ${country}`) : null
      if (!wpExtract) wpExtract = await fetchWikipediaExtract(c.name)
      if (wpExtract) sources.push({ url: `https://en.wikipedia.org/wiki/${encodeURIComponent(c.name)}`, text: wpExtract })
      if (c.official_website) { const site = await fetchText(c.official_website); if (site) sources.push({ url: c.official_website, text: site }) }
      if (c.description && !wpExtract) sources.push({ url: 'existing', text: c.description })
      if (!sources.length) { skipped++; results.push({ id: c.id, status: 'no_sources' }); await logStep(supabase, c.id, status, started, dryRun); continue }

      // Destination safety context.
      let safetyContext: string | undefined
      const co = c.countries as { name?: string; equality_score?: number; lgbti_criminalization?: Record<string, unknown> } | null
      if (co) {
        const crim = (co.lgbti_criminalization ?? {}) as Record<string, unknown>
        const legal = crim.legal === false ? `criminalized${typeof crim.penalty === 'string' && crim.penalty ? ` (${crim.penalty})` : ''}`
          : crim.legal === true ? 'legal' : 'n/a'
        safetyContext = `${co.name}: equality_score=${co.equality_score ?? 'n/a'}, legal_status=${legal}`
      }

      let ai: CityMoatEnrichment | null = null
      try {
        ai = await withCircuitBreaker(supabase, 'llm.openai.city-enrich', () =>
          researchEnrichCityFromSources(supabase, {
            name: c.name, country, region: c.region_name, existingDescription: c.description, sources, safetyContext,
          }))
      } catch (e) {
        if (e instanceof CircuitOpenError) return jsonResponse({ enriched, gated, skipped, circuit_open: true, results }, 200, req)
        throw e
      }
      if (!ai) { skipped++; results.push({ id: c.id, status: 'no_ai' }); await logStep(supabase, c.id, status, started, dryRun); continue }

      const confidence = typeof ai.confidence === 'number' ? ai.confidence : 0.5
      const highConf = confidence >= AUTO_APPLY_CONFIDENCE
      const citations = Array.isArray(ai.citations) ? ai.citations : []

      // --- Auto-apply NARRATIVE fields (empty only, high confidence) ---
      const update: Record<string, unknown> = {}
      if (highConf) {
        if (ai.description && (!c.description || String(c.description).trim().length < 80)) update.description = ai.description
        if (ai.best_time_to_visit && !c.best_time_to_visit) update.best_time_to_visit = ai.best_time_to_visit
        if (ai.local_customs && !c.local_customs) update.local_customs = ai.local_customs
      }
      update.enrichment_status = { ...(c.enrichment_status ?? {}), agentic: { at: new Date().toISOString(), confidence, ...ai } }
      update.last_refreshed_at = new Date().toISOString()

      // --- Review-gate SAFETY-SENSITIVE fields (never auto-publish) ---
      const queued: string[] = []
      const ratingValid = typeof ai.lgbt_friendly_rating === 'number'
        && Number.isFinite(ai.lgbt_friendly_rating)
        && citations.length > 0   // rating MUST be cited or it is not produced
      const gatedProposals: { field: string; value: unknown; cite: typeof citations }[] = []
      if (ratingValid) {
        const r = Math.max(1, Math.min(5, Math.round(ai.lgbt_friendly_rating as number)))
        gatedProposals.push({ field: 'lgbt_friendly_rating', value: { value: r, scale: '1-5', rationale: ai.rating_rationale ?? null }, cite: citations.filter(x => x?.field === 'lgbt_friendly_rating' || x?.field === 'rating') })
      }
      if (ai.safety_notes) gatedProposals.push({ field: 'safety_notes', value: { value: ai.safety_notes }, cite: citations.filter(x => x?.field === 'safety_notes' || x?.field === 'safety') })
      if (ai.editorial_hook) gatedProposals.push({ field: 'editorial_hook', value: { value: ai.editorial_hook }, cite: citations.filter(x => x?.field === 'editorial_hook' || x?.field === 'hook') })

      if (gatedProposals.length) update.needs_attention = true

      if (!dryRun) {
        await supabase.from('cities').update(update).eq('id', c.id)
        for (const g of gatedProposals) {
          await supabase.from('city_review_queue').delete().eq('city_id', c.id).eq('field', g.field).eq('status', 'open')
          await supabase.from('city_review_queue').insert({
            city_id: c.id, field: g.field, proposed_value: g.value,
            citations: g.cite.length ? g.cite : citations, confidence, model: 'gpt-4o-mini', status: 'open',
          })
          queued.push(g.field)
        }
        await supabase.from('city_quality_signals').insert({
          city_id: c.id, signal_type: 'enrichment', value: Math.round(confidence * 10000) / 10000,
          source: STEP, details: { applied: Object.keys(update).filter(k => !['enrichment_status', 'last_refreshed_at', 'needs_attention'].includes(k)), gated: queued },
        })
        await supabase.from('city_consensus_audit').insert({
          city_id: c.id, field: queued.join(','), winning_source: 'llm', confidence,
          action: queued.length ? 'review_gated' : 'auto_commit',
          details: { auto_fields: Object.keys(update).filter(k => !['enrichment_status', 'last_refreshed_at', 'needs_attention'].includes(k)), gated_fields: queued, citations },
        }).then(() => {}, () => {})
      }

      status = 'done'
      const autoCount = Object.keys(update).filter(k => !['enrichment_status', 'last_refreshed_at', 'needs_attention'].includes(k)).length
      if (autoCount) enriched++
      if (queued.length) gated++
      results.push({ id: c.id, name: c.name, confidence, auto_filled: autoCount, gated: queued })
    } catch (e) {
      status = 'failed'
      results.push({ id: c.id, status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
    await logStep(supabase, c.id, status, started, dryRun)
  }

  return jsonResponse({ enriched, gated, skipped, dry_run: dryRun, results }, 200, req)
})

async function logStep(supabase: ReturnType<typeof getServiceClient>, cityId: string, status: string, started: number, dryRun: boolean) {
  if (dryRun) return
  await supabase.from('enrichment_log').insert({
    entity_type: 'city', entity_id: cityId, step: STEP, status, duration_ms: Date.now() - started,
  }).then(() => {}, () => {})
}
