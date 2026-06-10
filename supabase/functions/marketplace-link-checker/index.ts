import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { logPipelineError } from '../_shared/pipeline-error-log.ts'
import { probeLink, isDeadLink } from '../_shared/link-health.ts'

// ============================================================
// Marketplace Link Checker (M-2, audit 2026-06-05)
// HEAD-requests each listing's external_url (fallback affiliate_url) and updates
// link_health + link_checked_at. Demotes broken listings to status='inactive'.
// Runs daily via pg_cron. Mirrors venue-url-checker.
//
// link_health: ok | redirect | broken | timeout | unchecked
// ============================================================

const TIMEOUT_MS    = 8_000
const DEFAULT_BATCH = 200
const DEFAULT_STALE = 30 // re-check after N days

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  const _auth = await requireInternalOrAdmin(req, supabase); if (_auth instanceof Response) return _auth

  try {
    const body = await req.json().catch(() => ({}))
    const batchSize = Number(body.batch_size ?? body.limit ?? DEFAULT_BATCH)
    const staleDays = Number(body.stale_days ?? DEFAULT_STALE)
    const dryRun    = body.dry_run ?? false

    const staleThreshold = new Date(Date.now() - staleDays * 86_400_000).toISOString()

    // Pick listings whose link hasn't been checked for staleDays, or never.
    const { data: listings, error: fetchErr } = await supabase
      .from('marketplace_listings')
      .select('id, external_url, affiliate_url, link_health')
      .or(`link_checked_at.is.null,link_checked_at.lt.${staleThreshold}`)
      .order('link_checked_at', { ascending: true, nullsFirst: true })
      .limit(batchSize)

    if (fetchErr) return errorResponse(`load: ${fetchErr.message}`, 500, req)
    if (!listings || listings.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'nothing to check' }, 200, req)
    }

    let ok = 0, broken = 0, redirect = 0, timeout = 0, skipped = 0

    for (const listing of listings) {
      const raw = (listing.external_url as string | null)?.trim()
        || (listing.affiliate_url as string | null)?.trim()
      if (!raw) { skipped++; continue }

      const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`

      // HEAD→GET probe. Only an explicit 404/410 is 'broken'; 401/403/405/429 are
      // 'blocked' (alive, bot-protected), network errors 'timeout'. A listing is
      // deactivated ONLY on a confirmed-dead link — bot walls / rate limits must
      // never deactivate a live product (the false-positive bug that paused this cron).
      const health = await probeLink(url, { timeoutMs: TIMEOUT_MS })
      if (health === 'ok') ok++
      else if (health === 'redirect') redirect++
      else if (health === 'broken') broken++
      else if (health === 'timeout') timeout++

      if (!dryRun) {
        const update: Record<string, unknown> = {
          link_health:     health,
          link_checked_at: new Date().toISOString(),
        }
        if (isDeadLink(health)) update.status = 'inactive'
        await supabase.from('marketplace_listings').update(update).eq('id', listing.id)
      }
    }

    return jsonResponse({
      success: true,
      items:   listings.length,
      ok, broken, redirect, timeout, skipped,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('marketplace-link-checker:', error)
    await logPipelineError(supabase, 'marketplace-link-checker', error, { severity: 'error' })
    return errorResponse((error as Error).message, 500, req)
  }
})
