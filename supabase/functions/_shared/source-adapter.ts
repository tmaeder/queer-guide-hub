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
 * Deterministic stringify with recursively sorted keys, so two normalized
 * payloads compare equal regardless of key ordering (Postgres jsonb reorders
 * keys on round-trip). Used only for refresh change-detection.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

/**
 * Write fetched items to ingestion_staging in batch.
 * Returns the number of rows inserted (or, in refresh mode, inserted + re-opened).
 *
 * `config.entityType` overrides `adapter.entityType` for this batch — used
 * by source-csv-upload to write per-row classified groups to staging
 * without spawning a separate adapter per group. (Issue #113)
 *
 * `config.refresh` (opt-in; used by the recurring marketplace sources) changes
 * the idempotency behavior from INSERT-skip to UPSERT-on-change: an already-seen
 * product whose normalized payload CHANGED has its staging row refreshed, and if
 * it was already committed it is re-opened to disposition='pending' — preserving
 * ai_validation_status/classification_result so validate/relevance SKIP it and
 * only the commit RPC re-runs (updating price/stock + writing price_history).
 * Unchanged products are still skipped. Non-refresh callers (news/venue/event
 * pipelines) are completely unaffected.
 */
export async function writeToStaging(
  supabase: SupabaseClient,
  adapter: SourceAdapter,
  rawItems: RawItem[],
  config: AdapterConfig & { targetTable: string; entityType?: string; refresh?: boolean }
): Promise<number> {
  if (rawItems.length === 0) return 0

  const entityType = config.entityType || adapter.entityType

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
      entity_type: entityType,
      target_table: config.targetTable,
      raw_data: raw.data,
      normalized_data: normalized,
      pipeline_run_id: config.pipelineRunId || null,
      node_id: config.nodeId || null,
      job_id: config.pipelineRunId || '00000000-0000-0000-0000-000000000000',
    }]
  })

  if (rows.length === 0) return 0

  const isDuplicate = (e: { code?: string; message?: string }) =>
    e.code === '23505' || !!e.message?.includes('duplicate key')

  // Refresh mode (opt-in): per-row upsert-on-change so recurring re-syncs update
  // prices/stock on existing listings, not just add new products.
  if (config.refresh) {
    let touched = 0
    for (const row of rows) {
      const { data: existing } = await supabase
        .from('ingestion_staging')
        .select('id, normalized_data, disposition')
        .eq('source_name', row.source_name)
        .eq('source_entity_id', row.source_entity_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!existing) {
        const { error } = await supabase.from('ingestion_staging').insert(row)
        if (!error) touched++
        else if (!isDuplicate(error)) throw new Error(`Staging write failed for ${adapter.name}: ${error.message}`)
        continue
      }

      const changed = stableStringify(existing.normalized_data) !== stableStringify(row.normalized_data)
      if (!changed) continue

      const update: Record<string, unknown> = {
        raw_data: row.raw_data,
        normalized_data: row.normalized_data,
        updated_at: new Date().toISOString(),
      }
      // Re-open committed rows so the commit RPC reprocesses the changed payload.
      // Preserve ai_validation_status / classification_result (not touched here)
      // so the LLM relevance gate is NOT re-run for price/stock deltas.
      if (existing.disposition === 'committed') {
        update.disposition = 'pending'
        update.processed_at = null
        update.error_message = null
      }
      const { error } = await supabase.from('ingestion_staging').update(update).eq('id', existing.id)
      if (error) throw new Error(`Staging refresh failed for ${adapter.name}: ${error.message}`)
      touched++
    }
    return touched
  }

  // Try bulk insert first (fast path). If any row hits a uniqueness constraint
  // (idempotency_key partial index), fall back to per-row inserts so individual
  // duplicates are skipped without killing the entire batch.
  const { error: bulkErr } = await supabase.from('ingestion_staging').insert(rows)
  if (!bulkErr) return rows.length
  if (!isDuplicate(bulkErr)) {
    throw new Error(`Staging write failed for ${adapter.name}: ${bulkErr.message}`)
  }

  // Fallback: insert row-by-row, skip known duplicates
  let inserted = 0
  for (const row of rows) {
    const { error: rowErr } = await supabase.from('ingestion_staging').insert(row)
    if (!rowErr) inserted++
    else if (!isDuplicate(rowErr)) {
      throw new Error(`Staging write failed for ${adapter.name}: ${rowErr.message}`)
    }
  }
  return inserted
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
