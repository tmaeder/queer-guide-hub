import {
  getServiceClient,
  jsonResponse,
  errorResponse,
  corsResponse,
  requireInternalOrAdmin,
} from './supabase-client.ts'

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
  /** Returns 'skip' when the row lacks the minimum fields (no name/title). */
  enrichItem(
    supabase: ServiceClient,
    item: StagingItem,
    normalized: Record<string, unknown>
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

      let q = supabase
        .from('ingestion_staging')
        .select('id, normalized_data, entity_type, target_table')
        .in('target_table', config.targetTables)
        .eq('enrichment_status', 'pending')
        .not('normalized_data', 'is', null)
        .order('created_at', { ascending: true })
        .limit(batchSize)
      if (pipelineRunId) q = q.eq('pipeline_run_id', pipelineRunId)

      const { data: items, error } = await q
      if (error) return errorResponse(`load: ${error.message}`, 500, req)
      if (!items || items.length === 0) {
        return jsonResponse({ success: true, items: 0, message: 'nothing to enrich' }, 200, req)
      }

      let enriched = 0,
        failed = 0,
        skipped = 0

      const processItem = async (item: StagingItem) => {
        const n = (item.normalized_data ?? {}) as Record<string, unknown>
        const startedAt = Date.now()

        const outcome = await config.enrichItem(supabase, item, n)
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

        // The normalized_data merge rides along inside the RPC — one round-trip
        // instead of a separate per-row UPDATE (the double-write folded per the
        // #1923 follow-up; requires migration 20260704150000).
        const { error: applyErr } = await supabase.rpc('apply_enrichment', {
          p_staging_id: item.id,
          p_pipeline_run_id: pipelineRunId ?? null,
          p_stage: stage,
          p_new_enriched: outcome.enrichedData,
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
      for (let i = 0; i < items.length; i += concurrency) {
        if (deadline && Date.now() > deadline) break
        await Promise.all(items.slice(i, i + concurrency).map(processItem))
      }

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
