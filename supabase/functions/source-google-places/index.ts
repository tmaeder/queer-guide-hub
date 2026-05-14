import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging, MissingCredentialsError, skippedResponse } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// ============================================================
// Source: Google Places Text Search API
// Replaces: import-google-places-venues
// ============================================================

const GP_BASE = 'https://maps.googleapis.com/maps/api/place/textsearch/json'
const QUERIES = ['LGBTQ friendly bar', 'gay bar', 'queer cafe', 'pride venue', 'drag brunch']
const HOTEL_QUERIES = [
  'gay friendly hotel', 'lgbtq hotel', 'gay friendly bed and breakfast',
  'lgbtq guesthouse', 'gay resort', 'gay friendly hostel',
]
const DEFAULT_LOCATIONS = ['40.7128,-74.006', '37.7749,-122.4194', '34.0522,-118.2437', '51.5074,-0.1278', '52.52,-13.405']

const googlePlacesAdapter: SourceAdapter = {
  name: 'google-places',
  entityType: 'venue',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const apiKey = config.apiKey || Deno.env.get('GOOGLE_PLACES_API_KEY')
    if (!apiKey) throw new MissingCredentialsError('GOOGLE_PLACES_API_KEY')

    const supabase = getServiceClient()
    const locations = (config.filters?.locations as string[]) || DEFAULT_LOCATIONS
    const limit = config.batchSize || 20
    const mode   = (config.filters?.mode as string) || 'all'  // 'venues' | 'hotels' | 'all'
    const queries = mode === 'hotels' ? HOTEL_QUERIES
                  : mode === 'venues' ? QUERIES
                  : [...QUERIES, ...HOTEL_QUERIES]
    const allItems: RawItem[] = []

    for (const location of locations) {
      for (const query of queries) {
        try {
          const items = await withCircuitBreaker(supabase, 'google_places', async () => {
            const params = new URLSearchParams({ query, location, radius: '5000', key: apiKey })
            const res = await fetch(`${GP_BASE}?${params}`)
            if (!res.ok) throw new Error(`Google Places ${res.status}`)
            const json = await res.json()
            return json.results || []
          })
          const isHotelQuery = HOTEL_QUERIES.includes(query)
          for (const place of items.slice(0, limit)) {
            allItems.push({
              sourceId: place.place_id || `gp-${Date.now()}`,
              data: { ...place, _query: query, _is_accommodation: isHotelQuery },
            })
          }
          await new Promise(r => setTimeout(r, 200))
        } catch (e) {
          console.error(`Google Places error for "${query}":`, (e as Error).message)
        }
      }
    }
    const seen = new Set<string>()
    return allItems.filter(i => { if (seen.has(i.sourceId)) return false; seen.add(i.sourceId); return true })
  },

  normalize(raw: RawItem): NormalizedItem {
    const d = raw.data as Record<string, unknown>
    const geo = d.geometry as Record<string, Record<string, number>> | undefined
    const loc = geo?.location
    const types = (d.types as string[]) || []
    const isHotel = Boolean(d._is_accommodation) ||
      types.some(t => ['lodging','hotel','bed_and_breakfast','hostel','resort','guest_house'].includes(t))
    return {
      entityType: 'venue',
      sourceId: raw.sourceId,
      sourceName: 'google-places',
      name: String(d.name || ''),
      description: '',
      location: {
        lat: loc?.lat, lng: loc?.lng,
        address: String(d.formatted_address || d.vicinity || ''),
      },
      images: d.photos ? [(d.photos as Array<Record<string, string>>)[0]?.photo_reference || ''] : [],
      tags: types,
      ...(isHotel ? { accommodation_type: 'hotel' as const } : {}),
      metadata: {
        google_place_id: raw.sourceId,
        rating: d.rating,
        user_ratings_total: d.user_ratings_total,
        price_level: d.price_level,
        business_status: d.business_status,
        platform_ids: { google: raw.sourceId },
        query: d._query,
        data_source: 'google-places',
      },
    } as NormalizedItem
  },
  getSourceId(raw: RawItem): string { return raw.sourceId },
}

Deno.serve(withErrorReporting('source-google-places', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.limit || body.batch_size || 20,
      filters: { locations: body.locations, mode: body.mode || 'all' },
      apiKey: Deno.env.get('GOOGLE_PLACES_API_KEY'),
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id, nodeId: body.node_id,
    }
    const rawItems = await googlePlacesAdapter.fetch(config)
    if (config.dryRun) return jsonResponse({ success: true, items: rawItems.length, dry_run: true }, 200, req)
    const written = await writeToStaging(supabase, googlePlacesAdapter, rawItems, { ...config, targetTable: 'venues' })
    return jsonResponse({ success: true, items: written, items_total: rawItems.length, items_processed: written, items_succeeded: written, items_failed: 0 }, 200, req)
  } catch (error) {
    if (error instanceof MissingCredentialsError) {
      return jsonResponse(skippedResponse('missing_credentials', error.missing), 200, req)
    }
    return errorResponse((error as Error).message, 500, req)
  }
}))
