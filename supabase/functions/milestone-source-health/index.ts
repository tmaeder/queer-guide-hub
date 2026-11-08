import {
  corsResponse,
  errorResponse,
  getServiceClient,
  jsonResponse,
  requireInternalOrAdmin,
} from '../_shared/supabase-client.ts'
import { logPipelineError } from '../_shared/pipeline-error-log.ts'
import { detectMilestoneDateEvidence, probeMilestoneSource } from '../_shared/milestone-source-health.ts'

const DEFAULT_BATCH = 50

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  const auth = await requireInternalOrAdmin(req, supabase)
  if (auth instanceof Response) return auth

  try {
    const body = await req.json().catch(() => ({}))
    const limit = Math.min(Math.max(Number(body.limit ?? DEFAULT_BATCH), 1), 200)
    const dryRun = body.dry_run === true
    const { data: claimed, error: claimError } = await supabase.rpc('claim_milestone_source_health', {
      p_limit: limit,
    })
    if (claimError) return errorResponse(`claim: ${claimError.message}`, 500, req)

    const rows = claimed ?? []
    const byDomain = new Map<string, typeof rows>()
    for (const row of rows) {
      const queue = byDomain.get(row.domain) ?? []
      queue.push(row)
      byDomain.set(row.domain, queue)
    }

    let changed = 0
    let failed = 0
    const affected = new Set<string>()
    const domainQueues = [...byDomain.values()]

    const worker = async () => {
      for (;;) {
        const queue = domainQueues.shift()
        if (!queue) return
        for (const row of queue) {
          const result = await probeMilestoneSource(row.source_url, { timeoutMs: 4_000 })
          const supports = ['event']
          if (detectMilestoneDateEvidence(result.bodyText, row.milestone_date, row.date_precision)) {
            supports.push('date')
          }
          affected.add(row.milestone_id)
          if (!dryRun) {
            const retryDays = result.healthState === 'rate_limited' ? 1
              : result.healthState === 'blocked' ? 7
              : result.healthState === 'missing' ? 30 : 14
            const { error } = await supabase.from('milestone_source_health').update({
              health_state: result.healthState,
              http_status: result.httpStatus,
              redirect_url: result.redirectUrl,
              last_error: result.error,
              supports,
              last_checked_at: new Date().toISOString(),
              next_check_at: new Date(Date.now() + retryDays * 86_400_000).toISOString(),
              check_attempts: row.check_attempts ? Number(row.check_attempts) + 1 : 1,
              updated_at: new Date().toISOString(),
            }).eq('id', row.id)
            if (error) failed++
            else changed++
          }
          // Domain-aware throttling: never burst requests at the same publisher.
          await new Promise((resolve) => setTimeout(resolve, 250))
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, domainQueues.length) }, () => worker()))

    if (dryRun && rows.length) {
      await supabase.rpc('release_milestone_source_health_claims', { p_ids: rows.map((row: { id: string }) => row.id) })
    }
    if (!dryRun && affected.size) {
      await supabase.rpc('mark_milestone_sources_for_rescore', { p_ids: [...affected] })
    }

    return jsonResponse({
      success: failed === 0,
      items_examined: rows.length,
      items_changed: changed,
      items_failed: failed,
      domains: byDomain.size,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    await logPipelineError(supabase, 'milestone-source-health', error, { severity: 'error' })
    return errorResponse((error as Error).message, 500, req)
  }
})
