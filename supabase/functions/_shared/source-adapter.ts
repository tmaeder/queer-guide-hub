import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

// ============================================================
// Source Adapter Interface — standard contract for all data sources
// ============================================================

export interface AdapterConfig {
  batchSize: number
  offset?: number
  filters?: Record<string, unknown>
  apiKey?: string
  dryRun?: boolean
  pipelineRunId?: string
  nodeId?: string
}

/**
 * Thrown by source adapters when required credentials are not configured.
 * Callers should map this to a 200-OK skipped response so a single missing
 * key does not fail the whole pipeline DAG.
 */
export class MissingCredentialsError extends Error {
  readonly missing: string[]
  constructor(missing: string | string[]) {
    const arr = Array.isArray(missing) ? missing : [missing]
    super(`Missing credentials: ${arr.join(', ')}`)
    this.name = 'MissingCredentialsError'
    this.missing = arr
  }
}

/**
 * Build a 200-OK response body that signals a source was skipped because
 * credentials were missing. Pipeline-executor treats this as a non-fatal
 * skipped node, not a failure.
 */
export function skippedResponse(reason: string, missing: string[]): Record<string, unknown> {
  return {
    success: true,
    skipped: true,
    reason,
    missing_credentials: missing,
    items: 0,
    items_total: 0,
    items_processed: 0,
    items_succeeded: 0,
    items_failed: 0,
  }
}

export interface RawItem {
  sourceId: string
  data: Record<string, unknown>
}

export interface NormalizedItem {
  entityType: string
  sourceId: string
  sourceName: string
  name: string
  description?: string
  location?: {
    lat?: number
    lng?: number
    address?: string
    city?: string
    country?: string
    countryCode?: string
  }
  dates?: {
    start?: string
    end?: string
  }
  tags?: string[]
  urls?: string[]
  images?: string[]
  contacts?: {
    email?: string
    phone?: string
    website?: string
  }
  metadata: Record<string, unknown>
}

export interface SourceAdapter {
  name: string
  entityType: string
  fetch(config: AdapterConfig): Promise<RawItem[]>
  normalize(raw: RawItem): NormalizedItem
  getSourceId(raw: RawItem): string
}

/**
 * Write fetched items to ingestion_staging in batch.
 * Returns the number of rows inserted.
 */
export async function writeToStaging(
  supabase: SupabaseClient,
  adapter: SourceAdapter,
  rawItems: RawItem[],
  config: AdapterConfig & { targetTable: string }
): Promise<number> {
  if (rawItems.length === 0) return 0

  // Deduplicate within the batch by sourceId to prevent duplicate staging rows
  const seen = new Set<string>()
  const rows = rawItems.flatMap(raw => {
    const sid = adapter.getSourceId(raw)
    if (seen.has(sid)) return []
    seen.add(sid)
    const normalized = adapter.normalize(raw)
    return [{
      source_type: adapter.name,
      source_name: adapter.name,
      source_entity_id: sid,
      entity_type: adapter.entityType,
      target_table: config.targetTable,
      raw_data: raw.data,
      normalized_data: normalized,
      pipeline_run_id: config.pipelineRunId || null,
      node_id: config.nodeId || null,
      job_id: config.pipelineRunId || '00000000-0000-0000-0000-000000000000',
    }]
  })

  if (rows.length === 0) return 0

  const { error } = await supabase.from('ingestion_staging').insert(rows)
  if (error) {
    if (error.code === '23505' || error.message?.includes('duplicate key')) return 0
    throw new Error(`Staging write failed for ${adapter.name}: ${error.message}`)
  }

  return rows.length
}

/**
 * Create a standard edge function handler from a SourceAdapter.
 * Handles the HTTP request/response lifecycle.
 */
export function createSourceHandler(adapter: SourceAdapter, targetTable: string) {
  return async (req: Request, supabase: SupabaseClient): Promise<{ items: number; dryRun: boolean }> => {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.batchSize ?? body.batch_size ?? 50,
      offset: body.offset,
      filters: body.filters ?? {},
      apiKey: body.apiKey,
      dryRun: body.dry_run ?? body.dryRun ?? false,
      pipelineRunId: body.pipeline_run_id,
      nodeId: body.node_id,
    }

    const rawItems = await adapter.fetch(config)

    if (config.dryRun) {
      return { items: rawItems.length, dryRun: true }
    }

    const written = await writeToStaging(supabase, adapter, rawItems, {
      ...config,
      targetTable,
    })

    return { items: written, dryRun: false }
  }
}
