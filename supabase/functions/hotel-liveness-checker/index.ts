// hotel-liveness-checker — link-rot / liveness for hotels. Probes each hotel's
// booking_url/website (HEAD→GET, redirect-manual) and records liveness. Only
// 404/410 mark a listing dead (bot-walls 401/403/405/429 + timeouts are NOT
// dead — see _shared/link-health.ts). Never deletes; dead rows are flagged for
// admin review. Runs stalest-first so a weekly cron sweeps the whole set.
//
// Auth: X-Webhook-Secret (reuses EVENT_QUALITY_WEBHOOK_SECRET) or admin/service-role.
// Body: { batch_limit?, dry_run?, hotel_ids? }.

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { hasValidWebhookSecret } from '../_shared/webhook-auth.ts'
import { probeLink } from '../_shared/link-health.ts'

const DEFAULT_BATCH = 50
const STEP = 'liveness'

// LinkStatus → stored liveness_status.
function toLiveness(s: string): string {
  if (s === 'ok') return 'live'
  if (s === 'redirect') return 'live'      // a redirect still resolves
  if (s === 'broken') return 'dead_link'   // 404/410 only
  if (s === 'blocked') return 'blocked'    // bot-wall — alive but unverifiable
  return 'unknown'                          // timeout/unknown — transient, never dead
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  if (!hasValidWebhookSecret(req, 'EVENT_QUALITY_WEBHOOK_SECRET')) {
    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth
  }

  const body = await req.json().catch(() => ({}))
  const batchLimit: number = body.batch_limit ?? DEFAULT_BATCH
  const dryRun: boolean = body.dry_run ?? false
  const hotelIds: string[] | undefined = body.hotel_ids

  let q = supabase.from('hotels').select('id, name, booking_url, website, liveness_status')
  if (hotelIds?.length) q = q.in('id', hotelIds)
  else q = q.order('liveness_checked_at', { ascending: true, nullsFirst: true }).limit(batchLimit)
  const { data: hotels, error } = await q
  if (error) return jsonResponse({ error: error.message, success: false }, 500, req)
  if (!hotels?.length) return jsonResponse({ checked: 0, message: 'none' }, 200, req)

  let live = 0, dead = 0, blocked = 0, unknown = 0, skipped = 0
  const deadList: Array<Record<string, unknown>> = []

  for (const h of hotels) {
    const url = h.booking_url || h.website
    if (!url) { skipped++; continue }
    let status: string
    try {
      status = toLiveness(await probeLink(url, { timeoutMs: 8000 }))
    } catch {
      status = 'unknown'
    }
    if (status === 'live') live++
    else if (status === 'dead_link') { dead++; deadList.push({ id: h.id, name: h.name, url }) }
    else if (status === 'blocked') blocked++
    else unknown++

    if (!dryRun) {
      await supabase.from('hotels').update({
        liveness_status: status,
        liveness_checked_at: new Date().toISOString(),
        last_verified_at: new Date().toISOString(),
      }).eq('id', h.id)
      await supabase.from('enrichment_log').insert({ entity_type: 'hotel', entity_id: h.id, step: STEP, status }).then(() => {}, () => {})
    }
  }

  return jsonResponse({ checked: hotels.length, live, dead, blocked, unknown, skipped, dead_listings: deadList, dry_run: dryRun }, 200, req)
})
