import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'

// ============================================================
// Source: Airbnb (LGBTQ+ friendly stays via sitemap discovery)
// SCOPE: discovery only — Airbnb blocks programmatic detail extraction
// without paid proxy rotation. Listings staged here will land in the
// review queue (W_NO_COORDS) until enriched by the /scraper/ Playwright job
// or human review.
// ============================================================

const SITEMAP_INDEX = 'https://www.airbnb.com/sitemap-master-index.xml.gz'
const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide/bot)'
const ROOM_RX  = /\/rooms\/(\d+)/
const STAY_RX  = /\/h\/[^/?]+|\/stays\//

const airbnbAdapter: SourceAdapter = {
  name: 'airbnb',
  entityType: 'venue',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const supabase = getServiceClient()
    const limit    = config.batchSize || 200
    // Caller MUST supply specific stays_sitemap URLs (sub-sitemaps from the index)
    // since the master index is gzipped and we don't gunzip in the edge runtime.
    const sitemaps = (config.filters?.sitemaps as string[]) ?? []
    if (sitemaps.length === 0) {
      throw new Error('source-airbnb: provide filters.sitemaps[] (uncompressed sub-sitemap URLs from ' + SITEMAP_INDEX + ')')
    }

    const items: RawItem[] = []
    for (const sm of sitemaps) {
      const xml = await withCircuitBreaker(supabase, 'airbnb', async () => {
        const res = await fetch(sm, { headers: { 'user-agent': UA, accept: 'application/xml,text/xml' } })
        if (res.status === 403 || res.status === 429) throw new Error(`airbnb_blocked_${res.status}`)
        if (!res.ok) throw new Error(`airbnb_sitemap_${res.status}`)
        return await res.text()
      })
      const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim())
      for (const url of locs) {
        const room = url.match(ROOM_RX)?.[1]
        if (!room && !STAY_RX.test(url)) continue
        items.push({
          sourceId: room ? `airbnb-${room}` : `airbnb-${url.split('/').pop()}`,
          data: { url, airbnb_id: room ?? null },
        })
        if (items.length >= limit) return items
      }
    }
    return items
  },

  normalize(raw: RawItem): NormalizedItem {
    const d = raw.data as Record<string, unknown>
    const id = d.airbnb_id as string | null
    return {
      entityType: 'venue',
      sourceId:   raw.sourceId,
      sourceName: 'airbnb',
      name:       id ? `Airbnb listing #${id}` : raw.sourceId,
      description: '',
      location:   {},
      urls:       [String(d.url)],
      tags:       ['lgbtq-friendly'],
      accommodation_type: 'apartment',
      booking_url: String(d.url),
      metadata: {
        airbnb_id: id,
        platform_ids: { airbnb: id ?? raw.sourceId },
        is_listing_page: !!id,
        data_source: 'airbnb',
        note: 'sitemap-discovered; needs Playwright detail enrichment',
      },
    } as NormalizedItem
  },

  getSourceId(raw: RawItem): string { return raw.sourceId },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.limit || body.batch_size || 200,
      filters: { sitemaps: body.sitemaps },
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id, nodeId: body.node_id,
    }
    const rawItems = await airbnbAdapter.fetch(config)
    if (config.dryRun) return jsonResponse({ success: true, items: rawItems.length, dry_run: true }, 200, req)
    const written = await writeToStaging(supabase, airbnbAdapter, rawItems, { ...config, targetTable: 'venues' })
    return jsonResponse({
      success: true, items: written, items_total: rawItems.length,
      items_processed: written, items_succeeded: written, items_failed: 0,
      note: 'Sitemap discovery only. Detail enrichment requires Playwright + proxy rotation.',
    }, 200, req)
  } catch (e) { return errorResponse((e as Error).message, 500, req) }
})
