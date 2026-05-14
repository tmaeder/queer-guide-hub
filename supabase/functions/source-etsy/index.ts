import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging, MissingCredentialsError, skippedResponse } from '../_shared/source-adapter.ts'
import { extractMerchantDomain, normalizeCurrency } from '../_shared/marketplace-pipeline-utils.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

interface EtsyListing {
  listing_id: number; title: string; description: string; tags: string[];
  price: { amount: number; divisor: number; currency_code: string };
  url: string; quantity: number; state: string; taxonomy_path?: string[];
  shop_id: number; shop_name?: string; images?: { url_fullxfull: string }[];
}

function makeAdapter(shopId: string): SourceAdapter {
  return {
    name: 'etsy', entityType: 'marketplace',
    async fetch(config: AdapterConfig): Promise<RawItem[]> {
      const apiKey = (config.filters?.apiKey as string) || Deno.env.get('ETSY_API_KEY')
      if (!apiKey) throw new MissingCredentialsError('ETSY_API_KEY')
      const limit = Math.min(config.batchSize || 50, 100)
      const url = new URL(`https://openapi.etsy.com/v3/application/shops/${shopId}/listings/active`)
      url.searchParams.set('limit', String(limit)); url.searchParams.set('includes', 'Images,Shop')
      const supabase = getServiceClient()
      const data = await withCircuitBreaker(supabase, 'etsy', async () => {
        const res = await fetch(url, { headers: { 'x-api-key': apiKey, 'Accept': 'application/json' } })
        if (!res.ok) throw new Error(`Etsy ${res.status}: ${await res.text()}`)
        return await res.json() as { results: EtsyListing[] }
      })
      return data.results.map(l => ({ sourceId: String(l.listing_id), data: l as unknown as Record<string, unknown> }))
    },
    normalize(raw: RawItem): NormalizedItem {
      const l = raw.data as unknown as EtsyListing
      const price = l.price ? l.price.amount / (l.price.divisor || 100) : undefined
      const images = (l.images || []).map(i => i.url_fullxfull).filter(Boolean)
      const category = l.taxonomy_path?.join(' > ') || ''
      const topCategory = l.taxonomy_path?.[0] || ''
      return {
        entityType: 'marketplace', sourceId: raw.sourceId, sourceName: 'etsy',
        name: l.title, description: String(l.description || '').trim(),
        urls: l.url ? [l.url] : [], images, tags: l.tags || [],
        metadata: {
          source_slug: 'etsy', etsy_listing_id: raw.sourceId,
          merchant_deep_link: l.url, merchant_domain: extractMerchantDomain(l.url),
          price: Number.isFinite(price) && price != null && price > 0 ? price : null,
          currency: normalizeCurrency(l.price?.currency_code),
          category: topCategory, subcategory: category,
          business_name: l.shop_name || `etsy-shop-${l.shop_id}`,
          in_stock: l.quantity > 0 && l.state === 'active', shop_id: String(l.shop_id),
        },
      }
    },
    getSourceId(raw: RawItem): string { return raw.sourceId },
  }
}

Deno.serve(withErrorReporting('source-etsy', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const shopId = body.shopId || body.shop_id || Deno.env.get('ETSY_SHOP_ID')
    if (!shopId) return jsonResponse(skippedResponse('missing_credentials', ['ETSY_SHOP_ID']), 200, req)
    const adapter = makeAdapter(String(shopId))
    const config: AdapterConfig = {
      batchSize: body.limit || body.batch_size || 50,
      filters: { apiKey: body.apiKey },
      dryRun: body.dry_run || false, pipelineRunId: body.pipeline_run_id, nodeId: body.node_id,
    }
    const rawItems = await adapter.fetch(config)
    if (config.dryRun) return jsonResponse({ success: true, items: rawItems.length, dry_run: true }, 200, req)
    const written = await writeToStaging(supabase, adapter, rawItems, { ...config, targetTable: 'marketplace_listings' })
    return jsonResponse({ success: true, items: written, items_total: rawItems.length, items_processed: written, items_succeeded: written, items_failed: 0 }, 200, req)
  } catch (error) {
    if (error instanceof MissingCredentialsError) {
      return jsonResponse(skippedResponse('missing_credentials', error.missing), 200, req)
    }
    return errorResponse((error as Error).message, 500, req)
  }
}))
