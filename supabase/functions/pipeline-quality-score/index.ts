import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

// ============================================================
// Pipeline Quality Score Node
// Computes a 0-100 quality score based on data completeness
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string
    const entityType = body.entityType as string
    const minScore = body.minScore ?? 40
    const batchSize = body.batch_size || 50
    const dryRun = body.dry_run || false

    let query = supabase
      .from('ingestion_staging')
      .select('id, normalized_data, enriched_data, entity_type, target_table')
      .eq('enrichment_status', 'pending')
      .in('dedup_status', ['unique', 'pending'])
      .eq('ai_validation_status', 'approved')
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (pipelineRunId) query = query.eq('pipeline_run_id', pipelineRunId)

    const { data: items, error } = await query
    if (error) return errorResponse(`Failed to load items: ${error.message}`, 500, req)
    if (!items || items.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'No items to score' }, 200, req)
    }

    let scored = 0
    for (const item of items) {
      const normalized = (item.normalized_data || {}) as Record<string, unknown>
      const type = item.entity_type || entityType

      const score = computeScore(normalized, type)

      if (!dryRun) {
        await supabase
          .from('ingestion_staging')
          .update({
            enrichment_status: 'completed',
            enriched_data: { ...(item.enriched_data as Record<string, unknown> || {}), quality_score: score },
          })
          .eq('id', item.id)
      }
      scored++
    }

    return jsonResponse({
      success: true,
      items: scored,
      items_processed: scored,
      items_succeeded: scored,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-quality-score error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})

function computeScore(data: Record<string, unknown>, entityType: string): number {
  let score = 0
  const max = 100

  // Name (20 pts)
  const name = String(data.name || '')
  if (name.length > 0) score += 10
  if (name.length > 10) score += 10

  // Description (20 pts)
  const desc = String(data.description || '')
  if (desc.length > 0) score += 10
  if (desc.length > 50) score += 10

  // Location (20 pts)
  const loc = data.location as Record<string, unknown> | undefined
  if (loc) {
    if (loc.lat && loc.lng) score += 10
    if (loc.city || loc.country) score += 10
  }

  // URLs (10 pts)
  const urls = data.urls as string[] | undefined
  if (urls && urls.length > 0) score += 10

  // Images (10 pts)
  const images = data.images as string[] | undefined
  if (images && images.length > 0) score += 10

  // Tags (10 pts)
  const tags = data.tags as string[] | undefined
  if (tags && tags.length > 0) score += 5
  if (tags && tags.length > 3) score += 5

  // Contacts (10 pts)
  const contacts = data.contacts as Record<string, unknown> | undefined
  if (contacts) {
    if (contacts.website) score += 5
    if (contacts.email || contacts.phone) score += 5
  }

  return Math.min(score, max)
}
