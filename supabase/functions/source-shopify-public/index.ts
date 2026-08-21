import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging, skippedResponse } from '../_shared/source-adapter.ts'
import { extractMerchantDomain, normalizeCurrency } from '../_shared/marketplace-pipeline-utils.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { assertPublicHttpUrl } from '../_shared/ssrf-guard.ts'

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

// Per-merchant overrides read from marketplace_merchants.config. Both are OPTIONAL and
// must stay so: writeToStaging refresh mode diffs stableStringify(normalized_data), so
// emitting a new metadata key unconditionally would mark all ~50k existing staging rows
// changed and force a full re-commit across every registered merchant. Gating on config
// presence keeps every shop that doesn't set them byte-identical.
interface MerchantOverrides {
  // Shopify `product_type` is the merchant's own label; on a bookshop feed it is
  // "Paperback"/"Hardback", which marketplace_subcategory_group() maps to 'other'.
  // Pinning subcategory is what lands the catalog in department books_art.
  subcategory?: string | null
  // `vendor` is the AUTHOR on a bookshop feed, not the seller — without this every
  // listing would name the author as the business.
  businessName?: string | null
}

/** ISO-3166 country whose Shopify Market prices in the given currency. Only the
 *  currencies this project's SAFE_CURRENCIES list can present need an entry. */
const CURRENCY_MARKET: Record<string, string> = {
  GBP: 'GB', USD: 'US', EUR: 'DE', CHF: 'CH', CAD: 'CA', AUD: 'AU',
  NZD: 'NZ', SEK: 'SE', NOK: 'NO', DKK: 'DK', JPY: 'JP',
}

// ── Storefront GraphQL (the currency-correct path) ─────────────────────────────
//
// products.json has no currency field and Shopify Markets localises presentment
// prices by the REQUESTER's geo-IP, so an eu-central-2 edge function reading a GBP
// shop silently received EUR and stored it as GBP (queerlit "A Dangerous Bargain":
// 12.45 stored vs £10.99 actual). Nothing in that response could ever have revealed
// the mismatch.
//
// The Storefront API fixes both halves: @inContext(country:) PINS the market, and
// price.currencyCode comes back with the number so it is VERIFIED, not assumed.
// Measured on queerlit 2026-08-02 — GB 10.99 GBP / DE 13.35 EUR / US 15.42 USD.
//
// The token is the shop theme's own PUBLIC storefront token (read-only, rate-limited,
// served in every page load). It is config, not a secret.
const STOREFRONT_API_VERSION = '2024-10'
const STOREFRONT_PER_PAGE = 250

// `country` is passed as a $variable rather than interpolated into the query string:
// it originates from merchant config, and a directive built by concatenation would be
// an injection point into the GraphQL document.
const STOREFRONT_QUERY = `query($n:Int!,$c:String,$country:CountryCode!) @inContext(country: $country) {
  products(first:$n, after:$c) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title handle description vendor productType tags onlineStoreUrl
      images(first:5){ nodes{ url } }
      variants(first:1){ nodes{ sku availableForSale price{ amount currencyCode } } }
    }
  }
}`

interface StorefrontProduct {
  id: string; title: string; handle: string; description: string
  vendor: string; productType: string; tags: string[]; onlineStoreUrl: string | null
  images: { nodes: { url: string }[] }
  variants: { nodes: { sku: string | null; availableForSale: boolean; price: { amount: string; currencyCode: string } }[] }
}

async function storefrontPage(
  shopDomain: string, token: string, country: string, cursor: string | null,
): Promise<{ nodes: StorefrontProduct[]; hasNext: boolean; endCursor: string | null }> {
  const url = assertPublicHttpUrl(`https://${shopDomain}/api/${STOREFRONT_API_VERSION}/graphql.json`)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25_000)
  try {
    const res = await fetch(url, {
      method: 'POST', signal: ctrl.signal,
      headers: {
        'X-Shopify-Storefront-Access-Token': token,
        'content-type': 'application/json',
        'User-Agent': UA,
      },
      body: JSON.stringify({
        query: STOREFRONT_QUERY,
        variables: { n: STOREFRONT_PER_PAGE, c: cursor, country },
      }),
    })
    if (!res.ok) throw new Error(`storefront ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const json = await res.json() as { data?: { products?: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: StorefrontProduct[] } }; errors?: unknown[] }
    if (json.errors?.length) throw new Error(`storefront graphql: ${JSON.stringify(json.errors).slice(0, 250)}`)
    const p = json.data?.products
    if (!p) throw new Error('storefront: no products in response')
    return { nodes: p.nodes ?? [], hasNext: p.pageInfo.hasNextPage, endCursor: p.pageInfo.endCursor }
  } finally { clearTimeout(timer) }
}

function makeStorefrontAdapter(
  shopDomain: string, sourceSlug: string, expectedCurrency: string,
  ov: MerchantOverrides, token: string, country: string,
): SourceAdapter {
  return {
    name: sourceSlug, entityType: 'marketplace',
    // The handler drives pagination and passes the page's nodes through config.
    fetch: () => Promise.resolve([]),
    normalize(raw: RawItem): NormalizedItem {
      const p = raw.data as unknown as StorefrontProduct
      const v = p.variants?.nodes?.[0]
      const price = v ? Number(v.price.amount) : undefined
      const externalUrl = p.onlineStoreUrl || `https://${shopDomain}/products/${p.handle}`
      return {
        entityType: 'marketplace', sourceId: raw.sourceId, sourceName: sourceSlug,
        name: p.title,
        description: String(p.description || '').replace(/\s+/g, ' ').trim(),
        urls: [externalUrl],
        images: (p.images?.nodes ?? []).map(i => i.url).filter(Boolean),
        tags: (p.tags ?? []).map(t => String(t).trim()).filter(Boolean),
        metadata: {
          source_slug: sourceSlug, shop_domain: shopDomain, product_id: p.id,
          merchant_deep_link: externalUrl, merchant_domain: extractMerchantDomain(externalUrl),
          price: Number.isFinite(price) && price != null && price > 0 ? price : null,
          // Straight off the wire — NOT the configured guess. This is the whole point.
          currency: normalizeCurrency(v?.price.currencyCode ?? expectedCurrency),
          category: p.productType, brand: p.vendor, brand_name: p.vendor,
          business_name: ov.businessName || p.vendor || shopDomain,
          in_stock: v?.availableForSale, sku: v?.sku ?? undefined, handle: p.handle,
          market_country: country,
          ...(ov.subcategory ? { subcategory: ov.subcategory } : {}),
        },
      }
    },
    getSourceId(raw: RawItem): string { return raw.sourceId },
  }
}

function makeAdapter(shopDomain: string, sourceSlug: string, currency = 'EUR', ov: MerchantOverrides = {}, marketCountry: string | null = null): SourceAdapter {
  return {
    name: sourceSlug, entityType: 'marketplace',
    // Single page (config.offset = page number). The handler streams page-by-page
    // so memory stays bounded — fetching the whole 7k+ catalog at once OOMs the
    // worker (HTTP 546). Returns [] past the last page.
    async fetch(config: AdapterConfig): Promise<RawItem[]> {
      const page = Number(config.offset ?? 1)
      // KNOWN UNSOLVED (2026-08-02): products.json carries NO currency field, and
      // Shopify Markets localises presentment prices by the REQUESTER's geo-IP. This
      // function runs in eu-central-2, so queerlit.co.uk (base currency GBP, confirmed
      // via /meta.json) served it EUR and we stored those numbers under
      // `currency: 'GBP'` — A Dangerous Bargain: 12.45 stored vs £10.99 actual, exactly
      // the EUR rate. Wrong prices are user-facing, so those listings are quarantined
      // (status='inactive') and the merchant is disabled.
      //
      // `?country=` below was MEASURED AND DOES NOT FIX IT — Shopify honours that param
      // on the Storefront API, not on products.json; the edge function still received
      // 12.45 after it was added. It is kept only as a manual `config.market_country`
      // hook. DO NOT treat this as solved: a real fix needs either a region-pinned
      // fetch (proxy/worker in the target market) or the Storefront GraphQL API with
      // an explicit @inContext(country:) directive, which returns the currency code so
      // the value can be self-verified instead of assumed.
      const q = new URLSearchParams({ limit: String(PER_PAGE), page: String(page) })
      if (marketCountry) q.set('country', marketCountry)
      const url = assertPublicHttpUrl(`https://${shopDomain}/products.json?${q}`)
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
          : (err as Error).message, { cause: err })
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
          business_name: ov.businessName || p.vendor || shopDomain, in_stock: inStock, sku: variant?.sku, handle: p.handle,
          // Emitted ONLY when the merchant configures it — see MerchantOverrides.
          ...(ov.subcategory ? { subcategory: ov.subcategory } : {}),
        },
      }
    },
    getSourceId(raw: RawItem): string { return raw.sourceId },
  }
}

Deno.serve(withErrorReporting('source-shopify-public', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  const _auth = await requireInternalOrAdmin(req, supabase); if (_auth instanceof Response) return _auth
  try {
    const body = await req.json().catch(() => ({}))
    const shopDomain = (body.shop_domain || body.shopDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!shopDomain) return jsonResponse(skippedResponse('missing_config', ['shop_domain']), 200, req)
    const sourceSlug = body.source_slug || defaultSlug(shopDomain)

    // Respect the merchant registry: a merchant disabled there (blocked egress,
    // wiped catalog, …) is skipped no matter who invokes this function.
    const { data: merchant } = await supabase
      .from('marketplace_merchants')
      .select('id, is_enabled, config')
      .eq('shop_domain', shopDomain)
      .maybeSingle()
    if (merchant && merchant.is_enabled === false) {
      return jsonResponse(skippedResponse('merchant_disabled', [shopDomain]), 200, req)
    }

    // Registry config is the source of truth for per-merchant shaping; the request
    // body may override it for one-off manual runs.
    const mcfg = (merchant?.config ?? {}) as Record<string, unknown>
    const cfgStr = (k: string): string | null => {
      const v = mcfg[k]
      return typeof v === 'string' && v.trim() ? v.trim() : null
    }
    // currency deliberately NOT read from config here — marketplace-sync-merchants
    // already forwards config.currency in the body, and adding a second source of
    // truth would silently re-price every staging row of any merchant whose config
    // disagrees with what its rows were written with.
    const currency = typeof body.currency === 'string' && body.currency ? body.currency : 'EUR'
    // Pin the market to the country that prices in `currency`, so the numbers we store
    // are actually denominated in the currency we label them with.
    const marketCountry = (typeof body.market_country === 'string' && body.market_country)
      || cfgStr('market_country')
      || CURRENCY_MARKET[normalizeCurrency(currency)]
      || null
    const overrides: MerchantOverrides = {
      subcategory: (typeof body.subcategory === 'string' && body.subcategory) || cfgStr('subcategory'),
      businessName: (typeof body.business_name === 'string' && body.business_name) || cfgStr('business_name'),
    }
    const maxPages = Number(body.max_pages ?? 40)
    const dryRun = body.dry_run || false
    const refresh = body.refresh === true

    // ── Storefront GraphQL path (currency-correct) ────────────────────────────
    const storefrontToken = (typeof body.storefront_token === 'string' && body.storefront_token)
      || cfgStr('storefront_token')
    if (storefrontToken) {
      if (!marketCountry) return jsonResponse(skippedResponse('missing_config', ['market_country']), 200, req)
      const expected = normalizeCurrency(currency)
      const sfAdapter = makeStorefrontAdapter(shopDomain, sourceSlug, expected, overrides, storefrontToken, marketCountry)

      // ── resumable cursor ───────────────────────────────────────────────────
      // Without this every invocation restarts at page 1, so a catalog larger than
      // one run's page budget can never be swept: queerlit stalled at ~1,850 of
      // 6,955 and the tail (including 45 already-committed listings) was never
      // re-read. The cursor lives in marketplace_merchants.config alongside
      // source-shop-crawl's crawl_cursor, so successive runs resume.
      //
      // Reaching the end resets to null and increments `wraps` — wrapping IS the
      // price/stock refresh mechanism, since writeToStaging refresh mode skips
      // unchanged payloads for free.
      const sfCursorCfg = (mcfg.storefront_cursor ?? {}) as Record<string, unknown>
      let cursor: string | null = body.reset_cursor === true
        ? null
        : (typeof sfCursorCfg.after === 'string' && sfCursorCfg.after ? sfCursorCfg.after : null)
      let wraps = Number(sfCursorCfg.wraps ?? 0)
      const startedAtCursor = cursor

      let total = 0, written = 0, pages = 0
      let seenCurrency: string | null = null
      let completedSweep = false
      let cursorRetried = false

      for (pages = 0; pages < maxPages; pages++) {
        let page: { nodes: StorefrontProduct[]; hasNext: boolean; endCursor: string | null }
        try {
          page = await storefrontPage(shopDomain, storefrontToken, marketCountry, cursor)
        } catch (err) {
          // Storefront cursors are opaque and go stale when the product set shifts.
          // A persisted bad cursor would otherwise wedge this merchant forever, so
          // fall back to a fresh sweep exactly once per run rather than failing.
          if (cursor && !cursorRetried) {
            console.error(`storefront cursor rejected for ${sourceSlug}, restarting sweep:`, (err as Error).message)
            cursorRetried = true
            cursor = null
            pages--
            continue
          }
          throw err
        }
        const { nodes, hasNext, endCursor } = page
        if (nodes.length === 0) { completedSweep = true; break }

        // Verify, do not assume. This is the check whose absence let EUR prices be
        // stored as GBP: refuse the batch rather than persist a number whose currency
        // we cannot vouch for.
        for (const n of nodes) {
          const cc = n.variants?.nodes?.[0]?.price?.currencyCode
          if (!cc) continue
          seenCurrency ??= cc
          if (cc !== expected) {
            return errorResponse(
              `currency mismatch for ${sourceSlug}: market ${marketCountry} returned ${cc}, config says ${expected}. ` +
              `Refusing to stage — fix config.currency / config.market_country first.`,
              422, req,
            )
          }
        }

        const items: RawItem[] = nodes
          .filter(n => n.handle)
          .map(n => ({ sourceId: `${sourceSlug}:${n.handle}`, data: n as unknown as Record<string, unknown> }))
        total += items.length
        if (!dryRun && items.length) {
          written += await writeToStaging(supabase, sfAdapter, items, {
            batchSize: items.length, pipelineRunId: body.pipeline_run_id, nodeId: body.node_id,
            targetTable: 'marketplace_listings', refresh,
          })
        }
        cursor = endCursor
        if (!hasNext || !cursor) { completedSweep = true; break }
      }

      // End of catalog -> back to the start for the next refresh pass.
      if (completedSweep) { cursor = null; wraps += 1 }

      // Persist only for the registry-driven path. A manual run that overrode the
      // token or market from the body is not necessarily sweeping the same product
      // set, so it must not move the shared cursor.
      const usedRegistryConfig = !body.storefront_token && !body.market_country
      if (!dryRun && merchant?.id && usedRegistryConfig) {
        const { error: cErr } = await supabase.from('marketplace_merchants')
          .update({
            config: {
              ...mcfg,
              storefront_cursor: {
                after: cursor, wraps,
                completed_sweep: completedSweep,
                updated_at: new Date().toISOString(),
              },
            },
          })
          .eq('id', merchant.id)
        if (cErr) console.error(`storefront cursor persist ${sourceSlug}:`, cErr.message)
      }

      return jsonResponse({
        success: true, items: dryRun ? total : written, items_total: total,
        items_processed: dryRun ? total : written, items_succeeded: dryRun ? total : written,
        items_failed: 0, pages_fetched: pages + 1,
        source: 'storefront', market_country: marketCountry, currency_verified: seenCurrency,
        resumed_from: startedAtCursor ? `${startedAtCursor.slice(0, 12)}…` : null,
        next_cursor: cursor ? `${cursor.slice(0, 12)}…` : null,
        completed_sweep: completedSweep, wraps, cursor_restarted: cursorRetried,
      }, 200, req)
    }

    const adapter = makeAdapter(shopDomain, sourceSlug, currency, overrides)

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
