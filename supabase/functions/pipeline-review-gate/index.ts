import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

// ============================================================
// Pipeline Review Gate Node
// Routes low-confidence items to human review queue,
// auto-approves high-confidence items.
//
// Hardened: review_queue inserts use the correct schema (entity_type,
// entity_id, review_type, status, details — NOT reason/source which were
// failing silently before the swallowed `.catch(() => {})` was removed).
// On insert failure the staging row is left pending so the next run retries.
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string
    const minConfidence = body.minConfidence ?? 0.7
    const autoApproveAbove = body.autoApproveAbove ?? 0.9
    const batchSize = body.batch_size || 50
    const dryRun = body.dry_run || false

    let query = supabase
      .from('ingestion_staging')
      .select('id, ai_confidence_score, ai_validation_status, review_status, enriched_data, target_table')
      .eq('ai_validation_status', 'approved')
      .eq('review_status', 'auto')
      .eq('disposition', 'pending')
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (pipelineRunId) query = query.eq('pipeline_run_id', pipelineRunId)

    const { data: items, error } = await query
    if (error) return errorResponse(`Failed to load items: ${error.message}`, 500, req)
    if (!items || items.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'No items to review-gate' }, 200, req)
    }

    let approved = 0
    let sentToReview = 0
    let failed = 0

    for (const item of items) {
      const confidence = item.ai_confidence_score || 0
      const enriched = (item.enriched_data || {}) as Record<string, unknown>
      const qualityScore = (enriched.quality_score as number) || 50

      const combinedScore = (confidence * 0.6) + (qualityScore / 100 * 0.4)

      if (combinedScore >= autoApproveAbove) {
        if (!dryRun) {
          const { error: e } = await supabase
            .from('ingestion_staging')
            .update({ review_status: 'approved' })
            .eq('id', item.id)
          if (e) { failed++; console.error(`approve ${item.id}: ${e.message}`); continue }
        }
        approved++
      } else if (combinedScore < minConfidence) {
        if (!dryRun) {
          // Hard-fail review_queue insert: no swallowed errors. If the insert
          // fails, leave the row in 'auto' so the next run retries.
          const { error: rqErr } = await supabase.from('review_queue').insert({
            entity_type: 'ingestion_staging',
            entity_id:   item.id,
            review_type: 'low_confidence',
            status:      'pending',
            details: {
              combined_score: combinedScore,
              confidence,
              quality_score: qualityScore,
              target_table: item.target_table,
              source: 'pipeline-review-gate',
            },
          })
          if (rqErr) {
            console.error(`review_queue insert ${item.id}: ${rqErr.message}`)
            await supabase.from('ingestion_staging').update({
              error_message: `review_gate: review_queue insert failed: ${rqErr.message}`,
            }).eq('id', item.id)
            failed++
            continue
          }

          const { error: updErr } = await supabase
            .from('ingestion_staging')
            .update({ review_status: 'pending_review' })
            .eq('id', item.id)
          if (updErr) {
            // review_queue row exists but staging update failed — log loudly.
            // Next run will see the orphan and resolve.
            console.error(`staging update ${item.id}: ${updErr.message}`)
            failed++
            continue
          }
        }
        sentToReview++
      } else {
        if (!dryRun) {
          const { error: e } = await supabase
            .from('ingestion_staging')
            .update({ review_status: 'approved' })
            .eq('id', item.id)
          if (e) { failed++; console.error(`auto-approve ${item.id}: ${e.message}`); continue }
        }
        approved++
      }
    }

    return jsonResponse({
      success: true,
      items: approved,
      items_total: items.length,
      items_processed: approved + sentToReview + failed,
      items_succeeded: approved,
      items_failed: failed,
      approved,
      sent_to_review: sentToReview,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-review-gate error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
