import { corsResponse, errorResponse, getServiceClient, jsonResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { buildQuestions, decide, parseEvaluation, POLICY_VERSION, SOURCES, type Context, type Evidence } from './policy.ts'
import { fetchEvidence } from './evidence.ts'
import { recoverSources } from './research.ts'
import { ProviderError } from './provider.ts'

type Job = { case_id: string; lease_token: string; queue_type: string }
async function evaluate(body: unknown) {
  const response = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${Deno.env.get('JEV_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) { await response.body?.cancel(); throw new ProviderError('Jev', response.status) }
  return await response.json()
}
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  if (req.method !== 'POST') return errorResponse('Use POST', 405, req)
  const db = getServiceClient(); const auth = await requireInternalOrAdmin(req, db)
  if (auth instanceof Response) return auth
  if (!Deno.env.get('JEV_API_KEY')) return errorResponse('JEV_API_KEY is not configured', 503, req)
  const started = new Date().toISOString()
  const budgetStarted = Date.now()
  const summary = { examined: 0, applied: 0, blocked: 0, retry: 0, stale: 0, preview: 0 }
  const rpc = async <T>(name: string, args: Record<string, unknown> = {}): Promise<T> => {
    const { data, error } = await db.rpc(name, args)
    if (error) throw new Error(`${name}: ${error.message}`)
    return data as T
  }
  let runId: number | null = null
  const recordRun = async (failed: boolean, reason?: string) => {
    if (runId !== null) {
      const { error } = await db.from('admin_automation_runs').update({ status: failed ? 'error' : 'success', finished_at: new Date().toISOString(), items_examined: summary.examined, items_changed: summary.applied, summary: { ...summary, reason, policy_version: POLICY_VERSION } }).eq('id', runId).eq('automation_slug', 'review_jev')
      if (error) console.error('Jev run log update failed:', error.message)
    }
    const { error } = await db.from('admin_automations').update({ last_run_at: started, last_run_status: failed ? 'error' : 'success' }).eq('slug', 'review_jev')
    if (error) console.error('Jev automation status failed:', error.message)
  }
  try {
    const body = await req.json().catch(() => ({}))
    runId = Number.isSafeInteger(body.run_id) ? body.run_id : null
    if (body.probe === true) {
      const answer = await evaluate({ model: Deno.env.get('JEV_MODEL') || 'jev-1.14.0', state: 'Synthetic integration test only: 2 + 2 = 4.', questions: { answer: { type: 'choice', instructions: 'Is the arithmetic statement correct?', criteria: { correct: 'The arithmetic is correct.', incorrect: 'The arithmetic is incorrect.' } } } })
      const probe = answer as { model?: string; answers?: { answer?: { choice?: string } } }
      if (!probe.model || probe.answers?.answer?.choice !== 'correct') throw new Error('Jev synthetic probe failed')
      return jsonResponse({ success: true, configured: true, model: probe.model, probe: 'passed' }, 200, req)
    }
    // A global outage must never turn otherwise actionable cases into evidence blockers.
    if (body.case_id !== undefined && (typeof body.case_id !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(body.case_id))) return errorResponse('Invalid case_id', 400, req)
    const jobs = body.case_id
      ? await rpc<Job[]>('claim_jev_review_job', { p_case_id: body.case_id })
      : await rpc<Job[]>('claim_jev_review_jobs', { p_batch: Math.min(16, Math.max(1, Math.trunc(Number(body.batch)) || 8)) })
    let globalFailure: string | null = null
    for (const job of jobs) {
      summary.examined++
      let context: Context | undefined; let evidence: Evidence[] = []; let result: Record<string, unknown>
      try {
        if (Date.now() - budgetStarted > 150000) throw new Error('worker_budget_deferred')
        if (globalFailure) throw new Error(globalFailure)
        if (!(job.queue_type in SOURCES)) throw new Error(`Unregistered Review source: ${job.queue_type}`)
        context = await rpc<Context>('get_jev_review_context', { p_case_id: job.case_id, p_lease_token: job.lease_token })
        if (context.blocker) result = { blocker: context.blocker }
        else {
          const errors: string[] = []
          const integrityOnly = context.candidates.length === 1 && context.candidates[0].action === 'reject' && typeof context.candidates[0].payload.integrity_rule === 'string'
          if (integrityOnly) evidence.push({ url: 'https://queer.guide/admin', retrieved_at: new Date().toISOString(), kind: 'proposal_integrity', text: JSON.stringify({ rule: context.candidates[0].explanation, proposal: context.proposal, current_text: context.record?.description, scope: 'Proposal integrity only. No underlying historical or entity facts are certified.' }) })
          // Read only application-supplied source URLs. No model-generated destinations.
          for (const url of integrityOnly ? [] : context.urls.slice(0, 2)) {
            try { evidence.push(await fetchEvidence(url)) }
            catch (error) { errors.push(error instanceof Error ? error.message : 'Source fetch failed') }
          }
          if (!evidence.length) evidence = await recoverSources(context)
          if (!evidence.length) result = { blocker: context.urls.length ? 'source_unavailable' : 'missing_source_url', source_errors: errors }
          else {
            const request = buildQuestions(context, evidence)
            request.model = Deno.env.get('JEV_MODEL') || request.model
            const evaluation = parseEvaluation(await evaluate(request), context.candidates)
            const decision = decide(context, evaluation)
            result = { evaluation, blocker: decision.blocker, policy_version: POLICY_VERSION, source_errors: errors }
          }
        }
      } catch (error) {
        // Auth, balance, quotas and provider failures are operational failures, retried without data changes.
        if (error instanceof ProviderError && ([401, 402, 403, 429].includes(error.status) || error.status >= 500 && error.status <= 599)) globalFailure = error.message
        result = { retry: error instanceof Error ? error.message : 'Review evaluation failed' }
      }
      const saved = await rpc<{ status: keyof typeof summary }>('finish_jev_review_job', { p_case_id: job.case_id, p_lease_token: job.lease_token,
        p_input_hash: context?.input_hash ?? '', p_result: result, p_evidence: evidence, p_dry_run: body.dry_run !== false })
      if (saved.status in summary) summary[saved.status]++
    }
    await recordRun(Boolean(globalFailure), globalFailure ?? undefined)
    return jsonResponse({ success: !globalFailure, ...summary, policy_version: POLICY_VERSION, ...(globalFailure ? { error: globalFailure } : {}) }, globalFailure ? 503 : 200, req)
  } catch (error) {
    console.error('Review automation failed:', error instanceof Error ? error.message : error)
    await recordRun(true, 'review_automation_failed')
    return errorResponse('review_automation_failed', 500, req)
  }
})
