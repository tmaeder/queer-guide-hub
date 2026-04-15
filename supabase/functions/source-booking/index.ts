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

async function fetchViaDemandApi(_supabase: unknown, _apiKey: string, _config: AdapterConfig, _limit: number): Promise<RawItem[]> {
  // Stub. When BOOKING_DEMAND_API_KEY is provisioned, implement:
  //   POST https://demandapi.booking.com/3.1/accommodations/search
  //   Headers: { Authorization: 'Bearer <apiKey>' }
  //   Body: { city_ids?: [...], filters: { accommodation_type: 'hotel' }, page: 1 }
  //   Map response → RawItem[] with mode='api', set normalized fields directly.
  // Until then, a clear error so the caller knows to use sitemap mode.
  throw new Error('Booking Demand API integration not implemented; remove BOOKING_DEMAND_API_KEY env var to use sitemap fallback')
}

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
