import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { sanitizeArticle } from '../_shared/news-quality/sanitize.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Retroactive sanitizer for already-committed news_articles.
// Applies the updated sanitize pipeline (HTML stripping + extended junk phrases)
// to live articles that passed through the old pipeline before 2026.06.21.
// Snapshots originals before mutating. Safe to run multiple times (idempotent via version guard).

Deno.serve(withErrorReporting('pipeline-resanitize-news', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const batchSize = Math.min(300, body.batch_size ?? 100)
    const dryRun = body.dry_run === true
    const targetVersion = '2026.06.21'

    // Select articles that likely have contamination and haven't been re-sanitized yet.
    const { data: items, error } = await supabase
      .from('news_articles')
      .select('id, title, content, quality_pipeline_version')
      .eq('seo_indexable', true)
      .is('duplicate_of_id', null)
      .not('content', 'is', null)
      .or([
        'content.ilike.%<p>%',
        'content.ilike.%<a %',
        'content.ilike.%&lt;%',
        'content.ilike.%&amp;%',
        'content.ilike.%©%',
        'content.ilike.%subscribe%',
        'content.ilike.%newsletter%',
        'content.ilike.%(opens in new window)%',
        'content.ilike.%Credit:%',
        'content.ilike.%Facebook Twitter%',
        'content.ilike.%Facebook\nTwitter%',
      ].join(','))
      .not('quality_pipeline_version', 'eq', targetVersion)
      .order('created_at', { ascending: false })
      .limit(batchSize)

    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    if (!items || items.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'nothing to resanitize' }, 200, req)
    }

    let updated = 0, skipped = 0, failed = 0
    const totalRemoved: Record<string, number> = {}

    for (const item of items) {
      try {
        const r = sanitizeArticle({ title: item.title ?? '', content: item.content ?? '' })

        if (!r.changed) { skipped++; continue }

        for (const a of r.removedArtifacts) {
          totalRemoved[a] = (totalRemoved[a] ?? 0) + 1
        }

        if (!dryRun) {
          // Snapshot original before mutating (idempotent — snapshot fn skips if already exists).
          await supabase.rpc('snapshot_news_article_original', {
            p_article_id: item.id,
            p_pipeline_version: item.quality_pipeline_version ?? 'pre-2026.06.21',
          }).then(({ error: snapErr }) => {
            if (snapErr) console.warn(`snapshot ${item.id}: ${snapErr.message}`)
          })

          const { error: upErr } = await supabase
            .from('news_articles')
            .update({
              title: r.title,
              content: r.content,
              quality_pipeline_version: targetVersion,
              last_quality_run_at: new Date().toISOString(),
            })
            .eq('id', item.id)

          if (upErr) { failed++; console.error(`update ${item.id}: ${upErr.message}`); continue }
        }
        updated++
      } catch (e) {
        failed++
        console.error(`resanitize item ${item.id} failed: ${(e as Error).message}`)
      }
    }

    return jsonResponse({
      success: true,
      dry_run: dryRun,
      items_total: items.length,
      updated, skipped, failed,
      removed_summary: totalRemoved,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-resanitize-news:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
