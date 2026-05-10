import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { scoreMarketplaceQuality } from '../_shared/marketplace-pipeline-utils.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// ============================================================
// Pipeline Quality Score Node
// Computes a 0-100 quality score based on data completeness
// ============================================================

Deno.serve(withErrorReporting('pipeline-quality-score', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const _pipelineRunId = body.pipeline_run_id as string
    const entityType = body.entityType as string
    const minScore = body.minScore ?? 40
    const batchSize = body.batch_size || 50
    const dryRun = body.dry_run || false

    const query = supabase
      .from('ingestion_staging')
      .select('id, normalized_data, enriched_data, entity_type, target_table')
      .eq('enrichment_status', 'pending')
      .in('dedup_status', ['unique', 'pending'])
      .eq('ai_validation_status', 'approved')
      .order('created_at', { ascending: true })
      .limit(batchSize)

    const { data: items, error } = await query
    if (error) return errorResponse(`Failed to load items: ${error.message}`, 500, req)
    if (!items || items.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'No items to score' }, 200, req)
    }

    let scored = 0
    for (const item of items) {
      const normalized = (item.normalized_data || {}) as Record<string, unknown>
      const type = item.entity_type || entityType

      const score = type === 'personality' || item.target_table === 'personalities'
        ? computePersonalityScore(normalized)
        : (type === 'marketplace' || item.target_table === 'marketplace_listings')
          ? scoreMarketplaceQuality(normalized)
          : computeScore(normalized, type)

      if (!dryRun) {
        const belowMin = score < minScore
        await supabase
          .from('ingestion_staging')
          .update({
            enrichment_status: 'completed',
            enriched_data: { ...(item.enriched_data as Record<string, unknown> || {}), quality_score: score },
            ...(belowMin ? { review_status: 'pending_review', disposition: 'pending' } : {}),
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
}))

function computeScore(data: Record<string, unknown>, _entityType: string): number {
  let score = 0
  const max = 100

  // Name (20 pts) — different entity types use different primary name fields.
  // Events use `title`; marketplace uses `title` or `product_name`; venues and
  // personalities use `name`. Without this fallback, events and products were
  // scoring 0 on the name dimension despite being complete.
  const name = String(
    data.name
      ?? data.title
      ?? data.product_name
      ?? (data as Record<string, unknown>).display_name
      ?? '',
  )
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

/** Personality rubric: image 15, description 20, lgbti_connection 20, birth_date 10, profession 10, nationality 10, wikidata_qid 15. */
function computePersonalityScore(data: Record<string, unknown>): number {
  let score = 0
  const name = String(data.name || '')
  if (name.length >= 2) score += 5
  if (String(data.image_url || '')) score += 15
  const desc = String(data.description || data.bio || '')
  if (desc.length > 0) score += 10
  if (desc.length > 80) score += 10
  if (String(data.lgbti_connection || '')) score += 20
  if (data.birth_date) score += 10
  if (String(data.profession || '')) score += 10
  if (String(data.nationality || '')) score += 10
  if (String(data.wikidata_qid || '')) score += 15
  const fields = data.fields as unknown[] | undefined
  if (fields && fields.length > 0) score += 5
  return Math.min(score, 100)
}
