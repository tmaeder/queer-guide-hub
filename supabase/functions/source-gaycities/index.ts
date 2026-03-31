import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'

// ============================================================
// Source: GayCities/gaytravel4u.com (web scraper)
// Replaces: scrape-gaycities-events
// ============================================================

const BASE_URL = 'https://www.gaytravel4u.com/gay-{city}-events/'
const DEFAULT_CITIES = [
  'new-york', 'san-francisco', 'los-angeles', 'chicago', 'london',
  'berlin', 'amsterdam', 'paris', 'barcelona', 'sydney',
  'toronto', 'miami', 'seattle', 'portland', 'denver',
  'austin', 'boston', 'atlanta', 'dallas', 'philadelphia',
]

const gaycitiesAdapter: SourceAdapter = {
  name: 'gaycities',
  entityType: 'event',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const cities = (config.filters?.cities as string[]) || DEFAULT_CITIES
    const allItems: RawItem[] = []

    for (const city of cities.slice(0, 20)) {
      try {
        const url = BASE_URL.replace('{city}', city)
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QueerGuideBot/1.0)' },
        })
        if (!res.ok) { console.warn(`GayCities ${city}: ${res.status}`); continue }

        const html = await res.text()
        const events = parseEventsFromHtml(html, city)

        for (const event of events) {
          allItems.push({
            sourceId: `gc-${city}-${String(event.title || '').replace(/\W/g, '-').slice(0, 40)}-${Date.now()}`,
            data: { ...event, _source_city: city },
          })
        }

        await new Promise(r => setTimeout(r, 1000))
      } catch (e) {
        console.error(`GayCities error for ${city}:`, (e as Error).message)
      }
    }

    return allItems
  },

  normalize(raw: RawItem): NormalizedItem {
    const d = raw.data
    const cityName = String(d._source_city || '').replace(/-/g, ' ')
    return {
      entityType: 'event',
      sourceId: raw.sourceId,
      sourceName: 'gaycities',
      name: String(d.title || ''),
      description: String(d.description || ''),
      location: {
        address: String(d.address || ''),
        city: cityName.replace(/\b\w/g, c => c.toUpperCase()),
      },
      dates: {
        start: normalizeDate(d.start_date),
        end: normalizeDate(d.end_date),
      },
      urls: d.url ? [String(d.url)] : [],
      images: d.image ? [String(d.image)] : [],
      tags: ['lgbtq', 'event'],
      metadata: { venue_name: d.venue_name, event_type: 'LGBTQ+ Event', source_url: d.url },
    }
  },
  getSourceId(raw: RawItem): string { return raw.sourceId },
}

function parseEventsFromHtml(html: string, _city: string): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = []

  // Try JSON-LD structured data
  const jsonLdPattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi
  let jsonMatch
  while ((jsonMatch = jsonLdPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(jsonMatch[1])
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        if (item['@type'] === 'Event') {
          events.push({
            title: item.name,
            description: item.description,
            start_date: item.startDate,
            end_date: item.endDate,
            venue_name: item.location?.name,
            address: item.location?.address?.streetAddress,
            url: item.url,
            image: item.image,
          })
        }
      }
    } catch { /* ignore parse errors */ }
  }

  // Fallback: parse HTML article cards
  if (events.length === 0) {
    const cardPattern = /<article[^>]*class="[^"]*event[^"]*"[^>]*>([\s\S]*?)<\/article>/gi
    let cardMatch
    while ((cardMatch = cardPattern.exec(html)) !== null) {
      const card = cardMatch[1]
      const title = extractTagContent(card, 'h2') || extractTagContent(card, 'h3')
      const desc = extractTagContent(card, 'p')
      const link = extractAttrValue(card, 'a', 'href')
      const img = extractAttrValue(card, 'img', 'src')
      if (title) {
        events.push({ title, description: desc, url: link, image: img })
      }
    }
  }

  return events
}

function extractTagContent(html: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const m = re.exec(html)
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : ''
}

function extractAttrValue(html: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i')
  const m = re.exec(html)
  return m ? m[1] : ''
}

function normalizeDate(val: unknown): string | null {
  if (!val) return null
  try { const d = new Date(String(val)); return isNaN(d.getTime()) ? null : d.toISOString() } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.batch_size || 50,
      filters: { cities: body.cities, maxPages: body.maxPages },
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id, nodeId: body.node_id,
    }
    const rawItems = await gaycitiesAdapter.fetch(config)
    if (config.dryRun) return jsonResponse({ success: true, items: rawItems.length, dry_run: true }, 200, req)
    const written = await writeToStaging(supabase, gaycitiesAdapter, rawItems, { ...config, targetTable: 'events' })
    return jsonResponse({ success: true, items: written, items_total: rawItems.length, items_processed: written, items_succeeded: written, items_failed: 0 }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
})
