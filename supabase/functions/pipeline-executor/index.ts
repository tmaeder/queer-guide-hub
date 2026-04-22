import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { reportApiError } from '../_shared/report-api-error.ts'
import { evaluateCondition } from '../_shared/condition-evaluator.ts'
import type { PipelineMessage, PipelineNode, PipelineEdge, NodeState } from '../_shared/pipeline-message.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

// ============================================================
// Pipeline Executor — DAG execution engine
// Processes pipeline_steps queue messages, walks the DAG in
// topological order, invokes edge functions for each node.
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  try {
    const body = await req.json().catch(() => ({}))

    // Two entry points:
    // 1. Start a new pipeline run: { action: "start", pipeline_id, context }
    // 2. Continue execution: { action: "continue", pipeline_run_id, current_node_id }
    // 3. Direct from queue message (has pipeline_run_id + current_node_id)
    const action = body.action || (body.pipeline_run_id ? 'continue' : 'start')

    switch (action) {
      case 'start':
        return await handleStart(supabase, supabaseUrl, serviceKey, body, req)
      case 'continue':
        return await handleContinue(supabase, supabaseUrl, serviceKey, body, req)
      default:
        return errorResponse(`Unknown action: ${action}`, 400, req)
    }
  } catch (error) {
    console.error('pipeline-executor error:', error)
    reportApiError('pipeline-executor', error, { endpoint: '/functions/v1/pipeline-executor' })
    return errorResponse((error as Error).message, 500, req)
  }
})

// ─── START: Initialize a new pipeline run ─────────────────────────────────────

async function handleStart(
  supabase: SupabaseClient,
  supabaseUrl: string,
  serviceKey: string,
  body: Record<string, unknown>,
  req: Request
): Promise<Response> {
  const pipelineId = body.pipeline_id as string
  const pipelineName = body.pipeline_name as string

  if (!pipelineId && !pipelineName) {
    return errorResponse('Missing pipeline_id or pipeline_name', 400, req)
  }

  // Load pipeline definition
  let query = supabase.from('pipeline_definitions').select('*')
  if (pipelineId) query = query.eq('id', pipelineId)
  else query = query.eq('name', pipelineName)

  const { data: pipeline, error: pipeError } = await query.single()
  if (pipeError || !pipeline) {
    return errorResponse(`Pipeline not found: ${pipelineId || pipelineName}`, 404, req)
  }

  const nodes = pipeline.nodes as PipelineNode[]
  const edges = pipeline.edges as PipelineEdge[]

  if (!nodes || nodes.length === 0) {
    return errorResponse('Pipeline has no nodes', 400, req)
  }

  // Build initial node_states
  const nodeStates: Record<string, NodeState> = {}
  for (const node of nodes) {
    nodeStates[node.id] = { status: 'pending', items_in: 0, items_out: 0 }
  }

  // Create pipeline_run record
  const context = {
    dry_run: body.dry_run ?? false,
    triggered_by: body.triggered_by ?? 'manual',
    batch_size: body.batch_size ?? 50,
    ...(pipeline.default_context || {}),
    ...(body.context || {}),
  }

  // Snapshot pipeline definition so future edits don't mutate this run's
  // configuration (reproducible auditability — see migration
  // 20260415170300_pipeline_run_snapshot.sql).
  const { data: snapshot } = await supabase.rpc('snapshot_pipeline_definition', {
    p_pipeline_id: pipeline.id,
  })

  const { data: run, error: runError } = await supabase
    .from('pipeline_runs')
    .insert({
      pipeline_id: pipeline.id,
      pipeline_name: pipeline.name,
      status: 'running',
      node_states: nodeStates,
      context,
      started_at: new Date().toISOString(),
      triggered_by: context.triggered_by,
      pipeline_snapshot: snapshot ?? null,
      pipeline_version: pipeline.version ?? 1,
    })
    .select('id')
    .single()

  if (runError || !run) {
    return errorResponse(`Failed to create run: ${runError?.message}`, 500, req)
  }

  // Find all initial nodes (in-degree = 0) — support parallel fan-out at start
  const sorted = topologicalSort(nodes, edges)
  const targetIds = new Set(edges.map(e => e.target))
  const initialNodeIds = nodes.map(n => n.id).filter(id => !targetIds.has(id))
  if (initialNodeIds.length === 0) initialNodeIds.push(sorted[0])

  // Enqueue all initial nodes in parallel
  for (const nodeId of initialNodeIds) {
    await enqueueStep(supabase, {
      pipeline_run_id: run.id,
      pipeline_id: pipeline.id,
      pipeline_name: pipeline.name,
      current_node_id: nodeId,
      current_step: 0,
      total_steps: sorted.length,
      context,
    })
  }

  return jsonResponse({
    success: true,
    pipeline_run_id: run.id,
    pipeline_name: pipeline.name,
    total_steps: sorted.length,
    initial_nodes: initialNodeIds,
  }, 200, req)
}

// ─── CONTINUE: Execute the current node and advance ───────────────────────────

async function handleContinue(
  supabase: SupabaseClient,
  supabaseUrl: string,
  serviceKey: string,
  body: Record<string, unknown>,
  req: Request
): Promise<Response> {
  const runId = body.pipeline_run_id as string
  const currentNodeId = body.current_node_id as string

  if (!runId || !currentNodeId) {
    return errorResponse('Missing pipeline_run_id or current_node_id', 400, req)
  }

  // Load the run
  const { data: run, error: runError } = await supabase
    .from('pipeline_runs')
    .select('*, pipeline_definitions(*)')
    .eq('id', runId)
    .single()

  if (runError || !run) {
    return errorResponse(`Run not found: ${runId}`, 404, req)
  }

  if (run.status === 'cancelled' || run.status === 'paused' || run.status === 'failed' || run.status === 'completed') {
    return jsonResponse({ success: true, message: `Run is ${run.status}, skipping` }, 200, req)
  }

  const pipeline = run.pipeline_definitions
  const nodes = pipeline.nodes as PipelineNode[]
  const edges = pipeline.edges as PipelineEdge[]
  const nodeStates = run.node_states as Record<string, NodeState>
  const context = run.context

  // Find current node
  const currentNode = nodes.find(n => n.id === currentNodeId)
  if (!currentNode) {
    return errorResponse(`Node ${currentNodeId} not found in pipeline`, 400, req)
  }

  // Guard: skip if already processed (prevents duplicate queue messages from re-running nodes)
  const currentNodeState = nodeStates[currentNodeId]
  if (currentNodeState?.status === 'completed' || currentNodeState?.status === 'skipped') {
    return jsonResponse({ success: true, message: `Node ${currentNodeId} already ${currentNodeState.status}` }, 200, req)
  }

  // Check if upstream nodes are all completed (with advisory lock for fan-in safety)
  const incomingEdges = edges.filter(e => e.target === currentNodeId)
  if (incomingEdges.length > 1) {
    // Fan-in: acquire advisory lock to prevent concurrent duplicate enqueues
    const lockKey = Math.abs(hashCode(`${runId}:${currentNodeId}`))
    const { data: lockResult } = await supabase.rpc('pg_try_advisory_lock', { key: lockKey })
    if (!lockResult) {
      // Another invocation is already checking this node — re-enqueue with jitter
      await enqueueStep(supabase, body as PipelineMessage, 5 + Math.floor(Math.random() * 10))
      return jsonResponse({ success: true, message: 'Fan-in lock contention, re-enqueued' }, 200, req)
    }
    // Re-fetch node_states to avoid stale reads
    const { data: freshRun } = await supabase.from('pipeline_runs').select('node_states').eq('id', runId).single()
    if (freshRun) Object.assign(nodeStates, freshRun.node_states)
  }
  for (const edge of incomingEdges) {
    const upstreamState = nodeStates[edge.source]
    if (upstreamState && upstreamState.status !== 'completed' && upstreamState.status !== 'skipped') {
      // Upstream not ready — re-enqueue with delay
      await enqueueStep(supabase, body as PipelineMessage, 10)
      return jsonResponse({ success: true, message: 'Waiting for upstream', waiting_on: edge.source }, 200, req)
    }
  }

  // Check edge conditions
  for (const edge of incomingEdges) {
    if (edge.condition) {
      const condCtx = {
        items_count: nodeStates[edge.source]?.items_out || 0,
        items_valid: 0,
        items_invalid: 0,
        entity_type: (context as Record<string, string>).entity_type || '',
        source_name: (context as Record<string, string>).source_name || '',
        dry_run: (context as Record<string, boolean>).dry_run || false,
      }
      if (!evaluateCondition(edge.condition, condCtx)) {
        // Condition not met — skip this node
        nodeStates[currentNodeId] = { status: 'skipped', items_in: 0, items_out: 0 }
        await updateNodeStates(supabase, runId, { [currentNodeId]: nodeStates[currentNodeId] })
        await advanceToNextNodes(supabase, run, nodes, edges, currentNodeId, nodeStates)
        return jsonResponse({ success: true, message: `Node ${currentNodeId} skipped (condition)` }, 200, req)
      }
    }
  }

  // Mark node as running
  nodeStates[currentNodeId] = {
    ...nodeStates[currentNodeId],
    status: 'running',
    started_at: new Date().toISOString(),
  }
  await updateNodeStates(supabase, runId, { [currentNodeId]: nodeStates[currentNodeId] })

  // Look up node type to find the edge function to invoke
  const { data: nodeType } = await supabase
    .from('pipeline_node_types')
    .select('edge_function')
    .eq('slug', currentNode.type)
    .single()

  const edgeFunction = nodeType?.edge_function
  if (!edgeFunction) {
    // Built-in control node (fan-out, fan-in, filter, delay, circuit-breaker)
    const result = await handleBuiltInNode(supabase, currentNode, run, nodeStates)
    nodeStates[currentNodeId] = {
      ...nodeStates[currentNodeId],
      status: 'completed',
      completed_at: new Date().toISOString(),
      items_out: result.items_out,
      duration_ms: (() => { const s = new Date(nodeStates[currentNodeId].started_at!).getTime(); return Number.isFinite(s) ? Date.now() - s : 0; })(),
    }
    await updateNodeStates(supabase, runId, { [currentNodeId]: nodeStates[currentNodeId] })
    await advanceToNextNodes(supabase, run, nodes, edges, currentNodeId, nodeStates)
    return jsonResponse({ success: true, node: currentNodeId, status: 'completed', ...result }, 200, req)
  }

  // Invoke the edge function
  try {
    const functionUrl = `${supabaseUrl}/functions/v1/${edgeFunction}`
    const nodeConfig = currentNode.data?.config || {}

    const payload = {
      ...nodeConfig,
      pipeline_run_id: runId,
      node_id: currentNodeId,
      dry_run: (context as Record<string, boolean>).dry_run || false,
      batch_size: (context as Record<string, number>).batch_size || 50,
    }

    const controller = new AbortController()
    const timeout = (pipeline.timeout_seconds || 150) * 1000
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const responseText = await response.text()
    let result: Record<string, unknown> = {}
    try { result = JSON.parse(responseText) } catch { result = { raw: responseText.slice(0, 1000) } }

    if (response.ok) {
      const itemsOut = (result.items as number) || (result.items_processed as number) || (result.items_total as number) || 0

      nodeStates[currentNodeId] = {
        ...nodeStates[currentNodeId],
        status: 'completed',
        completed_at: new Date().toISOString(),
        items_out: itemsOut,
        duration_ms: (() => { const s = new Date(nodeStates[currentNodeId].started_at!).getTime(); return Number.isFinite(s) ? Date.now() - s : 0; })(),
      }
      await updateNodeStates(supabase, runId, { [currentNodeId]: nodeStates[currentNodeId] })

      // Update run counters
      await supabase
        .from('pipeline_runs')
        .update({
          items_processed: (run.items_processed || 0) + itemsOut,
          items_succeeded: (run.items_succeeded || 0) + itemsOut,
        })
        .eq('id', runId)

      // Advance to next nodes
      await advanceToNextNodes(supabase, run, nodes, edges, currentNodeId, nodeStates)

      return jsonResponse({
        success: true,
        node: currentNodeId,
        edge_function: edgeFunction,
        status: 'completed',
        items_out: itemsOut,
      }, 200, req)
    } else {
      const errorMsg = (result.error as string) || `HTTP ${response.status}`
      nodeStates[currentNodeId] = {
        ...nodeStates[currentNodeId],
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: errorMsg,
        duration_ms: (() => { const s = new Date(nodeStates[currentNodeId].started_at!).getTime(); return Number.isFinite(s) ? Date.now() - s : 0; })(),
      }
      await updateNodeStates(supabase, runId, { [currentNodeId]: nodeStates[currentNodeId] })

      // Mark the entire run as failed
      await supabase
        .from('pipeline_runs')
        .update({
          status: 'failed',
          error_message: `Node ${currentNodeId} (${edgeFunction}) failed: ${errorMsg}`,
        })
        .eq('id', runId)

      // Skip all downstream nodes so they don't hang as 'pending'
      skipDescendants(nodes, edges, currentNodeId, nodeStates)
      await updateNodeStates(supabase, runId, nodeStates)

      return jsonResponse({
        success: false,
        node: currentNodeId,
        edge_function: edgeFunction,
        error: errorMsg,
      }, 200, req) // 200 so dispatcher doesn't retry the pipeline-executor itself
    }
  } catch (error) {
    const errorMsg = (error as Error).name === 'AbortError'
      ? `Timeout after ${pipeline.timeout_seconds || 150}s`
      : (error as Error).message

    nodeStates[currentNodeId] = {
      ...nodeStates[currentNodeId],
      status: 'failed',
      error: errorMsg,
      completed_at: new Date().toISOString(),
    }
    skipDescendants(nodes, edges, currentNodeId, nodeStates)
    await updateNodeStates(supabase, runId, nodeStates)

    await supabase
      .from('pipeline_runs')
      .update({ status: 'failed', error_message: `Node ${currentNodeId} error: ${errorMsg}` })
      .eq('id', runId)

    return jsonResponse({ success: false, node: currentNodeId, error: errorMsg }, 200, req)
  }
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

/** Topological sort using Kahn's algorithm */
function topologicalSort(nodes: PipelineNode[], edges: PipelineEdge[]): string[] {
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  for (const node of nodes) {
    inDegree.set(node.id, 0)
    adjacency.set(node.id, [])
  }

  for (const edge of edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
    adjacency.get(edge.source)?.push(edge.target)
  }

  const queue: string[] = []
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id)
  }

  const sorted: string[] = []
  while (queue.length > 0) {
    const current = queue.shift()!
    sorted.push(current)
    for (const neighbor of adjacency.get(current) || []) {
      const newDegree = (inDegree.get(neighbor) || 1) - 1
      inDegree.set(neighbor, newDegree)
      if (newDegree === 0) queue.push(neighbor)
    }
  }

  if (sorted.length !== nodes.length) {
    throw new Error(`Pipeline DAG has a cycle — ${nodes.length - sorted.length} nodes unreachable`)
  }

  return sorted
}

/** Update node_states in pipeline_runs using atomic JSONB merge to prevent lost updates */
async function updateNodeStates(
  supabase: SupabaseClient,
  runId: string,
  nodeStates: Record<string, NodeState>
): Promise<void> {
  await supabase.rpc('merge_pipeline_node_states', {
    p_run_id: runId,
    p_patch: nodeStates,
  }).then(({ error }) => {
    if (error) {
      // Fallback to full overwrite if RPC not available
      return supabase.from('pipeline_runs').update({ node_states: nodeStates }).eq('id', runId)
    }
  })
}

/** Enqueue a pipeline step message to pgmq */
async function enqueueStep(
  supabase: SupabaseClient,
  message: PipelineMessage | Record<string, unknown>,
  delaySec = 0
): Promise<void> {
  const { error } = await supabase.rpc('pgmq_send', {
    p_queue: 'pipeline_steps',
    p_msg: {
      workflow: 'pipeline-executor',
      action: 'continue',
      ...message,
    },
    p_delay: delaySec,
  })
  if (error) {
    console.error(`[pipeline-executor] enqueueStep failed for node ${(message as PipelineMessage).current_node_id}:`, error)
    throw new Error(`enqueueStep failed: ${error.message}`)
  }
}

/** Find and enqueue next nodes after current completes */
async function advanceToNextNodes(
  supabase: SupabaseClient,
  run: Record<string, unknown>,
  nodes: PipelineNode[],
  edges: PipelineEdge[],
  completedNodeId: string,
  nodeStates: Record<string, NodeState>
): Promise<void> {
  const outgoingEdges = edges.filter(e => e.source === completedNodeId)

  if (outgoingEdges.length === 0) {
    // Check if ALL nodes are done (completed or skipped)
    const allDone = nodes.every(n => {
      const state = nodeStates[n.id]
      return state?.status === 'completed' || state?.status === 'skipped' || state?.status === 'failed'
    })

    if (allDone) {
      const hasFailed = nodes.some(n => nodeStates[n.id]?.status === 'failed')
      await supabase
        .from('pipeline_runs')
        .update({ status: hasFailed ? 'failed' : 'completed' })
        .eq('id', run.id as string)
    }
    return
  }

  for (const edge of outgoingEdges) {
    const targetState = nodeStates[edge.target]
    if (targetState && targetState.status === 'pending') {
      await enqueueStep(supabase, {
        pipeline_run_id: run.id as string,
        pipeline_id: (run.pipeline_definitions as Record<string, string>)?.id || run.pipeline_id as string,
        pipeline_name: run.pipeline_name as string,
        current_node_id: edge.target,
        current_step: 0,
        total_steps: nodes.length,
        context: run.context as Record<string, unknown>,
      })
    }
  }
}

/** Simple string hash for advisory lock keys */
function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return h
}

/** Mark all transitive descendants of a failed node as 'skipped' */
function skipDescendants(
  nodes: PipelineNode[],
  edges: PipelineEdge[],
  failedNodeId: string,
  nodeStates: Record<string, NodeState>
): void {
  const visited = new Set<string>()
  const queue = [failedNodeId]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const edge of edges) {
      if (edge.source === current && !visited.has(edge.target)) {
        visited.add(edge.target)
        const state = nodeStates[edge.target]
        if (!state || state.status === 'pending') {
          nodeStates[edge.target] = { status: 'skipped', items_in: 0, items_out: 0 }
          queue.push(edge.target)
        }
      }
    }
  }
}

/** Handle built-in control nodes (no edge function) */
async function handleBuiltInNode(
  supabase: SupabaseClient,
  node: PipelineNode,
  run: Record<string, unknown>,
  _nodeStates: Record<string, NodeState>
): Promise<{ items_out: number }> {
  const config = node.data?.config || {}

  switch (node.type) {
    case 'fan-out': {
      // Fan-out is handled by pipeline topology — multiple outgoing edges
      return { items_out: 0 }
    }
    case 'fan-in': {
      // Fan-in waits for all incoming edges — handled by upstream check
      return { items_out: 0 }
    }
    case 'filter': {
      // Filter is handled by edge conditions
      return { items_out: 0 }
    }
    case 'delay': {
      const delayMs = (config as Record<string, number>).delayMs || 1000
      await new Promise(resolve => setTimeout(resolve, Math.min(delayMs, 10000)))
      return { items_out: 0 }
    }
    case 'circuit-breaker-check': {
      const { checkCircuit } = await import('../_shared/circuit-breaker.ts')
      const apiName = (config as Record<string, string>).apiName
      if (apiName) {
        const result = await checkCircuit(supabase, apiName)
        if (!result.allowed) {
          throw new Error(result.reason || `Circuit open for ${apiName}`)
        }
      }
      return { items_out: 0 }
    }
    case 'source-personality-staging': {
      // Adopt pending personality staging rows into this pipeline run so
      // downstream nodes (normalize, validate, etc.) can filter by pipeline_run_id.
      const entityType = (config as Record<string, string>).entity_type || 'personality'
      const batchSize = (config as Record<string, number>).batch_size || 500
      const runId = run.id as string
      const { data: items } = await supabase
        .from('ingestion_staging')
        .select('id')
        .eq('entity_type', entityType)
        .is('normalized_data', null)
        .eq('disposition', 'pending')
        .limit(batchSize)
      if (!items || items.length === 0) return { items_out: 0 }
      const ids = items.map((r: Record<string, string>) => r.id)
      await supabase.from('ingestion_staging').update({ pipeline_run_id: runId }).in('id', ids)
      return { items_out: ids.length }
    }
    default:
      console.warn(`Unknown built-in node type: ${node.type}`)
      return { items_out: 0 }
  }
}
