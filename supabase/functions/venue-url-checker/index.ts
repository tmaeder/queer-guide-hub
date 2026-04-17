import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { logPipelineError } from '../_shared/pipeline-error-log.ts'

// ============================================================
// Venue URL Checker
// HEAD-requests each venue's website and updates url_status +
// url_checked_at. Runs weekly via pg_cron.
//
// Statuses: ok | redirect | broken | timeout | unknown
// ============================================================

const TIMEOUT_MS    = 8_000
const DEFAULT_BATCH = 200
const DEFAULT_STALE = 30   // re-check after N days

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const batchSize  = Number(body.batch_size  ?? DEFAULT_BATCH)
    const staleDays  = Number(body.stale_days  ?? DEFAULT_STALE)
    const dryRun     = body.dry_run ?? false

    // Pick venues whose url hasn't been checked for staleDays, or never
    const staleThreshold = new Date(Date.now() - staleDays * 86_400_000).toISOString()

    const { data: venues, error: fetchErr } = await supabase
      .from('venues')
      .select('id, website, url_status')
      .not('website', 'is', null)
      .or(`url_checked_at.is.null,url_checked_at.lt.${staleThreshold}`)
      .order('url_checked_at', { ascending: true, nullsFirst: true })
      .limit(batchSize)

    if (fetchErr) return errorResponse(`load: ${fetchErr.message}`, 500, req)
    if (!venues || venues.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'nothing to check' }, 200, req)
    }

    let ok = 0, broken = 0, redirect = 0, timeout = 0, skipped = 0

    for (const venue of venues) {
      const raw = (venue.website as string | null)?.trim()
      if (!raw) { skipped++; continue }

      const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`

      let status: 'ok' | 'broken' | 'redirect' | 'timeout' | 'unknown' = 'unknown'

      try {
        const controller = new AbortController()
        const tid = setTimeout(() => controller.abort(), TIMEOUT_MS)

        const resp = await fetch(url, {
          method: 'HEAD',
          redirect: 'manual',   // don't follow — detect redirects explicitly
          signal: controller.signal,
          headers: {
            'User-Agent': 'QueerGuide-LinkChecker/1.0 (+https://queer.guide/about)',
          },
        })
        clearTimeout(tid)

        if (resp.status >= 200 && resp.status < 300) {
          status = 'ok'; ok++
        } else if (resp.status >= 300 && resp.status < 400) {
          status = 'redirect'; redirect++
        } else {
          status = 'broken'; broken++
        }
      } catch (e) {
        const msg = (e as Error).message || ''
        if (msg.includes('abort') || msg.includes('signal')) {
          status = 'timeout'; timeout++
        } else {
          status = 'broken'; broken++
        }
      }

      if (!dryRun) {
        await supabase
          .from('venues')
          .update({
            url_status:     status,
            url_checked_at: new Date().toISOString(),
          })
          .eq('id', venue.id)
      }
    }

    return jsonResponse({
      success:    true,
      items:      venues.length,
      ok, broken, redirect, timeout, skipped,
      dry_run:    dryRun,
    }, 200, req)
  } catch (error) {
    console.error('venue-url-checker:', error)
    await logPipelineError(supabase, 'venue-url-checker', error, { severity: 'warning' })
    return errorResponse((error as Error).message, 500, req)
  }
})
