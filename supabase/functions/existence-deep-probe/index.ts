// existence-deep-probe — body-reading existence collector for venues + marketplace.
//
// The cheap HEAD-only checkers (venue-url-checker, marketplace-link-checker) emit
// http_status signals. This bounded job goes deeper on a small batch: it fetches the
// page body and emits JSON-LD (availability/eventStatus) + regex "permanently closed"
// signals, and — only on an inconclusive HTTP-200 — escalates to a circuit-broken,
// daily-capped LLM page-read. Events are covered by event-liveness-checker (which
// already body-fetches), so this handles venue + marketplace. Nothing here archives;
// it only feeds entity_existence_signals for run_existence_decision.
//
// Auth: X-Webhook-Secret (cron) or admin/service-role. Body:
//   { entity_type?: 'venue'|'marketplace'|'both', batch_limit?, llm_daily_cap?, dry_run? }

import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { logPipelineError } from '../_shared/pipeline-error-log.ts'
import { probeExistence, classifyPageLlm, fetchHtml, insertSignals, type ExistenceSignal, type EntityType } from '../_shared/existence-probe.ts'

const DEFAULT_BATCH = 40
const DEFAULT_LLM_CAP = 150
const BETWEEN_MS = 300

async function llmUsedToday(supabase: ReturnType<typeof getServiceClient>): Promise<number> {
  const start = new Date(); start.setUTCHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('entity_existence_signals')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'existence-probe:llm')
    .gte('observed_at', start.toISOString())
  return count ?? 0
}

async function runType(
  supabase: ReturnType<typeof getServiceClient>,
  entityType: EntityType,
  rows: Array<{ id: string; url: string | null }>,
  llmBudget: { left: number },
  dryRun: boolean,
): Promise<{ checked: number; signals: number; llm: number }> {
  let checked = 0, llm = 0
  const all: ExistenceSignal[] = []
  for (let i = 0; i < rows.length; i++) {
    const { id, url } = rows[i]
    if (!url) continue
    checked++
    try {
      const { signals, needsLlm } = await probeExistence({ entityType, entityId: id, url })
      all.push(...signals)
      if (needsLlm && llmBudget.left > 0) {
        const { body } = await fetchHtml(url)
        if (body) {
          const sig = await classifyPageLlm(supabase, { entityType, entityId: id, url, html: body })
          if (sig) { all.push(sig); llm++; llmBudget.left-- }
        }
      }
    } catch (_e) { /* skip this row */ }
    if (i < rows.length - 1) await new Promise((r) => setTimeout(r, BETWEEN_MS))
  }
  if (!dryRun) await insertSignals(supabase, all)
  return { checked, signals: all.length, llm }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  const secret = Deno.env.get('EXISTENCE_WEBHOOK_SECRET')
  const provided = req.headers.get('X-Webhook-Secret')
  if (!(secret && provided && provided === secret)) {
    const auth = await requireInternalOrAdmin(req, supabase); if (auth instanceof Response) return auth
  }

  try {
    const body = await req.json().catch(() => ({}))
    const which: string = body.entity_type ?? 'both'
    const batch = Number(body.batch_limit ?? DEFAULT_BATCH)
    const cap = Number(body.llm_daily_cap ?? DEFAULT_LLM_CAP)
    const dryRun: boolean = body.dry_run ?? false

    const used = await llmUsedToday(supabase)
    const llmBudget = { left: Math.max(0, cap - used) }

    const out: Record<string, unknown> = { dry_run: dryRun, llm_budget_start: llmBudget.left }

    if (which === 'venue' || which === 'both') {
      const { data, error } = await supabase.rpc('venues_due_for_existence_check', { p_limit: batch })
      if (error) return errorResponse(`venues selector: ${error.message}`, 500, req)
      const rows = (data ?? []).map((r: { id: string; website: string | null }) => ({ id: r.id, url: r.website }))
      out.venue = await runType(supabase, 'venue', rows, llmBudget, dryRun)
    }
    if (which === 'marketplace' || which === 'both') {
      const { data, error } = await supabase.rpc('marketplace_due_for_existence_check', { p_limit: batch })
      if (error) return errorResponse(`marketplace selector: ${error.message}`, 500, req)
      const rows = (data ?? []).map((r: { id: string; external_url: string | null }) => ({ id: r.id, url: r.external_url }))
      out.marketplace = await runType(supabase, 'marketplace', rows, llmBudget, dryRun)
    }

    out.llm_budget_left = llmBudget.left
    return jsonResponse({ success: true, ...out }, 200, req)
  } catch (error) {
    console.error('existence-deep-probe:', error)
    await logPipelineError(supabase, 'existence-deep-probe', error, { severity: 'warn' })
    return errorResponse((error as Error).message, 500, req)
  }
})
