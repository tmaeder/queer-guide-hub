import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

// ============================================================
// Pipeline Review Gate Node
// Routes low-confidence items to human review queue,
// auto-approves high-confidence items
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
      .select('id, ai_confidence_score, ai_validation_status, review_status, enriched_data')
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

    for (const item of items) {
      const confidence = item.ai_confidence_score || 0
      const enriched = (item.enriched_data || {}) as Record<string, unknown>
      const qualityScore = (enriched.quality_score as number) || 50

      // Combined score: confidence + quality
      const combinedScore = (confidence * 0.6) + (qualityScore / 100 * 0.4)

      if (combinedScore >= autoApproveAbove) {
        if (!dryRun) {
          await supabase
            .from('ingestion_staging')
            .update({ review_status: 'approved' })
            .eq('id', item.id)
        }
        approved++
      } else if (combinedScore < minConfidence) {
        if (!dryRun) {
          await supabase
            .from('ingestion_staging')
            .update({ review_status: 'pending_review' })
            .eq('id', item.id)

          // Also add to review_queue if it exists
          await supabase.from('review_queue').insert({
            entity_type: 'staging_item',
            entity_id: item.id,
            reason: `Low confidence (${(combinedScore * 100).toFixed(0)}%)`,
            source: 'pipeline-review-gate',
          }).catch(() => {}) // review_queue may not exist yet
        }
        sentToReview++
      } else {
        // Medium confidence — auto-approve
        if (!dryRun) {
          await supabase
            .from('ingestion_staging')
            .update({ review_status: 'approved' })
            .eq('id', item.id)
        }
        approved++
      }
    }

    return jsonResponse({
      success: true,
      items: approved,
      items_total: items.length,
      items_processed: approved + sentToReview,
      items_succeeded: approved,
      approved,
      sent_to_review: sentToReview,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-review-gate error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
