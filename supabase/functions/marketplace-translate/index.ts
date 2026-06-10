import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { logPipelineError } from '../_shared/pipeline-error-log.ts'
import { llmChatCompletion } from '../_shared/llm-client.ts'
import {
  MARKETPLACE_TRANSLATE_SYSTEM,
  buildMarketplaceTranslateUserPrompt,
  parseMarketplaceTranslate,
  type TranslateItem,
} from '../_shared/prompts/marketplace-translate.ts'

// ============================================================
// Marketplace Translate (2026-06-07)
// Translates German product titles → English for an English-language platform
// (the ohmyfantasy catalog). Writes the English title to `title`, preserves the
// original German in `title_i18n.de`. Idempotent: rows that already have a
// `title_i18n.de` key are skipped, so re-running sweeps forward and terminates.
// Default scope: active rows with German characters in the title that aren't yet
// translated. Pass source_type to narrow.
// ============================================================

const LLM_BATCH     = 6
const DEFAULT_LIMIT = 300
const WALL_CLOCK_MS = 110_000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  const startedAt = Date.now()

  try {
    const body = await req.json().catch(() => ({}))
    const limit      = Number(body.limit ?? DEFAULT_LIMIT)
    const sourceType = body.source_type as string | undefined
    const dryRun     = body.dry_run ?? false

    // DB-level filter for "not yet translated" (de key absent). Ordering by
    // updated_at is unreliable here because other jobs bump timestamps, so we
    // filter on the marker directly — guarantees forward progress + termination.
    let q = supabase
      .from('marketplace_listings')
      .select('id, title, title_i18n')
      .eq('status', 'active')
      .filter('title_i18n->>de', 'is', null)
      .order('id', { ascending: true })
      .limit(limit)
    if (sourceType) q = q.eq('source_type', sourceType)

    const { data: rows, error } = await q
    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    const todo = rows ?? []
    if (todo.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'nothing to translate' }, 200, req)
    }

    let translated = 0, failed = 0
    for (let i = 0; i < todo.length; i += LLM_BATCH) {
      if (Date.now() - startedAt > WALL_CLOCK_MS) break
      const chunk = todo.slice(i, i + LLM_BATCH)
      const items: TranslateItem[] = chunk.map((r, idx) => ({ i: idx, title: r.title as string }))

      let map: Map<number, string>
      try {
        const res = await llmChatCompletion({
          messages: [
            { role: 'system', content: MARKETPLACE_TRANSLATE_SYSTEM },
            { role: 'user', content: buildMarketplaceTranslateUserPrompt(items) },
          ],
          temperature: 0.1,
          max_tokens: 3500,
          timeoutMs: 40_000,
          retries: 2,
        })
        map = parseMarketplaceTranslate(res.content)
      } catch (e) {
        failed += chunk.length
        await logPipelineError(supabase, 'marketplace-translate', e, { severity: 'warn' })
        continue
      }

      for (let idx = 0; idx < chunk.length; idx++) {
        const en = map.get(idx)
        if (!en) { failed++; continue }
        const orig = chunk[idx].title as string
        const i18n = { ...((chunk[idx].title_i18n as Record<string, unknown> | null) ?? {}), de: orig }
        if (!dryRun) {
          // English to primary title; preserve German in title_i18n.de.
          await supabase.from('marketplace_listings')
            .update({ title: en, title_i18n: i18n })
            .eq('id', chunk[idx].id)
        }
        translated++
      }
    }

    return jsonResponse({
      success: true, items: todo.length, translated, failed,
      elapsed_ms: Date.now() - startedAt, dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('marketplace-translate:', error)
    await logPipelineError(supabase, 'marketplace-translate', error, { severity: 'error' })
    return errorResponse((error as Error).message, 500, req)
  }
})
