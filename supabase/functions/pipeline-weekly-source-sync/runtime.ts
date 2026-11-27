import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { jsonResponse, errorResponse } from '../_shared/supabase-client.ts'
import { batchSize, result, safeError, WEEKLY_PIPELINE } from './contracts.ts'
import type { SourceResult } from './contracts.ts'
import { dispatchSource } from './dispatch.ts'

interface WeeklyRun { id: string; pipeline_name: string; context: Record<string, unknown> }
interface WeeklyPipeline { id: string; name: string; default_context?: Record<string, unknown> }
interface Wake { run_id: string; job_ids?: string[] }

/** Durable messages are committed first; opportunistic wakes only reduce latency. */
function wakeJobs(data: Wake): void {
  const runtime = (globalThis as typeof globalThis & { EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void } }).EdgeRuntime
  if (!runtime || !data.job_ids?.length) return
  runtime.waitUntil((async () => {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const secret = Deno.env.get('INTERNAL_INVOKE_SECRET')
    if (!url || !key) return
    await Promise.allSettled(data.job_ids!.map(async job => {
      const response = await fetch(`${url}/functions/v1/pipeline-weekly-source-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key,
          ...(secret ? { 'X-Internal-Secret': secret } : {}),
        },
        body: JSON.stringify({ action: 'continue', pipeline_run_id: data.run_id, current_node_id: job }),
        signal: AbortSignal.timeout(125_000),
      })
      await response.body?.cancel()
    }))
  })())
}

export async function startWeeklySourceSync(
  client: SupabaseClient, pipeline: WeeklyPipeline, body: Record<string, unknown>, req: Request,
): Promise<Response> {
  const supplied = body.context && typeof body.context === 'object' && !Array.isArray(body.context)
    ? body.context as Record<string, unknown> : {}
  const defaults = pipeline.default_context ?? {}
  // Allowlist context: source settings and credentials never enter run snapshots.
  const context = {
    dry_run: body.dry_run === true || supplied.dry_run === true,
    batch_size: batchSize(body.batch_size ?? supplied.batch_size ?? defaults.batch_size),
    triggered_by: body.triggered_by === 'cron' || supplied.triggered_by === 'cron' ? 'cron' : 'manual',
    metrics_unit: 'sources',
  }
  const { data, error } = await client.rpc('start_weekly_source_sync', { p_pipeline: pipeline.id, p_context: context })
  if (error) return errorResponse('Could not start the weekly source sync', 500, req)
  if (!data?.run_id) return errorResponse('The weekly source sync is disabled', 409, req)
  wakeJobs(data)
  return jsonResponse({
    success: true, pipeline_run_id: data.run_id, pipeline_name: WEEKLY_PIPELINE,
    total_steps: 1, sources_total: data.total_sources, initial_nodes: ['weekly-sync'], reused_run: data.reused === true,
    dry_run: data.dry_run ?? context.dry_run,
  }, 200, req)
}

export async function continueWeeklySourceSync(
  client: SupabaseClient, run: WeeklyRun, jobId: string, req: Request,
): Promise<Response> {
  if (run.pipeline_name !== WEEKLY_PIPELINE || !/^[0-9a-f-]{36}$/i.test(jobId))
    return errorResponse('Invalid weekly source job', 400, req)
  const { data: claim, error } = await client.rpc('claim_weekly_source_sync_job', { p_run: run.id, p_job: jobId })
  if (error) return errorResponse('Could not claim the weekly source job', 500, req)
  if (!claim) return jsonResponse({ success: true, status: 'ignored' }, 200, req)
  let outcome: SourceResult
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const secret = Deno.env.get('INTERNAL_INVOKE_SECRET')
  try {
    if (!url || !key) outcome = { ...result('blocked', 'Internal source transport is not configured'), required_settings: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] }
    else outcome = await dispatchSource(client, claim, run.context, {
      url, serviceKey: key, internalSecret: secret, getEnv: name => Deno.env.get(name),
    })
  } catch (failure) {
    outcome = { ...result('failed', safeError((failure as Error).message, [key ?? '', secret ?? ''])), retryable: true }
  }
  const { data: finished, error: finishError } = await client.rpc('finish_weekly_source_sync_job', {
    p_run: run.id, p_job: jobId, p_token: claim.token, p_result: outcome,
  })
  if (finishError) return errorResponse('Could not persist the weekly source outcome; its lease will recover', 500, req)
  if (finished) wakeJobs(finished)
  return jsonResponse({ success: true, status: finished?.accepted ? (outcome.waiting ? 'waiting' : outcome.outcome) : 'ignored' }, 200, req)
}
