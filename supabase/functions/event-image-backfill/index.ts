import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireAdmin } from '../_shared/supabase-client.ts'
import { scrapeSocialCardImage } from '../_shared/news-quality/image-replace.ts'
import { gateImages } from '../_shared/image-gate.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Backfill og:image / twitter:image for events that have a URL but no image (P1).
// Reuses the same social-card scraper as backfill-news-images. Gates the result
// (drops logos / sprites / svg / data-uris) before storing into events.images.
// Safe to run repeatedly — only touches rows with an empty images array.

Deno.serve(withErrorReporting('event-image-backfill', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const adminErr = await requireAdmin(req)
  if (adminErr) return adminErr

  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const batchSize = Math.min(50, body.batch_size ?? 30)
    const dryRun = body.dry_run === true

    // Events with a usable URL but no image. Prefer upcoming first (user-facing).
    const { data: events, error } = await supabase
      .from('events')
      .select('id, website, ticket_url, images, start_date')
      .is('duplicate_of_id', null)
      .or('website.not.is.null,ticket_url.not.is.null')
      .order('start_date', { ascending: false })
      .limit(batchSize * 6) // over-fetch; many rows already have images, filtered below

    if (error) return errorResponse(`load: ${error.message}`, 500, req)

    const candidates = (events ?? [])
      .filter((e) => !Array.isArray(e.images) || e.images.length === 0)
      .slice(0, batchSize)

    if (candidates.length === 0) {
      return jsonResponse({ success: true, found: 0, message: 'No events need images' }, 200, req)
    }

    let updated = 0, failed = 0, noImage = 0, gated = 0

    for (const ev of candidates) {
      const url = (ev.website || ev.ticket_url) as string
      try {
        const result = await scrapeSocialCardImage(url, AbortSignal.timeout(10000))
        if (!result) { noImage++; continue }

        const kept = gateImages([result.imageUrl]).kept
        if (kept.length === 0) { gated++; continue }

        if (!dryRun) {
          const { error: upErr } = await supabase
            .from('events')
            .update({ images: kept })
            .eq('id', ev.id)
          if (upErr) { failed++; continue }
        }
        updated++
      } catch {
        failed++
      }
    }

    return jsonResponse({
      success: true,
      candidates: candidates.length,
      updated,
      no_image: noImage,
      gated_out: gated,
      failed,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('event-image-backfill:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
