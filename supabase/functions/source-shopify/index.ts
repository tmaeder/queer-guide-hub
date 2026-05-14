import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging, MissingCredentialsError, skippedResponse } from '../_shared/source-adapter.ts'
import { extractMerchantDomain, normalizeCurrency } from '../_shared/marketplace-pipeline-utils.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

interface ShopifyProduct {
  id: number; title: string; body_html: string; vendor: string; product_type: string; handle: string; status: string; tags: string;
  images: { src: string }[]; variants: { price: string; sku: string; available: boolean; inventory_quantity: number }[];
}

function makeAdapter(shopDomain: string): SourceAdapter {
  return {
    name: 'shopify', entityType: 'marketplace',
    async fetch(config: AdapterConfig): Promise<RawItem[]> {
      const token = (config.filters?.accessToken as string) || Deno.env.get('SHOPIFY_ADMIN_TOKEN')
      if (!token) throw new MissingCredentialsError('SHOPIFY_ADMIN_TOKEN')
      const limit = Math.min(config.batchSize || 50, 250)
      const since = config.filters?.updatedAtMin as string | undefined
      const url = new URL(`https://${shopDomain}/admin/api/2024-04/products.json`)
      url.searchParams.set('limit', String(limit)); url.searchParams.set('status', 'active')
      if (since) url.searchParams.set('updated_at_min', since)
      const supabase = getServiceClient()
      const data = await withCircuitBreaker(supabase, 'shopify', async () => {
        const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token, 'Accept': 'application/json' } })
        if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`)
        return await res.json() as { products: ShopifyProduct[] }
      })
      return data.products.map(p => ({ sourceId: `${shopDomain}:${p.id}`, data: p as unknown as Record<string, unknown> }))
    },
    normalize(raw: RawItem): NormalizedItem {
      const p = raw.data as unknown as ShopifyProduct
      const variant = p.variants?.[0]
      const price = variant ? Number(variant.price) : undefined
      const inStock = variant ? (variant.available || variant.inventory_quantity > 0) : undefined
      const externalUrl = `https://${shopDomain}/products/${p.handle}`
      const images = (p.images || []).map(i => i.src).filter(Boolean)
      const tags = String(p.tags || '').split(',').map(t => t.trim()).filter(Boolean)
      return {
        entityType: 'marketplace', sourceId: raw.sourceId, sourceName: 'shopify',
        name: p.title,
        description: String(p.body_html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        urls: [externalUrl], images, tags,
        metadata: {
          source_slug: 'shopify', shop_domain: shopDomain, product_id: String(p.id),
          merchant_deep_link: externalUrl, merchant_domain: extractMerchantDomain(externalUrl),
          price: Number.isFinite(price) && price != null && price > 0 ? price : null,
          currency: normalizeCurrency('USD'), category: p.product_type, brand: p.vendor, brand_name: p.vendor,
          business_name: p.vendor || shopDomain, in_stock: inStock, sku: variant?.sku, handle: p.handle,
        },
      }
    },
    getSourceId(raw: RawItem): string { return raw.sourceId },
  }
}

Deno.serve(withErrorReporting('source-shopify', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const shopDomain = body.shopDomain || body.shop_domain || Deno.env.get('SHOPIFY_SHOP_DOMAIN')
    if (!shopDomain) return jsonResponse(skippedResponse('missing_credentials', ['SHOPIFY_SHOP_DOMAIN']), 200, req)
    const adapter = makeAdapter(shopDomain)
    const config: AdapterConfig = {
      batchSize: body.limit || body.batch_size || 50,
      filters: { accessToken: body.accessToken, updatedAtMin: body.updated_at_min },
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
