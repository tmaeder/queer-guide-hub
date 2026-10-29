import { callJev, createJevBudget, JevBudgetDeferred } from './jev-client.ts'
import { buildPipelineRequest, PIPELINE_QUESTION_VERSION, pipelineJudgment, projectPipelineEvidence } from './jev-pipeline-judgments.ts'

export interface JevPipelineDb {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
  from(table: string): { select(columns: string): { in(column: string, ids: string[]): PromiseLike<{ data: Array<Record<string, unknown>> | null; error: unknown }> } }
}
/** No source writes or approval changes. Failures are observable shadow errors. */
export async function runPipelineShadow(db: JevPipelineDb, ids: string[], apiKey: string, account: 'production' | 'validation-2026-10-29' = 'production') {
  const summary = { mode: 'shadow', evaluated: 0, cached_or_leased: 0, excluded: 0, errors: 0, budget_deferred: 0, supported: 0, contradicted: 0, uncertain: 0 }
  if (!ids.length) return summary
  if (!apiKey.trim()) { summary.errors++; return summary }
  // Limit both per-run cost and added latency; the gate's legacy batch may be 200.
  const { data: rows, error } = await db.from('ingestion_staging')
    .select('id,entity_type,source_name,raw_data,normalized_data,enriched_data').in('id', ids.slice(0, 16))
  if (error || !rows) { summary.errors++; return summary }
  for (const row of rows) {
    if (summary.evaluated >= 4) break
    const { evidence } = projectPipelineEvidence(row)
    if (!evidence) { summary.excluded++; continue }
    const request = buildPipelineRequest(evidence)
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(request)))
    const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
    const token = crypto.randomUUID()
    const identity = { p_staging_id: row.id, p_input_hash: hash, p_model: request.model, p_policy_version: PIPELINE_QUESTION_VERSION, p_lease_token: token }
    const claim = await db.rpc('claim_jev_pipeline_check', { ...identity, p_source_name: evidence.source_name, p_entity_type: evidence.entity_type })
    if (claim.error || typeof claim.data !== 'boolean') { summary.errors++; break }
    if (!claim.data) { summary.cached_or_leased++; continue }
    try {
      const response = await callJev(request, { apiKey, caller: 'pipeline-review-gate.shadow', budget: createJevBudget(db, account) })
      const verdict = pipelineJudgment(response)
      const finished = await db.rpc('finish_jev_pipeline_check', { ...identity, p_verdict: verdict, p_answers: response.answers, p_input_tokens: response.usage.input_tokens })
      if (finished.error || finished.data !== true) { summary.errors++; break }
      summary.evaluated++; summary[verdict]++
    } catch (error) {
      const deferred = error instanceof JevBudgetDeferred
      const finished = await db.rpc('finish_jev_pipeline_check', { ...identity, p_verdict: deferred ? 'budget_deferred' : 'error', p_answers: {}, p_input_tokens: null })
      if (finished.error || finished.data !== true) summary.errors++
      if (deferred) summary.budget_deferred++
      else summary.errors++
      break
    }
  }
  return summary
}
