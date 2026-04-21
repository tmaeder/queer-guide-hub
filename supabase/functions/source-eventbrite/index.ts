import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging, MissingCredentialsError, skippedResponse } from '../_shared/source-adapter.ts'

// ============================================================
// Source: Eventbrite Events API
// Replaces: import-eventbrite-events
// ============================================================

const EB_BASE = 'https://www.eventbriteapi.com/v3/events/search/'
const LGBTQ_QUERIES = ['lgbtq', 'gay pride', 'queer', 'drag show', 'pride festival']

const eventbriteAdapter: SourceAdapter = {
  name: 'eventbrite',
  entityType: 'event',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const token = config.apiKey || Deno.env.get('EVENTBRITE_OAUTH_TOKEN')
    if (!token) throw new MissingCredentialsError('EVENTBRITE_OAUTH_TOKEN')

    const supabase = getServiceClient()
    const cities = (config.filters?.cities as string[]) || ['New York', 'San Francisco', 'Los Angeles', 'London', 'Berlin']
    const keywords = (config.filters?.keywords as string[]) || LGBTQ_QUERIES
    const limit = config.batchSize || 50
    const allItems: RawItem[] = []

    for (const city of cities) {
      for (const query of keywords) {
        try {
          const items = await withCircuitBreaker(supabase, 'eventbrite', async () => {
            const params = new URLSearchParams({
              q: query,
              'location.address': city,
              'expand': 'venue',
            })
            const res = await fetch(`${EB_BASE}?${params}`, {
              headers: { 'Authorization': `Bearer ${token}` },
            })
            if (!res.ok) throw new Error(`Eventbrite API ${res.status}`)
            const json = await res.json()
            return json.events || []
          })

          for (const event of items.slice(0, limit)) {
            allItems.push({
              sourceId: event.id || `eb-${Date.now()}`,
              data: { ...event, _search_city: city },
            })
          }
          await new Promise(r => setTimeout(r, 300))
        } catch (e) {
          console.error(`Eventbrite error for "${query}" in ${city}:`, (e as Error).message)
        }
      }
    }

    const seen = new Set<string>()
    return allItems.filter(item => { if (seen.has(item.sourceId)) return false; seen.add(item.sourceId); return true })
  },

  normalize(raw: RawItem): NormalizedItem {
    const d = raw.data
    const venue = (d.venue as Record<string, unknown>) || {}
    const addr = (venue.address as Record<string, unknown>) || {}
    return {
      entityType: 'event',
      sourceId: raw.sourceId,
      sourceName: 'eventbrite',
      name: (d.name as Record<string, string>)?.text || String(d.name || ''),
      description: (d.description as Record<string, string>)?.text || String(d.description || ''),
      location: {
        lat: Number(addr.latitude) || undefined,
        lng: Number(addr.longitude) || undefined,
        address: String(addr.localized_address_display || ''),
        city: String(addr.city || d._search_city || ''),
        country: String(addr.country || ''),
      },
      dates: {
        start: (d.start as Record<string, string>)?.utc || null,
        end: (d.end as Record<string, string>)?.utc || null,
      },
      urls: d.url ? [String(d.url)] : [],
      images: (d.logo as Record<string, Record<string, string>>)?.original?.url ? [String((d.logo as Record<string, Record<string, string>>).original.url)] : [],
      tags: ['lgbtq', 'event'],
      metadata: { eventbrite_id: raw.sourceId, venue_name: venue.name, event_type: mapEventType(d.category_id as string) },
    }
  },

  getSourceId(raw: RawItem): string { return raw.sourceId },
}

function mapEventType(categoryId: string | undefined): string {
  const map: Record<string, string> = { '103': 'concert', '110': 'party', '105': 'art', '101': 'conference', '104': 'theater' }
  return map[categoryId || ''] || 'event'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.limit || body.batch_size || 50,
      filters: { cities: body.cities, keywords: body.keywords },
      apiKey: Deno.env.get('EVENTBRITE_OAUTH_TOKEN'),
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id,
      nodeId: body.node_id,
    }
    const rawItems = await eventbriteAdapter.fetch(config)
    if (config.dryRun) return jsonResponse({ success: true, items: rawItems.length, dry_run: true }, 200, req)
    const written = await writeToStaging(supabase, eventbriteAdapter, rawItems, { ...config, targetTable: 'events' })
    return jsonResponse({ success: true, items: written, items_total: rawItems.length, items_processed: written, items_succeeded: written, items_failed: 0 }, 200, req)
  } catch (error) {
    if (error instanceof MissingCredentialsError) {
      return jsonResponse(skippedResponse('missing_credentials', error.missing), 200, req)
    }
    return errorResponse((error as Error).message, 500, req)
  }
})
