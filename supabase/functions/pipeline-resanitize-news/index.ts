import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { sanitizeArticle, cleanShortText } from '../_shared/news-quality/sanitize.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Decode + strip every locale value of a *_i18n jsonb map. Returns the cleaned
// object plus whether anything changed (so we only write when needed).
function cleanI18n(map: unknown): { value: Record<string, string>; changed: boolean } {
  if (!map || typeof map !== 'object') return { value: {}, changed: false }
  const out: Record<string, string> = {}
  let changed = false
  for (const [locale, v] of Object.entries(map as Record<string, unknown>)) {
    const raw = typeof v === 'string' ? v : String(v ?? '')
    const cleaned = cleanShortText(raw, true)
    out[locale] = cleaned
    if (cleaned !== raw) changed = true
  }
  return { value: out, changed }
}

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

    const includeUnindexed = body.include_unindexed === true

    // Select articles that likely have contamination in ANY rendered field.
    // Entity/tag patterns are unambiguous (don't trip the version guard); the
    // junk-phrase patterns (subscribe/newsletter/…) stay version-guarded so the
    // cron stays a cheap no-op once the content backlog is clean.
    let q = supabase
      .from('news_articles')
      .select('id, title, content, excerpt, author, title_i18n, quality_pipeline_version')
      .is('duplicate_of_id', null)
    if (!includeUnindexed) q = q.eq('seo_indexable', true)
    const { data: items, error } = await q
      .or([
        // entity/tag contamination across rendered text fields (jsonb i18n is
        // cleaned opportunistically on any selected row + via the translate fix)
        'title.ilike.%&#%', 'title.ilike.%&lt;%', 'title.ilike.%&amp;%',
        'excerpt.ilike.%&#%', 'excerpt.ilike.%&lt;%', 'excerpt.ilike.%&amp;%', 'excerpt.ilike.%&nbsp;%',
        'author.ilike.%&#%', 'author.ilike.%&amp;%', 'author.ilike.%&lt;%',
        // body junk
        'content.ilike.%<p>%', 'content.ilike.%<a %', 'content.ilike.%&lt;%',
        'content.ilike.%&amp;%', 'content.ilike.%(opens in new window)%',
        'content.ilike.%Facebook Twitter%',
      ].join(','))
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
        const r = sanitizeArticle({
          title: item.title ?? '',
          content: item.content ?? '',
          excerpt: item.excerpt ?? '',
          author: item.author ?? '',
        })
        const i18n = cleanI18n(item.title_i18n)

        if (!r.changed && !i18n.changed) { skipped++; continue }

        for (const a of r.removedArtifacts) {
          totalRemoved[a] = (totalRemoved[a] ?? 0) + 1
        }
        if (i18n.changed) totalRemoved['title_i18n:cleaned'] = (totalRemoved['title_i18n:cleaned'] ?? 0) + 1

        if (!dryRun) {
          // Snapshot original before mutating (idempotent — snapshot fn skips if already exists).
          await supabase.rpc('snapshot_news_article_original', {
            p_article_id: item.id,
            p_pipeline_version: item.quality_pipeline_version ?? 'pre-2026.06.21',
          }).then(({ error: snapErr }) => {
            if (snapErr) console.warn(`snapshot ${item.id}: ${snapErr.message}`)
          })

          const patch: Record<string, unknown> = {
            title: r.title,
            content: r.content,
            quality_pipeline_version: targetVersion,
            last_quality_run_at: new Date().toISOString(),
          }
          // author goes through the DB trigger (decode + junk-byline nulling), so
          // only set it when there's a value; let null-out happen there.
          if (item.excerpt != null) patch.excerpt = r.excerpt
          if (item.author != null) patch.author = r.author
          if (i18n.changed) patch.title_i18n = i18n.value

          const { error: upErr } = await supabase
            .from('news_articles')
            .update(patch)
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
