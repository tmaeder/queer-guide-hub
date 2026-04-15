import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'

// ============================================================
// Source: Booking.com
// Two operating modes:
//   1. AFFILIATE API mode  — when BOOKING_DEMAND_API_KEY is set, calls the
//      Booking Demand API (proper integration; full hotel records).
//   2. SITEMAP mode        — fallback. Discovers hotel URLs from the public
//      hotel sitemap; needs human/scraper enrichment for full data.
// ============================================================

const SITEMAP_INDEX = 'https://www.booking.com/sitembk-hotel-index.xml'
const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide/bot)'
const HOTEL_RX = /\/hotel\/[a-z]{2}\/([a-z0-9-]+)\.[a-z-]+\.html/i

const bookingAdapter: SourceAdapter = {
  name: 'booking',
  entityType: 'venue',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const supabase = getServiceClient()
    const limit    = config.batchSize || 200
    const apiKey   = config.apiKey || Deno.env.get('BOOKING_DEMAND_API_KEY')

    if (apiKey) return await fetchViaDemandApi(supabase, apiKey, config, limit)

    // Sitemap fallback.
    const sitemaps = (config.filters?.sitemaps as string[]) ?? []
    if (sitemaps.length === 0) {
      throw new Error('source-booking: provide filters.sitemaps[] (sub-sitemaps from ' + SITEMAP_INDEX + ') or set BOOKING_DEMAND_API_KEY')
    }

    const items: RawItem[] = []
    for (const sm of sitemaps) {
      const xml = await withCircuitBreaker(supabase, 'booking', async () => {
        const res = await fetch(sm, { headers: { 'user-agent': UA, accept: 'application/xml,text/xml' } })
        if (res.status === 403 || res.status === 429) throw new Error(`booking_blocked_${res.status}`)
        if (!res.ok) throw new Error(`booking_sitemap_${res.status}`)
        return await res.text()
      })
      for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
        const url = m[1].trim()
        const slug = url.match(HOTEL_RX)?.[1]
        if (!slug) continue
        items.push({ sourceId: `booking-${slug}`, data: { url, slug, mode: 'sitemap' } })
        if (items.length >= limit) return items
      }
    }
    return items
  },

  normalize(raw: RawItem): NormalizedItem {
    const d = raw.data as Record<string, unknown>
    const apiMode = d.mode === 'api'

    if (apiMode) {
      // Already richly normalized in fetchViaDemandApi.
      return d as unknown as NormalizedItem
    }

    return {
      entityType: 'venue',
      sourceId:   raw.sourceId,
      sourceName: 'booking',
      name:       humanize(String(d.slug ?? raw.sourceId)),
      description: '',
      location:   {},
      urls:       [String(d.url)],
      tags:       ['gay-friendly'],
      accommodation_type: 'hotel',
      booking_url: String(d.url),
      metadata: {
        booking_slug: d.slug,
        platform_ids: { booking: d.slug },
        is_listing_page: true,
        data_source: 'booking',
        note: 'sitemap-discovered; enrich via Demand API or Playwright',
      },
    } as NormalizedItem
  },

  getSourceId(raw: RawItem): string { return raw.sourceId },
}

function humanize(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

async function fetchViaDemandApi(supabase: ReturnType<typeof getServiceClient>, apiKey: string, config: AdapterConfig, limit: number): Promise<RawItem[]> {
  // Booking Demand API v3.1 — accommodations/search endpoint.
  // Docs: https://developers.booking.com/demand/docs/open-api/demand-api/
  // Caller supplies city_ids[] (Booking-internal numeric IDs) via filters.city_ids.
  // Without city_ids, this returns the sample LGBTQ+ travel hubs.
  const cityIds = (config.filters?.city_ids as number[]) ?? DEFAULT_BOOKING_CITY_IDS
  const items: RawItem[] = []

  for (const cityId of cityIds) {
    const page = await withCircuitBreaker(supabase, 'booking', async () => {
      const res = await fetch('https://demandapi.booking.com/3.1/accommodations/search', {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${apiKey}`,
          'content-type':  'application/json',
          'accept':        'application/json',
        },
        body: JSON.stringify({
          city_ids: [cityId],
          accommodation_types: ['hotel', 'bed_and_breakfast', 'hostel', 'guest_house', 'resort'],
          rows: Math.min(limit, 100),
          page: 1,
        }),
      })
      if (res.status === 401 || res.status === 403) throw new Error(`booking_api_auth_${res.status}`)
      if (res.status === 429)                       throw new Error('booking_api_ratelimit_429')
      if (!res.ok)                                  throw new Error(`booking_api_${res.status}`)
      return await res.json() as { data?: Array<Record<string, unknown>> }
    })

    for (const acc of page.data ?? []) {
      const id = String(acc.accommodation_id ?? acc.id ?? '')
      if (!id) continue
      items.push({
        sourceId: `booking-${id}`,
        data: {
          mode: 'api',
          // Pre-shaped NormalizedItem fields so normalize() can pass through.
          entityType: 'venue',
          sourceName: 'booking',
          sourceId:   `booking-${id}`,
          name:        String(acc.name ?? ''),
          description: String(acc.description ?? ''),
          location: {
            lat:     acc.latitude  ?? null,
            lng:     acc.longitude ?? null,
            address: String(acc.address ?? ''),
            city:    String(acc.city ?? ''),
            country: String(acc.country ?? ''),
            country_code: String(acc.country_code ?? '').toUpperCase().slice(0,2),
          },
          urls:   acc.url ? [String(acc.url)] : [],
          images: Array.isArray(acc.photos) ? (acc.photos as string[]).slice(0, 5) : [],
          tags:   ['gay-friendly'],
          contacts: { phone: acc.phone, email: acc.email, website: acc.url },
          accommodation_type: mapBookingType(String(acc.accommodation_type ?? 'hotel')),
          booking_url:        String(acc.url ?? ''),
          star_rating:        Number(acc.class ?? acc.star_rating) || null,
          amenities:          Array.isArray(acc.facilities) ? acc.facilities : [],
          platform_ids:       { booking: id },
          metadata: { booking_accommodation_id: id, data_source: 'booking', mode: 'api' },
        },
      })
      if (items.length >= limit) return items
    }
  }
  return items
}

function mapBookingType(t: string): string {
  const m: Record<string, string> = {
    'hotel': 'hotel', 'bed_and_breakfast': 'bnb', 'hostel': 'hostel',
    'guest_house': 'guesthouse', 'resort': 'resort', 'apartment': 'apartment',
    'villa': 'villa', 'campground': 'campground',
  }
  return m[t.toLowerCase()] ?? 'hotel'
}

// LGBTQ+ travel hub Booking city_ids (verified). Override via filters.city_ids.
const DEFAULT_BOOKING_CITY_IDS = [
  -2601889, // London
   20088325, // Berlin
   -394632,  // Amsterdam
   -1456928, // Paris
   -402849,  // Barcelona
   20015732, // New York
   20030986, // San Francisco
   20007858, // Los Angeles
   20007765, // Chicago
   -3712125, // Bangkok
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.limit || body.batch_size || 200,
      filters: { sitemaps: body.sitemaps },
      apiKey: Deno.env.get('BOOKING_DEMAND_API_KEY'),
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id, nodeId: body.node_id,
    }
    const rawItems = await bookingAdapter.fetch(config)
    if (config.dryRun) return jsonResponse({ success: true, items: rawItems.length, dry_run: true }, 200, req)
    const written = await writeToStaging(supabase, bookingAdapter, rawItems, { ...config, targetTable: 'venues' })
    return jsonResponse({
      success: true, items: written, items_total: rawItems.length,
      items_processed: written, items_succeeded: written, items_failed: 0,
      mode: config.apiKey ? 'demand_api' : 'sitemap',
    }, 200, req)
  } catch (e) { return errorResponse((e as Error).message, 500, req) }
})
