import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { logPipelineError } from '../_shared/pipeline-error-log.ts'
import { probeLink, isDeadLink, classifyHttpStatus, type LinkStatus } from '../_shared/link-health.ts'
import { extractProduct } from '../_shared/marketplace-extract.ts'

// ============================================================
// Marketplace Enrich (Phase 1 — Truth Loop, design 2026-06-07)
// Re-fetches each listing's external_url and backfills the gaps the original
// one-time scrapers never captured: description (JSON-LD Product → og → meta →
// DOM) and images (JSON-LD → og → DOM). Deterministic, $0 (no LLM).
// Also stamps link_health from the same fetch and demotes confirmed-dead links.
//
// Selects listings that are missing a usable description OR images, oldest-
// enriched first. Idempotent: re-running only touches still-empty fields.
// Runs on demand + daily via pg_cron. Batched to bound search-trigger write load.
// ============================================================

const TIMEOUT_MS    = 12_000
const DEFAULT_BATCH = 200
const MIN_DESC_LEN  = 50
const UA = 'QueerGuide-MarketplaceEnrich/1.0 (+https://queer.guide/about)'

async function fetchHtml(
  url: string,
): Promise<{ html: string | null; status: LinkStatus }> {
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const resp = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    })
    const status = classifyHttpStatus(resp.status)
    if (!resp.ok) {
      await resp.body?.cancel()
      return { html: null, status }
    }
    const ct = resp.headers.get('content-type') ?? ''
    if (!/html/i.test(ct)) {
      await resp.body?.cancel()
      return { html: null, status }
    }
    return { html: await resp.text(), status }
  } catch (e) {
    const msg = (e as Error).message || ''
    return { html: null, status: msg.includes('abort') ? 'timeout' : 'timeout' }
  } finally {
    clearTimeout(tid)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const batchSize = Number(body.batch_size ?? body.limit ?? DEFAULT_BATCH)
    const staleDays = Number(body.stale_days ?? 7)
    const dryRun    = body.dry_run ?? false

    const staleThreshold = new Date(Date.now() - staleDays * 86_400_000).toISOString()

    // Listings missing a usable description OR any image (external_url required —
    // it is the truth source) AND not enriched recently. Every processed row gets
    // link_checked_at stamped, so this staleness gate guarantees forward progress:
    // dead / no-gain rows are not reselected until they go stale again.
    const { data: listings, error: fetchErr } = await supabase
      .from('marketplace_listings')
      .select('id, external_url, affiliate_url, description, images')
      .not('external_url', 'is', null)
      .or(`description.is.null,description.eq.,images.is.null`)
      .or(`link_checked_at.is.null,link_checked_at.lt.${staleThreshold}`)
      .order('link_checked_at', { ascending: true, nullsFirst: true })
      .limit(batchSize)

    if (fetchErr) return errorResponse(`load: ${fetchErr.message}`, 500, req)
    if (!listings || listings.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'nothing to enrich' }, 200, req)
    }

    let descFilled = 0, imgFilled = 0, dead = 0, fetchFail = 0, noGain = 0

    for (const listing of listings) {
      const raw = (listing.external_url as string | null)?.trim()
        || (listing.affiliate_url as string | null)?.trim()
      if (!raw) { noGain++; continue }
      const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`

      const hasDesc = (listing.description as string | null) != null
        && (listing.description as string).trim().length >= MIN_DESC_LEN
      const curImages = (listing.images as string[] | null) ?? []
      const hasImage = Array.isArray(curImages) && curImages.length > 0

      const { html, status } = await fetchHtml(url)

      const update: Record<string, unknown> = {
        link_health:     status,
        link_checked_at: new Date().toISOString(),
        last_verified_at: new Date().toISOString(),
      }
      // Only a confirmed 404/410 demotes — never a bot-wall or transient error.
      if (isDeadLink(status)) { update.status = 'inactive'; dead++ }

      if (!html) {
        if (!isDeadLink(status)) fetchFail++ // hard-dead already counted in `dead`
        if (!dryRun) await supabase.from('marketplace_listings').update(update).eq('id', listing.id)
        continue
      }

      const prod = extractProduct(html, url)

      // Soft-404: HTTP 200 but the page is a "product no longer exists" stub
      // (no Product schema AND 404 copy). Demote like a hard-dead link.
      if (prod.notFound && !prod.hasProductSchema) {
        update.link_health = 'broken'
        update.status = 'inactive'
        dead++
        if (!dryRun) await supabase.from('marketplace_listings').update(update).eq('id', listing.id)
        continue
      }

      let gained = false
      // Description only from JSON-LD Product prose (extractor enforces source).
      if (!hasDesc && prod.description && prod.description.trim().length >= MIN_DESC_LEN) {
        update.description = prod.description.trim()
        descFilled++
        gained = true
      }
      // Fill images only on a confirmed product page (guards against soft-404
      // placeholder/logo images on stub pages without Product schema).
      if (!hasImage && prod.hasProductSchema && prod.images.length) {
        update.images = prod.images
        imgFilled++
        gained = true
      }
      if (!gained) noGain++

      if (!dryRun) {
        await supabase.from('marketplace_listings').update(update).eq('id', listing.id)
      }
    }

    return jsonResponse({
      success: true,
      items: listings.length,
      desc_filled: descFilled,
      img_filled: imgFilled,
      dead,
      fetch_fail: fetchFail,
      no_gain: noGain,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('marketplace-enrich:', error)
    await logPipelineError(supabase, 'marketplace-enrich', error, { severity: 'error' })
    return errorResponse((error as Error).message, 500, req)
  }
})
