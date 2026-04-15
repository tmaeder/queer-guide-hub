import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'

// ============================================================
// Source: MisterB&B (LGBTQ+ accommodations)
// SCOPE: sitemap-driven discovery only.
// MisterB&B applies aggressive bot blocking on listing detail pages —
// extracting price/photos/coordinates from the edge runtime is unreliable.
// Detail enrichment must be run from the Node.js scraper (with Playwright):
//   cd Dev/scraper && npm run scrape -- --source misterbnb
//
// What this edge fn does:
//   1. Fetches public sitemap (allowed by robots.txt).
//   2. Filters to /s/<destination> and /places/* listings.
//   3. Optionally crawls a destination page to discover accommodation links.
//   4. Stages each as a venue with accommodation_type='bnb' + booking_url.
// Validation will mark items needs_review (W_NO_COORDS) until a Playwright
// run enriches them, then re-validation auto-approves.
// ============================================================

const BASE       = 'https://www.misterbandb.com'
const SITEMAP    = `${BASE}/sitemap.xml`
const UA         = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide/bot)'
const DEST_RX    = /\/s\/[^/?]+$/
const PLACES_RX  = /\/places\/[^/?]+$/

const misterbnbAdapter: SourceAdapter = {
  name: 'misterbnb',
  entityType: 'venue',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const supabase  = getServiceClient()
    const limit     = config.batchSize || 200
    const cityFilter = ((config.filters?.cities as string[]) || []).map(s => s.toLowerCase().replace(/\s+/g, '-'))

    const xml = await withCircuitBreaker(supabase, 'misterbnb', async () => {
      const res = await fetch(SITEMAP, { headers: { 'user-agent': UA, accept: 'application/xml,text/xml' } })
      if (res.status === 403 || res.status === 429) throw new Error(`misterbnb_blocked_${res.status}`)
      if (!res.ok) throw new Error(`misterbnb_sitemap_${res.status}`)
      return await res.text()
    })

    // Cheap regex extraction (no XML parser dep).
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim())
    const filtered = locs.filter(u => {
      try {
        const path = new URL(u).pathname
        if (!DEST_RX.test(path) && !PLACES_RX.test(path)) return false
        if (cityFilter.length === 0) return true
        return cityFilter.some(c => path.includes(`/s/${c}`) || path.includes(`/${c}`))
      } catch { return false }
    })

    return filtered.slice(0, limit).map(url => {
      const path = new URL(url).pathname
      const isListing = PLACES_RX.test(path)
      const slug = path.split('/').pop() ?? ''
      const cityFromDest = path.match(/\/s\/([^/?]+)/)?.[1]?.replace(/-/g, ' ')
      return {
        sourceId: `misterbnb-${slug}`,
        data: {
          url, slug,
          name: humanize(slug),
          city: cityFromDest ?? null,
          is_listing: isListing,
        },
      }
    })
  },

  normalize(raw: RawItem): NormalizedItem {
    const d = raw.data as Record<string, unknown>
    const isListing = Boolean(d.is_listing)
    return {
      entityType: 'venue',
      sourceId: raw.sourceId,
      sourceName: 'misterbnb',
      name: String(d.name ?? raw.sourceId),
      description: '',
      location: { city: String(d.city ?? '') },
      urls: [String(d.url)],
      tags: ['lgbtq-friendly', 'gay-friendly'],
      // Only listing pages are real B&Bs; destination index pages will likely
      // be rejected by validation (no name/coords), which is the right behaviour.
      ...(isListing ? { accommodation_type: 'bnb' as const, booking_url: String(d.url) } : {}),
      metadata: {
        misterbnb_slug: d.slug,
        platform_ids: { misterbnb: d.slug },
        is_listing_page: isListing,
        data_source: 'misterbnb',
        note: 'sitemap-discovered; run scraper (Playwright) for amenities/coords/photos',
      },
    } as NormalizedItem
  },

  getSourceId(raw: RawItem): string { return raw.sourceId },
}

function humanize(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.limit || body.batch_size || 200,
      filters: { cities: body.cities },
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id,
      nodeId: body.node_id,
    }
    const rawItems = await misterbnbAdapter.fetch(config)
    if (config.dryRun) {
      return jsonResponse({ success: true, items: rawItems.length, dry_run: true }, 200, req)
    }
    const written = await writeToStaging(supabase, misterbnbAdapter, rawItems, { ...config, targetTable: 'venues' })
    return jsonResponse({
      success: true, items: written, items_total: rawItems.length,
      items_processed: written, items_succeeded: written, items_failed: 0,
      note: 'Sitemap discovery only. Run /scraper/ Playwright job to enrich coords/amenities/photos.',
    }, 200, req)
  } catch (e) {
    return errorResponse((e as Error).message, 500, req)
  }
})
