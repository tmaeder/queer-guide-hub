import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging, skippedResponse } from '../_shared/source-adapter.ts'
import { extractMerchantDomain, normalizeCurrency } from '../_shared/marketplace-pipeline-utils.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// ============================================================
// source-shopify-public — ingest any Shopify storefront via its PUBLIC
// /products.json feed (no Admin API token). Sibling of source-shopify, which
// needs SHOPIFY_ADMIN_TOKEN. Built for re-ingesting merchants whose catalog we
// can only read publicly (e.g. ohmyfantasy.com after it wiped + re-slugged its
// store, audit 2026-06-07). Writes to ingestion_staging → marketplace pipeline.
//
// Node config: { shop_domain, source_slug, max_pages?, batch_size? }
//   shop_domain  e.g. "ohmyfantasy.com"
//   source_slug  source_type stamped on staging rows + source_entity_id prefix
//                (default: shop_domain without TLD). MUST match the merchant's
//                existing source_type so dedup links to the right listings.
//   max_pages    pagination cap (250 products/page; default 40 ≈ 10k products)
// ============================================================

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
const PER_PAGE = 250

interface PublicProduct {
  id: number; title: string; body_html: string; vendor: string; product_type: string;
  handle: string; tags: string[] | string; published_at?: string;
  images: { src: string }[];
  variants: { price: string; sku?: string; available?: boolean }[];
}

function defaultSlug(shopDomain: string): string {
  return shopDomain.replace(/^www\./, '').split('.')[0]
}

function makeAdapter(shopDomain: string, sourceSlug: string): SourceAdapter {
  return {
    name: sourceSlug, entityType: 'marketplace',
    async fetch(config: AdapterConfig): Promise<RawItem[]> {
      const maxPages = Number(config.filters?.maxPages ?? 40)
      const out: RawItem[] = []
      for (let page = 1; page <= maxPages; page++) {
        const url = `https://${shopDomain}/products.json?limit=${PER_PAGE}&page=${page}`
        const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
        if (!res.ok) {
          if (page === 1) throw new Error(`products.json ${res.status} for ${shopDomain}`)
          break // ran past the last page
        }
        const data = await res.json() as { products?: PublicProduct[] }
        const products = data.products || []
        if (products.length === 0) break
        for (const p of products) {
          if (!p.handle) continue
          out.push({ sourceId: `${sourceSlug}:${p.handle}`, data: p as unknown as Record<string, unknown> })
        }
        if (products.length < PER_PAGE) break // last page
      }
      return out
    },
    normalize(raw: RawItem): NormalizedItem {
      const p = raw.data as unknown as PublicProduct
      const variant = p.variants?.[0]
      const price = variant ? Number(variant.price) : undefined
      const inStock = variant?.available
      const externalUrl = `https://${shopDomain}/products/${p.handle}`
      const images = (p.images || []).map(i => i.src).filter(Boolean)
      const tags = Array.isArray(p.tags)
        ? p.tags.map(t => String(t).trim()).filter(Boolean)
        : String(p.tags || '').split(',').map(t => t.trim()).filter(Boolean)
      return {
        entityType: 'marketplace', sourceId: raw.sourceId, sourceName: sourceSlug,
        name: p.title,
        description: String(p.body_html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        urls: [externalUrl], images, tags,
        metadata: {
          source_slug: sourceSlug, shop_domain: shopDomain, product_id: String(p.id),
          merchant_deep_link: externalUrl, merchant_domain: extractMerchantDomain(externalUrl),
          price: Number.isFinite(price) && price != null && price > 0 ? price : null,
          currency: normalizeCurrency('EUR'), category: p.product_type, brand: p.vendor, brand_name: p.vendor,
          business_name: p.vendor || shopDomain, in_stock: inStock, sku: variant?.sku, handle: p.handle,
        },
      }
    },
    getSourceId(raw: RawItem): string { return raw.sourceId },
  }
}

Deno.serve(withErrorReporting('source-shopify-public', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const shopDomain = (body.shop_domain || body.shopDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!shopDomain) return jsonResponse(skippedResponse('missing_config', ['shop_domain']), 200, req)
    const sourceSlug = body.source_slug || defaultSlug(shopDomain)
    const adapter = makeAdapter(shopDomain, sourceSlug)
    const config: AdapterConfig = {
      batchSize: body.batch_size || PER_PAGE,
      filters: { maxPages: body.max_pages },
      dryRun: body.dry_run || false, pipelineRunId: body.pipeline_run_id, nodeId: body.node_id,
    }
    const rawItems = await adapter.fetch(config)
    if (config.dryRun) return jsonResponse({ success: true, items: rawItems.length, dry_run: true }, 200, req)
    const written = await writeToStaging(supabase, adapter, rawItems, { ...config, targetTable: 'marketplace_listings' })
    return jsonResponse({ success: true, items: written, items_total: rawItems.length, items_processed: written, items_succeeded: written, items_failed: 0 }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
}))
