import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging, MissingCredentialsError, skippedResponse } from '../_shared/source-adapter.ts'

// ============================================================
// Source: TomTom Search API
// Replaces: import-tomtom-venues
// ============================================================

const TT_BASE = 'https://api.tomtom.com/search/2/search'
const SEARCH_TERMS = ['gay bar', 'lgbtq club', 'queer cafe', 'pride venue']
// TomTom API keys are typically Referer-restricted. Supabase Edge Functions do not
// send a Referer by default, so an unrestricted key + explicit Referer header is required.
const TT_REFERER = 'https://queer.guide'

const tomtomAdapter: SourceAdapter = {
  name: 'tomtom',
  entityType: 'venue',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const apiKey = config.apiKey || Deno.env.get('TOMTOM_API_KEY')
    if (!apiKey) throw new MissingCredentialsError('TOMTOM_API_KEY')

    const supabase = getServiceClient()
    const cities = (config.filters?.cities as string[]) || ['New York']
    const limit = Math.min(config.batchSize || 15, 15)
    const allItems: RawItem[] = []

    for (const city of cities) {
      for (const term of SEARCH_TERMS) {
        try {
          const items = await withCircuitBreaker(supabase, 'tomtom', async () => {
            const searchTerm = encodeURIComponent(`${term} ${city}`)
            const params = new URLSearchParams({ key: apiKey, limit: String(limit), language: 'en-US' })
            const res = await fetch(`${TT_BASE}/${searchTerm}.json?${params}`, {
              headers: { 'Referer': TT_REFERER, 'Origin': TT_REFERER },
            })
            if (!res.ok) {
              const body = await res.text().catch(() => '')
              throw new Error(`TomTom API ${res.status}: ${body.slice(0, 200)}`)
            }
            const json = await res.json()
            // TomTom search returns Streets/Geography/POI mixed in. Only POI entries
            // have an actual venue name (poi.name); the rest produce nameless rows.
            const all = (json.results || []) as Array<Record<string, unknown>>
            return all.filter(r => r.type === 'POI' && (r.poi as Record<string, unknown> | undefined)?.name)
          })
          for (const poi of items) {
            const id = poi.id || `tt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            allItems.push({ sourceId: id, data: { ...poi, _search_city: city, _search_term: term } })
          }
          await new Promise(r => setTimeout(r, 300))
        } catch (e) {
          console.error(`TomTom error for "${term}" in ${city}:`, (e as Error).message)
        }
      }
    }
    const seen = new Set<string>()
    return allItems.filter(i => { if (seen.has(i.sourceId)) return false; seen.add(i.sourceId); return true })
  },

  normalize(raw: RawItem): NormalizedItem {
    const d = raw.data as Record<string, unknown>
    const poi = (d.poi as Record<string, unknown>) || {}
    const addr = (d.address as Record<string, unknown>) || {}
    const pos = (d.position as Record<string, number>) || {}
    return {
      entityType: 'venue',
      sourceId: raw.sourceId,
      sourceName: 'tomtom',
      name: String(poi.name || d.poi || ''),
      description: '',
      location: {
        lat: pos.lat, lng: pos.lon,
        address: String(addr.freeformAddress || ''),
        city: String(addr.municipality || d._search_city || ''),
        country: String(addr.country || ''),
        countryCode: String(addr.countryCode || ''),
      },
      contacts: {
        phone: (poi.phone as string) || undefined,
        website: (poi.url as string) || undefined,
      },
      tags: ((poi.classifications as Array<Record<string, unknown>>) || []).map(c => String(c.code || '')).filter(Boolean),
      metadata: {
        tomtom_id: raw.sourceId,
        data_source: 'tomtom',
        score: d.score,
      },
    }
  },
  getSourceId(raw: RawItem): string { return raw.sourceId },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.limit || body.batch_size || 15,
      filters: { cities: body.cities },
      apiKey: Deno.env.get('TOMTOM_API_KEY'),
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id, nodeId: body.node_id,
    }
    const rawItems = await tomtomAdapter.fetch(config)
    if (config.dryRun) return jsonResponse({ success: true, items: rawItems.length, dry_run: true }, 200, req)
    const written = await writeToStaging(supabase, tomtomAdapter, rawItems, { ...config, targetTable: 'venues' })
    return jsonResponse({ success: true, items: written, items_total: rawItems.length, items_processed: written, items_succeeded: written, items_failed: 0 }, 200, req)
  } catch (error) {
    if (error instanceof MissingCredentialsError) {
      return jsonResponse(skippedResponse('missing_credentials', error.missing), 200, req)
    }
    return errorResponse((error as Error).message, 500, req)
  }
})
