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

  const rows = rawItems.map(raw => {
    const normalized = adapter.normalize(raw)
    return {
      source_type: adapter.name,
      source_name: adapter.name,
      entity_type: adapter.entityType,
      target_table: config.targetTable,
      raw_data: raw.data,
      normalized_data: normalized,
      pipeline_run_id: config.pipelineRunId || null,
      node_id: config.nodeId || null,
      job_id: config.pipelineRunId || '00000000-0000-0000-0000-000000000000',
    }
  })

  const { error } = await supabase.from('ingestion_staging').insert(rows)
  if (error) {
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
