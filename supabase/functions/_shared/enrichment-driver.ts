import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
  requireInternalOrAdmin,
} from './supabase-client.ts'
import { createBatchCircuitChecker, type BatchCircuitChecker } from './circuit-breaker.ts'
import { consumeLlmBudget } from './llm-budget.ts'
import { setInvocationDeadline } from './llm-router.ts'

// Shared batch driver for the pipeline-enrich-* staging functions.
//
// Owns the request lifecycle every adopter used to copy-paste: auth, body
// parsing, the pending-staging query, the bounded-concurrency pool (the
// hardened pipeline-enrich-news shape — a sequential loop overran the edge
// wall clock at ~50 slow calls per batch and 504'd away the whole batch),
// the normalized_data merge write, the apply_enrichment RPC, tally, and the
// exact response envelope the pipeline-executor expects.
//
// Adopters supply only `enrichItem`: fetch/AI logic, their own circuit
// breakers, and the entity-specific enriched/merged payloads.

type ServiceClient = ReturnType<typeof getServiceClient>

export interface EnrichOutcome {
  /** Did enrichment produce usable data? Drives apply_enrichment status. */
  succeeded: boolean
  /** Payload written via apply_enrichment (p_new_enriched). */
  enrichedData: Record<string, unknown>
  /** When present, UPDATE ingestion_staging.normalized_data with this merge. */
  mergedNormalized?: Record<string, unknown> | null
  /** Error string (already stringified; CircuitOpenError → 'circuit_open:<api>'). */
  error?: string | null
}

export interface StagingItem {
  id: string
  normalized_data: Record<string, unknown> | null
  entity_type: string | null
  target_table: string | null
  /** Prior enrichment payload — read by the skip-if-unchanged guard. */
  enriched_data?: Record<string, unknown> | null
  /** Source payload hash stamped by pipeline-normalize (idempotency key). */
  payload_hash?: string | null
}

export interface EnrichmentDriverConfig {
  /** Function name, e.g. 'pipeline-enrich-venue' — used as RPC actor; the
   *  stage is derived by stripping the 'pipeline-' prefix. */
  fnName: string
  targetTables: string[]
  defaultBatchSize: number
  maxBatchSize: number
  /** Pool width; clamped to [1, 8]; callers may override via body.concurrency. */
  defaultConcurrency?: number
  /** Optional wall-clock budget, checked between pool waves. */
  wallClockMs?: number
  /** Single-breaker adopters set their breaker api name here and call the
   *  provided `breaker.run(fn)` instead of withCircuitBreaker — the closed
   *  state is then checked once per batch instead of once per item (N+1
   *  fix). Multi-breaker adopters leave this unset. */
  batchBreakerApi?: string
  /** Opt-in: only enrich rows the deterministic gates have already passed —
   *  ai_validation_status='approved' AND dedup_status <> 'duplicate'. Meant
   *  for the reordered DAGs where validate+dedup run BEFORE the LLM stages.
   *  Default false so the current stage order (enrich first, where both
   *  columns still read 'pending') keeps working. Request body
   *  `require_gates` (spread from the DAG node config) overrides this. */
  requireGates?: boolean
  /** Central LLM budget caller key (llm_budget_consume, migration
   *  20260817090000). When set, the driver consumes `items.length` before the
   *  batch runs; an exhausted budget skips the whole batch with
   *  `skipped_reason: 'llm_budget_exhausted'` (rows stay pending for the next
   *  window). RPC missing/erroring → console.warn + run as before. */
  llmBudgetCaller?: string
  /** Returns 'skip' when the row lacks the minimum fields (no name/title). */
  enrichItem(
    supabase: ServiceClient,
    item: StagingItem,
    normalized: Record<string, unknown>,
    breaker?: BatchCircuitChecker
  ): Promise<EnrichOutcome | 'skip'>
  /** Test seam — overrides client construction / auth. Not for production use. */
  _deps?: {
    getClient?: () => ServiceClient
    authorize?: (req: Request, client: ServiceClient) => Promise<Response | null>
  }
}

export function serveEnrichment(config: EnrichmentDriverConfig) {
  const stage = config.fnName.replace(/^pipeline-/, '')

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return corsResponse(req)
    const supabase = config._deps?.getClient ? config._deps.getClient() : getServiceClient()
    const _auth = config._deps?.authorize
      ? await config._deps.authorize(req, supabase)
      : await requireInternalOrAdmin(req, supabase)
    if (_auth instanceof Response) return _auth

    try {
      const body = await req.json().catch(() => ({}))
      const pipelineRunId = body.pipeline_run_id as string | undefined
      const batchSize = Math.min(config.maxBatchSize, body.batch_size ?? config.defaultBatchSize)
      const dryRun = body.dry_run === true
      const concurrency = Math.min(
        8,
        Math.max(1, body.concurrency ?? config.defaultConcurrency ?? 4)
      )
      const requireGates = (body.require_gates as boolean | undefined) ?? config.requireGates ?? false

      let q = supabase
        .from('ingestion_staging')
        .select('id, normalized_data, entity_type, target_table, enriched_data, payload_hash')
        .in('target_table', config.targetTables)
        .eq('enrichment_status', 'pending')
        // Rows a deterministic gate already disposed (validate-reject stamps
        // disposition='rejected') must never reach paid enrichment. Under the
        // current stage order every enrichment-pending row is still
        // disposition='pending', so this is a no-op there; once validate+dedup
        // move ahead of the LLM stages it becomes the cost gate. Mirrors
        // pipeline-deduplicate's selection. (Column is NOT NULL DEFAULT
        // 'pending', so eq has no NULL trap.)
        .eq('disposition', 'pending')
        .not('normalized_data', 'is', null)
      if (pipelineRunId) q = q.eq('pipeline_run_id', pipelineRunId)
      if (requireGates) {
        q = q.eq('ai_validation_status', 'approved').neq('dedup_status', 'duplicate')
      }

      const { data: items, error } = await q
        .order('created_at', { ascending: true })
        .limit(batchSize)
      if (error) return errorResponse(`load: ${error.message}`, 500, req)
      if (!items || items.length === 0) {
        return jsonResponse({ success: true, items: 0, message: 'nothing to enrich' }, 200, req)
      }

      // Central LLM spend ceiling — consume the whole batch before any LLM
      // work. Denied ⇒ skip the batch; rows stay 'pending' and drain
      // oldest-first once the daily window rolls. (items/items_processed stay
      // 0 so the executor's run counters don't count skipped work.)
      if (config.llmBudgetCaller) {
        const budget = await consumeLlmBudget(supabase, config.llmBudgetCaller, items.length)
        if (!budget.allowed) {
          return jsonResponse(
            {
              success: true,
              items: 0,
              items_processed: 0,
              skipped: items.length,
              skipped_reason: 'llm_budget_exhausted',
              budget_cap: budget.cap,
              dry_run: dryRun,
            },
            200,
            req
          )
        }
      }

      let enriched = 0,
        failed = 0,
        skipped = 0

      const breaker = config.batchBreakerApi
        ? createBatchCircuitChecker(supabase, config.batchBreakerApi)
        : undefined

      const processItem = async (item: StagingItem) => {
        const n = (item.normalized_data ?? {}) as Record<string, unknown>
        const startedAt = Date.now()

        // Skip-if-unchanged: a row already enriched once (enriched_at +
        // payload_hash stamped into enriched_data below) whose source payload
        // has not moved since would just re-buy the same LLM answer. Re-mark
        // it 'enriched' with an empty merge so it leaves the pending pool
        // instead of being reprocessed on every re-stage.
        const prior = (item.enriched_data ?? {}) as Record<string, unknown>
        if (
          typeof prior.enriched_at === 'string' &&
          item.payload_hash &&
          prior.payload_hash === item.payload_hash
        ) {
          skipped++
          if (!dryRun) {
            const { error: skipErr } = await supabase.rpc('apply_enrichment', {
              p_staging_id: item.id,
              p_pipeline_run_id: pipelineRunId ?? null,
              p_stage: stage,
              p_new_enriched: {},
              p_actor: config.fnName,
              p_status: 'success',
              p_error_message: null,
              p_duration_ms: 0,
              p_merged_normalized: null,
            })
            if (skipErr) console.error(`apply_enrichment (unchanged) ${item.id}: ${skipErr.message}`)
          }
          return
        }

        const outcome = await config.enrichItem(supabase, item, n, breaker)
        if (outcome === 'skip') {
          skipped++
          return
        }

        if (dryRun) {
          enriched++
          return
        }

        // No data and no thrown error means the upstream source/LLM returned
        // nothing usable. Treat it as a hard failure so apply_enrichment marks
        // the row 'failed' — otherwise it stays 'pending' and is reprocessed
        // every batch, starving fresh rows (the news-pipeline starvation fix,
        // now applied to every adopter).
        let itemError = outcome.error ?? null
        if (!outcome.succeeded && !itemError) itemError = 'no_enrichment_data_produced'
        const status = outcome.succeeded ? 'success' : 'failed'

        // Stamp what this enrichment saw so the unchanged guard above can
        // compare on the next pass: the row's payload_hash, plus enriched_at
        // for adopters that don't set it themselves (adopter value wins).
        let enrichedData = outcome.enrichedData
        if (status === 'success') {
          enrichedData = { enriched_at: new Date().toISOString(), ...enrichedData }
          if (item.payload_hash) enrichedData = { ...enrichedData, payload_hash: item.payload_hash }
        }

        // The normalized_data merge rides along inside the RPC — one round-trip
        // instead of a separate per-row UPDATE (the double-write folded per the
        // #1923 follow-up; requires migration 20260704150000).
        const { error: applyErr } = await supabase.rpc('apply_enrichment', {
          p_staging_id: item.id,
          p_pipeline_run_id: pipelineRunId ?? null,
          p_stage: stage,
          p_new_enriched: enrichedData,
          p_actor: config.fnName,
          p_status: status,
          p_error_message: itemError,
          p_duration_ms: Date.now() - startedAt,
          p_merged_normalized: outcome.mergedNormalized ?? null,
        })

        if (applyErr) {
          failed++
          console.error(`apply_enrichment ${item.id}: ${applyErr.message}`)
          return
        }

        if (status === 'success') enriched++
        else failed++
      }

      // Bounded-concurrency pool with an optional wall-clock budget checked
      // between waves. Items past the deadline stay 'pending' for the next run.
      const deadline = config.wallClockMs ? Date.now() + config.wallClockMs : null

      // Publish that deadline to the LLM router so its NVIDIA rate-limit pacing
      // can never sleep past it. Without this the between-waves check above is
      // not enough: it bounds when a wave STARTS, while pacing adds latency
      // inside a wave that is already running. A batch paced at 32 RPM is
      // minutes long, and this driver's own header records that a slow
      // sequential loop already 504'd an entire batch away once.
      const releaseDeadline = deadline ? setInvocationDeadline(deadline) : null
      try {
        for (let i = 0; i < items.length; i += concurrency) {
          if (deadline && Date.now() > deadline) break
          await Promise.all(items.slice(i, i + concurrency).map(processItem))
        }
      } finally {
        releaseDeadline?.()
      }
      await breaker?.flush()

      return jsonResponse(
        {
          success: true,
          items: enriched + skipped,
          items_total: items.length,
          items_processed: enriched + failed + skipped,
          items_succeeded: enriched,
          items_failed: failed,
          enriched,
          failed,
          skipped,
          dry_run: dryRun,
        },
        200,
        req
      )
    } catch (error) {
      console.error(`${config.fnName}:`, error)
      return errorResponse((error as Error).message, 500, req)
    }
  }
}
