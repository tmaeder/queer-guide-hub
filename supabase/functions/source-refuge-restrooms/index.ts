import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// ============================================================
// Source: Refuge Restrooms API
// Replaces: import-refuge-restrooms
// ============================================================

const API_BASE = 'https://www.refugerestrooms.org/api/v1/restrooms'

const refugeAdapter: SourceAdapter = {
  name: 'refuge-restrooms',
  entityType: 'venue',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const supabase = getServiceClient()
    const maxPages = (config.filters?.maxPages as number) || 10
    const perPage = 100
    const allItems: RawItem[] = []

    for (let page = 1; page <= maxPages; page++) {
      try {
        const items = await withCircuitBreaker(supabase, 'refuge_restrooms', async () => {
          const params = new URLSearchParams({ page: String(page), per_page: String(perPage) })
          const res = await fetch(`${API_BASE}?${params}`)
          if (!res.ok) throw new Error(`Refuge API ${res.status}`)
          return await res.json()
        })

        if (!items || items.length === 0) break

        for (const restroom of items) {
          allItems.push({
            sourceId: String(restroom.id || `refuge-${page}-${Date.now()}`),
            data: restroom,
          })
        }

        await new Promise(r => setTimeout(r, 300))
      } catch (e) {
        console.error(`Refuge page ${page} error:`, (e as Error).message)
        break
      }
    }
    return allItems
  },

  normalize(raw: RawItem): NormalizedItem {
    const d = raw.data as Record<string, unknown>
    const amenities: string[] = []
    if (d.unisex) amenities.push('unisex')
    if (d.accessible) amenities.push('wheelchair-accessible')
    if (d.changing_table) amenities.push('changing-table')

    return {
      entityType: 'venue',
      sourceId: raw.sourceId,
      sourceName: 'refuge-restrooms',
      name: String(d.name || 'Gender-Neutral Restroom'),
      description: [d.comment, d.directions].filter(Boolean).join(' - '),
      location: {
        lat: Number(d.latitude) || undefined,
        lng: Number(d.longitude) || undefined,
        address: String(d.street || ''),
        city: String(d.city || ''),
        country: String(d.country || ''),
      },
      tags: ['restroom', 'gender-neutral', ...amenities],
      metadata: {
        external_id: raw.sourceId,
        data_source: 'refuge-restrooms',
        unisex: d.unisex,
        accessible: d.accessible,
        changing_table: d.changing_table,
        upvote: d.upvote,
        downvote: d.downvote,
      },
    }
  },
  getSourceId(raw: RawItem): string { return raw.sourceId },
}

Deno.serve(withErrorReporting('source-refuge-restrooms', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.batch_size || 100,
      filters: { maxPages: body.max_pages || 10 },
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id, nodeId: body.node_id,
    }
    const rawItems = await refugeAdapter.fetch(config)
    if (config.dryRun) return jsonResponse({ success: true, items: rawItems.length, dry_run: true }, 200, req)
    const written = await writeToStaging(supabase, refugeAdapter, rawItems, { ...config, targetTable: 'venues' })
    return jsonResponse({ success: true, items: written, items_total: rawItems.length, items_processed: written, items_succeeded: written, items_failed: 0 }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
}))
