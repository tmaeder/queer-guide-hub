import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'

// ============================================================
// Source: Foursquare Places API v3
// Replaces: import-foursquare-venues
// ============================================================

const FSQ_BASE = 'https://api.foursquare.com/v3/places/search'
const FSQ_FIELDS = 'fsq_id,name,geocodes,location,categories,description,tel,website,email,hours,rating,price,photos,features,tastes'

const SEARCH_TERMS = ['gay bar', 'lgbtq', 'pride', 'queer', 'drag', 'leather bar']

const DEFAULT_CITIES = [
  'New York, NY', 'San Francisco, CA', 'Los Angeles, CA', 'Chicago, IL',
  'London, UK', 'Berlin, Germany', 'Amsterdam, Netherlands', 'Paris, France',
  'Barcelona, Spain', 'Sydney, Australia', 'Toronto, Canada', 'Bangkok, Thailand',
  'Tel Aviv, Israel', 'Buenos Aires, Argentina', 'Mexico City, Mexico',
  'Sao Paulo, Brazil', 'Madrid, Spain', 'Lisbon, Portugal', 'Montreal, Canada', 'Miami, FL',
]

const foursquareAdapter: SourceAdapter = {
  name: 'foursquare',
  entityType: 'venue',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const apiKey = config.apiKey || Deno.env.get('FOURSQUARE_API_KEY')
    if (!apiKey) throw new Error('FOURSQUARE_API_KEY not configured')

    const supabase = getServiceClient()
    const cities = (config.filters?.cities as string[]) || getCityForHour()
    const limit = config.batchSize || 20
    const allItems: RawItem[] = []

    for (const city of cities) {
      for (const term of SEARCH_TERMS) {
        try {
          const items = await withCircuitBreaker(supabase, 'foursquare', async () => {
            const params = new URLSearchParams({
              near: city,
              query: term,
              limit: String(limit),
              radius: '30000',
              fields: FSQ_FIELDS,
            })
            const res = await fetch(`${FSQ_BASE}?${params}`, {
              headers: { 'Authorization': apiKey, 'Accept': 'application/json' },
            })
            if (res.status === 401) throw new Error('Invalid Foursquare API key (401)')
            if (!res.ok) throw new Error(`Foursquare API ${res.status}`)
            const json = await res.json()
            return json.results || []
          })

          for (const place of items) {
            allItems.push({
              sourceId: place.fsq_id || `fsq-${Date.now()}`,
              data: { ...place, _search_city: city, _search_term: term },
            })
          }

          // Rate limit between search terms
          await new Promise(r => setTimeout(r, 200))
        } catch (e) {
          console.error(`Foursquare error for "${term}" in ${city}:`, (e as Error).message)
          if ((e as Error).message.includes('401')) throw e // API key issue, stop entirely
        }
      }
      // Rate limit between cities
      await new Promise(r => setTimeout(r, 500))
    }

    // Deduplicate by fsq_id within the batch
    const seen = new Set<string>()
    return allItems.filter(item => {
      const id = item.sourceId
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
  },

  normalize(raw: RawItem): NormalizedItem {
    const d = raw.data
    const geo = (d.geocodes as Record<string, Record<string, number>>)?.main || {}
    const loc = (d.location as Record<string, unknown>) || {}
    const cats = (d.categories as Array<Record<string, unknown>>) || []

    return {
      entityType: 'venue',
      sourceId: raw.sourceId,
      sourceName: 'foursquare',
      name: String(d.name || '').slice(0, 200),
      description: String(d.description || ''),
      location: {
        lat: geo.latitude || null,
        lng: geo.longitude || null,
        address: String(loc.formatted_address || loc.address || ''),
        city: String(loc.locality || loc.region || d._search_city || ''),
        country: String(loc.country || ''),
        countryCode: String(loc.country_code || '').toUpperCase(),
      },
      urls: d.website ? [String(d.website)] : [],
      images: extractPhotos(d.photos as Array<Record<string, unknown>>),
      tags: extractFsqTags(cats, d.tastes as string[], d.features as Record<string, unknown>),
      contacts: {
        phone: d.tel ? String(d.tel) : undefined,
        website: d.website ? String(d.website) : undefined,
        email: d.email ? String(d.email) : undefined,
      },
      metadata: {
        foursquare_id: raw.sourceId,
        foursquare_rating: d.rating,
        price_range: d.price,
        hours: d.hours,
        categories: cats.map(c => c.name),
        features: d.features,
        data_source: 'foursquare',
      },
    }
  },

  getSourceId(raw: RawItem): string {
    return raw.sourceId
  },
}

function getCityForHour(): string[] {
  const hour = new Date().getUTCHours()
  return [DEFAULT_CITIES[hour % DEFAULT_CITIES.length]]
}

function extractPhotos(photos: Array<Record<string, unknown>> | undefined): string[] {
  if (!photos) return []
  return photos.slice(0, 3).map(p => `${p.prefix}300x300${p.suffix}`).filter(Boolean)
}

function extractFsqTags(
  categories: Array<Record<string, unknown>>,
  tastes: string[] | undefined,
  _features: Record<string, unknown> | undefined
): string[] {
  const tags = new Set<string>()
  for (const cat of categories) {
    if (cat.name) tags.add(String(cat.name).toLowerCase())
  }
  if (tastes) {
    for (const taste of tastes.slice(0, 10)) tags.add(taste.toLowerCase())
  }
  return [...tags].slice(0, 15)
}

// ─── HTTP Handler ────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.limit || body.batch_size || 20,
      filters: { cities: body.cities },
      apiKey: body.apiKey || Deno.env.get('FOURSQUARE_API_KEY'),
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id,
      nodeId: body.node_id,
    }

    const rawItems = await foursquareAdapter.fetch(config)

    if (config.dryRun) {
      return jsonResponse({ success: true, items: rawItems.length, dry_run: true }, 200, req)
    }

    const written = await writeToStaging(supabase, foursquareAdapter, rawItems, {
      ...config,
      targetTable: 'venues',
    })

    return jsonResponse({
      success: true,
      items: written,
      items_total: rawItems.length,
      items_processed: written,
      items_succeeded: written,
      items_failed: 0,
    }, 200, req)
  } catch (error) {
    console.error('source-foursquare error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
