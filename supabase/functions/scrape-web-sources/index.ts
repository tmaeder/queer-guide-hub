import { fetchPublisherDocument } from '../source-rss-news/publisher-feed.ts'
import { robotsSitemaps, sitemapLocations, sitemapPathMatchers, readScrapeBody } from './scrape-bounds.ts'
/**
 * scrape-web-sources — unified web scraper edge function
 *
 * Reads scrape_sources from the database, crawls each target using the
 * configured method, extracts structured items, and stages them into the
 * ingestion pipeline.
 *
 * Scrape methods (all run natively in the edge function, no external API):
 *   - sitemap      — Parse /sitemap.xml, discover product/page URLs, fetch & extract
 *   - native_crawl — BFS link-following crawler with depth/path limits
 *   - html_fetch   — Single-page fetch + extraction (events, wiki, timelines)
 *   - api          — REST API integration (Equaldex etc.)
 *
 * Invocation modes:
 *   { "mode": "scheduled" }                       — process all due sources
 *   { "mode": "scheduled", "content_types": [...]} — filter by content_type
 *   { "source_slug": "mr-s-leather" }             — run a single source
 *   { "source_id": "uuid" }                       — run by ID
 *   { "dry_run": true, ... }                      — extract but don't stage
 */

import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'
import { fetchPublicSourceThroughProxy } from '../_shared/public-source-proxy.ts'
import { getServiceClient, requireInternalOrAdmin, corsResponse, errorResponse, jsonResponse } from '../_shared/supabase-client.ts'
import { assertPublicHttpUrl } from '../_shared/ssrf-guard.ts'
import { scrapedEventRejectReason } from '../_shared/scraped-event-guard.ts'
import { scrapedNewsStagingSkipReason } from '../_shared/scraped-news-staging-guard.ts'
import { trimTrailingSlashes } from '../_shared/trim-trailing-slashes.ts'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ScrapeSource {
  id: string
  slug: string
  name: string
  url: string
  content_type: string
  target_table: string
  scrape_method: string
  scrape_config: Record<string, unknown>
  schedule_interval_hours: number
  is_enabled: boolean
  priority: number
  last_run_at: string | null
  last_success_at: string | null
  consecutive_failures: number
  rate_limit_ms: number
  max_pages_per_run: number
  user_agent: string
  total_runs: number
  total_items_fetched: number
}

interface ExtractedItem {
  name: string
  description?: string
  price?: string
  price_amount?: number
  currency?: string
  image_url?: string
  images?: string[]
  url?: string
  category?: string
  brand?: string
  // Events
  title?: string
  start_date?: string
  end_date?: string
  city?: string
  country?: string
  venue_name?: string
  event_type?: string
  // Generic
  raw_data: Record<string, unknown>
}

// ─── Constants ──────────────────────────────────────────────────────────────

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
]

const MAX_SOURCES_PER_RUN = 1   // process only 1 per invocation
const DB_FETCH_LIMIT = 50       // over-fetch so in-memory interval filter has enough candidates
const MAX_ITEMS_PER_SOURCE = 500
const WALL_CLOCK_LIMIT_MS = 40_000
const MAX_PAGES_PER_INVOCATION = 25

// ─── HTML Fetch ─────────────────────────────────────────────────────────────

let fetchCounter = 0

async function fetchPage(url: string, userAgent: string, attempt = 0): Promise<string> {
  assertPublicHttpUrl(url) // source.url + crawled links are operator/DB-supplied — refuse private targets
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    fetchCounter++
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent || USER_AGENTS[fetchCounter % USER_AGENTS.length],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: controller.signal,
    })
    if (response.status === 403 && url === 'https://www.travelgay.com/gay-pride-calendar') {
      await response.body?.cancel()
      return await fetchPublisherDocument(url, controller.signal, { workerUrl: Deno.env.get('EXTRACT_WORKER_URL'), workerSecret: Deno.env.get('EXTRACT_WORKER_SECRET') ?? Deno.env.get('INTERNAL_INVOKE_SECRET') })
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await readScrapeBody(response, /xml/i.test(response.headers.get('content-type') || '') ? 4_000_000 : 1_000_000)
  } catch (err) {
    clearTimeout(timeout)
    if (attempt < 2) {
      await delay(1000 * Math.pow(2, attempt))
      return fetchPage(url, userAgent, attempt + 1)
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

// ─── Sitemap Crawl (native, no external API) ────────────────────────────────

export async function crawlViaSitemap(
  source: ScrapeSource,
): Promise<{ pages: { url: string; html: string }[]; error?: string }> {
  const config = source.scrape_config
  const maxPages = Math.min((config.limit as number) || 200, source.max_pages_per_run, MAX_PAGES_PER_INVOCATION)
  const includePatterns = (config.include_paths as string[]) || []
  const baseUrl = trimTrailingSlashes(source.url)
  const pages: { url: string; html: string }[] = []

  // 1. Try to find and parse sitemap(s)
  const configuredSitemap = typeof config.sitemap_url === 'string' ? config.sitemap_url : null
  if (configuredSitemap && new URL(configuredSitemap).origin !== new URL(baseUrl).origin) {
    return { pages: [], error: 'Configured sitemap must belong to the source origin' }
  }
  const sitemapUrls = configuredSitemap ? [configuredSitemap] : await discoverSitemapUrls(baseUrl, source.user_agent)
  if (sitemapUrls.length === 0) {
    return { pages: [], error: `No sitemap found at ${baseUrl}` }
  }

  // 2. Collect product URLs from sitemaps
  const productUrls: string[] = []
  // One discovery budget covers every robots.txt root and its descendants.
  const visited = new Set<string>()
  for (const sitemapUrl of sitemapUrls) {
    if (productUrls.length >= maxPages || visited.size >= 8) break
    const urls = await parseSitemap(sitemapUrl, source.user_agent, includePatterns, maxPages - productUrls.length, visited, config.sitemap_require_images === true)
    productUrls.push(...urls)
  }

  if (productUrls.length === 0) {
    return { pages: [], error: 'Sitemap found but no matching URLs' }
  }

  console.log(`[${source.slug}] Sitemap: found ${productUrls.length} URLs to scrape`)

  // 3. Fetch each product page with rate limiting
  const rateLimitMs = source.rate_limit_ms || 2000
  const deadline = Date.now() + WALL_CLOCK_LIMIT_MS
  for (const url of productUrls.slice(0, maxPages)) {
    if (Date.now() > deadline) {
      console.log(`[${source.slug}] Sitemap: wall-clock limit reached after ${pages.length} pages`)
      break
    }
    try {
      const html = await fetchPage(url, source.user_agent)
      pages.push({ url, html })
    } catch (err) {
      console.warn(`[${source.slug}] Failed to fetch ${url}: ${(err as Error).message}`)
    }
    if (pages.length < productUrls.length) {
      await delay(rateLimitMs)
    }
  }

  return { pages }
}

async function discoverSitemapUrls(baseUrl: string, userAgent: string): Promise<string[]> {
  // Storefront registrations may point at a locale or collection; discovery
  // files belong to the site root, not /collections/example/robots.txt.
  baseUrl = new URL(baseUrl).origin
  const candidates = [
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap_index.xml`,
    `${baseUrl}/sitemap_products.xml`,
    `${baseUrl}/sitemap-index.xml`,
  ]

  // Also check robots.txt for sitemap directives
  try {
    const robotsTxt = await fetchPage(`${baseUrl}/robots.txt`, userAgent)
    const sitemapLines = robotsSitemaps(robotsTxt)
    if (sitemapLines.length > 0) return sitemapLines
  } catch {
    // robots.txt not found — continue with candidates
  }

  // Try each candidate URL
  for (const url of candidates) {
    try {
      const xml = await fetchPage(url, userAgent)
      if (xml.includes('<urlset') || xml.includes('<sitemapindex')) {
        return [url]
      }
    } catch {
      // not found — try next
    }
  }

  return []
}

async function parseSitemap(
  sitemapUrl: string,
  userAgent: string,
  includePatterns: string[],
  limit: number,
  visited = new Set<string>(),
  requireImages = false,
): Promise<string[]> {
  const urls: string[] = []
  if (limit <= 0 || visited.has(sitemapUrl) || visited.size >= 8) return urls
  visited.add(sitemapUrl)

  try {
    const xml = await fetchPage(sitemapUrl, userAgent)
    // Handle sitemap index (contains links to other sitemaps)
    const childSitemaps = [...sitemapLocations(xml, 'sitemap', 256)]
    if (childSitemaps.length > 0) {
      // Filter for product-related sitemaps
      const productSitemaps = childSitemaps.filter(url =>
        /product|collection|shop|catalog|item/i.test(url)
      )
      // If no product-specific sitemaps found, use all of them
      const targetSitemaps = productSitemaps.length > 0 ? productSitemaps : childSitemaps.slice(0, 5)

      for (const childUrl of targetSitemaps) {
        if (urls.length >= limit || visited.size >= 8) break
        const childUrls = await parseSitemap(childUrl, userAgent, includePatterns, limit - urls.length, visited, requireImages)
        urls.push(...childUrls)
        if (urls.length < limit && visited.size < 8) await delay(500) // only wait when another fetch can start
      }
      return urls
    }

    // Stream locations and stop at the requested count. Building a DOM for
    // a merchant's entire catalogue exhausted the worker before its first page.
    const matchers = sitemapPathMatchers(includePatterns)
    for (const url of sitemapLocations(xml, 'url', Number.POSITIVE_INFINITY, requireImages)) {
      let path: string
      try { path = new URL(url).pathname } catch { continue }
      if (matchers.length && !matchers.some(pattern => pattern.test(path))) continue
      urls.push(url)
      if (urls.length >= limit) break
    }
  } catch (err) {
    console.error(`Failed to parse sitemap ${sitemapUrl}:`, (err as Error).message)
  }

  return urls
}

// ─── Native Crawl (BFS link-following, no external API) ─────────────────────

export async function crawlNative(
  source: ScrapeSource,
): Promise<{ pages: { url: string; html: string }[]; error?: string }> {
  const config = source.scrape_config
  const maxPages = Math.min((config.limit as number) || 100, source.max_pages_per_run, MAX_PAGES_PER_INVOCATION)
  const maxDepth = (config.max_depth as number) || 3
  const includePatterns = (config.include_paths as string[]) || []
  const excludePatterns = (config.exclude_paths as string[]) || [
    '/cart*', '/checkout*', '/account*', '/login*', '/register*',
    '/privacy*', '/terms*', '/cookie*', '/faq*', '/contact*',
    '*.pdf', '*.jpg', '*.png', '*.gif', '*.css', '*.js',
  ]

  const allowSubdomains = config.allow_subdomains === true
  const visited = new Set<string>()
  const pages: { url: string; html: string }[] = []
  const queue: { url: string; depth: number }[] = [{ url: source.url, depth: 0 }]

  const rateLimitMs = source.rate_limit_ms || 2000
  const deadline = Date.now() + WALL_CLOCK_LIMIT_MS

  while (queue.length > 0 && pages.length < maxPages) {
    if (Date.now() > deadline) {
      console.log(`[${source.slug}] Native crawl: wall-clock limit reached after ${pages.length} pages`)
      break
    }
    const { url, depth } = queue.shift()!

    // Normalize URL (remove fragments, trailing slashes)
    const normalizedUrl = normalizeUrl(url)
    if (visited.has(normalizedUrl)) continue
    visited.add(normalizedUrl)

    // Check URL is on same origin
    try {
      if (!allowedCrawlUrl(normalizedUrl, source.url, allowSubdomains)) continue
    } catch { continue }

    // Check exclude patterns
    const pathname = new URL(normalizedUrl).pathname
    const globToRegex = (pattern: string): RegExp => {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const wildcardPattern = escaped.replace(/\\\*/g, '.*')
      return new RegExp(wildcardPattern, 'i')
    }
    if (excludePatterns.some(p => {
      const regex = globToRegex(p)
      return regex.test(pathname)
    })) continue

    // Fetch page
    try {
      const html = await fetchPage(normalizedUrl, source.user_agent)

      // Only keep pages matching include patterns (if set) for extraction
      const matchesInclude = includePatterns.length === 0 || includePatterns.some(p => {
        const regex = globToRegex(p)
        return regex.test(pathname)
      })

      if (matchesInclude) {
        pages.push({ url: normalizedUrl, html })
      }

      // Discover links for further crawling (up to maxDepth)
      if (depth < maxDepth) {
        const $ = cheerio.load(html)
        const preferred: { url: string; depth: number }[] = []
        const other: { url: string; depth: number }[] = []
        const hrefs = config.structured_product_links === true
          ? structuredProductLinks(html, normalizedUrl)
          : $(typeof config.link_selector === 'string' ? config.link_selector : 'a[href]').map((_, el) => $(el).attr('href')).get()
        for (const href of hrefs) {
          if (!href) continue

          let absoluteUrl: string
          try {
            absoluteUrl = new URL(href, normalizedUrl).href
          } catch { continue }

          // Only follow links on same origin
          if (!allowedCrawlUrl(absoluteUrl, source.url, allowSubdomains)) continue

          const nextNorm = normalizeUrl(absoluteUrl)
          if (visited.has(nextNorm)) continue
          const matches = includePatterns.length === 0 || includePatterns.some(p => globToRegex(p).test(new URL(nextNorm).pathname))
          ;(matches ? preferred : other).push({ url: nextNorm, depth: depth + 1 })
        }
        // Navigation links must not fill the entire bounded queue before the
        // product/event links later in a catalogue page have been considered.
        queue.unshift(...preferred.slice(0, maxPages * 3))
        for (const next of other) if (queue.length < maxPages * 3) queue.push(next)
        queue.splice(maxPages * 3)
      }

      // Rate limit
      await delay(rateLimitMs)
    } catch (err) {
      console.warn(`[${source.slug}] Crawl failed for ${normalizedUrl}: ${(err as Error).message}`)
    }
  }

  console.log(`[${source.slug}] Native crawl: visited ${visited.size} URLs, kept ${pages.length} pages`)
  return { pages }
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    // Remove common tracking params
    u.searchParams.delete('utm_source')
    u.searchParams.delete('utm_medium')
    u.searchParams.delete('utm_campaign')
    u.searchParams.delete('ref')
    u.searchParams.delete('fbclid')
    u.searchParams.delete('gclid')
    // Normalize trailing slash
    let path = u.pathname
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1)
    }
    u.pathname = path
    return u.href
  } catch {
    return url
  }
}

export function allowedCrawlUrl(raw: string, sourceUrl: string, allowSubdomains = false): boolean {
  try {
    const url = new URL(raw)
    const source = new URL(sourceUrl)
    if (url.username || url.password) return false
    if (url.origin === source.origin) return true
    const host = source.hostname.replace(/^www\./, '')
    return allowSubdomains && url.protocol === source.protocol && url.port === source.port
      && (url.hostname === host || url.hostname.endsWith(`.${host}`))
  } catch { return false }
}

// A published ItemList can expose real product links even when the visible
// catalogue is rendered by JavaScript. List metadata is never itself a product.
export function structuredProductLinks(html: string, pageUrl: string): string[] {
  const $ = cheerio.load(html)
  const links = new Set<string>()
  const pending: unknown[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try { pending.push(JSON.parse($(el).text())) } catch { /* malformed schema */ }
  })
  for (let visited = 0; pending.length && visited < 500 && links.size < 100; visited++) {
    const node = pending.shift()
    if (Array.isArray(node)) { pending.push(...node.slice(0, 100)); continue }
    if (!node || typeof node !== 'object') continue
    const value = node as Record<string, unknown>
    if (value['@type'] === 'ItemList' && Array.isArray(value.itemListElement)) {
      for (const item of value.itemListElement.slice(0, 100)) {
        if (!item || typeof item !== 'object' || typeof item.url !== 'string') continue
        try {
          const url = new URL(item.url, pageUrl)
          if (url.origin === new URL(pageUrl).origin) links.add(url.href)
        } catch { /* invalid item */ }
      }
    }
    if (value['@graph']) pending.push(value['@graph'])
    if (value.mainEntity) pending.push(value.mainEntity)
  }
  return [...links].slice(0, 100)
}

// ─── Product Extraction ─────────────────────────────────────────────────────

export function extractProductsFromPage(
  html: string,
  pageUrl: string,
  source: ScrapeSource,
): ExtractedItem[] {
  const items: ExtractedItem[] = []
  const $ = cheerio.load(html)

  // 1. JSON-LD Product structured data
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).html() || '{}')
      const nodes = Array.isArray(parsed) ? parsed : parsed['@graph'] ? parsed['@graph'] : [parsed]
      for (const node of nodes) {
        if (items.length >= MAX_ITEMS_PER_SOURCE) break
        if (!node || typeof node !== 'object' || !node['@type']) continue
        const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']]
        // Modern Shopify themes publish a ProductGroup whose explicit variants
        // carry the actual prices and offer URLs. The group is not another item.
        if (types.includes('ProductGroup')) {
          if (Array.isArray(node.hasVariant)) {
            for (const variant of node.hasVariant.slice(0, MAX_ITEMS_PER_SOURCE - items.length)) {
              if (!variant || typeof variant !== 'object') continue
              const variantTypes = Array.isArray(variant['@type']) ? variant['@type'] : [variant['@type']]
              if (!variantTypes.some((t: string) => t === 'Product' || t === 'IndividualProduct')) continue
              const variantOffer = Array.isArray(variant.offers) ? variant.offers[0] : variant.offers
              nodes.push({ ...node, ...variant, hasVariant: undefined, offers: variant.offers,
                url: variant.url || variantOffer?.url || node.url || pageUrl })
            }
          }
          continue
        }
        if (!types.some((t: string) => t === 'Product' || t === 'IndividualProduct')) continue

        const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers
        const price = offers?.price ? parseFloat(offers.price) : undefined
        const currency = offers?.priceCurrency || 'USD'

        const image = typeof node.image === 'string' ? node.image
          : Array.isArray(node.image) ? node.image[0]
          : node.image?.url || node.image?.contentUrl || undefined

        items.push({
          name: node.name || 'Unknown Product',
          description: (node.description || '').slice(0, 1000),
          price: price ? `${currency} ${price}` : undefined,
          price_amount: price,
          currency,
          image_url: image,
          images: Array.isArray(node.image) ? node.image.slice(0, 5) : image ? [image] : [],
          url: node.url || pageUrl,
          brand: typeof node.brand === 'string' ? node.brand : node.brand?.name || source.name,
          category: node.category || undefined,
          raw_data: node,
        })
      }
    } catch {
      // skip bad JSON-LD
    }
  })

  // 2. Open Graph product meta tags (fallback if no JSON-LD)
  if (items.length === 0) {
    const ogTitle = $('meta[property="og:title"]').attr('content')
    const ogPrice = $('meta[property="product:price:amount"]').attr('content')
    const ogCurrency = $('meta[property="product:price:currency"]').attr('content') || 'USD'
    const ogImage = $('meta[property="og:image"]').attr('content')
    const ogDesc = $('meta[property="og:description"]').attr('content')

    if (ogTitle && ogPrice) {
      items.push({
        name: ogTitle,
        description: ogDesc?.slice(0, 1000),
        price: `${ogCurrency} ${ogPrice}`,
        price_amount: parseFloat(ogPrice),
        currency: ogCurrency,
        image_url: ogImage || undefined,
        images: ogImage ? [ogImage] : [],
        url: pageUrl,
        brand: source.name,
        raw_data: { og_title: ogTitle, og_price: ogPrice, og_currency: ogCurrency },
      })
    }
  }

  // 3. Microdata Product itemscope
  $('[itemscope][itemtype*="Product"]').each((_, el) => {
    const $el = $(el)
    // Related-product scopes must retain their own names, prices and URLs.
    const property = (key: string) => $el.find(`[itemprop="${key}"]`).filter((_, node) =>
      $(node).closest('[itemscope][itemtype*="Product"]')[0] === el).first()
    const nameEl = property('name')
    const name = (nameEl.attr('content') || nameEl.text()).trim()
    if (!name) return

    // Skip if already found via JSON-LD
    if (items.some(i => i.name.toLowerCase() === name.toLowerCase())) return

    const desc = property('description').text().trim()
    const priceEl = property('price')
    const priceVal = priceEl.attr('content') || priceEl.text().trim()
    const currency = property('priceCurrency').attr('content') || 'USD'
    const imageEl = property('image')
    const image = imageEl.attr('src') || imageEl.attr('content') || undefined
    const urlEl = property('url')
    let productUrl: string
    try {
      const url = new URL(urlEl.attr('href') || urlEl.attr('content') || $el.attr('itemid') || nameEl.closest('a').attr('href') || pageUrl, pageUrl)
      if (!['https:', 'http:'].includes(url.protocol)) return
      productUrl = url.href
    } catch { return }

    items.push({
      name,
      description: desc.slice(0, 1000),
      price: priceVal ? `${currency} ${priceVal}` : undefined,
      price_amount: priceVal ? parseFloat(priceVal) : undefined,
      currency,
      image_url: image,
      images: image ? [image] : [],
      url: productUrl,
      brand: source.name,
      raw_data: { microdata: true, url: productUrl },
    })
  })

  return items
}

// ─── Event Extraction ───────────────────────────────────────────────────────

export function extractEventsFromPage(
  html: string,
  pageUrl: string,
  source: ScrapeSource,
): ExtractedItem[] {
  const items: ExtractedItem[] = []
  const $ = cheerio.load(html)
  const config = source.scrape_config

  // 1. JSON-LD Event
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).html() || '{}')
      const nodes = Array.isArray(parsed) ? parsed : parsed['@graph'] ? parsed['@graph'] : [parsed]
      for (const node of nodes) {
        const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']]
        if (!types.some((t: string) => typeof t === 'string' && t.toLowerCase().includes('event'))) continue

        if (source.slug === 'travelgay-pride') {
          const titleYear = /\b(20\d{2})\b/.exec(node.name || '')?.[1]
          if (node.month || titleYear && ![String(node.startDate).slice(0,4), String(node.endDate).slice(0,4)].includes(titleYear)) continue
        }
        const loc = node.location || {}
        const addr = typeof loc === 'string' ? null : (loc.address || {})
        const image = typeof node.image === 'string' ? node.image
          : Array.isArray(node.image) ? node.image[0]
          : node.image?.url || undefined

        items.push({
          title: node.name || node.headline || 'Untitled Event',
          name: node.name || node.headline || 'Untitled Event',
          description: (node.description || '').slice(0, 1000),
          start_date: node.startDate ? new Date(node.startDate).toISOString() : undefined,
          end_date: node.endDate ? new Date(node.endDate).toISOString() : undefined,
          venue_name: source.slug === 'travelgay-pride' && loc.name === 'TBA' ? undefined : typeof loc === 'string' ? loc : loc.name || undefined,
          city: addr?.addressLocality || undefined,
          country: addr?.addressCountry || undefined,
          event_type: (config.event_type as string) || 'other',
          url: node.url || pageUrl,
          image_url: image,
          images: image ? [image] : [],
          raw_data: node,
        })
      }
    } catch {
      // skip
    }
  })

  // 2. HTML card extraction using configured selectors
  const selectors = (config.selectors || {}) as Record<string, string>
  if (selectors.card) {
    const seenTitles = new Set(items.map(i => (i.title || i.name || '').toLowerCase()))
    const $cards = $(selectors.card)

    $cards.each((_, el) => {
      const $el = $(el)
      const title = (selectors.title
        ? $el.find(selectors.title).first().text().trim()
        : $el.find('h2, h3').first().text().trim())

      if (!title || title.length < 3 || seenTitles.has(title.toLowerCase())) return
      seenTitles.add(title.toLowerCase())

      const $date = selectors.date ? $el.find(selectors.date).first() : $el.find('time[datetime]').first()
      const dateText = $date.attr('datetime') || $date.attr('content') || $date.text().trim()
      const location = selectors.location
        ? $el.find(selectors.location).first().text().trim()
        : ''
      const desc = selectors.description
        ? $el.find(selectors.description).first().text().trim()
        : $el.find('p, .description, .excerpt').first().text().trim()
      const image = $el.find('img').first().attr('src') || undefined
      const link = ($el.is('a') ? $el.attr('href') : $el.find('a').first().attr('href')) || undefined

      const dates = publishedEventDates(dateText)

      items.push({
        title,
        name: title,
        description: desc.slice(0, 1000) || undefined,
        start_date: dates.start,
        end_date: dates.end,
        city: location || undefined,
        event_type: (config.event_type as string) || 'other',
        url: link && link.startsWith('http') ? link : link ? new URL(link, source.url).href : pageUrl,
        image_url: image && image.startsWith('http') ? image : image ? new URL(image, source.url).href : undefined,
        images: [],
        raw_data: { html_card: true, date_text: dateText, location_text: location },
      })
    })
  }

  return items
}

export function publishedEventDates(text: string): { start?: string; end?: string } {
  // Fully specified dates only: never inherit a year or turn 0026 into 2026.
  const month = '(?:January|February|March|April|May|June|July|August|September|October|November|December)'
  const english = `${month}\\s+\\d{1,2},?\\s+20\\d{2}`
  const iso = '20\\d{2}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2}(?::\\d{2}(?:[.]\\d+)?)?(?:Z|[+-]\\d{2}:\\d{2}))?'
  const match = new RegExp(`^\\s*(${english})(?:\\s*[-–]\\s*(${english}))?\\s*$`, 'i').exec(text)
    || new RegExp(`^\\s*(${iso})(?:\\s+[-–]\\s+(${iso}))?\\s*$`, 'i').exec(text)
  if (!match) return {}
  const parse = (value: string) => new Date(/^20\d{2}-/.test(value) ? value : `${value} UTC`)
  const start = parse(match[1])
  const end = match[2] ? parse(match[2]) : null
  if (!Number.isFinite(start.getTime()) || end && (!Number.isFinite(end.getTime()) || end < start)) return {}
  return { start: start.toISOString(), ...(end ? { end: end.toISOString() } : {}) }
}

export function extractCityList(html: string, pageUrl: string, source: ScrapeSource): ExtractedItem[] {
  const $ = cheerio.load(html)
  const selectors = (source.scrape_config.selectors || {}) as Record<string, string>
  const items: ExtractedItem[] = []
  const seen = new Set<string>()
  $(selectors.card || 'a:has(h4)').each((_, el) => {
    if (items.length >= MAX_ITEMS_PER_SOURCE) return false
    const card = $(el)
    const name = (card.attr('aria-label') || card.find(selectors.name || 'h2,h3,h4').first().text()).trim()
    const href = card.is('a') ? card.attr('href') : card.find('a[href]').first().attr('href')
    if (!name || !href || seen.has(name.toLowerCase())) return
    const url = new URL(href, pageUrl)
    if (!['https:', 'http:'].includes(url.protocol)) return
    if (source.slug === 'gaycities-places' && (!/^[^.]+[.]gaycities[.]com$/.test(url.hostname) || ['www','events','blog'].includes(url.hostname.split('.')[0]))) return
    seen.add(name.toLowerCase())
    const countryByHost = (source.scrape_config.country_by_host || {}) as Record<string, string>
    const country = (selectors.country ? card.find(selectors.country).first().text().trim() : '') || countryByHost[url.hostname]
    items.push({ name, city: name, country: country || undefined, url: url.href,
      raw_data: { city_list: true, source_url: pageUrl } })
  })
  return items
}

// ─── Wiki Table Extraction ──────────────────────────────────────────────────

function extractWikiTable(
  html: string,
  pageUrl: string,
  source: ScrapeSource,
): ExtractedItem[] {
  const items: ExtractedItem[] = []
  const $ = cheerio.load(html)
  const config = source.scrape_config
  const selectors = (config.selectors || {}) as Record<string, unknown>

  const tableSelector = (selectors.table as string) || 'table.wikitable'
  const $tables = $(tableSelector)

  $tables.each((_, table) => {
    const $rows = $(table).find('tr')
    $rows.each((i, row) => {
      if (i === 0) return // skip header
      const $cells = $(row).find('td, th')
      if ($cells.length < 2) return

      const nameCol = (selectors.name_col as number) ?? (selectors.title_col as number) ?? 0
      const cityCol = (selectors.city_col as number) ?? 1
      const countryCol = (selectors.country_col as number) ?? 2
      const dateCol = (selectors.date_col as number) ?? -1

      const name = $cells.eq(nameCol).text().trim()
      const city = $cells.eq(cityCol).text().trim()
      const country = cityCol !== countryCol && $cells.length > countryCol
        ? $cells.eq(countryCol).text().trim()
        : ''

      if (!name || name.length < 2) return

      let dateStr: string | undefined
      if (dateCol >= 0 && $cells.length > dateCol) {
        const raw = $cells.eq(dateCol).text().trim()
        try {
          const d = new Date(raw)
          if (!isNaN(d.getTime())) dateStr = d.toISOString()
        } catch { /* ignore */ }
      }

      const link = $cells.eq(nameCol).find('a').first().attr('href')
      const url = link
        ? (link.startsWith('http') ? link : `https://en.wikipedia.org${link}`)
        : pageUrl

      if (source.content_type === 'events') {
        items.push({
          title: name,
          name,
          city,
          country,
          start_date: dateStr,
          event_type: (config.event_type as string) || 'other',
          url,
          raw_data: { wiki_table: true, row_index: i },
        })
      } else {
        // queer_villages or cities
        items.push({
          name,
          city,
          country,
          description: `${name} in ${city}${country ? ', ' + country : ''}`,
          url,
          raw_data: { wiki_table: true, row_index: i },
        })
      }
    })
  })

  return items
}

// ─── Wiki List Extraction (heading + ul/li structure, e.g. WNBR) ──────────

export function extractWikiList(
  html: string,
  pageUrl: string,
  source: ScrapeSource,
): ExtractedItem[] {
  const items: ExtractedItem[] = []
  const $ = cheerio.load(html)
  const config = source.scrape_config
  const skipHeadings = new Set(['contents', 'references', 'see also', 'notes', 'external links', 'further reading'])

  let currentCountry = ''
  const $nodes = $('.mw-parser-output').first().length ? $('.mw-parser-output').first().find('h2, h3, ul > li') : $('h2, h3, ul > li')
  $nodes.each((_, el) => {
    const tag = el.tagName.toLowerCase()
    if (tag === 'h2' || tag === 'h3') {
      const text = $(el).find('.mw-headline').text().trim() || $(el).text().replace(/\[edit\]/gi, '').trim()
      currentCountry = text && !skipHeadings.has(text.toLowerCase()) ? text : ''
      return
    }
    if (tag === 'li' && currentCountry) {
      if ($(el).find('li').length) return
      const link = $(el).find('a[href]').filter((_, a) => $(a).text().trim().length >= 2 && !/^(?:File|Image):/i.test(($(a).attr('title') || ''))).first()
      const city = link.text().trim()
      if (!city || city.length < 2) return
      const rawText = $(el).text().trim()
      const currentRide = $(el).clone()
      currentRide.find('.previous-rides').remove()

      if (source.content_type === 'events') {
        items.push({
          title: `${(config.event_type as string) || 'Event'} - ${city}`,
          name: `${(config.event_type as string) || 'Event'} - ${city}`,
          city,
          country: currentCountry,
          event_type: (config.event_type as string) || 'other',
          start_date: publishedWikiRideDate(currentRide.text()),
          description: rawText.slice(0, 500) || undefined,
          url: link.attr('href')
            ? new URL(link.attr('href')!, pageUrl).href
            : pageUrl,
          raw_data: { wiki_list: true, raw_text: rawText },
        })
      } else {
        items.push({
          name: city,
          city,
          country: currentCountry,
          description: rawText.slice(0, 500) || undefined,
          url: link.attr('href')
            ? new URL(link.attr('href')!, pageUrl).href
            : pageUrl,
          raw_data: { wiki_list: true },
        })
      }
    }
  })

  return items
}

// ─── Wiki Country Tables (per-country wikitables, country from heading) ────

export function extractWikiCountryTables(
  html: string,
  pageUrl: string,
  source: ScrapeSource,
): ExtractedItem[] {
  const items: ExtractedItem[] = []
  const $ = cheerio.load(html)
  const config = source.scrape_config
  const selectors = (config.selectors || {}) as Record<string, unknown>
  const skipHeadings = new Set(['contents', 'references', 'see also', 'notes', 'external links', 'further reading'])

  const tableSelector = (selectors.table as string) || 'table.wikitable'

  $(tableSelector).each((_, table) => {
    // Find country from preceding heading
    let country = ''
    let prev = $(table).prev()
    while (prev.length) {
      const tag = prev[0]?.tagName.toLowerCase()
      if (tag === 'h2' || tag === 'h3' || prev.is('.mw-heading')) {
        const heading = prev.is('.mw-heading') ? prev.find('h2,h3').first() : prev
        country = heading.find('.mw-headline').text().trim() || heading.text().replace(/\[edit\]/gi, '').trim()
        break
      }
      prev = prev.prev()
    }
    if (!country || skipHeadings.has(country.toLowerCase())) return

    const nameCol = (selectors.name_col as number) ?? 0
    const cityCol = (selectors.city_col as number) ?? 1

    $(table).find('tr').each((i, row) => {
      if (i === 0) return
      const $cells = $(row).find('td, th')
      if ($cells.length < 2) return

      const name = $cells.eq(nameCol).text().trim()
      const city = $cells.eq(cityCol).text().trim()
      if (!name || name.length < 2) return

      const link = $cells.eq(nameCol).find('a').first().attr('href')

      items.push({
        name,
        city: city || undefined,
        country,
        description: `${name} in ${city}${country ? ', ' + country : ''}`,
        url: link
          ? (link.startsWith('http') ? link : `https://en.wikipedia.org${link}`)
          : pageUrl,
        raw_data: { wiki_country_table: true },
      })
    })
  })

  return items
}

// Only dates explicitly published before the previous-rides archive qualify.
// Unknown/cancelled/unconfirmed dates remain unknown rather than being invented.
export function publishedWikiRideDate(text: string): string | undefined {
  const current = text.split(/\(\s*Previous rides|Previous rides:/i)[0]
  if (/\b(cancelled|canceled|unconfirmed|proposed|TBC|TBA)\b/i.test(current)) return
  const date = /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/i.exec(current)
  if (!date) return
  const value = new Date(`${date[1]} ${date[2]} ${date[3]} 00:00:00 UTC`)
  if (Number.isFinite(value.getTime()) && value.getUTCDate() === Number(date[1])) return value.toISOString()
}

// ─── Timeline Extraction ────────────────────────────────────────────────────

function extractTimelineItems(
  html: string,
  pageUrl: string,
  source: ScrapeSource,
): ExtractedItem[] {
  const items: ExtractedItem[] = []
  const $ = cheerio.load(html)
  const selectors = (source.scrape_config.selectors || {}) as Record<string, string>

  const itemSelector = selectors.item || '.timeline-item, article'
  $(itemSelector).each((_, el) => {
    const $el = $(el)
    const title = (selectors.title ? $el.find(selectors.title).first().text().trim() : $el.find('h2, h3').first().text().trim())
    const dateText = selectors.date ? $el.find(selectors.date).first().text().trim() : ''
    const desc = selectors.description ? $el.find(selectors.description).first().text().trim() : $el.find('p').first().text().trim()
    const link = $el.find('a').first().attr('href')

    if (!title || title.length < 5) return

    let parsedDate: string | undefined
    if (dateText) {
      try {
        const d = new Date(dateText)
        if (!isNaN(d.getTime())) parsedDate = d.toISOString()
      } catch { /* ignore */ }
    }

    items.push({
      title,
      name: title,
      description: desc.slice(0, 1000) || undefined,
      start_date: parsedDate,
      url: link && link.startsWith('http') ? link : link ? new URL(link, source.url).href : pageUrl,
      raw_data: { timeline: true, date_text: dateText },
    })
  })

  return items
}

// ─── Equaldex timeline (equaldex.com/timeline[/year]) ──────────────────────
// DOM: <div class="timeline_year" id="YYYY"> … <li class="timeline_item">
//   <div class="timeline_date">September 17</div>   (month+day only; ABSENT on
//     items sharing the previous item's date — carry it forward)
//   <div class="timeline_info">
//     <div><div class="flag">…</div><a href="/region/x">Region</a>[, <a>…</a>]</div>
//     <div><b>Right</b> becomes <b>status</b>.</div>
//     <div class="subtle">long description</div>
//   </div>
// The generic timeline extractor produced garbage here: its `.timeline_info a`
// title selector grabs the REGION link, the year-less date parses to 2001, and
// `.timeline_info` text() concatenates flag+region+event+description.
function extractEqualdexTimeline(html: string, pageUrl: string): ExtractedItem[] {
  const items: ExtractedItem[] = []
  const $ = cheerio.load(html)

  // The item <ul>s are SIBLINGS of the .timeline_year header, not children —
  // walk both in document order and carry the current year (+ last date) along.
  let year = 0
  let lastDate: string | undefined
  $('.timeline_year, li.timeline_item').each((_, el) => {
    const $el = $(el)
    if ($el.hasClass('timeline_year')) {
      year = Number($el.attr('id') || $el.find('h2').first().text().trim()) || 0
      lastDate = undefined
      return
    }
    if (!year || year < 1000) return

    const dateText = $el.find('.timeline_date').first().text().trim()
    if (dateText) {
      const d = new Date(`${dateText} ${year} UTC`)
      if (!isNaN(d.getTime())) lastDate = d.toISOString()
    }

    const $info = $el.children('.timeline_info').first()
    const $blocks = $info.children('div')
    const regions = $blocks.eq(0).find('a').map((_, a) => $(a).text().trim()).get().filter(Boolean)
    const event = $blocks.eq(1).text().trim().replace(/\.\s*$/, '')
    const detail = $info.find('.subtle').first().text().trim()
    if (!event || event.length < 5) return

    const regionLink = $blocks.eq(0).find('a').first().attr('href')
    items.push({
      title: regions.length ? `${regions.join(', ')}: ${event}` : event,
      name: event,
      description: detail || event,
      start_date: lastDate,
      country: regions.length ? regions[regions.length - 1] : undefined,
      url: regionLink ? new URL(regionLink, pageUrl).href : pageUrl,
      raw_data: {
        equaldex_timeline: true, year, date_text: dateText || null,
        regions, event,
      },
    })
  })

  return items
}

// ─── API Extraction (Equaldex) ──────────────────────────────────────────────

async function fetchFromApi(source: ScrapeSource): Promise<ExtractedItem[]> {
  const config = source.scrape_config
  const apiBase = (config.api_base as string) || source.url
  const apiKeyEnv = config.api_key_env as string
  const apiKey = apiKeyEnv ? Deno.env.get(apiKeyEnv) : undefined
  const items: ExtractedItem[] = []

  const endpoints = (config.endpoints as string[]) || ['/']

  for (const endpoint of endpoints) {
    const url = `${apiBase}${endpoint}`
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

    try {
      assertPublicHttpUrl(url)
      const res = await fetch(url, { headers })
      if (!res.ok) {
        console.error(`API fetch failed for ${url}: ${res.status}`)
        continue
      }

      const data = await res.json()

      // Equaldex-specific: extract regions
      if (config.extract === 'equaldex_regions') {
        const regions = data.regions || data.data?.regions || (Array.isArray(data) ? data : [])
        for (const region of regions) {
          items.push({
            name: region.name || region.region_name || 'Unknown',
            description: region.description || undefined,
            country: region.name || region.region_name,
            url: `https://www.equaldex.com/region/${region.id || region.slug || ''}`,
            raw_data: region,
          })
        }
      } else {
        // Generic API data
        const records = Array.isArray(data) ? data : data.data || data.results || []
        for (const record of records) {
          items.push({
            name: record.name || record.title || 'Unknown',
            description: record.description || record.summary || undefined,
            url: record.url || source.url,
            raw_data: record,
          })
        }
      }
    } catch (err) {
      console.error(`API error for ${url}:`, (err as Error).message)
    }
  }

  return items
}

// ─── Normalize to Target Table ──────────────────────────────────────────────

function normalizeItem(
  item: ExtractedItem,
  source: ScrapeSource,
): Record<string, unknown> {
  switch (source.target_table) {
    case 'marketplace_products':
      return {
        name: item.name,
        description: item.description || null,
        price: item.price_amount ?? null,
        price_amount: item.price_amount ?? null,
        currency: item.currency || 'USD',
        external_url: item.url || null,
        urls: item.url ? [item.url] : [],
        metadata: { product_url: item.url, merchant_deep_link: item.url, price: item.price_amount, currency: item.currency, brand: item.brand || source.name, business_name: source.name, category: item.category },
        image_url: item.image_url || null,
        images: item.images || [],
        brand: item.brand || source.name,
        category: item.category || null,
        source_slug: source.slug,
        source_name: source.name,
        is_active: true,
        is_public: true,
      }

    case 'events':
      return {
        title: item.title || item.name,
        description: item.description || null,
        event_type: item.event_type || 'other',
        // Undated items are filtered out before staging (scraped-event-guard.ts); never date an
        // event by the scraper's clock, and never invent a city called 'Unknown'.
        start_date: item.start_date,
        end_date: item.end_date || null,
        venue_name: item.venue_name || null,
        city: item.city || null,
        country: item.country || null,
        website: item.url || null,
        images: item.images || (item.image_url ? [item.image_url] : []),
        featured: false,
        status: 'active',
        is_public: true,
      }

    case 'news_articles':
      return {
        title: item.title || item.name,
        content: item.description || null,
        excerpt: item.description ? item.description.slice(0, 200) : null,
        url: item.url || null,
        source_name: source.name,
        published_at: item.start_date || new Date().toISOString(),
        is_published: true,
      }

    case 'venues':
      return {
        name: item.name,
        description: item.description || null,
        city: item.city || null,
        country: item.country || null,
        category: (source.scrape_config.category as string) || 'accommodation',
        website: item.url || null,
        images: item.images || (item.image_url ? [item.image_url] : []),
        is_active: true,
        is_public: true,
      }

    case 'cities':
      return {
        name: item.city || item.name,
        country_name: item.country || null,
        location: { country: item.country || null },
        description: item.description || null,
      }

    case 'countries':
      return {
        name: item.country || item.name,
        description: item.description || null,
      }

    default:
      return {
        name: item.name,
        description: item.description || null,
        url: item.url || null,
      }
  }
}

// ─── Unified page extraction router ─────────────────────────────────────────

export function extractFromPage(html: string, pageUrl: string, source: ScrapeSource): ExtractedItem[] {
  const config = source.scrape_config
  if (config.extract === 'products' || source.content_type === 'products') {
    return extractProductsFromPage(html, pageUrl, source)
  } else if (config.extract === 'accommodations' || source.content_type === 'accommodations') {
    return extractProductsFromPage(html, pageUrl, source)
  } else if (config.extract === 'wiki_table') {
    return extractWikiTable(html, pageUrl, source)
  } else if (config.extract === 'wiki_list') {
    return extractWikiList(html, pageUrl, source)
  } else if (config.extract === 'wiki_country_tables') {
    return extractWikiCountryTables(html, pageUrl, source)
  } else if (config.extract === 'city_list') {
    return extractCityList(html, pageUrl, source)
  } else if (config.extract === 'equaldex_timeline') {
    return extractEqualdexTimeline(html, pageUrl)
  } else if (config.extract === 'timeline_items') {
    return extractTimelineItems(html, pageUrl, source)
  } else {
    return extractEventsFromPage(html, pageUrl, source)
  }
}

// Canonical staging is consumed by the registered per-table pg_cron drains.
// Legacy scraper registrations still call the product target marketplace_products.
export function scrapedStagingRow(item: ExtractedItem, source: ScrapeSource, jobId: string) {
  const target = source.target_table === 'marketplace_products' ? 'marketplace_listings' : source.target_table
  const entityTypes: Record<string, string> = { marketplace_listings: 'marketplace', events: 'event', venues: 'venue', cities: 'city', countries: 'country', news_articles: 'news_article' }
  if (!entityTypes[target]) throw new Error(`Unsupported staging target: ${target}`)
  return {
    job_id: jobId, source_type: source.slug, source_name: source.slug,
    source_entity_id: item.url || item.name, entity_type: entityTypes[target], target_table: target,
    raw_data: { ...item.raw_data, name: item.name, url: item.url },
    normalized_data: normalizeItem(item, source),
  }
}

// ─── Deduplicate within batch ───────────────────────────────────────────────

function dedupeItems(items: ExtractedItem[]): ExtractedItem[] {
  const seen = new Set<string>()
  return items.filter(item => {
    const key = `${(item.name || item.title || '').toLowerCase().trim()}|${item.url || ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ─── Process a Single Source ────────────────────────────────────────────────

export async function processSource(
  supabase: ReturnType<typeof getServiceClient>,
  source: ScrapeSource,
  dryRun: boolean,
): Promise<{
  source_slug: string
  items_found: number
  items_staged: number
  pages_crawled: number
  error?: string
  skipped_reason?: string
  items_skipped?: number
  preview?: ExtractedItem[]
}> {
  const skipReason = scrapedNewsStagingSkipReason(source, dryRun)
  if (skipReason) {
    console.info(`[${source.slug}] Skipped news staging: ${skipReason}`)
    // Advance the scheduler without counting a policy skip as a source failure.
    const { error } = await supabase.from('scrape_sources').update({
      last_run_at: new Date().toISOString(),
    }).eq('id', source.id)
    if (error) console.warn(`[${source.slug}] Could not record skipped attempt: ${error.message}`)
    return {
      source_slug: source.slug, items_found: 0, items_staged: 0, pages_crawled: 0,
      skipped_reason: skipReason,
    }
  }

  const startTime = Date.now()
  let allItems: ExtractedItem[] = []
  let pagesCrawled = 0

  console.log(`[${source.slug}] Starting scrape: ${source.url} (method: ${source.scrape_method})`)

  try {
    // ── Crawl / Fetch ─────────────────────────────────────────
    switch (source.scrape_method) {
      case 'sitemap': {
        // Native sitemap-based crawl — no external API needed
        const { pages, error } = await crawlViaSitemap(source)
        if (error) {
          console.error(`[${source.slug}] Sitemap error: ${error}`)
          // Fallback to native_crawl if sitemap fails
          console.log(`[${source.slug}] Falling back to native_crawl`)
          const fallback = await crawlNative(source)
          if (fallback.error || fallback.pages.length === 0) {
            throw new Error(error + ' (native_crawl fallback also failed)')
          }
          pagesCrawled = fallback.pages.length
          for (const page of fallback.pages) {
            allItems.push(...extractFromPage(page.html, page.url, source))
          }
        } else {
          pagesCrawled = pages.length
          for (const page of pages) {
            allItems.push(...extractFromPage(page.html, page.url, source))
          }
        }
        break
      }

      case 'native_crawl': {
        // BFS link-following crawler — no external API needed
        const { pages, error } = await crawlNative(source)
        if (error) {
          console.error(`[${source.slug}] Native crawl error: ${error}`)
          throw new Error(error)
        }
        pagesCrawled = pages.length
        for (const page of pages) {
          allItems.push(...extractFromPage(page.html, page.url, source))
        }
        break
      }

      case 'html_fetch': {
        const html = source.scrape_config.use_public_proxy === true
          ? (await fetchPublicSourceThroughProxy(source.url, Deno.env.get('FIRECRAWL_API_KEY') || '', response => readScrapeBody(response, 4_000_000))).slice(0, 1_000_000)
          : await fetchPage(source.url, source.user_agent)
        pagesCrawled = 1
        allItems = extractFromPage(html, source.url, source)
        break
      }

      case 'api': {
        allItems = await fetchFromApi(source)
        pagesCrawled = 1
        break
      }

      default:
        throw new Error(`Unknown scrape method: ${source.scrape_method}`)
    }

    // ── Deduplicate ──────────────────────────────────────────
    allItems = dedupeItems(allItems)
    const itemsFound = allItems.length

    console.log(`[${source.slug}] Extracted ${itemsFound} items from ${pagesCrawled} pages`)

    if (itemsFound === 0) {
      // Still update last_run_at so this source isn't re-dispatched every cycle
      await supabase.from('scrape_sources').update({
        last_run_at: new Date().toISOString(),
        last_error: 'No items extracted',
        consecutive_failures: (source.consecutive_failures || 0) + 1,
        total_runs: (source.total_runs || 0) + 1,
      }).eq('id', source.id)
      return { source_slug: source.slug, items_found: 0, items_staged: 0, pages_crawled: pagesCrawled, error: 'No items extracted' }
    }

    // Cap items
    if (allItems.length > MAX_ITEMS_PER_SOURCE) {
      allItems = allItems.slice(0, MAX_ITEMS_PER_SOURCE)
    }

    if (dryRun) {
      return {
        source_slug: source.slug,
        items_found: itemsFound,
        items_staged: 0,
        pages_crawled: pagesCrawled,
        preview: allItems.slice(0, 20),
      }
    }

    // ── Resolve ingestion_sources ID (FK target) ───────────
    const { data: ingestionSource } = await supabase
      .from('ingestion_sources')
      .select('id')
      .eq('slug', source.slug)
      .maybeSingle()

    // ── Create import job ────────────────────────────────────
    const { data: job, error: jobError } = await supabase
      .from('import_jobs_enhanced')
      .insert({
        user_id: '00000000-0000-0000-0000-000000000000',
        source_id: ingestionSource?.id ?? null,
        source_type: 'web_scraping',
        type: 'web-scraping',
        status: 'processing',
        pipeline_stage: 'fetching',
        items_fetched: itemsFound,
      })
      .select('id')
      .single()

    if (jobError || !job) {
      throw new Error(`Failed to create import job: ${jobError?.message}`)
    }

    // ── Create scrape_run ────────────────────────────────────
    const { data: run } = await supabase
      .from('scrape_runs')
      .insert({
        source_id: source.id,
        job_id: job.id,
        status: 'running',
        pages_crawled: pagesCrawled,
        items_found: itemsFound,
        started_at: new Date(startTime).toISOString(),
        run_config: { method: source.scrape_method, url: source.url },
      })
      .select('id')
      .single()

    // ── Stage items into ingestion_staging ────────────────────
    const rejected: Record<string, number> = {}
    const stageable = source.target_table === 'events'
      ? allItems.filter(item => {
          const reason = scrapedEventRejectReason(item)
          if (reason) rejected[reason] = (rejected[reason] ?? 0) + 1
          return !reason
        })
      : allItems
    if (Object.keys(rejected).length) {
      console.log(`[${source.slug}] Skipped non-events:`, JSON.stringify(rejected))
    }

    const stagingRows = stageable.map(item => scrapedStagingRow(item, source, job.id))

    // Insert in chunks of 100
    let itemsStaged = 0
    let itemsSkipped = 0
    let itemsFailed = 0
    for (let i = 0; i < stagingRows.length; i += 100) {
      const chunk = stagingRows.slice(i, i + 100)
      const { error: insertError } = await supabase.from('ingestion_staging').insert(chunk)
      if (insertError) {
        // A known item must not reject a whole batch or overwrite a reviewed row.
        for (const row of chunk) {
          const { error } = await supabase.from('ingestion_staging').insert(row)
          if (!error) itemsStaged++
          else if (error.code === '23505') itemsSkipped++
          else { itemsFailed++; console.error(`[${source.slug}] Staging insert error:`, error.message) }
        }
      } else {
        itemsStaged += chunk.length
      }
    }

    // ── Update scrape_run ────────────────────────────────────
    const successful = itemsStaged + itemsSkipped > 0 && itemsFailed === 0
    const stagingError = itemsFailed > 0 ? `${itemsFailed} staging writes failed` : 'No items staged'
    const duration = Date.now() - startTime
    if (run) {
      await supabase.from('scrape_runs').update({
        status: successful ? 'completed' : 'failed',
        items_staged: itemsStaged,
        completed_at: new Date().toISOString(),
        duration_ms: duration,
      }).eq('id', run.id)
    }

    // ── Update scrape_source ─────────────────────────────────
    await supabase.from('scrape_sources').update({
      last_run_at: new Date().toISOString(),
      last_success_at: successful ? new Date().toISOString() : source.last_success_at,
      last_error: successful ? null : stagingError,
      total_runs: (source.total_runs || 0) + 1,
      total_items_fetched: (source.total_items_fetched || 0) + itemsStaged,
      consecutive_failures: successful ? 0 : (source.consecutive_failures || 0) + 1,
    }).eq('id', source.id)

    // ── Update import job ────────────────────────────────────
    await supabase.from('import_jobs_enhanced').update({
      items_fetched: itemsStaged,
      pipeline_stage: itemsStaged > 0 ? 'ai_validation' : 'completed',
      status: itemsStaged > 0 ? 'processing' : 'completed',
    }).eq('id', job.id)

    // The canonical pg_cron drains validate, deduplicate and review these rows.
    // Starting the venue DAG here refetched unrelated sources and stranded products.

    return {
      source_slug: source.slug,
      items_found: itemsFound,
      items_staged: itemsStaged,
      pages_crawled: pagesCrawled,
      items_skipped: itemsSkipped,
      ...(!successful ? { error: stagingError } : {}),
    }
  } catch (err) {
    const errorMsg = (err as Error).message

    // Update source with failure
    await supabase.from('scrape_sources').update({
      last_run_at: new Date().toISOString(),
      last_error: errorMsg,
      consecutive_failures: (source.consecutive_failures || 0) + 1,
    }).eq('id', source.id)

    return {
      source_slug: source.slug,
      items_found: 0,
      items_staged: 0,
      pages_crawled: pagesCrawled,
      error: errorMsg,
    }
  }
}

// ─── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  try {
    const supabase = getServiceClient()

    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth

    const body = await req.json().catch(() => ({}))
    const {
      mode,
      source_slug: sourceSlug,
      source_id: sourceId,
      content_types: contentTypes,
      dry_run: dryRun = false,
    } = body as {
      mode?: string
      source_slug?: string
      source_id?: string
      content_types?: string[]
      dry_run?: boolean
    }

    // ── Build query for sources to scrape ────────────────────
    let query = supabase
      .from('scrape_sources')
      .select('*')
      .eq('is_enabled', true)

    if (sourceSlug) {
      query = supabase.from('scrape_sources').select('*').eq('slug', sourceSlug)
    } else if (sourceId) {
      query = supabase.from('scrape_sources').select('*').eq('id', sourceId)
    } else if (mode === 'scheduled') {
      // Filter by content_types if specified
      if (contentTypes && contentTypes.length > 0) {
        query = query.in('content_type', contentTypes)
      }

      // Only run sources that are due (last_run_at + interval < now)
      // Sort by priority ASC (lower = higher priority), then oldest first
      // Exclude sources with too many consecutive failures at DB level so LIMIT picks correctly
      // Over-fetch (DB_FETCH_LIMIT) so the in-memory interval filter has enough candidates
      // even when the top DB rows were recently run and not yet due.
      query = query
        .lt('consecutive_failures', 5)
        .order('priority', { ascending: true })
        .order('last_run_at', { ascending: true, nullsFirst: true })
        .limit(DB_FETCH_LIMIT)
    } else {
      query = query
        .lt('consecutive_failures', 5)
        .order('priority', { ascending: true })
        .order('last_run_at', { ascending: true, nullsFirst: true })
        .limit(DB_FETCH_LIMIT)
    }

    const { data: sources, error: sourcesError } = await query

    if (sourcesError) {
      return errorResponse(`Failed to load sources: ${sourcesError.message}`, 500, req)
    }

    if (!sources || sources.length === 0) {
      return jsonResponse({ success: true, message: 'No sources to scrape', results: [] }, 200, req)
    }

    // Filter out sources not yet due (for scheduled mode)
    let filteredSources = sources as ScrapeSource[]
    if (mode === 'scheduled' && !sourceSlug && !sourceId) {
      const now = Date.now()
      filteredSources = filteredSources.filter(s => {
        if (!s.last_run_at) return true // never run
        const intervalMs = (s.schedule_interval_hours || 168) * 60 * 60 * 1000
        const nextRunAt = new Date(s.last_run_at).getTime() + intervalMs
        return nextRunAt <= now
      })

      // Also skip sources with too many consecutive failures
      filteredSources = filteredSources.filter(s => (s.consecutive_failures || 0) < 5)

      // Limit to MAX_SOURCES_PER_RUN after filtering (DB over-fetched for candidate pool)
      filteredSources = filteredSources.slice(0, MAX_SOURCES_PER_RUN)
    }

    if (filteredSources.length === 0) {
      return jsonResponse({ success: true, message: 'No sources due for scraping', results: [] }, 200, req)
    }

    // ── Fan-out for batch mode to avoid edge function timeout ─────────
    // When processing multiple sources, dispatch each to a separate invocation
    // (fire-and-forget) so each runs within its own timeout budget.
    const isBatch = !sourceSlug && !sourceId && filteredSources.length > 1
    if (isBatch) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const selfUrl = `${supabaseUrl}/functions/v1/scrape-web-sources`

      // Dispatch each source as a separate invocation.
      // Use EdgeRuntime.waitUntil() so Deno doesn't kill the background fetches
      // when this response is returned.
      const dispatches = filteredSources.map(source =>
        fetch(selfUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ source_id: source.id, dry_run: dryRun }),
        }).catch(err => console.error(`Dispatch failed for ${source.slug}:`, err))
      )
      // Keep runtime alive until all dispatched requests are sent
      // @ts-expect-error — EdgeRuntime is available in Supabase Deno runtime
      if (typeof EdgeRuntime !== 'undefined') {
        // @ts-expect-error — EdgeRuntime global is Deno-only
        EdgeRuntime.waitUntil(Promise.allSettled(dispatches))
      }

      return jsonResponse({
        success: true,
        mode: 'fan-out',
        sources_dispatched: filteredSources.length,
        dispatched: filteredSources.map(s => s.slug),
        dry_run: dryRun,
      }, 200, req)
    }

    // ── Single-source (or single-item batch) — process inline ─────────
    const results = []
    for (const source of filteredSources) {
      const result = await processSource(supabase, source, dryRun)
      results.push(result)

      if (filteredSources.length > 1) {
        await delay(source.rate_limit_ms || 2000)
      }
    }

    const totalFound = results.reduce((s, r) => s + r.items_found, 0)
    const totalStaged = results.reduce((s, r) => s + r.items_staged, 0)
    const errors = results.filter(r => r.error)

    return jsonResponse({
      success: true,
      sources_processed: results.length,
      total_items_found: totalFound,
      total_items_staged: totalStaged,
      errors_count: errors.length,
      dry_run: dryRun,
      results,
    }, 200, req)

  } catch (error) {
    console.error('scrape-web-sources error:', error)
    return errorResponse('Internal server error', 500, req)
  }
})

// ─── Helpers ────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
