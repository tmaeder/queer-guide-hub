import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { extractArticle } from '../_shared/news-quality/extract.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Pipeline Extract Full-Text (News) — fetch the source URL and recover the full
// article body + metadata that RSS truncates. Runs AFTER pipeline-normalize and
// BEFORE pipeline-sanitize-news, so every downstream stage (sanitize, AI enrich,
// quality-enhance, validate, score) reasons over full text instead of stubs.
//
// Idempotent: skips rows that already carry normalized_data.extraction_meta.
// Conservative: only replaces content when extraction yields materially MORE
// text than the RSS payload; never blanks an article on failure.

const FETCH_TIMEOUT_MS = 8000
const MAX_HTML_BYTES = 3_000_000
const MIN_GAIN_RATIO = 1.2   // require extracted ≥ 1.2× the RSS length to swap
const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide/bot)'

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!/text\/html|application\/xhtml/i.test(ct)) return null
    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_HTML_BYTES) return null
    return new TextDecoder('utf-8').decode(buf)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

Deno.serve(withErrorReporting('pipeline-extract-fulltext', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string | undefined
    const batchSize     = Math.min(50, body.batch_size ?? 15)
    const dryRun        = body.dry_run === true

    let q = supabase
      .from('ingestion_staging')
      .select('id, normalized_data')
      .eq('target_table', 'news_articles')
      .eq('enrichment_status', 'pending')
      .not('normalized_data', 'is', null)
      .order('created_at', { ascending: true })
      .limit(batchSize)
    if (pipelineRunId) q = q.eq('pipeline_run_id', pipelineRunId)

    const { data: items, error } = await q
    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    if (!items || items.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'nothing to extract' }, 200, req)
    }

    let extracted = 0, skipped = 0, failed = 0, alreadyDone = 0

    for (const item of items) {
      const n = (item.normalized_data ?? {}) as Record<string, unknown>

      // Idempotency: already processed in a prior run.
      if (n.extraction_meta) { alreadyDone++; continue }

      const url = String(
        n.url ??
        (Array.isArray(n.urls) ? (n.urls as unknown[])[0] : '') ??
        '',
      ).trim()

      if (!/^https?:\/\//i.test(url)) { skipped++; continue }

      const rssContent = String(n.content ?? n.description ?? '')

      try {
        const html = await fetchHtml(url)
        const art = html ? extractArticle(html, url) : null

        const meta: Record<string, unknown> = {
          method: art?.method ?? 'fetch_failed',
          run_at: new Date().toISOString(),
          original_length: rssContent.length,
          extracted_length: art?.charCount ?? 0,
          applied: false,
        }

        const merged: Record<string, unknown> = { ...n }

        // Swap in full text only when it's a clear gain over the RSS stub.
        if (
          art && art.content &&
          art.content.length > rssContent.length * MIN_GAIN_RATIO &&
          art.content.length >= 250
        ) {
          merged.content = art.content
          meta.applied = true
          extracted++
        } else {
          skipped++
        }

        // Backfill thin/empty metadata from the page even when body wasn't swapped.
        if (art) {
          if (art.author && !n.author) merged.author = art.author
          if (art.publishedAt && !n.published_at) merged.published_at = art.publishedAt
          if (art.imageUrl && !n.image_url && !(Array.isArray(n.images) && n.images.length)) {
            merged.image_url = art.imageUrl
          }
          if (art.lang && !n.lang) merged.lang = art.lang
        }

        merged.extraction_meta = meta

        if (!dryRun) {
          const { error: upErr } = await supabase
            .from('ingestion_staging')
            .update({ normalized_data: merged, updated_at: new Date().toISOString() })
            .eq('id', item.id)
          if (upErr) { failed++; console.error(`extract update ${item.id}: ${upErr.message}`); continue }
        }
      } catch (e) {
        failed++
        console.error(`extract ${item.id}: ${(e as Error).message}`)
      }
    }

    return jsonResponse({
      success: true,
      items: extracted + skipped + alreadyDone,
      items_total: items.length,
      items_processed: extracted + skipped + failed + alreadyDone,
      items_succeeded: extracted,
      items_failed: failed,
      extracted, skipped, already_done: alreadyDone, failed,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-extract-fulltext:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
