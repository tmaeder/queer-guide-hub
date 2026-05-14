import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// ============================================================
// Source: Spartacus LGBTQ+ Travel Guide (web scraper)
// Replaces: scrape-spartacus
// ============================================================

const SPARTACUS_BASE = 'https://www.spartacus.world'

const spartacusAdapter: SourceAdapter = {
  name: 'spartacus',
  entityType: 'venue',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const countries = (config.filters?.countries as string[]) || []
    const allItems: RawItem[] = []

    for (const country of countries) {
      try {
        const url = `${SPARTACUS_BASE}/en/gay-guide/${country.toLowerCase()}`
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QueerGuideBot/1.0)' },
        })
        if (!res.ok) { console.warn(`Spartacus ${country}: ${res.status}`); continue }

        const html = await res.text()
        const listings = parseListings(html, country)

        for (const listing of listings) {
          allItems.push({
            sourceId: `sp-${country}-${String(listing.name || '').replace(/\W/g, '-').slice(0, 40)}`,
            data: { ...listing, _country: country },
          })
        }

        await new Promise(r => setTimeout(r, 1500))
      } catch (e) {
        console.error(`Spartacus error for ${country}:`, (e as Error).message)
      }
    }

    return allItems
  },

  normalize(raw: RawItem): NormalizedItem {
    const d = raw.data as Record<string, unknown>
    return {
      entityType: 'venue',
      sourceId: raw.sourceId,
      sourceName: 'spartacus',
      name: String(d.name || ''),
      description: String(d.description || ''),
      location: {
        address: String(d.address || ''),
        city: String(d.city || ''),
        country: String(d._country || ''),
      },
      urls: d.url ? [String(d.url)] : [],
      tags: ['lgbtq', 'venue', ...(d.category ? [String(d.category).toLowerCase()] : [])],
      metadata: { data_source: 'spartacus', category: d.category, phone: d.phone },
    }
  },
  getSourceId(raw: RawItem): string { return raw.sourceId },
}

function parseListings(html: string, _country: string): Record<string, unknown>[] {
  const listings: Record<string, unknown>[] = []

  const blockPattern = /<div[^>]*class="[^"]*listing[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi
  let blockMatch
  while ((blockMatch = blockPattern.exec(html)) !== null) {
    const block = blockMatch[1]
    const name = getTagText(block, 'h3') || getTagText(block, 'h2')
    const desc = getTagText(block, 'p')
    if (name) {
      listings.push({ name, description: desc })
    }
  }

  return listings
}

function getTagText(html: string, tag: string): string {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const m = pattern.exec(html)
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : ''
}

Deno.serve(withErrorReporting('source-spartacus', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.batch_size || 50,
      filters: { countries: body.countries || [] },
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id, nodeId: body.node_id,
    }
    const rawItems = await spartacusAdapter.fetch(config)
    if (config.dryRun) return jsonResponse({ success: true, items: rawItems.length, dry_run: true }, 200, req)
    const written = await writeToStaging(supabase, spartacusAdapter, rawItems, { ...config, targetTable: 'venues' })
    return jsonResponse({ success: true, items: written, items_total: rawItems.length, items_processed: written, items_succeeded: written, items_failed: 0 }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
}))
