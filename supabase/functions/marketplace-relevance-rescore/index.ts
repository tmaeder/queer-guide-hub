import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin, boundedInt } from '../_shared/supabase-client.ts'
import { logPipelineError } from '../_shared/pipeline-error-log.ts'
import { llmChatCompletion } from '../_shared/llm-client.ts'
import {
  MARKETPLACE_RELEVANCE_SYSTEM,
  buildMarketplaceRelevanceUserPrompt,
  parseMarketplaceRelevance,
  type RelevanceItem,
} from '../_shared/prompts/marketplace-relevance.ts'

// ============================================================
// Marketplace Relevance Re-score (Phase 2, design 2026-06-07)
// Re-scores lgbti_relevance_score with a kink/brand-aware prompt. The original
// scores were miscalibrated — gay fetish gear ("Pig Snout", "COLT Wristband",
// jockstraps, hanky-code laces) scored 0.00 because they weren't explicitly
// "pride" themed. This re-scores from title+brand+category+description in
// batches via the LLM. Writes lgbti_relevance_score + classified_at.
//
// Selection: oldest classified_at first (re-score sweep), active by default.
// Idempotent: re-running picks the least-recently-scored rows.
// ============================================================

const LLM_BATCH    = 25   // products per LLM call
// 2026-08-22 DQ pass: 250/week left 10,834 rows parked at the 0.6 default
// and the prune's freshness guard starving. The cron is nightly now; 600
// rows/night clears the backlog in ~3 weeks and then keeps the 61k catalog
// on a ~100-day re-verification cycle. Wall clock stays well under the edge
// runtime ceiling; the loop breaks cleanly when it's hit.
const DEFAULT_LIMIT = 600  // rows per invocation (stay under wall-clock)
const WALL_CLOCK_MS = 120_000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  if (req.method !== 'POST') return errorResponse('Use POST', 405, req)
  const supabase = getServiceClient()
  // Service-role client + paid LLM calls: never reachable with the public anon key.
  const auth = await requireInternalOrAdmin(req, supabase)
  if (auth instanceof Response) return auth
  const startedAt = Date.now()

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      ['dry_run', 'include_inactive'].some(key => body[key] !== undefined && typeof body[key] !== 'boolean')) return errorResponse('Invalid request body', 400, req)
    const limit       = boundedInt(body.limit, DEFAULT_LIMIT, 1000)
    const includeAll  = body.include_inactive ?? false
    // ISO timestamp, re-serialised so caller text never reaches the PostgREST .or() filter grammar.
    const rawBefore = body.rescore_before
    const beforeMs = typeof rawBefore === 'string' ? Date.parse(rawBefore) : NaN
    if (rawBefore != null && Number.isNaN(beforeMs)) return errorResponse('invalid_rescore_before', 400, req)
    const rescoreBefore = Number.isNaN(beforeMs) ? undefined : new Date(beforeMs).toISOString()
    const dryRun      = body.dry_run ?? false

    let q = supabase
      .from('marketplace_listings')
      .select('id, title, brand, category, subcategory, description, lgbti_relevance_score, updated_at, classified_at, status, review_status')
      .not('title', 'is', null)
      .order('classified_at', { ascending: true, nullsFirst: true })
      .limit(limit)
    if (!includeAll) q = q.eq('status', 'active')
    if (rescoreBefore) q = q.or(`classified_at.is.null,classified_at.lt.${rescoreBefore}`)

    const { data: rows, error } = await q
    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    if (!rows || rows.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'nothing to score' }, 200, req)
    }

    let scored = 0, failed = 0, stale = 0, raised = 0, lowered = 0
    const now = new Date().toISOString()

    for (let i = 0; i < rows.length; i += LLM_BATCH) {
      if (Date.now() - startedAt > WALL_CLOCK_MS) break
      const chunk = rows.slice(i, i + LLM_BATCH)
      const items: RelevanceItem[] = chunk.map((r, idx) => ({
        i: idx,
        title: r.title as string,
        brand: r.brand as string | null,
        category: [r.category, r.subcategory].filter(Boolean).join(' / ') || null,
        description: r.description as string | null,
      }))

      let scores: Map<number, number>
      try {
        const res = await llmChatCompletion({
          callerFn: 'marketplace-relevance-rescore',
          messages: [
            { role: 'system', content: MARKETPLACE_RELEVANCE_SYSTEM },
            { role: 'user', content: buildMarketplaceRelevanceUserPrompt(items) },
          ],
          temperature: 0,
          max_tokens: 1500,
          timeoutMs: 40_000,
          retries: 2,
        })
        scores = parseMarketplaceRelevance(res.content, chunk.length)
      } catch (e) {
        failed += chunk.length
        await logPipelineError(supabase, 'marketplace-relevance-rescore', e, { severity: 'warn' })
        continue
      }

      for (let idx = 0; idx < chunk.length; idx++) {
        const s = scores.get(idx)
        if (s === undefined) { failed++; continue }
        if (!dryRun) {
          // A successful inference is not a successful write. Concurrent staff,
          // source or model updates win; a changed snapshot is retried later.
          if (typeof chunk[idx].updated_at !== 'string') { failed++; continue }
          let write = supabase.from('marketplace_listings')
            .update({ lgbti_relevance_score: s, classified_at: now })
            .eq('id', chunk[idx].id)
            .eq('updated_at', chunk[idx].updated_at)
          // This table has no universal updated_at trigger. Compare every model
          // input, previous result and review/publication state in the same UPDATE.
          for (const key of ['title', 'brand', 'category', 'subcategory', 'description', 'lgbti_relevance_score', 'classified_at', 'status', 'review_status'] as const) {
            const value = chunk[idx][key]
            write = value == null ? write.is(key, null) : write.eq(key, value)
          }
          const { data: written, error: writeError } = await write.select('id')
          if (writeError) { failed++; continue }
          if (!written?.length) { stale++; continue }
        }
        const prev = chunk[idx].lgbti_relevance_score == null ? NaN : Number(chunk[idx].lgbti_relevance_score)
        if (Number.isFinite(prev)) { if (s > prev) raised++; else if (s < prev) lowered++ }
        scored++
      }
    }

    return jsonResponse({
      success: failed === 0,
      items: rows.length,
      scored, failed, stale, raised, lowered,
      elapsed_ms: Date.now() - startedAt,
      dry_run: dryRun,
    }, failed ? 503 : 200, req)
  } catch (error) {
    console.error('marketplace-relevance-rescore:', error)
    await logPipelineError(supabase, 'marketplace-relevance-rescore', error, { severity: 'error' })
    return errorResponse((error as Error).message, 500, req)
  }
})
