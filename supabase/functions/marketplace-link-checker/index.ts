import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { logPipelineError } from '../_shared/pipeline-error-log.ts'
import { probeLink, isDeadLink } from '../_shared/link-health.ts'
import { httpStatusSignal, insertSignals, type ExistenceSignal } from '../_shared/existence-probe.ts'

// ============================================================
// Marketplace Link Checker (M-2, audit 2026-06-05)
// Claims stale rows, probes external_url (fallback affiliate_url), and updates
// link_health + link_checked_at. A listing is demoted only after two separate
// confirmed 404/410 results. Runs hourly; current feed presence is credited as
// positive evidence by the claim function.
//
// link_health: ok | redirect | broken | timeout | unchecked
// ============================================================

const TIMEOUT_MS    = 8_000
const DEFAULT_BATCH = 75
const DEFAULT_STALE = 30 // re-check after N days
const CONCURRENCY   = 6  // parallel probes — serial probing capped a run at ~200 URLs

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  const _auth = await requireInternalOrAdmin(req, supabase); if (_auth instanceof Response) return _auth

  try {
    const body = await req.json().catch(() => ({}))
    const batchSize = Number(body.batch_size ?? body.limit ?? DEFAULT_BATCH)
    const staleDays = Number(body.stale_days ?? DEFAULT_STALE)
    const dryRun    = body.dry_run ?? false

    // Durable claims make concurrent/retried invocations harmless. The RPC
    // excludes feed-fresh rows because a current feed sighting is equivalent
    // liveness evidence for the 30-day coverage target.
    const claimToken = crypto.randomUUID()
    const { data: listings, error: fetchErr } = await supabase.rpc('marketplace_claim_link_checks', {
      p_limit: Math.min(Math.max(batchSize, 1), 200),
      p_stale_days: Math.max(staleDays, 1),
      p_claim_token: claimToken,
    })

    if (fetchErr) return errorResponse(`load: ${fetchErr.message}`, 500, req)
    if (!listings || listings.length === 0) {
      await supabase.rpc('marketplace_release_link_check_claims', { p_claim_token: claimToken })
      return jsonResponse({ success: true, items: 0, items_examined: 0, items_changed: 0, items_terminal: 0, items_failed: 0, message: 'nothing to check' }, 200, req)
    }

    let ok = 0, broken = 0, redirect = 0, timeout = 0, skipped = 0, failed = 0, deactivated = 0
    const sigs: ExistenceSignal[] = []

    // Serialize within each domain and parallelize only across domains. This
    // avoids bursts against small merchants while retaining useful throughput.
    const byHost = new Map<string, typeof listings>()
    for (const listing of listings) {
      const raw = (listing.external_url as string | null)?.trim() || (listing.affiliate_url as string | null)?.trim()
      let host = 'invalid'
      try { host = new URL(/^https?:\/\//i.test(raw || '') ? raw! : `https://${raw}`).hostname.toLowerCase() } catch { /* invalid bucket */ }
      const bucket = byHost.get(host) ?? []
      bucket.push(listing)
      byHost.set(host, bucket)
    }
    const hostQueues = [...byHost.values()]
    const worker = async () => {
      for (;;) {
        const bucket = hostQueues.shift()
        if (!bucket) return
        for (const listing of bucket) {
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

          const sig = httpStatusSignal('marketplace', listing.id as string, health)
          if (sig) sigs.push(sig)

          if (!dryRun) {
            const nextBrokenStreak = isDeadLink(health) ? Number(listing.link_broken_streak ?? 0) + 1 : 0
            const update: Record<string, unknown> = {
              link_health:     health,
              link_checked_at: new Date().toISOString(),
              link_broken_streak: nextBrokenStreak,
              link_last_failure_at: isDeadLink(health) ? new Date().toISOString() : null,
            }
            if (isDeadLink(health) && nextBrokenStreak >= 2) {
              update.status = 'inactive'
              update.archived_reason = 'link_broken_confirmed'
              update.archived_at = new Date().toISOString()
              deactivated++
            }
            const { error } = await supabase.from('marketplace_listings').update(update).eq('id', listing.id)
            if (error) failed++
          }
        }
        // The next bucket necessarily has a different host.
        await Promise.resolve()
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, hostQueues.length) }, () => worker()))

    if (!dryRun) await insertSignals(supabase, sigs)
    await supabase.rpc('marketplace_release_link_check_claims', { p_claim_token: claimToken })

    const changed = listings.length - skipped - failed

    return jsonResponse({
      success: failed === 0,
      items:   listings.length,
      items_examined: listings.length,
      items_changed: changed,
      items_terminal: changed,
      items_failed: failed,
      ok, broken, redirect, timeout, skipped, deactivated,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('marketplace-link-checker:', error)
    await logPipelineError(supabase, 'marketplace-link-checker', error, { severity: 'error' })
    return errorResponse((error as Error).message, 500, req)
  }
})
