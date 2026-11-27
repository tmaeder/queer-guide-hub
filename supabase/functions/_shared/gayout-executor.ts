import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { jsonResponse, errorResponse } from './supabase-client.ts'
import { gayOutBatchResult } from './gayout-pipeline.ts'

/** Fenced continuations apply only to the dedicated GayOut DAG. */
export async function handleGayOutStep(supabase: SupabaseClient, supabaseUrl: string, serviceKey: string,
  run: Record<string, unknown>, nodeId: string, req: Request): Promise<Response> {
  const runId = String(run.id)
  const graph = run.pipeline_snapshot as { nodes?: Array<{ id: string; type: string; data?: { config?: Record<string, unknown> } }> }
  const node = graph?.nodes?.find(n => n.id === nodeId)
  if (!node) return errorResponse('GayOut step is absent from its run snapshot', 400, req)
  const { data: claim, error: claimError } = await supabase.rpc('gayout_claim_step', { p_run: runId, p_node: nodeId })
  if (claimError) return errorResponse(claimError.message, 500, req)
  if (!claim) return jsonResponse({ success: true, node: nodeId, status: 'ignored' }, 200, req)
  const previous = claim.state as Record<string, unknown>
  const context = (run.context || {}) as Record<string, unknown>, config = node.data?.config || {}
  let status = 500, result: unknown
  try {
    const { data: nodeType, error } = await supabase.from('pipeline_node_types').select('edge_function,is_enabled').eq('slug', node.type).single()
    if (error || !nodeType?.edge_function || !nodeType.is_enabled) throw new Error(error?.message || `GayOut stage ${node.type} is unavailable`)
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/${nodeType.edge_function}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ ...config,
        ...(node.type === 'source-gayout' ? { gayout_weekly_sync: true } : {}),
        // Matching can perform several database/provider calls per record.
        // Keep even older run snapshots within the invocation budget.
        ...(node.type === 'pipeline-deduplicate' ? { batch_size: Math.max(1, Math.min(config.targetTable === 'organizations' ? 2 : 5, Number(config.batch_size) || 5)) } : {}),
        ...(node.type === 'pipeline-commit' ? { batch_size: Math.max(1, Math.min(10, Number(config.batch_size) || 10)) } : {}),
        dry_run: context.dry_run === true, pipeline_run_id: runId, node_id: nodeId }),
      signal: AbortSignal.timeout(Math.max(10, Math.min(110, Number(config.invocation_timeout_seconds) || 100)) * 1000),
    })
    status = response.status; result = await response.json()
  } catch (error) { result = { success: false, error: error instanceof Error ? error.message : String(error) } }
  const batch = gayOutBatchResult(status, result, config.drain_until_empty === true, context.dry_run === true)
  const started = typeof previous.started_at === 'string' ? previous.started_at : new Date().toISOString()
  const value = result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : {}
  const state = {
    status: !batch.success ? 'failed' : batch.repeat ? 'pending' : 'completed', started_at: started,
    ...(!batch.repeat || !batch.success ? { completed_at: new Date().toISOString() } : {}),
    items_in: Number(previous.items_in || 0) + batch.processed, items_out: Number(previous.items_out || 0) + batch.itemsOut,
    duration_ms: Math.max(0, Date.now() - Date.parse(started)), ...(batch.error ? { error: batch.error } : {}),
    ...(value.summary && typeof value.summary === 'object' ? { source_summary: value.summary } : {}),
  }
  const { data: accepted, error } = await supabase.rpc('gayout_finish_step', {
    p_run: runId, p_node: nodeId, p_token: claim.token, p_state: state, p_processed: batch.processed,
    p_succeeded: batch.succeeded, p_failed: batch.failed, p_repeat: batch.repeat, p_delay: batch.delaySeconds,
  })
  if (error) return errorResponse(`GayOut checkpoint: ${error.message}`, 500, req)
  return jsonResponse({ success: accepted ? batch.success : true, node: nodeId, status: accepted ? state.status : 'ignored',
    items_out: batch.itemsOut, ...(batch.error ? { error: batch.error } : {}) }, 200, req)
}
