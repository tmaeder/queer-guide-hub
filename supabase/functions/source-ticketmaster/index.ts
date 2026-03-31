import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'

// ============================================================
// Source: Ticketmaster Discovery API
// Replaces: import-ticketmaster-events
// ============================================================

const TM_BASE = 'https://app.ticketmaster.com/discovery/v2/events.json'

const ticketmasterAdapter: SourceAdapter = {
  name: 'ticketmaster',
  entityType: 'event',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const apiKey = config.apiKey || Deno.env.get('TICKETMASTER_API_KEY')
    if (!apiKey) throw new Error('TICKETMASTER_API_KEY not configured')

    const supabase = getServiceClient()
    const keywords = (config.filters?.keywords as string[]) || ['lgbtq', 'pride', 'drag', 'queer']
    const countryCode = (config.filters?.countryCode as string) || 'US'
    const limit = config.batchSize || 50
    const allItems: RawItem[] = []

    for (const keyword of keywords) {
      try {
        const items = await withCircuitBreaker(supabase, 'ticketmaster', async () => {
          const params = new URLSearchParams({ apikey: apiKey, keyword, countryCode, size: String(limit), sort: 'date,asc' })
          const res = await fetch(`${TM_BASE}?${params}`)
          if (!res.ok) throw new Error(`Ticketmaster API ${res.status}`)
          const json = await res.json()
          return json._embedded?.events || []
        })
        for (const event of items) {
          allItems.push({ sourceId: event.id || `tm-${Date.now()}`, data: event })
        }
        await new Promise(r => setTimeout(r, 200))
      } catch (e) {
        console.error(`Ticketmaster error for "${keyword}":`, (e as Error).message)
      }
    }

    const seen = new Set<string>()
    return allItems.filter(item => { if (seen.has(item.sourceId)) return false; seen.add(item.sourceId); return true })
  },

  normalize(raw: RawItem): NormalizedItem {
    const d = raw.data
    const venue = ((d._embedded as Record<string, unknown[]>)?.venues as Record<string, unknown>[])?.[0] || {}
    const prices = (d.priceRanges as Array<Record<string, number>>)?.[0]
    const img = (d.images as Array<Record<string, unknown>>)?.[0]
    return {
      entityType: 'event',
      sourceId: raw.sourceId,
      sourceName: 'ticketmaster',
      name: String(d.name || ''),
      description: String(d.info || d.pleaseNote || ''),
      location: {
        lat: Number((venue.location as Record<string, string>)?.latitude) || undefined,
        lng: Number((venue.location as Record<string, string>)?.longitude) || undefined,
        address: String((venue.address as Record<string, string>)?.line1 || ''),
        city: String((venue.city as Record<string, string>)?.name || ''),
        country: String((venue.country as Record<string, string>)?.name || ''),
      },
      dates: {
        start: (d.dates as Record<string, Record<string, string>>)?.start?.dateTime || null,
        end: (d.dates as Record<string, Record<string, string>>)?.end?.dateTime || null,
      },
      urls: d.url ? [String(d.url)] : [],
      images: img ? [String(img.url)] : [],
      tags: ['lgbtq', 'event'],
      metadata: {
        ticketmaster_id: raw.sourceId,
        event_type: mapTmType(d.classifications as Array<Record<string, Record<string, string>>>),
        price_min: prices?.min, price_max: prices?.max,
        venue_name: venue.name,
        age_restriction: (d.ageRestrictions as Record<string, unknown>)?.legalAgeEnforced ? '18+' : null,
      },
    }
  },
  getSourceId(raw: RawItem): string { return raw.sourceId },
}

function mapTmType(classifications: Array<Record<string, Record<string, string>>> | undefined): string {
  const segment = classifications?.[0]?.segment?.name?.toLowerCase()
  const map: Record<string, string> = { music: 'concert', sports: 'sports', arts: 'theater', film: 'screening' }
  return map[segment || ''] || 'event'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.limit || body.batch_size || 50,
      filters: { keywords: body.keywords, countryCode: body.countryCode },
      apiKey: Deno.env.get('TICKETMASTER_API_KEY'),
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id, nodeId: body.node_id,
    }
    const rawItems = await ticketmasterAdapter.fetch(config)
    if (config.dryRun) return jsonResponse({ success: true, items: rawItems.length, dry_run: true }, 200, req)
    const written = await writeToStaging(supabase, ticketmasterAdapter, rawItems, { ...config, targetTable: 'events' })
    return jsonResponse({ success: true, items: written, items_total: rawItems.length, items_processed: written, items_succeeded: written, items_failed: 0 }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
})
