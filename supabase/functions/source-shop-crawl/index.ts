import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem } from '../_shared/source-adapter.ts'
import { writeToStaging, skippedResponse } from '../_shared/source-adapter.ts'
import { extractMerchantDomain, normalizeCurrency } from '../_shared/marketplace-pipeline-utils.ts'
import { extractContent } from '../_shared/extract-client.ts'
import { splitAuthor } from '../_shared/book-title.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// ============================================================
// source-shop-crawl — ingest storefronts that expose NO machine feed.
//
// The marketplace registry has had `provider='crawl'` since July 2026 with the
// crawler itself scoped "Phase 2" and never built, so every crawl merchant has
// imported exactly zero products. This is that crawler.
//
// It is deliberately ONE function with pluggable readers rather than one function
// per shop: sitemap read, cursor, budget, politeness, freshness-skip and ~90% of the
// field mapping are identical across targets, and schema.org uses the same property
// names in JSON-LD and in microdata. Only the reader differs.
//
// Body: { source_slug, limit?, dry_run?, reset_cursor?, pipeline_run_id?, node_id? }
//
// NOTE the body carries NO url and NO crawl parameters — everything is read from
// marketplace_merchants.config by slug. That is a security property, not a style
// choice: source-shopify-public takes shop_domain from the body while running
// verify_jwt=false, which is an SSRF hole this function does not reproduce.
//
// config keys (per merchant):
//   strategy          'jsonld' | 'microdata'   which reader parses a product page
//   sitemap           absolute URL of the product sitemap (or a sitemapindex)
//   url_include       regex a URL must match to be treated as a product page
//   entity_id_from    'isbn' | undefined       how to derive source_entity_id
//   subcategory       pinned subcategory (drives department; see below)
//   business_name     the SELLER (never the author)
//   currency, lang, author_from, concurrency, crawl_delay_ms, render,
//   refresh_after_days, lookahead
//   crawl_cursor      {index,total,updated_at,wraps} — written by this function
// ============================================================

const RUN_BUDGET_MS = 105_000 // mirrors marketplace-sync-merchants' 120s, less headroom
const DEFAULT_CONCURRENCY = 3
const DEFAULT_CRAWL_DELAY_MS = 300
const DEFAULT_LOOKAHEAD = 500
const DEFAULT_REFRESH_AFTER_DAYS = 21
const SITEMAP_TIMEOUT_MS = 30_000
const SITEMAP_INDEX_MAX_CHILDREN = 10
const IN_FILTER_CHUNK = 200 // PostgREST builds .in() into the URL; large lists 414 or silently truncate

// Identify honestly. This crawler is a first-party product crawler for queer.guide,
// not an AI training crawler — several target shops disallow ClaudeBot/GPTBot by name
// while permitting `User-agent: *`, and reusing one of those identities (or posing as
// a browser) would misrepresent what is fetching. The sitemap fetch uses this too.
const UA = 'QueerGuideBot/1.0 (+https://queer.guide/bot)'

interface CrawlConfig {
  strategy: string
  sitemap: string
  url_include?: string
  entity_id_from?: string
  subcategory?: string
  business_name?: string
  currency?: string
  lang?: string
  author_from?: string
  concurrency?: number
  crawl_delay_ms?: number
  render?: boolean
  refresh_after_days?: number
  lookahead?: number
  crawl_cursor?: { index?: number; total?: number; wraps?: number }
}

/** One product, already read out of a page by a strategy reader. */
interface ProductRead {
  name: string
  description: string
  images: string[]
  price: number | null
  currency: string | null
  inStock: boolean | null
  sku: string | null
  author: string | null
}

// ── sitemap ────────────────────────────────────────────────────────────────────

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m =>
    m[1].replace(/&amp;/g, '&').trim()
  )
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/xml,text/xml,*/*' }, signal: ctrl.signal })
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
    return await res.text()
  } finally { clearTimeout(timer) }
}

/** Read the product URL list. Handles a plain <urlset> and a <sitemapindex>.
 *  Sorted so the persisted cursor means the same thing on the next run — an unsorted
 *  list would silently re-crawl some URLs and skip others whenever the shop reorders
 *  its sitemap. */
async function collectProductUrls(cfg: CrawlConfig, shopDomain: string): Promise<string[]> {
  const root = await fetchText(cfg.sitemap, SITEMAP_TIMEOUT_MS)
  let urls: string[]
  if (/<sitemapindex/i.test(root)) {
    urls = []
    for (const child of locs(root).slice(0, SITEMAP_INDEX_MAX_CHILDREN)) {
      try { urls.push(...locs(await fetchText(child, SITEMAP_TIMEOUT_MS))) }
      catch (e) { console.error(`sitemap child ${child}:`, (e as Error).message) }
    }
  } else {
    urls = locs(root)
  }

  const include = cfg.url_include ? new RegExp(cfg.url_include) : null
  const host = shopDomain.replace(/^www\./, '')
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of urls) {
    if (include && !include.test(u)) continue
    // Defence in depth: a sitemap is attacker-controlled content, so never follow it
    // off the registered merchant's host.
    let h: string
    try { h = new URL(u).hostname.replace(/^www\./, '') } catch { continue }
    if (h !== host) continue
    if (seen.has(u)) continue
    seen.add(u)
    out.push(u)
  }
  return out.sort()
}

// ── entity id ──────────────────────────────────────────────────────────────────

/** Derived from the URL alone so freshness can be checked BEFORE paying for a fetch.
 *  Always non-empty: commit_marketplace_staging_batch only appends its md5 slug suffix
 *  when source_entity_id is set, and without that suffix two same-titled books collide
 *  on marketplace_listings_slug_unique and the second is rejected. */
function entityKey(url: string, cfg: CrawlConfig): string | null {
  if (cfg.entity_id_from === 'isbn') {
    const m = url.match(/-isbn-(\d{10,13})\/?$/i)
    if (m) return m[1]
  }
  try {
    const seg = new URL(url).pathname.replace(/\/+$/, '').split('/').filter(Boolean).pop()
    return seg ? decodeURIComponent(seg) : null
  } catch { return null }
}

// ── readers ────────────────────────────────────────────────────────────────────

/** Case-insensitive property read. Wix emits non-standard capitalised schema.org keys
 *  ("Offers", "Availability"), so an exact-key lookup silently loses the price. */
function ci(obj: Record<string, unknown> | undefined, ...names: string[]): unknown {
  if (!obj) return undefined
  const map = new Map(Object.keys(obj).map(k => [k.toLowerCase(), k]))
  for (const n of names) {
    const k = map.get(n.toLowerCase())
    if (k !== undefined && obj[k] !== undefined && obj[k] !== null) return obj[k]
  }
  return undefined
}

function asObj(v: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(v)) return asObj(v[0])
  return v && typeof v === 'object' ? v as Record<string, unknown> : undefined
}

function str(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number') return String(v)
  return null
}

function num(v: unknown): number | null {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v : ''
  // Strip currency symbols/spaces but keep the decimal separator.
  const cleaned = s.replace(/[^\d.,-]/g, '').replace(/,(\d{2})$/, '.$1').replace(/,/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Absolutise protocol-relative and root-relative image URLs — queerbooks serves
 *  `//queerbooks.b-cdn.net/...`, which is not a fetchable URL for the image mirror. */
function absUrl(raw: unknown, pageUrl: string): string | null {
  const s = str(raw)
  if (!s) return null
  try { return new URL(s, pageUrl).toString() } catch { return null }
}

function imagesFrom(v: unknown, pageUrl: string): string[] {
  const arr = Array.isArray(v) ? v : [v]
  const out: string[] = []
  for (const x of arr) {
    const u = typeof x === 'object' && x
      ? absUrl(ci(x as Record<string, unknown>, 'contentUrl', 'url'), pageUrl)
      : absUrl(x, pageUrl)
    if (u && !out.includes(u)) out.push(u)
  }
  return out
}

function availabilityToStock(v: unknown): boolean | null {
  const s = str(v)
  if (!s) return null
  if (/InStock|in_stock|\bavailable\b/i.test(s)) return true
  if (/OutOfStock|SoldOut|Discontinued|PreOrder|BackOrder/i.test(s)) return false
  return null
}

type Extracted = { jsonLd?: Array<Record<string, unknown>>; microdata?: Record<string, unknown>; meta: { title?: string; description?: string; image?: string } }

function readJsonLd(ex: Extracted, pageUrl: string): ProductRead | null {
  const prod = (ex.jsonLd ?? []).find(o => {
    const t = o['@type']
    const types = Array.isArray(t) ? t : [t]
    return types.some(x => typeof x === 'string' && /product/i.test(x))
  })
  if (!prod) return null
  const offer = asObj(ci(prod, 'offers'))
  return {
    name: str(ci(prod, 'name')) ?? str(ex.meta.title) ?? '',
    description: str(ci(prod, 'description')) ?? str(ex.meta.description) ?? '',
    images: imagesFrom(ci(prod, 'image'), pageUrl).length
      ? imagesFrom(ci(prod, 'image'), pageUrl)
      : imagesFrom(ex.meta.image, pageUrl),
    price: num(ci(offer, 'price', 'lowPrice')),
    currency: str(ci(offer, 'priceCurrency')),
    inStock: availabilityToStock(ci(offer, 'availability')),
    sku: str(ci(prod, 'sku', 'isbn', 'gtin13')),
    author: str(ci(asObj(ci(prod, 'author', 'brand')), 'name')) ?? str(ci(prod, 'author', 'brand')),
  }
}

function readMicrodata(ex: Extracted, pageUrl: string): ProductRead | null {
  const md = ex.microdata
  if (!md) return null
  const offer = asObj(ci(md, 'offers'))
  // nopCommerce ships no itemprop="name" — the title exists only in <title>/og:title.
  const name = str(ci(md, 'name')) ?? str(ex.meta.title) ?? ''
  const imgs = imagesFrom(ci(md, 'image'), pageUrl)
  return {
    name,
    description: str(ci(md, 'description')) ?? str(ex.meta.description) ?? '',
    images: imgs.length ? imgs : imagesFrom(ex.meta.image, pageUrl),
    price: num(ci(offer, 'price')),
    currency: str(ci(offer, 'priceCurrency')),
    inStock: availabilityToStock(ci(offer, 'availability')),
    sku: str(ci(md, 'sku', 'isbn', 'gtin13')),
    author: null,
  }
}

const READERS: Record<string, (ex: Extracted, pageUrl: string) => ProductRead | null> = {
  jsonld: readJsonLd,
  microdata: readMicrodata,
}

// ── main ───────────────────────────────────────────────────────────────────────

Deno.serve(withErrorReporting('source-shop-crawl', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  const auth = await requireInternalOrAdmin(req, supabase)
  if (auth instanceof Response) return auth

  const runStarted = Date.now()
  try {
    const body = await req.json().catch(() => ({}))
    const sourceSlug = String(body.source_slug ?? '').trim()
    if (!sourceSlug) return jsonResponse(skippedResponse('missing_config', ['source_slug']), 200, req)

    const { data: merchant, error: mErr } = await supabase
      .from('marketplace_merchants')
      .select('slug, display_name, shop_domain, is_enabled, config')
      .eq('provider', 'crawl').eq('slug', sourceSlug).maybeSingle()
    if (mErr) return errorResponse(`merchant lookup: ${mErr.message}`, 500, req)
    if (!merchant) return jsonResponse(skippedResponse('merchant_not_found', [sourceSlug]), 200, req)
    if (merchant.is_enabled === false) return jsonResponse(skippedResponse('merchant_disabled', [sourceSlug]), 200, req)

    const cfg = (merchant.config ?? {}) as unknown as CrawlConfig
    const missing = [!cfg.sitemap && 'config.sitemap', !cfg.strategy && 'config.strategy'].filter(Boolean) as string[]
    if (missing.length) return jsonResponse(skippedResponse('missing_config', missing), 200, req)
    const reader = READERS[cfg.strategy]
    if (!reader) return jsonResponse(skippedResponse('unknown_strategy', [cfg.strategy]), 200, req)

    const shopDomain = String(merchant.shop_domain ?? '')
    if (!shopDomain) return jsonResponse(skippedResponse('missing_config', ['shop_domain']), 200, req)
    // The sitemap must belong to the registered merchant.
    try {
      const sh = new URL(cfg.sitemap).hostname.replace(/^www\./, '')
      if (sh !== shopDomain.replace(/^www\./, '')) {
        return jsonResponse(skippedResponse('sitemap_host_mismatch', [cfg.sitemap]), 200, req)
      }
    } catch { return jsonResponse(skippedResponse('invalid_sitemap_url', [cfg.sitemap]), 200, req) }

    const dryRun = body.dry_run === true
    const urls = await collectProductUrls(cfg, shopDomain)
    if (urls.length === 0) return jsonResponse({ success: true, items: 0, message: 'sitemap_empty', total_urls: 0 }, 200, req)

    let cursor = body.reset_cursor === true ? 0 : Number(cfg.crawl_cursor?.index ?? 0)
    let wraps = Number(cfg.crawl_cursor?.wraps ?? 0)
    if (!Number.isFinite(cursor) || cursor < 0 || cursor >= urls.length) cursor = 0

    const lookahead = Math.max(1, Number(body.limit ?? cfg.lookahead ?? DEFAULT_LOOKAHEAD))
    const candidates = urls.slice(cursor, cursor + lookahead)

    // Freshness skip BEFORE fetching. The expensive resource is the page fetch (1-3s
    // each), not the DB write, so filtering here is what makes a bounded run cover
    // ground. Needs ix_ingestion_staging_source_lookup to be cheap.
    const refreshAfterMs = Math.max(0, Number(cfg.refresh_after_days ?? DEFAULT_REFRESH_AFTER_DAYS)) * 86_400_000
    const keyed = candidates
      .map(u => ({ url: u, key: entityKey(u, cfg) }))
      .filter((x): x is { url: string; key: string } => !!x.key)
    const fresh = new Set<string>()
    if (refreshAfterMs > 0) {
      const cutoff = new Date(Date.now() - refreshAfterMs).toISOString()
      for (let i = 0; i < keyed.length; i += IN_FILTER_CHUNK) {
        const chunk = keyed.slice(i, i + IN_FILTER_CHUNK)
        const { data: rows } = await supabase.from('ingestion_staging')
          .select('source_entity_id, updated_at, created_at')
          .eq('source_name', sourceSlug)
          .in('source_entity_id', chunk.map(c => `${sourceSlug}:${c.key}`))
        for (const r of (rows ?? []) as Array<{ source_entity_id: string; updated_at: string | null; created_at: string | null }>) {
          const seenAt = r.updated_at ?? r.created_at
          if (seenAt && seenAt > cutoff) fresh.add(r.source_entity_id)
        }
      }
    }
    const todo = keyed.filter(k => !fresh.has(`${sourceSlug}:${k.key}`))

    // ── bounded fetch pool ─────────────────────────────────────────────────────
    const concurrency = Math.max(1, Number(cfg.concurrency ?? DEFAULT_CONCURRENCY))
    const delayMs = Math.max(0, Number(cfg.crawl_delay_ms ?? DEFAULT_CRAWL_DELAY_MS))
    const items: RawItem[] = []
    let extractFailures = 0, noPrice = 0, consumed = 0, budgetHit = false
    let next = 0
    let lastStart = 0

    const worker = async () => {
      for (;;) {
        if (Date.now() - runStarted > RUN_BUDGET_MS) { budgetHit = true; return }
        const i = next++
        if (i >= todo.length) return
        const { url, key } = todo[i]
        consumed = Math.max(consumed, i + 1)

        // Politeness: space out request STARTS across the whole pool, so
        // crawl_delay_ms means what a robots.txt Crawl-delay means.
        const wait = lastStart + delayMs - Date.now()
        lastStart = Math.max(Date.now(), lastStart + delayMs)
        if (wait > 0) await new Promise(r => setTimeout(r, wait))

        const ex = await extractContent(supabase, {
          url,
          render: cfg.render === true,
          timeoutMs: 12_000,
        })
        if (!ex) { extractFailures++; continue }

        const read = reader(ex as unknown as Extracted, url)
        if (!read || !read.name) { extractFailures++; continue }
        // A priceless row would commit (validateMarketplaceNormalized only WARNS on a
        // missing price) and render a blank price on the card. Skip instead.
        if (read.price == null) { noPrice++; continue }

        const { title, author } = splitAuthor(read.name, cfg.author_from)
        items.push({
          sourceId: `${sourceSlug}:${key}`,
          data: {
            url, isbn: read.sku, name: title, author: author ?? read.author,
            description: read.description, images: read.images,
            price: read.price, currency: read.currency ?? cfg.currency ?? null,
            availability: read.inStock, strategy: cfg.strategy,
            // Tier 1 of the post-commit tag engine reads
            // marketplace_listing_sources.raw->>product_type. 'Book' resolves there at
            // 0.95, which stops Tier 2's \bring\b / \bgag\b rules from retyping a novel.
            product_type: 'Book',
          },
        })
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, todo.length)) }, worker))

    // ── stage ──────────────────────────────────────────────────────────────────
    const businessName = cfg.business_name || merchant.display_name || shopDomain
    const subcategory = cfg.subcategory || 'Books and Art'
    const currencyFallback = normalizeCurrency(cfg.currency ?? 'USD')

    const adapter: SourceAdapter = {
      name: sourceSlug,
      entityType: 'marketplace',
      fetch: () => Promise.resolve(items),
      getSourceId: (raw: RawItem) => raw.sourceId,
      normalize(raw: RawItem): NormalizedItem {
        const d = raw.data as Record<string, unknown>
        const url = String(d.url)
        const author = str(d.author)
        return {
          entityType: 'marketplace', sourceId: raw.sourceId, sourceName: sourceSlug,
          name: String(d.name),
          description: String(d.description ?? ''),
          urls: [url],
          images: (d.images as string[]) ?? [],
          tags: [],
          metadata: {
            source_slug: sourceSlug, shop_domain: shopDomain, product_id: raw.sourceId,
            merchant_deep_link: url, merchant_domain: extractMerchantDomain(url),
            price: d.price as number,
            currency: normalizeCurrency(d.currency ?? currencyFallback),
            category: 'Books',
            // Drives the STORED generated columns subcategory_group + department.
            // marketplace_subcategory_group() is English-only, so a German label like
            // "Bücher" would fall through to 'other' — we always write the English
            // display string rather than the shop's own wording.
            subcategory,
            brand: author, brand_name: author,
            business_name: businessName,
            in_stock: d.availability as boolean | null,
            sku: d.isbn as string | null,
            handle: raw.sourceId,
            isbn: d.isbn as string | null,
            author,
            ...(cfg.lang ? { lang: cfg.lang } : {}),
          },
        }
      },
    }

    let written = 0
    if (!dryRun && items.length > 0) {
      written = await writeToStaging(supabase, adapter, items, {
        batchSize: items.length,
        pipelineRunId: body.pipeline_run_id, nodeId: body.node_id,
        targetTable: 'marketplace_listings', refresh: true,
      })
    }

    // ── advance cursor ─────────────────────────────────────────────────────────
    // Only advance past what we actually looked at. Wrapping is not a failure state:
    // it is the price/stock refresh mechanism, since writeToStaging refresh mode skips
    // unchanged payloads for free.
    const examined = fresh.size + consumed
    let nextCursor = cursor + (budgetHit ? examined : candidates.length)
    if (nextCursor >= urls.length) { nextCursor = 0; wraps += 1 }

    if (!dryRun) {
      const { error: cErr } = await supabase.from('marketplace_merchants')
        .update({
          config: {
            ...(merchant.config as Record<string, unknown>),
            crawl_cursor: { index: nextCursor, total: urls.length, wraps, updated_at: new Date().toISOString() },
          },
          last_sync_at: new Date().toISOString(),
          last_sync_status: extractFailures > 0 && items.length === 0 ? 'error' : 'ok',
          last_sync_items: written,
        })
        .eq('provider', 'crawl').eq('slug', sourceSlug)
      if (cErr) console.error(`cursor persist ${sourceSlug}:`, cErr.message)
    }

    return jsonResponse({
      success: true,
      items: dryRun ? items.length : written,
      items_total: items.length,
      items_processed: dryRun ? items.length : written,
      items_succeeded: dryRun ? items.length : written,
      items_failed: extractFailures + noPrice,
      total_urls: urls.length,
      cursor: nextCursor, wraps,
      skipped_fresh: fresh.size,
      extract_failures: extractFailures,
      skipped_no_price: noPrice,
      budget_hit: budgetHit,
      elapsed_ms: Date.now() - runStarted,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
}))
