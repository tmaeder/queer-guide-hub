import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { logPipelineError } from '../_shared/pipeline-error-log.ts'
import { llmChatCompletion } from '../_shared/llm-client.ts'
import {
  MARKETPLACE_CATEGORY_SYSTEM,
  buildMarketplaceCategoryUserPrompt,
  parseMarketplaceCategory,
  labelForSlug,
  type CategoryItem,
} from '../_shared/prompts/marketplace-category.ts'

// ============================================================
// Marketplace Categorize (Phase 3, design 2026-06-07)
// Assigns a consistent content-based subcategory + subcategory_slug from a fixed
// taxonomy (see _shared/prompts/marketplace-category.ts), replacing the
// source-derived buckets (a dildo was "fetish_gear" from misterb but "sex_toys"
// from ohmyfantasy). Top-level `category` (products/services) is untouched.
// Browse tiles derive from distinct subcategory_slug, so this populates the UI.
//
// Only processes category='products' (services keep their own subcategories).
// Re-categorization is gated by a marker: rows whose subcategory_slug is already
// one of the new taxonomy slugs are skipped unless force=true.
// ============================================================

const LLM_BATCH     = 25
const DEFAULT_LIMIT = 250
const WALL_CLOCK_MS = 50_000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  const startedAt = Date.now()

  try {
    const body = await req.json().catch(() => ({}))
    const limit      = Number(body.limit ?? DEFAULT_LIMIT)
    const includeInactive = body.include_inactive ?? false
    const onlyOldSlug = body.only_old_slug ?? true // skip rows already on a new-taxonomy slug
    const dryRun     = body.dry_run ?? false

    let q = supabase
      .from('marketplace_listings')
      .select('id, title, brand, subcategory, subcategory_slug, description')
      .eq('category', 'products')
      .not('title', 'is', null)
      .order('updated_at', { ascending: true, nullsFirst: true })
      .limit(limit)
    if (!includeInactive) q = q.eq('status', 'active')
    // Re-categorize the legacy source-derived subcategories; once a row is set to
    // a new Title-Case label it no longer matches, so the sweep terminates.
    // (subcategory_slug is a generated column and cannot be filtered/written.)
    if (onlyOldSlug) {
      q = q.or('subcategory.is.null,subcategory.in.(fetish_gear,sex_toys,underwear)')
    }

    const { data: rows, error } = await q
    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    if (!rows || rows.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'nothing to categorize' }, 200, req)
    }

    let categorized = 0, failed = 0
    const dist: Record<string, number> = {}

    for (let i = 0; i < rows.length; i += LLM_BATCH) {
      if (Date.now() - startedAt > WALL_CLOCK_MS) break
      const chunk = rows.slice(i, i + LLM_BATCH)
      const items: CategoryItem[] = chunk.map((r, idx) => ({
        i: idx,
        title: r.title as string,
        brand: r.brand as string | null,
        subcategory: r.subcategory as string | null,
        description: r.description as string | null,
      }))

      let cats: Map<number, string>
      try {
        const res = await llmChatCompletion({
          messages: [
            { role: 'system', content: MARKETPLACE_CATEGORY_SYSTEM },
            { role: 'user', content: buildMarketplaceCategoryUserPrompt(items) },
          ],
          temperature: 0,
          max_tokens: 1200,
          timeoutMs: 40_000,
          retries: 2,
        })
        cats = parseMarketplaceCategory(res.content)
      } catch (e) {
        failed += chunk.length
        await logPipelineError(supabase, 'marketplace-categorize', e, { severity: 'warn' })
        continue
      }

      for (let idx = 0; idx < chunk.length; idx++) {
        const slug = cats.get(idx)
        if (!slug) { failed++; continue }
        dist[slug] = (dist[slug] ?? 0) + 1
        if (!dryRun) {
          // Only write `subcategory`; subcategory_slug is a generated column.
          const { error: upErr } = await supabase.from('marketplace_listings')
            .update({ subcategory: labelForSlug(slug) })
            .eq('id', chunk[idx].id)
          if (upErr) { failed++; continue }
        }
        categorized++
      }
    }

    return jsonResponse({
      success: true,
      items: rows.length,
      categorized, failed,
      distribution: dist,
      elapsed_ms: Date.now() - startedAt,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('marketplace-categorize:', error)
    await logPipelineError(supabase, 'marketplace-categorize', error, { severity: 'error' })
    return errorResponse((error as Error).message, 500, req)
  }
})
