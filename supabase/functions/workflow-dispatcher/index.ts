import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { jsonResponse, errorResponse, corsResponse, requireAdmin, getServiceClient } from '../_shared/supabase-client.ts'
import { reportApiError } from '../_shared/report-api-error.ts'

// Queue configuration: name → visibility timeout in seconds
const QUEUE_CONFIG: Record<string, number> = {
  scheduled_jobs: 300,    // 5 min
  import_jobs: 600,       // 10 min
  content_processing: 120, // 2 min
  pipeline_steps: 300,    // 5 min — DAG pipeline execution
}

const MAX_MESSAGES_PER_QUEUE = 10
const MAX_TOTAL_CONCURRENCY = 20

interface QueueMessage {
  msg_id: number
  read_ct: number
  enqueued_at: string
  vt: string
  message: {
    workflow: string
    triggered_by?: string
    idempotency_key?: string
    [key: string]: unknown
  }
}

interface WorkflowDefinition {
  id: string
  name: string
  edge_function: string
  queue_name: string
  default_payload: Record<string, unknown>
  max_retries: number
  retry_backoff_base: number
  max_concurrency: number
  timeout_seconds: number
  is_enabled: boolean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  // Use the service role key when the dispatcher invokes target edge functions.
  // The previous anon-key behaviour caused every target that ran supabase.auth.getUser()
  // in requireAdmin() / internal checks to return "Invalid authorization", which in turn
  // routed every scheduled workflow into the dead_letter queue.
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = getServiceClient()

  try {
    // Parse request — supports both cron (GET/POST with source=cron) and admin actions
    let action = 'dispatch'
    let payload: Record<string, unknown> = {}

    if (req.method === 'GET') {
      const url = new URL(req.url)
      action = url.searchParams.get('action') || 'dispatch'
    } else {
      try {
        payload = await req.json()
        action = (payload.action as string) || 'dispatch'
      } catch {
        // Empty body is fine for cron dispatch
      }
    }

    // Dispatch is called by cron (JWT verified by Supabase gateway).
    // All other actions are admin-only and require an authenticated admin user.
    if (action !== 'dispatch') {
      const authResult = await requireAdmin(req, supabase)
      if (authResult instanceof Response) return authResult
    }

    // Route actions
    switch (action) {
      case 'dispatch':
        return await handleDispatch(supabase, supabaseUrl, supabaseServiceRoleKey)

      case 'enqueue':
        return await handleEnqueue(supabase, payload)

      case 'retry':
        return await handleRetry(supabase, payload)

      case 'cancel':
        return await handleCancel(supabase, payload)

      case 'health_check':
        return await handleHealthCheck(supabase)

      case 'metrics':
        return await handleMetrics(supabase)

      default:
        return errorResponse(`Unknown action: ${action}`, 400, req)
    }
  } catch (error) {
    console.error('workflow-dispatcher error:', error)
    reportApiError('workflow-dispatcher', error, { endpoint: '/functions/v1/workflow-dispatcher' })
    return errorResponse('Internal server error', 500, req)
  }
})

// ─── DISPATCH: Read queues and invoke edge functions ────────────────────────

async function handleDispatch(
  supabase: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<Response> {
  const startTime = Date.now()
  const results: Record<string, unknown>[] = []

  // Check current running count to respect global concurrency
  const { count: runningCount } = await supabase
    .from('workflow_runs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'running')

  const availableSlots = MAX_TOTAL_CONCURRENCY - (runningCount || 0)
  if (availableSlots <= 0) {
    return jsonResponse({
      success: true,
      message: 'Max concurrency reached, skipping dispatch',
      running: runningCount,
    })
  }

  // Load workflow definitions (cached in memory for this invocation)
  const { data: definitions, error: defError } = await supabase
    .from('workflow_definitions')
    .select('*')
    .eq('is_enabled', true)

  if (defError) throw new Error(`Failed to load definitions: ${defError.message}`)

  const defMap = new Map<string, WorkflowDefinition>()
  for (const def of definitions || []) {
    defMap.set(def.name, def)
  }

  let totalDispatched = 0

  // Process each queue
  for (const [queueName, vt] of Object.entries(QUEUE_CONFIG)) {
    if (totalDispatched >= availableSlots) break

    const qty = Math.min(MAX_MESSAGES_PER_QUEUE, availableSlots - totalDispatched)

    // Read messages from pgmq via public wrapper
    const { data: messages, error: readError } = await supabase
      .rpc('pgmq_read', { p_queue: queueName, p_vt: vt, p_qty: qty })

    if (readError) {
      console.error(`Error reading queue ${queueName}:`, readError.message)
      results.push({ queue: queueName, error: readError.message })
      continue
    }

    if (!messages || messages.length === 0) continue

    // Process each message
    for (const msg of messages as QueueMessage[]) {
      const workflowName = msg.message?.workflow
      if (!workflowName) {
        console.error(`Message ${msg.msg_id} in ${queueName} has no workflow name, archiving`)
        await supabase.rpc('pgmq_archive', { p_queue: queueName, p_msg_id: msg.msg_id })
        continue
      }

      const def = defMap.get(workflowName)
      if (!def) {
        console.error(`Unknown workflow "${workflowName}" in ${queueName}, moving to dead_letter`)
        await moveToDeadLetter(supabase, queueName, msg, `Unknown workflow: ${workflowName}`)
        continue
      }

      if (!def.is_enabled) {
        console.log(`Workflow "${workflowName}" is disabled, archiving`)
        await supabase.rpc('pgmq_archive', { p_queue: queueName, p_msg_id: msg.msg_id })
        continue
      }

      // Check per-workflow concurrency
      const { count: workflowRunning } = await supabase
        .from('workflow_runs')
        .select('*', { count: 'exact', head: true })
        .eq('workflow_name', workflowName)
        .eq('status', 'running')

      if ((workflowRunning || 0) >= def.max_concurrency) {
        // Reset visibility timeout to re-process later
        await supabase.rpc('pgmq_set_vt', {
          p_queue: queueName,
          p_msg_id: msg.msg_id,
          vt_seconds: 60, // retry in 60s
        })
        results.push({ queue: queueName, workflow: workflowName, skipped: 'max_concurrency' })
        continue
      }

      // Check idempotency
      const idempotencyKey = msg.message?.idempotency_key as string | undefined
      if (idempotencyKey) {
        const { data: existing } = await supabase
          .from('workflow_runs')
          .select('id, status')
          .eq('idempotency_key', idempotencyKey)
          .in('status', ['running', 'completed'])
          .limit(1)

        if (existing && existing.length > 0) {
          console.log(`Idempotency key ${idempotencyKey} already processed, archiving`)
          await supabase.rpc('pgmq_archive', { p_queue: queueName, p_msg_id: msg.msg_id })
          continue
        }
      }

      // Create workflow_run record
      const attempt = msg.read_ct // read_ct tracks how many times this message was read
      const maxAttempts = def.max_retries + 1

      if (attempt > maxAttempts) {
        await moveToDeadLetter(supabase, queueName, msg, `Exceeded max retries (${def.max_retries})`)
        results.push({ queue: queueName, workflow: workflowName, dead_letter: true })
        continue
      }

      // Merge default payload with message payload
      const { _workflow, _triggered_by, idempotency_key: _idk, ...messagePayload } = msg.message
      const mergedPayload = { ...def.default_payload, ...messagePayload }

      const { data: run, error: insertError } = await supabase
        .from('workflow_runs')
        .insert({
          definition_id: def.id,
          workflow_name: workflowName,
          queue_name: queueName,
          pgmq_msg_id: msg.msg_id,
          status: 'running',
          attempt,
          max_attempts: maxAttempts,
          input_payload: mergedPayload,
          triggered_by: msg.message?.triggered_by || 'cron',
          idempotency_key: idempotencyKey || null,
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (insertError) {
        console.error(`Failed to create run for ${workflowName}:`, insertError.message)
        continue
      }

      // Invoke the edge function and await completion for reliability
      await dispatchEdgeFunction(
        supabase,
        supabaseUrl,
        serviceRoleKey,
        def,
        run.id,
        msg,
        queueName,
        mergedPayload
      )

      totalDispatched++
      results.push({
        queue: queueName,
        workflow: workflowName,
        run_id: run.id,
        attempt,
        msg_id: msg.msg_id,
      })
    }
  }

  return jsonResponse({
    success: true,
    dispatched: totalDispatched,
    duration_ms: Date.now() - startTime,
    results,
  })
}

// Fire-and-forget edge function invocation with result tracking
async function dispatchEdgeFunction(
  supabase: SupabaseClient,
  supabaseUrl: string,
  serviceRoleKey: string,
  def: WorkflowDefinition,
  runId: string,
  msg: QueueMessage,
  queueName: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), def.timeout_seconds * 1000)

    const functionUrl = `${supabaseUrl}/functions/v1/${def.edge_function}`
    // Authenticate internal invocations with the service role key so target functions
    // can recognise this as a system/internal call (e.g. fetch-news bypasses requireAdmin
    // when it sees the service role key in the Authorization header).
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const responseBody = await response.text()
    let result: Record<string, unknown> = {}
    try {
      result = JSON.parse(responseBody)
    } catch {
      result = { raw_response: responseBody.slice(0, 2000) }
    }

    if (response.ok) {
      // Success — archive the message and update run
      await supabase.rpc('pgmq_archive', { p_queue: queueName, p_msg_id: msg.msg_id })

      await supabase
        .from('workflow_runs')
        .update({
          status: 'completed',
          output_result: result,
          completed_at: new Date().toISOString(),
          progress_pct: 100,
          items_total: (result as Record<string, number>).items_total || 0,
          items_processed: (result as Record<string, number>).items_processed || 0,
          items_succeeded: (result as Record<string, number>).items_succeeded || 0,
          items_failed: (result as Record<string, number>).items_failed || 0,
        })
        .eq('id', runId)

      console.log(`[OK] ${def.name} run=${runId} status=${response.status}`)
    } else {
      // Failure — let VT expire for retry, update run
      const errorMsg = (result as Record<string, string>).error || `HTTP ${response.status}`

      const attempt = msg.read_ct
      const maxAttempts = def.max_retries + 1

      if (attempt >= maxAttempts) {
        // Move to dead letter
        await moveToDeadLetter(supabase, queueName, msg, errorMsg)
        await supabase
          .from('workflow_runs')
          .update({
            status: 'dead_letter',
            error_message: errorMsg,
            error_details: { status: response.status, body: result },
            completed_at: new Date().toISOString(),
          })
          .eq('id', runId)
      } else {
        // Schedule retry with exponential backoff
        const backoffSeconds = def.retry_backoff_base * Math.pow(2, attempt - 1)
        await supabase.rpc('pgmq_set_vt', {
          p_queue: queueName,
          p_msg_id: msg.msg_id,
          vt_seconds: backoffSeconds,
        })

        await supabase
          .from('workflow_runs')
          .update({
            status: 'failed',
            error_message: errorMsg,
            error_details: { status: response.status, body: result },
            completed_at: new Date().toISOString(),
            next_retry_at: new Date(Date.now() + backoffSeconds * 1000).toISOString(),
          })
          .eq('id', runId)
      }

      console.error(`[FAIL] ${def.name} run=${runId} status=${response.status} attempt=${attempt}/${maxAttempts}`)
    }
  } catch (error) {
    const errorMsg = (error as Error).name === 'AbortError'
      ? `Timeout after ${def.timeout_seconds}s`
      : (error as Error).message

    console.error(`[ERROR] ${def.name} run=${runId}: ${errorMsg}`)

    await supabase
      .from('workflow_runs')
      .update({
        status: 'failed',
        error_message: errorMsg,
        error_details: { type: (error as Error).name, message: (error as Error).message },
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId)
  }
}

// ─── MOVE TO DEAD LETTER ────────────────────────────────────────────────────

async function moveToDeadLetter(
  supabase: SupabaseClient,
  sourceQueue: string,
  msg: QueueMessage,
  reason: string
): Promise<void> {
  await supabase.rpc('pgmq_send', {
    p_queue: 'dead_letter',
    p_msg: {
      ...msg.message,
      _source_queue: sourceQueue,
      _source_msg_id: msg.msg_id,
      _dead_letter_reason: reason,
      _dead_letter_at: new Date().toISOString(),
      _read_count: msg.read_ct,
    },
  })
  await supabase.rpc('pgmq_archive', { p_queue: sourceQueue, p_msg_id: msg.msg_id })
}

// ─── ENQUEUE: Manually queue a workflow ─────────────────────────────────────

async function handleEnqueue(
  supabase: SupabaseClient,
  payload: Record<string, unknown>
): Promise<Response> {
  const workflowName = payload.workflow as string
  if (!workflowName) return errorResponse('Missing "workflow" parameter', 400)

  const { data: def, error } = await supabase
    .from('workflow_definitions')
    .select('*')
    .eq('name', workflowName)
    .single()

  if (error || !def) return errorResponse(`Unknown workflow: ${workflowName}`, 404)

  const { _workflow, _action, ...restPayload } = payload
  const msgPayload = {
    workflow: workflowName,
    triggered_by: 'admin',
    ...restPayload,
  }

  const { data: msgId, error: sendError } = await supabase
    .rpc('pgmq_send', { p_queue: def.queue_name, p_msg: msgPayload })

  if (sendError) return errorResponse(`Failed to enqueue: ${sendError.message}`)

  return jsonResponse({
    success: true,
    message: `Enqueued ${workflowName} to ${def.queue_name}`,
    msg_id: msgId,
    queue: def.queue_name,
  })
}

// ─── RETRY: Retry a dead-lettered or failed run ────────────────────────────

async function handleRetry(
  supabase: SupabaseClient,
  payload: Record<string, unknown>
): Promise<Response> {
  const runId = payload.run_id as string
  if (!runId) return errorResponse('Missing "run_id" parameter', 400)

  const { data: run, error } = await supabase
    .from('workflow_runs')
    .select('*, workflow_definitions(*)')
    .eq('id', runId)
    .single()

  if (error || !run) return errorResponse(`Run not found: ${runId}`, 404)
  if (!['failed', 'dead_letter'].includes(run.status)) {
    return errorResponse(`Can only retry failed/dead_letter runs, got: ${run.status}`, 400)
  }

  const def = run.workflow_definitions as WorkflowDefinition
  const msgPayload = {
    workflow: run.workflow_name,
    triggered_by: 'admin',
    retry_of_run: runId,
    ...run.input_payload,
  }

  const { data: msgId, error: sendError } = await supabase
    .rpc('pgmq_send', { p_queue: def.queue_name, p_msg: msgPayload })

  if (sendError) return errorResponse(`Failed to re-enqueue: ${sendError.message}`)

  // Update original run status
  await supabase
    .from('workflow_runs')
    .update({ status: 'cancelled', error_message: `Retried as new run (msg_id=${msgId})` })
    .eq('id', runId)

  return jsonResponse({
    success: true,
    message: `Re-enqueued ${run.workflow_name}`,
    original_run_id: runId,
    new_msg_id: msgId,
  })
}

// ─── CANCEL: Cancel a queued run ────────────────────────────────────────────

async function handleCancel(
  supabase: SupabaseClient,
  payload: Record<string, unknown>
): Promise<Response> {
  const runId = payload.run_id as string
  if (!runId) return errorResponse('Missing "run_id" parameter', 400)

  const { data: run, error } = await supabase
    .from('workflow_runs')
    .select('*')
    .eq('id', runId)
    .single()

  if (error || !run) return errorResponse(`Run not found: ${runId}`, 404)

  if (run.pgmq_msg_id && run.status === 'queued') {
    await supabase.rpc('pgmq_delete', { p_queue: run.queue_name, p_msg_id: run.pgmq_msg_id })
  }

  await supabase
    .from('workflow_runs')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', runId)

  return jsonResponse({ success: true, message: `Cancelled run ${runId}` })
}

// ─── HEALTH CHECK: Verify scheduled workflows ran recently ──────────────────

async function handleHealthCheck(
  supabase: SupabaseClient
): Promise<Response> {
  const { data: definitions } = await supabase
    .from('workflow_definitions')
    .select('name, schedule, is_enabled')
    .not('schedule', 'is', null)
    .eq('is_enabled', true)

  const issues: string[] = []

  for (const def of definitions || []) {
    // Check if this scheduled workflow ran in the last 25 hours
    const { count } = await supabase
      .from('workflow_runs')
      .select('*', { count: 'exact', head: true })
      .eq('workflow_name', def.name)
      .eq('status', 'completed')
      .gte('completed_at', new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString())

    if (!count || count === 0) {
      issues.push(`${def.name} (${def.schedule}) — no successful run in 25h`)
    }
  }

  // Check dead letter queue depth
  const { data: dlqMetrics } = await supabase.rpc('pgmq_metrics', { p_queue: 'dead_letter' })
  const dlqDepth = dlqMetrics?.[0]?.queue_length || 0

  if (dlqDepth > 0) {
    issues.push(`Dead letter queue has ${dlqDepth} messages`)
  }

  return jsonResponse({
    success: issues.length === 0,
    healthy: issues.length === 0,
    issues,
    checked_at: new Date().toISOString(),
  })
}

// ─── METRICS: Queue depths and recent run stats ─────────────────────────────

async function handleMetrics(
  supabase: SupabaseClient
): Promise<Response> {
  // Queue metrics
  const { data: queueMetrics } = await supabase.rpc('pgmq_metrics_all')

  // Recent run stats (last 24h)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: recentRuns } = await supabase
    .from('workflow_runs')
    .select('workflow_name, status, duration_ms')
    .gte('created_at', since)

  const stats: Record<string, { total: number; completed: number; failed: number; dead_letter: number; avg_duration_ms: number }> = {}
  for (const run of recentRuns || []) {
    if (!stats[run.workflow_name]) {
      stats[run.workflow_name] = { total: 0, completed: 0, failed: 0, dead_letter: 0, avg_duration_ms: 0 }
    }
    const s = stats[run.workflow_name]
    s.total++
    if (run.status === 'completed') {
      s.completed++
      if (run.duration_ms) {
        s.avg_duration_ms = (s.avg_duration_ms * (s.completed - 1) + run.duration_ms) / s.completed
      }
    }
    if (run.status === 'failed') s.failed++
    if (run.status === 'dead_letter') s.dead_letter++
  }

  return jsonResponse({
    success: true,
    queues: queueMetrics,
    runs_24h: stats,
    generated_at: new Date().toISOString(),
  })
}
