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

function makeAdapter(shopDomain: string, sourceSlug: string, currency = 'EUR'): SourceAdapter {
  return {
    name: sourceSlug, entityType: 'marketplace',
    // Single page (config.offset = page number). The handler streams page-by-page
    // so memory stays bounded — fetching the whole 7k+ catalog at once OOMs the
    // worker (HTTP 546). Returns [] past the last page.
    async fetch(config: AdapterConfig): Promise<RawItem[]> {
      const page = Number(config.offset ?? 1)
      const url = `https://${shopDomain}/products.json?limit=${PER_PAGE}&page=${page}`
      // Per-page timeout: merchants that tarpit datacenter egress (e.g.
      // ohmyfantasy.com) otherwise hang the fetch until the function hits its
      // wall-clock limit (HTTP 546) — fail fast with a clear error instead.
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 20_000)
      let data: { products?: PublicProduct[] }
      try {
        // Signal must cover the BODY read too — tarpitting merchants drip
        // bytes after sending headers, which otherwise hangs res.json() until
        // the worker wall-clock limit (HTTP 546).
        const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal })
        if (!res.ok) {
          if (page === 1) throw new Error(`products.json ${res.status} for ${shopDomain}`)
          return []
        }
        data = await res.json() as { products?: PublicProduct[] }
      } catch (err) {
        throw new Error((err as Error).name === 'AbortError'
          ? `products.json timeout after 20s for ${shopDomain} (page ${page}) — likely blocking datacenter egress`
          : (err as Error).message)
      } finally { clearTimeout(timer) }
      const products = data.products || []
      return products
        .filter(p => p.handle)
        .map(p => ({ sourceId: `${sourceSlug}:${p.handle}`, data: p as unknown as Record<string, unknown> }))
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
          currency: normalizeCurrency(currency), category: p.product_type, brand: p.vendor, brand_name: p.vendor,
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

    // Respect the merchant registry: a merchant disabled there (blocked egress,
    // wiped catalog, …) is skipped no matter who invokes this function.
    const { data: merchant } = await supabase
      .from('marketplace_merchants')
      .select('is_enabled')
      .eq('shop_domain', shopDomain)
      .maybeSingle()
    if (merchant && merchant.is_enabled === false) {
      return jsonResponse(skippedResponse('merchant_disabled', [shopDomain]), 200, req)
    }

    const currency = typeof body.currency === 'string' && body.currency ? body.currency : 'EUR'
    const adapter = makeAdapter(shopDomain, sourceSlug, currency)
    const maxPages = Number(body.max_pages ?? 40)
    const dryRun = body.dry_run || false
    const refresh = body.refresh === true

    // Stream page-by-page: fetch one page, stage it, release it. Bounds memory so
    // a 7k+ catalog doesn't OOM the worker. writeToStaging is idempotent on
    // source_entity_id, so already-seen products are skipped cheaply.
    let total = 0, written = 0, page = 0
    for (page = 1; page <= maxPages; page++) {
      const items = await adapter.fetch({ batchSize: PER_PAGE, offset: page })
      if (items.length === 0) break
      total += items.length
      if (!dryRun) {
        written += await writeToStaging(supabase, adapter, items, {
          batchSize: PER_PAGE, offset: page, pipelineRunId: body.pipeline_run_id, nodeId: body.node_id,
          targetTable: 'marketplace_listings', refresh,
        })
      }
      if (items.length < PER_PAGE) break // last page
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
