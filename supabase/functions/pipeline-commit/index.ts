import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { logPipelineError } from '../_shared/pipeline-error-log.ts'
import { reportApiError } from '../_shared/report-api-error.ts'
import { rpcWithBreaker } from '../_shared/circuit-breaker.ts'
import { buildRecord } from './build-record.ts'

// ============================================================
// Pipeline Commit
// Per-target SQL batch RPCs handle atomic upsert + audit + locks.
// News is structurally different (per-job). Venues has post-commit
// organizer flagging. Everything else flows through commitSimple().
// Legacy path remains for entity types without a dedicated RPC.
// ============================================================

interface SimpleCommitConfig {
  rpc: string
  idColumn: string
  extraArgs?: (ctx: { pipelineRunId?: string }) => Record<string, unknown>
}

const SIMPLE_COMMIT_TARGETS: Record<string, SimpleCommitConfig> = {
  venues:         { rpc: 'commit_venue_staging_batch',       idColumn: 'venue_id' },
  countries:      { rpc: 'commit_country_staging_batch',     idColumn: 'country_id' },
  cities:         { rpc: 'commit_city_staging_batch',        idColumn: 'city_id' },
  personalities:  { rpc: 'commit_personality_staging_batch', idColumn: 'personality_id' },
  events:         { rpc: 'commit_event_staging_batch',       idColumn: 'event_id' },
  queer_villages: { rpc: 'commit_village_staging_batch',     idColumn: 'village_id' },
  marketplace_listings: {
    rpc: 'commit_marketplace_staging_batch',
    idColumn: 'listing_id',
    extraArgs: (ctx) => ({ p_pipeline_run_id: ctx.pipelineRunId ?? null }),
  },
}

type SimpleCommitRow = { staging_id: string; action: string } & Record<string, string>

async function commitSimple(
  supabase: ReturnType<typeof getServiceClient>,
  target: string,
  cfg: SimpleCommitConfig,
  ctx: { batchSize: number; pipelineRunId?: string },
  req: Request,
): Promise<Response> {
  const args = { p_limit: ctx.batchSize, ...(cfg.extraArgs?.({ pipelineRunId: ctx.pipelineRunId }) ?? {}) }
  const { data, error, circuitOpen } = await rpcWithBreaker<SimpleCommitRow[]>(
    supabase, `rpc.${cfg.rpc}`, cfg.rpc, args,
  )
  if (circuitOpen) {
    return jsonResponse({ success: false, error: error?.message, circuit_open: true, retry: true }, 503, req)
  }
  if (error) return errorResponse(`commit fn: ${error.message}`, 500, req)
  const rows = data ?? []
  const inserted = rows.filter((r) => r.action === 'inserted').length
  const updated  = rows.filter((r) => r.action === 'updated').length
  const errorsCt = rows.filter((r) => r.action === 'error' || r.action === 'rejected').length
  return jsonResponse({
    success: true,
    items: rows.length,
    items_processed: rows.length,
    items_succeeded: inserted + updated,
    items_failed: errorsCt,
    inserted, updated,
    target,
  }, 200, req)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string
    const targetTable   = body.targetTable as string | undefined
    const strategy      = (body.strategy as string) || 'upsert'
    const conflictKey   = body.conflictKey as string | undefined
    const batchSize     = body.batch_size || 50
    const dryRun        = body.dry_run || false

    // Decide fast path: if all work is for venues, use the SQL batch fn.
    const resolvedTarget = targetTable ?? await detectTarget(supabase, pipelineRunId)

    if (resolvedTarget === 'venues' && !dryRun) {
      // Run the standard simple commit, then post-process for organizer flagging.
      const cfg = SIMPLE_COMMIT_TARGETS.venues
      const args = { p_limit: batchSize }
      const { data, error, circuitOpen } = await rpcWithBreaker<SimpleCommitRow[]>(
        supabase, `rpc.${cfg.rpc}`, cfg.rpc, args,
      )
      if (circuitOpen) return jsonResponse({ success: false, error: error?.message, circuit_open: true, retry: true }, 503, req)
      if (error) return errorResponse(`commit fn: ${error.message}`, 500, req)
      const rows = data ?? []
      const inserted = rows.filter((r) => r.action === 'inserted').length
      const updated  = rows.filter((r) => r.action === 'updated').length

      // Post-commit: flag venues from social/community submissions where
      // normalized_data.is_organizer=true. Read staging back to find them.
      if (rows.length) {
        const stagingIds = rows.map((r) => r.staging_id)
        const { data: orgRows } = await supabase
          .from('ingestion_staging')
          .select('id, normalized_data')
          .in('id', stagingIds)
        const stagingById = new Map<string, Record<string, unknown>>()
        for (const s of orgRows ?? []) stagingById.set(s.id, (s.normalized_data ?? {}) as Record<string, unknown>)
        const organizerUpdates = rows.filter((r) => {
          const n = stagingById.get(r.staging_id) ?? {}
          return n.is_organizer === true
        })
        for (const r of organizerUpdates) {
          const n = stagingById.get(r.staging_id) ?? {}
          await supabase
            .from('venues')
            .update({
              is_organizer: true,
              organizer_handles: (n.organizer_handles as Record<string, unknown>) ?? null,
            })
            .eq('id', r.venue_id)
        }
      }

      return jsonResponse({
        success: true,
        items: rows.length,
        items_processed: rows.length,
        items_succeeded: rows.length,
        inserted, updated,
      }, 200, req)
    }

    // Standard simple targets: countries, cities, personalities, events,
    // queer_villages, marketplace_listings — all go through commitSimple.
    if (resolvedTarget && !dryRun && resolvedTarget in SIMPLE_COMMIT_TARGETS && resolvedTarget !== 'venues') {
      return commitSimple(
        supabase,
        resolvedTarget,
        SIMPLE_COMMIT_TARGETS[resolvedTarget],
        { batchSize, pipelineRunId },
        req,
      )
    }

    if (resolvedTarget === 'news_articles' && !dryRun) {
      // Find unique job_ids in this batch and commit per-job via news RPC
      const jobQuery = supabase
        .from('ingestion_staging')
        .select('job_id')
        .eq('target_table', 'news_articles')
        .eq('disposition', 'pending')
        .limit(50)
      const { data: jobRows, error: jobErr } = await jobQuery
      if (jobErr) return errorResponse(`load jobs: ${jobErr.message}`, 500, req)
      const jobIds = Array.from(new Set((jobRows ?? []).map((r: { job_id: string }) => r.job_id)))
      if (jobIds.length === 0) {
        return jsonResponse({ success: true, items: 0, message: 'no pending news to commit' }, 200, req)
      }
      let totalInserted = 0, totalUpdated = 0, totalSkipped = 0, totalErrors = 0
      let _circuitTripped = 0
      for (const jid of jobIds) {
        const { data, error, circuitOpen } = await rpcWithBreaker<unknown>(
          supabase, 'rpc.news_commit_staging_batch', 'news_commit_staging_batch',
          { p_job_id: jid, p_pipeline_run_id: pipelineRunId ?? null, p_limit: batchSize },
        )
        if (circuitOpen) { _circuitTripped++; continue }
        if (error) { console.error(`news_commit ${jid}:`, error.message); totalErrors++; continue }
        const row = Array.isArray(data) ? data[0] : data
        totalInserted += row?.inserted ?? 0
        totalUpdated  += row?.updated ?? 0
        totalSkipped  += row?.skipped ?? 0
        totalErrors   += row?.errors ?? 0
      }
      return jsonResponse({
        success: true,
        items: totalInserted + totalUpdated,
        items_processed: totalInserted + totalUpdated + totalSkipped + totalErrors,
        items_succeeded: totalInserted + totalUpdated,
        items_failed: totalErrors,
        inserted: totalInserted, updated: totalUpdated,
        skipped: totalSkipped, errors: totalErrors,
      }, 200, req)
    }

    if (resolvedTarget === 'queer_villages' && !dryRun) {
      const { data, error, circuitOpen } = await rpcWithBreaker<Array<{ staging_id: string, village_id: string, action: string }>>(
        supabase, 'rpc.commit_village_staging_batch', 'commit_village_staging_batch', { p_limit: batchSize },
      )
      if (circuitOpen) return jsonResponse({ success: false, error: error?.message, circuit_open: true, retry: true }, 503, req)
      if (error) return errorResponse(`commit fn: ${error.message}`, 500, req)
      const rows = (data ?? []) as Array<{ staging_id: string, village_id: string, action: string }>
      const inserted = rows.filter((r) => r.action === 'inserted').length
      const updated  = rows.filter((r) => r.action === 'updated').length
      return jsonResponse({
        success: true, items: rows.length,
        items_processed: rows.length, items_succeeded: rows.length,
        inserted, updated,
      }, 200, req)
    }

    // ---- Legacy non-venue path ----
    // Idempotency: select target_record_id + idempotency_key so we can SKIP
    // items that were already committed in a prior partial run. Without this,
    // a retry after a mid-batch failure can re-insert the same record.
    let query = supabase
      .from('ingestion_staging')
      .select('id, normalized_data, enriched_data, target_table, entity_type, source_type, raw_data, target_record_id, idempotency_key, source_name')
      .in('disposition', ['pending'])
      .in('dedup_status', ['unique', 'pending'])
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (targetTable)   query = query.eq('target_table', targetTable)

    const { data: items, error } = await query
    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    if (!items || items.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'nothing to commit' }, 200, req)
    }

    let committed = 0, skipped = 0, errors = 0

    for (const item of items) {
      try {
        const table = item.target_table || targetTable
        if (!table) { skipped++; continue }

        // Idempotency checkpoint: a partial-failure retry must not re-insert
        // an item that already has a target_record_id from an earlier run.
        if (item.target_record_id) {
          await supabase.from('ingestion_staging').update({
            disposition: 'committed',
            processed_at: new Date().toISOString(),
            updated_at:   new Date().toISOString(),
          }).eq('id', item.id)
          skipped++
          continue
        }

        // Secondary idempotency: if staging update failed after a successful
        // insert on a prior attempt, target_record_id is null but the row
        // exists in the target table. Check via idempotency_key to avoid dupes.
        if (item.idempotency_key) {
          const { count } = await supabase
            .from('ingestion_staging')
            .select('id', { count: 'exact', head: true })
            .eq('idempotency_key', item.idempotency_key)
            .eq('disposition', 'committed')
            .neq('id', item.id)
          if (count && count > 0) {
            await supabase.from('ingestion_staging').update({
              disposition: 'committed',
              processed_at: new Date().toISOString(),
              error_message: 'idempotency_key already committed by sibling row',
            }).eq('id', item.id)
            skipped++
            continue
          }
        }

        const normalized = (item.normalized_data ?? {}) as Record<string, unknown>
        const enriched   = (item.enriched_data ?? {}) as Record<string, unknown>
        const record     = buildRecord(table, normalized, enriched, item.entity_type)

        if (dryRun) { committed++; continue }

        const q = supabase.from(table)
        const result = (strategy === 'upsert' && conflictKey)
          ? await q.upsert(record, { onConflict: conflictKey }).select('id').single()
          : await q.insert(record).select('id').single()
        if (result.error) throw new Error(`${table}: ${result.error.message}`)

        await supabase.from('ingestion_staging').update({
          disposition:      'committed',
          target_record_id: result.data?.id ?? null,
          processed_at:     new Date().toISOString(),
          updated_at:       new Date().toISOString(),
        }).eq('id', item.id)

        await supabase.from('ingestion_events').insert({
          staging_id: item.id,
          stage:      'commit',
          new_status: 'committed',
          actor:      'pipeline-commit',
          payload:    { target_table: table, record_id: result.data?.id },
        })

        committed++
      } catch (e) {
        console.error(`commit ${item.id}:`, (e as Error).message)
        await supabase.from('ingestion_staging').update({
          error_message: `commit: ${(e as Error).message}`,
          disposition:   'rejected',
          updated_at:    new Date().toISOString(),
        }).eq('id', item.id)
        await supabase.from('ingestion_events').insert({
          staging_id: item.id, stage: 'commit', new_status: 'rejected',
          actor: 'pipeline-commit', payload: { error: (e as Error).message },
        })
        errors++
      }
    }

    return jsonResponse({
      success: true,
      items: committed,
      items_total: items.length,
      items_processed: committed + skipped + errors,
      items_succeeded: committed,
      items_failed: errors,
      items_skipped: skipped,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-commit:', error)
    await logPipelineError(supabase, 'pipeline-commit', error, { severity: 'fatal' })
    reportApiError('pipeline-commit', error, { endpoint: '/functions/v1/pipeline-commit' })
    return errorResponse((error as Error).message, 500, req)
  }
})

async function detectTarget(supabase: ReturnType<typeof getServiceClient>, runId?: string): Promise<string | null> {
  const q = supabase
    .from('ingestion_staging')
    .select('target_table', { count: 'exact' })
    .eq('disposition', 'pending')
    .limit(1)
  if (runId) q.eq('pipeline_run_id', runId)
  const { data } = await q
  return data?.[0]?.target_table ?? null
}

function buildRecord(
  table: string,
  normalized: Record<string, unknown>,
  enriched: Record<string, unknown>,
  _entityType: string | null,
): Record<string, unknown> {
  const meta = (normalized.metadata ?? {}) as Record<string, unknown>
  const loc  = (normalized.location ?? {}) as Record<string, unknown>
  const record: Record<string, unknown> = {}

  switch (table) {
    case 'events':
      record.title       = normalized.name
      record.description = normalized.description || enriched.description
      record.start_date  = (normalized.dates as Record<string, unknown>)?.start
      record.end_date    = (normalized.dates as Record<string, unknown>)?.end
      if (loc.city) record.location = loc.city
      if (meta.url) record.url = meta.url
      {
        const site = meta.website || meta.url || ((normalized.urls as string[]) ?? [])[0]
        if (site) {
          const logo = logoUrlFromWebsite(site as string)
          if (logo) { record.logo_url = logo; record.logo_fetched_at = new Date().toISOString() }
        }
      }
      break

    case 'personalities':
      record.name = normalized.name
      record.bio  = normalized.description || enriched.description
      if (meta.birth_date)  record.birth_date  = meta.birth_date
      if (meta.nationality) record.nationality = meta.nationality
      if (meta.profession)  record.profession  = meta.profession
      break

    case 'news_articles':
      record.title     = normalized.name
      record.content   = normalized.description
      record.url       = ((normalized.urls as string[]) ?? [])[0]
      record.image_url = ((normalized.images as string[]) ?? [])[0]
      if (meta.source_name)  record.publisher_name = meta.source_name
      if (meta.published_at) record.published_at = meta.published_at
      break

    case 'countries':
      record.name = normalized.name
      record.code = meta.code || meta.cca2
      break

    default:
      if (normalized.name)        record.name        = normalized.name
      if (normalized.description) record.description = normalized.description
      Object.assign(record, meta)
  }

  return record
}
