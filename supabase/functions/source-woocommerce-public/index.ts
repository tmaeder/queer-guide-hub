import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging, skippedResponse } from '../_shared/source-adapter.ts'
import { extractMerchantDomain, normalizeCurrency } from '../_shared/marketplace-pipeline-utils.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// ============================================================
// source-woocommerce-public — ingest any WooCommerce storefront via its PUBLIC
// Store API (/wp-json/wc/store/v1/products, no auth). Sibling of
// source-shopify-public. Prices arrive in minor units with an explicit
// currency_code, so no currency config is needed.
//
// Node config: { shop_domain, source_slug, max_pages?, batch_size? }
//   shop_domain  e.g. "puppyplayexpert.com"
//   source_slug  source_type stamped on staging rows + source_entity_id prefix
//                (default: shop_domain without TLD)
//   max_pages    pagination cap (100 products/page; default 40 ≈ 4k products)
// ============================================================

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
const PER_PAGE = 100

interface WooProduct {
  id: number; name: string; slug: string; permalink: string
  description: string; short_description: string; sku: string
  is_in_stock: boolean
  prices: { price: string; currency_code: string; currency_minor_unit: number }
  images: { src: string }[]
  categories: { name: string }[]
  tags: { name: string }[]
  brands?: { name: string }[]
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
}

function stripHtml(s: string): string {
  return decodeEntities(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function defaultSlug(shopDomain: string): string {
  return shopDomain.replace(/^www\./, '').split('.')[0]
}

function makeAdapter(shopDomain: string, sourceSlug: string): SourceAdapter {
  return {
    name: sourceSlug, entityType: 'marketplace',
    // Single page per fetch (config.offset = page number); the handler streams
    // page-by-page so memory stays bounded. Returns [] past the last page.
    async fetch(config: AdapterConfig): Promise<RawItem[]> {
      const page = Number(config.offset ?? 1)
      const url = `https://${shopDomain}/wp-json/wc/store/v1/products?per_page=${PER_PAGE}&page=${page}`
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
      if (!res.ok) {
        if (page === 1) throw new Error(`store api ${res.status} for ${shopDomain}`)
        return []
      }
      const products = await res.json() as WooProduct[]
      return (products || [])
        .filter(p => p.slug)
        .map(p => ({ sourceId: `${sourceSlug}:${p.slug}`, data: p as unknown as Record<string, unknown> }))
    },
    normalize(raw: RawItem): NormalizedItem {
      const p = raw.data as unknown as WooProduct
      const minor = p.prices?.currency_minor_unit ?? 2
      const priceRaw = Number(p.prices?.price)
      const price = Number.isFinite(priceRaw) ? priceRaw / Math.pow(10, minor) : undefined
      const externalUrl = p.permalink || `https://${shopDomain}/product/${p.slug}/`
      const images = (p.images || []).map(i => i.src).filter(Boolean)
      const tags = (p.tags || []).map(t => decodeEntities(t.name).trim()).filter(Boolean)
      const category = decodeEntities(p.categories?.[0]?.name || '').trim()
      const brand = decodeEntities(p.brands?.[0]?.name || '').trim()
      return {
        entityType: 'marketplace', sourceId: raw.sourceId, sourceName: sourceSlug,
        name: decodeEntities(p.name).trim(),
        description: stripHtml(p.description || p.short_description),
        urls: [externalUrl], images, tags,
        metadata: {
          source_slug: sourceSlug, shop_domain: shopDomain, product_id: String(p.id),
          merchant_deep_link: externalUrl, merchant_domain: extractMerchantDomain(externalUrl),
          price: price != null && price > 0 ? price : null,
          currency: normalizeCurrency(p.prices?.currency_code || 'USD'),
          category, brand: brand || null, brand_name: brand || null,
          business_name: brand || shopDomain, in_stock: p.is_in_stock, sku: p.sku, handle: p.slug,
        },
      }
    },
    getSourceId(raw: RawItem): string { return raw.sourceId },
  }
}

Deno.serve(withErrorReporting('source-woocommerce-public', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  try {
    const body = await req.json().catch(() => ({}))
    const shopDomain = (body.shop_domain || body.shopDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!shopDomain) return jsonResponse(skippedResponse('missing_config', ['shop_domain']), 200, req)
    const sourceSlug = body.source_slug || defaultSlug(shopDomain)
    const adapter = makeAdapter(shopDomain, sourceSlug)
    const maxPages = Number(body.max_pages ?? 40)
    const dryRun = body.dry_run || false

    let total = 0, written = 0, page = 0
    for (page = 1; page <= maxPages; page++) {
      const items = await adapter.fetch({ batchSize: PER_PAGE, offset: page })
      if (items.length === 0) break
      total += items.length
      if (!dryRun) {
        written += await writeToStaging(supabase, adapter, items, {
          batchSize: PER_PAGE, offset: page, pipelineRunId: body.pipeline_run_id, nodeId: body.node_id,
          targetTable: 'marketplace_listings',
        })
      }
      if (items.length < PER_PAGE) break
    }
    return jsonResponse({
      success: true, items: dryRun ? total : written, items_total: total,
      items_processed: dryRun ? total : written, items_succeeded: dryRun ? total : written,
      items_failed: 0, pages_fetched: page,
    }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
}))
