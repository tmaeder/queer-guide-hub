import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { cleanNewsBody, cleanNewsText, newsCleanupSafetyIssues, newsTextIssues, NEWS_TEXT_VERSION } from '../_shared/news-quality/text-cleanup.ts'
import { cleanupSource } from '../_shared/news-quality/source-wording.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Every invocation scans a bounded, ordered page. Scheduled calls persist a
// cursor so clean/no-op rows cannot starve older articles. Explicit full_scan
// calls return a cursor without changing scheduled progress (including dry runs).
Deno.serve(withErrorReporting('pipeline-resanitize-news', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  const auth = await requireInternalOrAdmin(req, supabase)
  if (auth instanceof Response) return auth
  try {
    const body = await req.json().catch(() => ({}))
    const requestedBatch = Math.trunc(Number(body.batch_size))
    const batchSize = Number.isFinite(requestedBatch) ? Math.max(1, Math.min(20, requestedBatch)) : 20
    const dryRun = body.dry_run === true
    const scheduled = body.full_scan !== true && !dryRun
    let cursor = body.cursor ?? null
    if (cursor && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(cursor)) return errorResponse('Invalid cursor', 400, req)
    if (scheduled) {
      const { data, error } = await supabase.rpc('news_text_cleanup_cursor')
      if (error) throw new Error(`read cursor: ${error.message}`)
      cursor = data
    }
    // Podcast show notes have their own structure/sponsor policy and worker.
    // Keep this article-prose sweep from flagging legitimate episode metadata.
    let q = supabase.from('news_articles').select('id,title,content,excerpt,author,auto_publish_blocked_reasons,ingestion_staging_id')
      .or('media_type.is.null,media_type.neq.podcast')
      .order('id', { ascending: true }).limit(batchSize)
    if (cursor) q = q.gt('id', cursor)
    if (body.end_cursor) {
      if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(body.end_cursor)) return errorResponse('Invalid end cursor', 400, req)
      q = q.lte('id', body.end_cursor)
    }
    const { data: items, error } = await q
    if (error) throw new Error(`scan: ${error.message}`)
    const { data: sources, error: sourcesError } = await supabase.rpc('news_text_cleanup_sources', { p_ids: (items ?? []).map(item => item.id), p_version: NEWS_TEXT_VERSION })
    if (sourcesError) throw new Error(`read backups: ${sourcesError.message}`)
    const backups = new Map((sources ?? []).map((row: { article_id: string; original: Record<string, string | null>; cleaned: Record<string, string | null> }) => [row.article_id, row]))
    const stagingIds = (items ?? []).map(item => item.ingestion_staging_id).filter(Boolean)
    const { data: staging, error: stagingError } = stagingIds.length
      ? await supabase.from('ingestion_staging').select('id,raw_data').in('id', stagingIds)
      : { data: [], error: null }
    if (stagingError) throw new Error(`read source formatting: ${stagingError.message}`)
    const rawBodies = new Map((staging ?? []).map(row => [row.id, String(row.raw_data?.content ?? '').length <= 300_000 ? String(row.raw_data?.content ?? '') : '']))
    const patches: Array<Record<string, unknown>> = []
    const samples: Array<Record<string, unknown>> = []
    let needsReview = 0, scanned = 0, textBytes = 0
    let lastScanned: string | null = cursor
    for (const item of items ?? []) {
      const expected = { title: item.title, content: item.content, excerpt: item.excerpt, author: item.author }
      const backup = backups.get(item.id) as { original: Record<string, string | null>; cleaned: Record<string, string | null> } | undefined
      const source = (field: 'title' | 'content' | 'excerpt' | 'author') => cleanupSource(item[field], backup?.original[field], backup?.cleaned[field])
      const size = (source('content')?.length ?? 0) + (source('excerpt')?.length ?? 0)
      // Bound text work as well as row count: a single long scraped page must
      // not exhaust the edge worker and repeatedly starve the cursor.
      const workSize = size + (rawBodies.get(item.ingestion_staging_id)?.length ?? 0)
      if (scanned > 0 && textBytes + workSize > 100_000) break
      textBytes += Math.min(workSize, 600_000)
      scanned++; lastScanned = item.id
      const title = item.title === null ? null : cleanNewsText(source('title') ?? '', { field: 'title' })
      const cleaned = size > 300_000 ? { ...expected } : {
        title,
        content: item.content === null ? null : cleanNewsBody(source('content') ?? '', rawBodies.get(item.ingestion_staging_id) || source('excerpt') || '', title ?? undefined),
        excerpt: item.excerpt === null ? null : cleanNewsText(source('excerpt') ?? '', { field: 'excerpt' }),
        author: item.author === null ? null : cleanNewsText(source('author') ?? '', { field: 'title' }),
      }
      const issues = size > 300_000 ? ['oversized_text'] : newsTextIssues(`${cleaned.content ?? ''}\n${cleaned.excerpt ?? ''}`)
      const safety = size > 300_000 ? [] : newsCleanupSafetyIssues(source('content') ?? '', cleaned.content ?? '')
      if (safety.length) { cleaned.content = item.content; issues.push(...safety) }
      if (issues.length) needsReview++
      const markReview = issues.length > 0 && !item.auto_publish_blocked_reasons?.includes('text_hygiene')
      if (JSON.stringify(cleaned) === JSON.stringify(expected) && !markReview) continue
      patches.push({ id: item.id, expected, cleaned, issues })
      if (samples.length < 3) samples.push({ id: item.id, title, before: item.content?.slice(0, 1500), after: cleaned.content?.slice(0, 1500) })
    }
    let updated = 0
    if (!dryRun && patches.length) {
      const { data, error: updateError } = await supabase.rpc('news_apply_text_cleanup', { p_patches: patches, p_version: NEWS_TEXT_VERSION })
      if (updateError) throw new Error(`snapshot/update: ${updateError.message}`)
      updated = Number(data)
    }
    const complete = scanned === (items?.length ?? 0) && (items?.length ?? 0) < batchSize
    const nextCursor = complete ? null : lastScanned
    if (scheduled) {
      const { error: cursorError } = await supabase.rpc('news_text_cleanup_cursor', { p_write: true, p_cursor: nextCursor })
      if (cursorError) throw new Error(`save cursor: ${cursorError.message}`)
    }
    return jsonResponse({ success: true, dry_run: dryRun, version: NEWS_TEXT_VERSION,
      scanned, changed: patches.length, updated,
      concurrent_edits_skipped: dryRun ? 0 : patches.length - updated,
      needs_review: needsReview, next_cursor: nextCursor, complete, samples,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-resanitize-news', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
