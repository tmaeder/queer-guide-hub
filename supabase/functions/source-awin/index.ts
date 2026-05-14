import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging, MissingCredentialsError, skippedResponse } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// ============================================================
// Source: AWIN Affiliate Product Feed
// Replaces: import-awin-products
// ============================================================

const awinAdapter: SourceAdapter = {
  name: 'awin',
  entityType: 'marketplace',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const feedUrl = (config.filters?.feedUrl as string) || Deno.env.get('AWIN_FEED_URL')
    if (!feedUrl) throw new MissingCredentialsError('AWIN_FEED_URL')

    const supabase = getServiceClient()
    const limit = config.batchSize || 100

    const csvText = await withCircuitBreaker(supabase, 'awin', async () => {
      const res = await fetch(feedUrl)
      if (!res.ok) throw new Error(`AWIN feed ${res.status}`)
      return await res.text()
    })

    const lines = csvText.split('\n').filter(l => l.trim())
    if (lines.length < 2) return []

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
    const items: RawItem[] = []

    for (let i = 1; i < Math.min(lines.length, limit + 1); i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      const row: Record<string, unknown> = {}
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = values[j]
      }
      // Content-addressed fallback: use title+merchant hash instead of row index
      const fallbackId = row.aw_product_id || row.product_id
        || `awin-${String(row.product_name ?? '').slice(0, 50)}-${String(row.merchant_name ?? '')}`
      items.push({
        sourceId: String(fallbackId),
        data: row,
      })
    }

    return items
  },

  normalize(raw: RawItem): NormalizedItem {
    const d = raw.data as Record<string, unknown>
    return {
      entityType: 'marketplace',
      sourceId: raw.sourceId,
      sourceName: 'awin',
      name: String(d.product_name || d.title || ''),
      description: String(d.description || d.product_short_description || ''),
      urls: d.aw_deep_link ? [String(d.aw_deep_link)] : d.merchant_deep_link ? [String(d.merchant_deep_link)] : [],
      images: d.aw_image_url ? [String(d.aw_image_url)] : d.merchant_image_url ? [String(d.merchant_image_url)] : [],
      tags: d.category_name ? [String(d.category_name).toLowerCase()] : [],
      metadata: {
        awin_product_id: raw.sourceId,
        merchant_name: d.merchant_name,
        price: d.search_price || d.rrp_price,
        currency: d.currency,
        category: d.category_name,
        brand: d.brand_name,
        in_stock: d.in_stock !== '0',
      },
    }
  },
  getSourceId(raw: RawItem): string { return raw.sourceId },
}

Deno.serve(withErrorReporting('source-awin', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.limit || body.batch_size || 100,
      filters: { feedUrl: body.feedUrl },
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id, nodeId: body.node_id,
    }
    const rawItems = await awinAdapter.fetch(config)
    if (config.dryRun) return jsonResponse({ success: true, items: rawItems.length, dry_run: true }, 200, req)
    const written = await writeToStaging(supabase, awinAdapter, rawItems, { ...config, targetTable: 'marketplace_listings' })
    return jsonResponse({ success: true, items: written, items_total: rawItems.length, items_processed: written, items_succeeded: written, items_failed: 0 }, 200, req)
  } catch (error) {
    if (error instanceof MissingCredentialsError) {
      return jsonResponse(skippedResponse('missing_credentials', error.missing), 200, req)
    }
    return errorResponse((error as Error).message, 500, req)
  }
}))
