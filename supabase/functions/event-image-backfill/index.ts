import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { hasValidWebhookSecret } from '../_shared/webhook-auth.ts'
import { scrapeSocialCardImage } from '../_shared/news-quality/image-replace.ts'
import { gateImages } from '../_shared/image-gate.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// Backfill og:image / twitter:image for events that have a URL but no image (P1).
// Gets the event's OWN image from its source page (complements fetch-images,
// which fills stock/Pexels/Wikipedia art). Reuses the og:image social-card
// scraper pattern. Gates the result (drops logos/sprites/svg/data-uris)
// before storing into events.images. Safe to run repeatedly — only touches rows
// with an empty images array.
// Auth: X-Webhook-Secret (cron) or admin/service-role, mirroring the other
// event-quality functions so pg_cron can drive it with the Vault secret.

Deno.serve(withErrorReporting('event-image-backfill', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()
  if (!hasValidWebhookSecret(req, 'EVENT_QUALITY_WEBHOOK_SECRET')) {
    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth
  }

  try {
    const body = await req.json().catch(() => ({}))
    const batchSize = Math.min(50, body.batch_size ?? 30)
    const dryRun = body.dry_run === true

    // Events with a usable URL but no image. Prefer upcoming first (user-facing).
    const { data: events, error } = await supabase
      .from('events')
      .select('id, website, ticket_url, images, start_date')
      .is('duplicate_of_id', null)
      .or('images.is.null,images.eq.{}')
      .or('website.not.is.null,ticket_url.not.is.null')
      // Exclude the dominant shared homepage (1k+ WNBR events, no og:image) so
      // the over-fetch window reaches real per-event URLs instead of filling
      // with rows the hasEventPath() guard would only discard.
      .neq('website', 'https://worldnakedbikeride.org')
      .order('start_date', { ascending: false })
      .limit(batchSize * 8) // over-fetch; many rows already have images, filtered below

    if (error) return errorResponse(`load: ${error.message}`, 500, req)

    // Only event-specific pages yield a usable og:image. Skip bare-domain
    // homepages (path '/') — e.g. 1k+ World Naked Bike Ride events all point at
    // worldnakedbikeride.org, which has no og:image; without this guard a
    // recurring cron would re-fetch them forever (they never get an image, so
    // stay selected) and starve the real per-event URLs behind them.
    const hasEventPath = (raw: string | null): boolean => {
      if (!raw) return false
      try { const u = new URL(raw.replace(/^"|"$/g, '').trim()); return u.pathname.length > 1 || u.search.length > 0 }
      catch { return false }
    }

    const candidates = (events ?? [])
      .filter((e) => !Array.isArray(e.images) || e.images.length === 0)
      .filter((e) => hasEventPath((e.website || e.ticket_url) as string | null))
      .slice(0, batchSize)

    if (candidates.length === 0) {
      return jsonResponse({ success: true, found: 0, message: 'No events need images' }, 200, req)
    }

    let updated = 0, failed = 0, noImage = 0, gated = 0

    for (const ev of candidates) {
      const url = ((ev.website || ev.ticket_url) as string).replace(/^"|"$/g, '').trim()
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
