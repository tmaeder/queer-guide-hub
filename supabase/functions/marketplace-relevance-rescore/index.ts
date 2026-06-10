import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
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
const DEFAULT_LIMIT = 250  // rows per invocation (stay under wall-clock)
const WALL_CLOCK_MS = 50_000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  const startedAt = Date.now()

  try {
    const body = await req.json().catch(() => ({}))
    const limit       = Number(body.limit ?? DEFAULT_LIMIT)
    const includeAll  = body.include_inactive ?? false
    const rescoreBefore = body.rescore_before as string | undefined // ISO; only rows classified before this
    const dryRun      = body.dry_run ?? false

    let q = supabase
      .from('marketplace_listings')
      .select('id, title, brand, category, subcategory, description, lgbti_relevance_score')
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

    let scored = 0, failed = 0, raised = 0, lowered = 0
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
          messages: [
            { role: 'system', content: MARKETPLACE_RELEVANCE_SYSTEM },
            { role: 'user', content: buildMarketplaceRelevanceUserPrompt(items) },
          ],
          temperature: 0,
          max_tokens: 1500,
          timeoutMs: 40_000,
          retries: 2,
        })
        scores = parseMarketplaceRelevance(res.content)
      } catch (e) {
        failed += chunk.length
        await logPipelineError(supabase, 'marketplace-relevance-rescore', e, { severity: 'warn' })
        continue
      }

      for (let idx = 0; idx < chunk.length; idx++) {
        const s = scores.get(idx)
        if (s === undefined) { failed++; continue }
        const prev = Number(chunk[idx].lgbti_relevance_score)
        if (Number.isFinite(prev)) { if (s > prev) raised++; else if (s < prev) lowered++ }
        if (!dryRun) {
          await supabase.from('marketplace_listings')
            .update({ lgbti_relevance_score: s, classified_at: now })
            .eq('id', chunk[idx].id)
        }
        scored++
      }
    }

    return jsonResponse({
      success: true,
      items: rows.length,
      scored, failed, raised, lowered,
      elapsed_ms: Date.now() - startedAt,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('marketplace-relevance-rescore:', error)
    await logPipelineError(supabase, 'marketplace-relevance-rescore', error, { severity: 'error' })
    return errorResponse((error as Error).message, 500, req)
  }
})
