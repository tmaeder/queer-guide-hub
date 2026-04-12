import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

// ============================================================
// Pipeline Deduplicate Node
// Checks staging items against existing records for duplicates
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string
    const threshold = body.threshold ?? 0.85
    const strategy = body.strategy ?? 'skip' // skip | merge | flag
    const batchSize = body.batch_size || 50
    const dryRun = body.dry_run || false

    // Load validated items not yet deduped
    let query = supabase
      .from('ingestion_staging')
      .select('id, normalized_data, entity_type, target_table')
      .eq('ai_validation_status', 'approved')
      .eq('dedup_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (pipelineRunId) query = query.eq('pipeline_run_id', pipelineRunId)

    const { data: items, error } = await query
    if (error) return errorResponse(`Failed to load items: ${error.message}`, 500, req)
    if (!items || items.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'No items to deduplicate' }, 200, req)
    }

    let unique = 0
    let duplicates = 0
    let merges = 0

    for (const item of items) {
      const normalized = item.normalized_data as Record<string, unknown>
      const table = item.target_table
      const name = String(normalized.name || '').trim().toLowerCase()

      if (!table || !name) {
        if (!dryRun) {
          await supabase
            .from('ingestion_staging')
            .update({ dedup_status: 'unique' })
            .eq('id', item.id)
        }
        unique++
        continue
      }

      // Check for exact name match in target table
      const { data: existing } = await supabase
        .from(table)
        .select('id, name')
        .ilike('name', name)
        .limit(1)

      let isDuplicate = false
      let matchId: string | null = null
      let matchScore = 0

      if (existing && existing.length > 0) {
        isDuplicate = true
        matchId = existing[0].id
        matchScore = 1.0 // exact match
      } else {
        // Check for fuzzy match using trigram similarity if name is long enough
        if (name.length > 3) {
          const { data: fuzzy } = await supabase
            .rpc('similarity_search_name', { p_table: table, p_name: name, p_threshold: threshold })
            .catch(() => ({ data: null }))

          if (fuzzy && fuzzy.length > 0) {
            isDuplicate = true
            matchId = fuzzy[0].id
            matchScore = fuzzy[0].similarity || threshold
          }
        }
      }

      if (!dryRun) {
        if (isDuplicate) {
          const dedupStatus = strategy === 'flag' ? 'merge_candidate' : 'duplicate'
          await supabase
            .from('ingestion_staging')
            .update({
              dedup_status: dedupStatus,
              dedup_match_id: matchId,
              dedup_match_table: table,
              dedup_match_score: matchScore,
              disposition: strategy === 'skip' ? 'skipped' : 'pending',
              review_status: strategy === 'flag' ? 'pending_review' : 'auto',
            })
            .eq('id', item.id)

          if (strategy === 'flag') merges++
          else duplicates++
        } else {
          await supabase
            .from('ingestion_staging')
            .update({ dedup_status: 'unique' })
            .eq('id', item.id)
          unique++
        }
      } else {
        if (isDuplicate) duplicates++
        else unique++
      }
    }

    return jsonResponse({
      success: true,
      items: unique + merges,
      items_total: items.length,
      items_processed: unique + duplicates + merges,
      items_succeeded: unique,
      items_failed: 0,
      unique,
      duplicates,
      merge_candidates: merges,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-deduplicate error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
