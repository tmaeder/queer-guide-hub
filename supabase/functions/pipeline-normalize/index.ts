import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

// ============================================================
// Pipeline Normalize Node
// Reads raw_data from ingestion_staging, writes normalized_data
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string
    const _nodeId = body.node_id as string
    const entityType = body.entityType as string
    const batchSize = body.batch_size || 50
    const dryRun = body.dry_run || false

    // Load staging items that have raw_data but no normalized_data yet
    let query = supabase
      .from('ingestion_staging')
      .select('id, raw_data, source_type, entity_type, target_table')
      .is('normalized_data', null)
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (pipelineRunId) {
      query = query.eq('pipeline_run_id', pipelineRunId)
    }
    if (entityType) {
      query = query.eq('entity_type', entityType)
    }

    const { data: items, error } = await query
    if (error) return errorResponse(`Failed to load staging items: ${error.message}`, 500, req)
    if (!items || items.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'No items to normalize' }, 200, req)
    }

    let normalized = 0
    let errors = 0

    for (const item of items) {
      try {
        const raw = item.raw_data as Record<string, unknown>
        const type = item.entity_type || entityType || guessEntityType(item.target_table)

        const normalizedData = normalizeItem(raw, type)

        if (!dryRun) {
          await supabase
            .from('ingestion_staging')
            .update({
              normalized_data: normalizedData,
              entity_type: type,
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id)
        }

        normalized++
      } catch (e) {
        console.error(`Normalize error for ${item.id}:`, (e as Error).message)
        if (!dryRun) {
          await supabase
            .from('ingestion_staging')
            .update({
              error_message: `Normalize: ${(e as Error).message}`,
              disposition: 'rejected',
            })
            .eq('id', item.id)
        }
        errors++
      }
    }

    return jsonResponse({
      success: true,
      items: normalized,
      items_processed: normalized + errors,
      items_succeeded: normalized,
      items_failed: errors,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-normalize error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})

function guessEntityType(targetTable: string | null): string {
  if (!targetTable) return 'unknown'
  const map: Record<string, string> = {
    venues: 'venue', events: 'event', personalities: 'personality',
    news_articles: 'news_article', unified_tags: 'tag', cities: 'city',
    countries: 'country', marketplace_listings: 'marketplace', airports: 'airport',
  }
  return map[targetTable] || targetTable.replace(/s$/, '')
}

function normalizeItem(raw: Record<string, unknown>, entityType: string): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    entity_type: entityType,
    source_id: raw.id || raw.source_id || raw.external_id || null,
  }

  // Common fields
  normalized.name = cleanText(raw.name || raw.title || raw.display_name || '')
  normalized.description = cleanText(raw.description || raw.body || raw.content || raw.summary || '')

  // Location
  if (raw.lat || raw.latitude || raw.location) {
    const loc = (raw.location || {}) as Record<string, unknown>
    normalized.location = {
      lat: Number(raw.lat || raw.latitude || loc.lat) || null,
      lng: Number(raw.lng || raw.longitude || loc.lng || raw.lon) || null,
      address: cleanText(raw.address || loc.address || ''),
      city: cleanText(raw.city || loc.city || ''),
      country: cleanText(raw.country || loc.country || ''),
      country_code: (raw.country_code || raw.countryCode || loc.country_code || '').toString().toUpperCase(),
    }
  }

  // Dates
  if (raw.start_date || raw.date || raw.created_at || raw.published_at) {
    normalized.dates = {
      start: normalizeDate(raw.start_date || raw.date || raw.published_at),
      end: normalizeDate(raw.end_date),
    }
  }

  // Tags
  if (raw.tags || raw.categories || raw.keywords) {
    const tags = raw.tags || raw.categories || raw.keywords
    normalized.tags = Array.isArray(tags) ? tags.map(String) : String(tags).split(',').map(t => t.trim()).filter(Boolean)
  }

  // URLs
  const urls: string[] = []
  if (raw.url) urls.push(String(raw.url))
  if (raw.website) urls.push(String(raw.website))
  if (raw.link) urls.push(String(raw.link))
  if (urls.length > 0) normalized.urls = urls

  // Images
  const images: string[] = []
  if (raw.image) images.push(String(raw.image))
  if (raw.image_url) images.push(String(raw.image_url))
  if (raw.photo) images.push(String(raw.photo))
  if (Array.isArray(raw.images)) images.push(...raw.images.map(String))
  if (images.length > 0) normalized.images = images

  // Contacts
  if (raw.email || raw.phone || raw.website) {
    normalized.contacts = {
      email: raw.email ? String(raw.email).toLowerCase().trim() : null,
      phone: raw.phone ? String(raw.phone).trim() : null,
      website: raw.website ? String(raw.website).trim() : null,
    }
  }

  // Pass through any entity-specific fields
  normalized.metadata = { ...raw }

  return normalized
}

function cleanText(val: unknown): string {
  if (!val) return ''
  return String(val)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '') // strip HTML
    .trim()
}

function normalizeDate(val: unknown): string | null {
  if (!val) return null
  try {
    const d = new Date(String(val))
    return isNaN(d.getTime()) ? null : d.toISOString()
  } catch {
    return null
  }
}
