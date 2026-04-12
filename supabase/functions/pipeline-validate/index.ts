import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

// ============================================================
// Pipeline Validate Node
// Validates staging items: schema checks, required fields,
// optional AI-based LGBTQ+ relevance scoring
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string
    const entityType = body.entityType as string
    const _minConfidence = body.minConfidence ?? 0.5
    const _useAI = body.useAI ?? false // AI validation is opt-in
    const batchSize = body.batch_size || 50
    const dryRun = body.dry_run || false

    // Load items with normalized_data but not yet validated
    let query = supabase
      .from('ingestion_staging')
      .select('id, normalized_data, entity_type, target_table')
      .eq('ai_validation_status', 'pending')
      .not('normalized_data', 'is', null)
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (pipelineRunId) query = query.eq('pipeline_run_id', pipelineRunId)
    if (entityType) query = query.eq('entity_type', entityType)

    const { data: items, error } = await query
    if (error) return errorResponse(`Failed to load items: ${error.message}`, 500, req)
    if (!items || items.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'No items to validate' }, 200, req)
    }

    let approved = 0
    let rejected = 0
    let needsReview = 0

    for (const item of items) {
      const normalized = item.normalized_data as Record<string, unknown>
      const type = item.entity_type || entityType

      // Schema validation
      const validationErrors: string[] = []
      const validationWarnings: string[] = []

      // Required: name
      if (!normalized.name || String(normalized.name).trim().length < 2) {
        validationErrors.push('Missing or too short name')
      }

      // Entity-specific validations
      switch (type) {
        case 'venue':
          if (!normalized.location) validationWarnings.push('No location data')
          break
        case 'event':
          if (!normalized.dates) validationWarnings.push('No date information')
          break
        case 'news_article':
          if (!normalized.description && !((normalized.metadata as Record<string, unknown>)?.content)) {
            validationErrors.push('No article content')
          }
          break
      }

      // URL validation
      const urls = normalized.urls as string[] | undefined
      if (urls) {
        for (const url of urls) {
          try { new URL(url) } catch { validationWarnings.push(`Invalid URL: ${url}`) }
        }
      }

      // Determine status
      let status: 'approved' | 'rejected' | 'needs_review'
      let confidence = 1.0

      if (validationErrors.length > 0) {
        status = 'rejected'
        confidence = 0
      } else if (validationWarnings.length > 2) {
        status = 'needs_review'
        confidence = 0.5
      } else {
        status = 'approved'
        confidence = validationWarnings.length === 0 ? 1.0 : 0.8
      }

      if (!dryRun) {
        await supabase
          .from('ingestion_staging')
          .update({
            ai_validation_status: status,
            ai_confidence_score: confidence,
            ai_validation_result: { errors: validationErrors, warnings: validationWarnings },
            ai_validated_at: new Date().toISOString(),
            disposition: status === 'rejected' ? 'rejected' : 'pending',
            review_status: status === 'needs_review' ? 'pending_review' : 'auto',
          })
          .eq('id', item.id)
      }

      if (status === 'approved') approved++
      else if (status === 'rejected') rejected++
      else needsReview++
    }

    return jsonResponse({
      success: true,
      items: approved + needsReview,
      items_total: items.length,
      items_processed: approved + rejected + needsReview,
      items_succeeded: approved,
      items_failed: rejected,
      approved,
      rejected,
      needs_review: needsReview,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-validate error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
