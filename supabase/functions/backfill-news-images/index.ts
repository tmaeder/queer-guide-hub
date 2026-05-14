import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireAdmin } from '../_shared/supabase-client.ts'
import { scrapeSocialCardImage } from '../_shared/news-quality/image-replace.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Backfill OG images for news_articles missing image_url.
// Fetches og:image / twitter:image from the article URL.
// Safe to run repeatedly — only touches rows with NULL image_url.

Deno.serve(withErrorReporting('backfill-news-images', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const adminErr = await requireAdmin(req)
  if (adminErr) return adminErr

  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const batchSize = Math.min(100, body.batch_size ?? 50)
    const dryRun = body.dry_run === true

    const { data: articles, error } = await supabase
      .from('news_articles')
      .select('id, url')
      .or('image_url.is.null,image_url.eq.')
      .not('url', 'is', null)
      .neq('url', '')
      .order('published_at', { ascending: false })
      .limit(batchSize)

    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    if (!articles || articles.length === 0) {
      return jsonResponse({ success: true, found: 0, message: 'No articles need images' }, 200, req)
    }

    let updated = 0, failed = 0, noImage = 0

    for (const article of articles) {
      try {
        const result = await scrapeSocialCardImage(article.url, AbortSignal.timeout(10000))
        if (!result) { noImage++; continue }

        if (!dryRun) {
          const { error: upErr } = await supabase
            .from('news_articles')
            .update({ image_url: result.imageUrl })
            .eq('id', article.id)
          if (upErr) { failed++; continue }
        }
        updated++
      } catch {
        failed++
      }
    }

    return jsonResponse({
      success: true,
      candidates: articles.length,
      updated,
      no_image: noImage,
      failed,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('backfill-news-images:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
