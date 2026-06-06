import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { chatCompletion } from '../_shared/openai-client.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'

// Backfill LLM enrichment over ALREADY-COMMITTED rows (not staging). Two targets:
//   target='news'   → geo country_ids (where empty) + lgbti_relevance_score + classified_at
//   target='events' → lgbti_relevance_score + classified_at (events already carry geo)
//
// Uses the shared chatCompletion() → Cloudflare Workers AI (Llama 3.3 70B) under the
// 'llm.openai.enrich-news' circuit breaker. No response_format json_object (the CF /ai/v1
// compat endpoint hangs on it — see audit notes); we prompt for JSON and parse defensively.
//
// Resumable + idempotent: driven off classified_at IS NULL, set after every attempt (even when
// the model finds no country), so rows are never reprocessed and fresh rows are never starved.
// Webhook-gated (x-webhook-secret), getServiceClient writes bypass RLS. Per-row writes stay
// under the search_documents_sync() reindex-trigger timeout.

const BAL = /\{[\s\S]*\}/

function parseJson(text: unknown): Record<string, unknown> | null {
  if (text == null) return null
  if (typeof text === 'object') return text as Record<string, unknown> // CF may return already-structured response
  const s = String(text)
  const m = s.match(BAL)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

function clamp01(v: unknown): number | null {
  const n = Number(v)
  if (!isFinite(n)) return null
  return Math.max(0, Math.min(1, n))
}

const NEWS_SYS =
  'You classify LGBTQ+ news articles. Reply with ONLY a compact JSON object, no prose. ' +
  'Schema: {"countries":["ISO2",...],"relevance":0.0-1.0}. ' +
  '"countries" = ISO 3166-1 alpha-2 codes of the countries the article is primarily ABOUT ' +
  '(its geographic subject), NOT countries merely mentioned in passing or only present as a ' +
  'publisher name. Use [] for global/none/celebrity items with no clear country. ' +
  '"relevance" = how relevant the article is to LGBTQ+ people/rights/culture (1.0 = centrally about it, 0.0 = unrelated).'

const EVENT_SYS =
  'You rate how relevant an event is to LGBTQ+ people/community. Reply with ONLY a compact JSON ' +
  'object: {"relevance":0.0-1.0} (1.0 = an LGBTQ+/Pride/queer event, 0.0 = unrelated). No prose.'

// Fast 8B by default — the task (ISO2 code + a 0-1 score) is simple, and 70B at ~20s/call
// makes a 20k-row backfill infeasible. Overridable per-request via body.model.
async function llm(supabase: ReturnType<typeof getServiceClient>, system: string, user: string, model: string) {
  return withCircuitBreaker(supabase, 'llm.openai.enrich-news', () =>
    chatCompletion(supabase, {
      model,
      temperature: 0.1,
      max_tokens: 120,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  const secret = req.headers.get('x-webhook-secret')
  const expected = Deno.env.get('WEBHOOK_SECRET') || 'meilisearch-sync-webhook-2026'
  if (secret !== expected) return errorResponse('Unauthorized', 401, req)

  try {
    const body = await req.json().catch(() => ({}))
    const target = (body.target ?? 'news') as 'news' | 'events'
    const batchSize = Math.min(50, body.batch_size ?? 20)
    const model = (body.model as string) || '@cf/meta/llama-3.1-8b-instruct'
    const idGte = body.id_gte as string | undefined  // disjoint id ranges let the driver
    const idLt = body.id_lt as string | undefined     // run N non-overlapping shards in parallel
    const dryRun = body.dry_run === true

    let processed = 0, updated = 0, geo = 0, failed = 0
    let circuitOpen = false

    if (target === 'news') {
      // ISO2 → country_id map (built once).
      const { data: countries } = await supabase.from('countries').select('id, code')
      const codeToId = new Map<string, string>()
      for (const c of countries ?? []) if (c.code) codeToId.set(String(c.code).toUpperCase(), c.id)

      let nq = supabase
        .from('news_articles')
        .select('id, title, excerpt, content, country_ids')
        .is('classified_at', null)
        .is('duplicate_of_id', null)
      if (idGte) nq = nq.gte('id', idGte)
      if (idLt) nq = nq.lt('id', idLt)
      const { data: rows, error } = await nq.order('id', { ascending: true }).limit(batchSize)
      if (error) return errorResponse(`load news: ${error.message}`, 500, req)
      if (!rows || rows.length === 0) return jsonResponse({ success: true, target, processed: 0, message: 'done' }, 200, req)

      for (const r of rows) {
        processed++
        const user = `TITLE: ${r.title ?? ''}\nEXCERPT: ${(r.excerpt ?? '').slice(0, 400)}\nBODY: ${(r.content ?? '').slice(0, 800)}`
        let res
        try { res = await llm(supabase, NEWS_SYS, user, model) }
        catch (e) {
          if (e instanceof CircuitOpenError) { circuitOpen = true; processed--; break }
          failed++; continue
        }
        const j = parseJson(res?.content)
        const relevance = j ? clamp01(j.relevance) : null
        const ids: string[] = []
        if (j && Array.isArray(j.countries)) {
          for (const c of j.countries) {
            const id = codeToId.get(String(c).toUpperCase())
            if (id && !ids.includes(id)) ids.push(id)
          }
        }
        if (dryRun) { updated++; if (ids.length) geo++; continue }
        const patch: Record<string, unknown> = { classified_at: new Date().toISOString() }
        if (relevance !== null) patch.lgbti_relevance_score = relevance
        const hadCountry = Array.isArray(r.country_ids) && r.country_ids.length > 0
        if (ids.length && !hadCountry) { patch.country_ids = ids; geo++ }
        const { error: upErr } = await supabase.from('news_articles').update(patch).eq('id', r.id)
        if (upErr) { failed++; continue }
        updated++
      }
    } else {
      let eq = supabase
        .from('events')
        .select('id, title, description')
        .is('classified_at', null)
        .is('duplicate_of_id', null)
      if (idGte) eq = eq.gte('id', idGte)
      if (idLt) eq = eq.lt('id', idLt)
      const { data: rows, error } = await eq.order('id', { ascending: true }).limit(batchSize)
      if (error) return errorResponse(`load events: ${error.message}`, 500, req)
      if (!rows || rows.length === 0) return jsonResponse({ success: true, target, processed: 0, message: 'done' }, 200, req)

      for (const r of rows) {
        processed++
        const user = `TITLE: ${r.title ?? ''}\nABOUT: ${(r.description ?? '').slice(0, 600)}`
        let res
        try { res = await llm(supabase, EVENT_SYS, user, model) }
        catch (e) {
          if (e instanceof CircuitOpenError) { circuitOpen = true; processed--; break }
          failed++; continue
        }
        const j = parseJson(res?.content)
        const relevance = j ? clamp01(j.relevance) : null
        if (dryRun) { updated++; continue }
        const patch: Record<string, unknown> = { classified_at: new Date().toISOString() }
        if (relevance !== null) patch.lgbti_relevance_score = relevance
        const { error: upErr } = await supabase.from('events').update(patch).eq('id', r.id)
        if (upErr) { failed++; continue }
        updated++
      }
    }

    return jsonResponse({ success: true, target, processed, updated, geo, failed, circuit_open: circuitOpen, dry_run: dryRun }, 200, req)
  } catch (error) {
    console.error('backfill-llm-enrich:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
