import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { sanitizeArticle } from '../_shared/news-quality/sanitize.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Pipeline Sanitize (News) — deterministic junk-phrase removal + truncation detection.
// Runs on ingestion_staging rows BEFORE pipeline-enrich-news. Idempotent.

Deno.serve(withErrorReporting('pipeline-sanitize-news', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string | undefined
    const batchSize     = Math.min(500, body.batch_size ?? 100)
    const dryRun        = body.dry_run === true

    let q = supabase
      .from('ingestion_staging')
      .select('id, normalized_data, target_table')
      .in('target_table', ['news_articles'])
      .eq('enrichment_status', 'pending')
      .not('normalized_data', 'is', null)
      .order('created_at', { ascending: true })
      .limit(batchSize)
    if (pipelineRunId) q = q.eq('pipeline_run_id', pipelineRunId)

    const { data: items, error } = await q
    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    if (!items || items.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'nothing to sanitize' }, 200, req)
    }

    let updated = 0, skipped = 0, failed = 0
    const totalRemoved: Record<string, number> = {}

    for (const item of items) {
      try {
        const n = (item.normalized_data ?? {}) as Record<string, unknown>
        const title = String(n.title ?? n.name ?? '').trim()
        const content = String(n.content ?? n.body ?? '')
        if (!title && !content) { skipped++; continue }

        const r = sanitizeArticle({ title, content })

        if (!r.changed && !r.criticalPaywall && !r.truncated) {
          skipped++
          continue
        }

        for (const a of r.removedArtifacts) {
          totalRemoved[a] = (totalRemoved[a] ?? 0) + 1
        }

        if (!dryRun) {
          const merged = {
            ...n,
            title: r.title,
            content: r.content,
            sanitize_meta: {
              version: r.version,
              removed: r.removedArtifacts,
              truncated: r.truncated,
              critical_paywall: r.criticalPaywall,
              run_at: new Date().toISOString(),
            },
          }
          const { error: upErr } = await supabase
            .from('ingestion_staging')
            .update({ normalized_data: merged })
            .eq('id', item.id)
          if (upErr) { failed++; console.error(`sanitize update ${item.id}: ${upErr.message}`); continue }
        }
        updated++
      } catch (e) {
        failed++
        console.error(`sanitize item failed: ${(e as Error).message}`)
      }
    }

    return jsonResponse({
      success: true,
      items: updated + skipped,
      items_total: items.length,
      items_processed: updated + failed + skipped,
      items_succeeded: updated,
      items_failed: failed,
      updated, skipped, failed,
      removed_summary: totalRemoved,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-sanitize-news:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
