import { getServiceClient, getCorsHeaders, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

// ============================================================
// Pipeline Commit Node
// Reads validated/enriched items from ingestion_staging
// and INSERTs/UPSERTs them into the target table.
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string
    const nodeId = body.node_id as string
    const targetTable = body.targetTable as string
    const strategy = (body.strategy as string) || 'upsert'
    const conflictKey = body.conflictKey as string
    const batchSize = body.batch_size || 50
    const dryRun = body.dry_run || false

    // Load staging items ready for commit
    let query = supabase
      .from('ingestion_staging')
      .select('id, normalized_data, enriched_data, target_table, entity_type, source_type, raw_data')
      .in('disposition', ['pending'])
      .in('dedup_status', ['unique', 'pending']) // allow pending dedup for simple pipelines
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (pipelineRunId) {
      query = query.eq('pipeline_run_id', pipelineRunId)
    }

    const { data: items, error } = await query
    if (error) return errorResponse(`Failed to load staging items: ${error.message}`, 500, req)
    if (!items || items.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'No items to commit' }, 200, req)
    }

    let committed = 0
    let skipped = 0
    let errors = 0

    for (const item of items) {
      try {
        const table = item.target_table || targetTable
        if (!table) {
          console.warn(`No target_table for staging item ${item.id}, skipping`)
          skipped++
          continue
        }

        // Build the record from normalized + enriched data
        const normalized = (item.normalized_data || {}) as Record<string, unknown>
        const enriched = (item.enriched_data || {}) as Record<string, unknown>
        const record = buildRecord(table, normalized, enriched, item.entity_type)

        if (dryRun) {
          committed++
          continue
        }

        // Insert or upsert into target table
        let result
        if (strategy === 'upsert' && conflictKey) {
          result = await supabase.from(table).upsert(record, { onConflict: conflictKey }).select('id').single()
        } else {
          result = await supabase.from(table).insert(record).select('id').single()
        }

        if (result.error) {
          throw new Error(`${table} insert: ${result.error.message}`)
        }

        // Update staging item
        await supabase
          .from('ingestion_staging')
          .update({
            disposition: 'committed',
            target_record_id: result.data?.id || null,
            processed_at: new Date().toISOString(),
          })
          .eq('id', item.id)

        committed++
      } catch (e) {
        console.error(`Commit error for ${item.id}:`, (e as Error).message)
        await supabase
          .from('ingestion_staging')
          .update({
            error_message: `Commit: ${(e as Error).message}`,
            disposition: 'rejected',
          })
          .eq('id', item.id)
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
    console.error('pipeline-commit error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})

/** Map normalized/enriched data to target table columns */
function buildRecord(
  table: string,
  normalized: Record<string, unknown>,
  enriched: Record<string, unknown>,
  entityType: string | null
): Record<string, unknown> {
  const meta = (normalized.metadata || {}) as Record<string, unknown>
  const loc = (normalized.location || {}) as Record<string, unknown>

  // Start with common fields, then add table-specific mappings
  const record: Record<string, unknown> = {}

  switch (table) {
    case 'venues':
      record.name = normalized.name
      record.description = normalized.description || enriched.description
      record.address = loc.address
      record.city = loc.city
      record.country = loc.country
      record.latitude = loc.lat
      record.longitude = loc.lng
      record.website = (normalized.contacts as Record<string, unknown>)?.website
      record.phone = (normalized.contacts as Record<string, unknown>)?.phone
      record.email = (normalized.contacts as Record<string, unknown>)?.email
      if (meta.foursquare_id) record.foursquare_id = meta.foursquare_id
      if (meta.google_place_id) record.google_place_id = meta.google_place_id
      break

    case 'events':
      record.title = normalized.name
      record.description = normalized.description || enriched.description
      record.start_date = (normalized.dates as Record<string, unknown>)?.start
      record.end_date = (normalized.dates as Record<string, unknown>)?.end
      if (loc.city) record.location = loc.city
      if (meta.url) record.url = meta.url
      break

    case 'personalities':
      record.name = normalized.name
      record.bio = normalized.description || enriched.description
      if (meta.birth_date) record.birth_date = meta.birth_date
      if (meta.nationality) record.nationality = meta.nationality
      if (meta.profession) record.profession = meta.profession
      break

    case 'news_articles':
      record.title = normalized.name
      record.content = normalized.description
      record.url = ((normalized.urls as string[]) || [])[0]
      record.image_url = ((normalized.images as string[]) || [])[0]
      if (meta.source_name) record.source_name = meta.source_name
      if (meta.published_at) record.published_at = meta.published_at
      break

    case 'countries':
      record.name = normalized.name
      record.code = meta.code || meta.cca2
      break

    default:
      // Generic: pass through normalized fields
      if (normalized.name) record.name = normalized.name
      if (normalized.description) record.description = normalized.description
      Object.assign(record, meta)
      break
  }

  return record
}
