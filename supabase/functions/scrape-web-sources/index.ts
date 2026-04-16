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
 *   - firecrawl    — (legacy) External Firecrawl API, requires FIRECRAWL_API_KEY
 *
 * Invocation modes:
 *   { "mode": "scheduled" }                       — process all due sources
 *   { "mode": "scheduled", "content_types": [...]} — filter by content_type
 *   { "source_slug": "mr-s-leather" }             — run a single source
 *   { "source_id": "uuid" }                       — run by ID
 *   { "dry_run": true, ... }                      — extract but don't stage
 */

import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'
import { getServiceClient, requireAdmin, corsResponse, errorResponse, jsonResponse } from '../_shared/supabase-client.ts'

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

// ─── HTML Fetch ─────────────────────────────────────────────────────────────

let fetchCounter = 0

async function fetchPage(url: string, userAgent: string, attempt = 0): Promise<string> {
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
    clearTimeout(timeout)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.text()
  } catch (err) {
    clearTimeout(timeout)
    if (attempt < 2) {
      await delay(1000 * Math.pow(2, attempt))
      return fetchPage(url, userAgent, attempt + 1)
    }
    throw err
  }
}

// ─── Firecrawl Crawl ────────────────────────────────────────────────────────

async function crawlWithFirecrawl(
  source: ScrapeSource,
): Promise<{ pages: { url: string; html?: string; markdown?: string }[]; error?: string }> {
  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY')
  if (!firecrawlApiKey) {
    return { pages: [], error: 'FIRECRAWL_API_KEY not configured' }
  }

  const config = source.scrape_config
  const limit = Math.min((config.limit as number) || 100, source.max_pages_per_run)

  const crawlBody: Record<string, unknown> = {
    url: source.url,
    limit,
    scrapeOptions: { formats: ['html', 'markdown'] },
  }

  if (config.include_paths) {
    crawlBody.includePaths = config.include_paths
  }
  if (config.exclude_paths) {
    crawlBody.excludePaths = config.exclude_paths
  }

  try {
    const res = await fetch('https://api.firecrawl.dev/v1/crawl', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firecrawlApiKey}`,
      },
      body: JSON.stringify(crawlBody),
    })

    if (!res.ok) {
      const errText = await res.text()
      return { pages: [], error: `Firecrawl ${res.status}: ${errText.slice(0, 200)}` }
    }

    const result = await res.json()

    // v1 returns { success, id } for async crawl — poll for results
    if (result.id && !result.data) {
      return await pollFirecrawlJob(firecrawlApiKey, result.id)
    }

    if (!result.success) {
      return { pages: [], error: result.error || 'Firecrawl crawl failed' }
    }

    return { pages: result.data || [] }
  } catch (err) {
    return { pages: [], error: `Firecrawl error: ${(err as Error).message}` }
  }
}

async function pollFirecrawlJob(
  apiKey: string,
  jobId: string,
  maxWaitMs = 240000,
): Promise<{ pages: { url: string; html?: string; markdown?: string }[]; error?: string }> {
  const start = Date.now()
  let pollInterval = 5000

  while (Date.now() - start < maxWaitMs) {
    await delay(pollInterval)
    pollInterval = Math.min(pollInterval * 1.5, 15000)

    try {
      const res = await fetch(`https://api.firecrawl.dev/v1/crawl/${jobId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })

      if (!res.ok) continue

      const result = await res.json()

      if (result.status === 'completed') {
        return { pages: result.data || [] }
      }
      if (result.status === 'failed') {
        return { pages: [], error: `Crawl job failed: ${result.error || 'unknown'}` }
      }
      // still running — keep polling
    } catch {
      // network error — retry
    }
  }

  return { pages: [], error: 'Crawl job timed out' }
}

// ─── Sitemap Crawl (native, no external API) ────────────────────────────────

async function crawlViaSitemap(
  source: ScrapeSource,
): Promise<{ pages: { url: string; html: string }[]; error?: string }> {
  const config = source.scrape_config
  const maxPages = Math.min((config.limit as number) || 200, source.max_pages_per_run)
  const includePatterns = (config.include_paths as string[]) || []
  const baseUrl = source.url.replace(/\/+$/, '')
  const pages: { url: string; html: string }[] = []

  // 1. Try to find and parse sitemap(s)
  const sitemapUrls = await discoverSitemapUrls(baseUrl, source.user_agent)
  if (sitemapUrls.length === 0) {
    return { pages: [], error: `No sitemap found at ${baseUrl}` }
  }

  // 2. Collect product URLs from sitemaps
  const productUrls: string[] = []
  for (const sitemapUrl of sitemapUrls) {
    if (productUrls.length >= maxPages) break
    const urls = await parseSitemap(sitemapUrl, source.user_agent, includePatterns, maxPages - productUrls.length)
    productUrls.push(...urls)
  }

  if (productUrls.length === 0) {
    return { pages: [], error: 'Sitemap found but no matching URLs' }
  }

  console.log(`[${source.slug}] Sitemap: found ${productUrls.length} URLs to scrape`)

  // 3. Fetch each product page with rate limiting
  const rateLimitMs = source.rate_limit_ms || 2000
  for (const url of productUrls.slice(0, maxPages)) {
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
  const candidates = [
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap_index.xml`,
    `${baseUrl}/sitemap_products.xml`,
    `${baseUrl}/sitemap-index.xml`,
  ]

  // Also check robots.txt for sitemap directives
  try {
    const robotsTxt = await fetchPage(`${baseUrl}/robots.txt`, userAgent)
    const sitemapLines = robotsTxt.split('\n')
      .filter(l => l.toLowerCase().startsWith('sitemap:'))
      .map(l => l.split(':', 2).slice(1).join(':').trim())
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
): Promise<string[]> {
  const urls: string[] = []

  try {
    const xml = await fetchPage(sitemapUrl, userAgent)
    const $ = cheerio.load(xml, { xmlMode: true })

    // Handle sitemap index (contains links to other sitemaps)
    const childSitemaps = $('sitemap > loc').map((_, el) => $(el).text().trim()).get()
    if (childSitemaps.length > 0) {
      // Filter for product-related sitemaps
      const productSitemaps = childSitemaps.filter(url =>
        /product|collection|shop|catalog|item/i.test(url)
      )
      // If no product-specific sitemaps found, use all of them
      const targetSitemaps = productSitemaps.length > 0 ? productSitemaps : childSitemaps.slice(0, 5)

      for (const childUrl of targetSitemaps) {
        if (urls.length >= limit) break
        const childUrls = await parseSitemap(childUrl, userAgent, includePatterns, limit - urls.length)
        urls.push(...childUrls)
        await delay(500) // polite delay between sitemap fetches
      }
      return urls
    }

    // Regular sitemap — extract URLs
    $('url > loc').each((_, el) => {
      if (urls.length >= limit) return
      const url = $(el).text().trim()
      if (!url) return

      // Filter by include patterns
      if (includePatterns.length > 0) {
        const matches = includePatterns.some(pattern => {
          // Convert glob-like pattern to regex
          const regex = new RegExp(
            pattern.replace(/\*/g, '.*').replace(/\//g, '\\/'),
            'i'
          )
          return regex.test(new URL(url).pathname)
        })
        if (!matches) return
      }

      urls.push(url)
    })
  } catch (err) {
    console.error(`Failed to parse sitemap ${sitemapUrl}:`, (err as Error).message)
  }

  return urls
}

// ─── Native Crawl (BFS link-following, no external API) ─────────────────────

async function crawlNative(
  source: ScrapeSource,
): Promise<{ pages: { url: string; html: string }[]; error?: string }> {
  const config = source.scrape_config
  const maxPages = Math.min((config.limit as number) || 100, source.max_pages_per_run)
  const maxDepth = (config.max_depth as number) || 3
  const includePatterns = (config.include_paths as string[]) || []
  const excludePatterns = (config.exclude_paths as string[]) || [
    '/cart*', '/checkout*', '/account*', '/login*', '/register*',
    '/privacy*', '/terms*', '/cookie*', '/faq*', '/contact*',
    '*.pdf', '*.jpg', '*.png', '*.gif', '*.css', '*.js',
  ]

  const baseOrigin = new URL(source.url).origin
  const visited = new Set<string>()
  const pages: { url: string; html: string }[] = []
  const queue: { url: string; depth: number }[] = [{ url: source.url, depth: 0 }]

  const rateLimitMs = source.rate_limit_ms || 2000

  while (queue.length > 0 && pages.length < maxPages) {
    const { url, depth } = queue.shift()!

    // Normalize URL (remove fragments, trailing slashes)
    const normalizedUrl = normalizeUrl(url)
    if (visited.has(normalizedUrl)) continue
    visited.add(normalizedUrl)

    // Check URL is on same origin
    try {
      if (new URL(normalizedUrl).origin !== baseOrigin) continue
    } catch { continue }

    // Check exclude patterns
    const pathname = new URL(normalizedUrl).pathname
    if (excludePatterns.some(p => {
      const regex = new RegExp(p.replace(/\*/g, '.*').replace(/\//g, '\\/'), 'i')
      return regex.test(pathname)
    })) continue

    // Fetch page
    try {
      const html = await fetchPage(normalizedUrl, source.user_agent)

      // Only keep pages matching include patterns (if set) for extraction
      const matchesInclude = includePatterns.length === 0 || includePatterns.some(p => {
        const regex = new RegExp(p.replace(/\*/g, '.*').replace(/\//g, '\\/'), 'i')
        return regex.test(pathname)
      })

      if (matchesInclude) {
        pages.push({ url: normalizedUrl, html })
      }

      // Discover links for further crawling (up to maxDepth)
      if (depth < maxDepth) {
        const $ = cheerio.load(html)
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href')
          if (!href) return

          let absoluteUrl: string
          try {
            absoluteUrl = new URL(href, normalizedUrl).href
          } catch { return }

          // Only follow links on same origin
          if (new URL(absoluteUrl).origin !== baseOrigin) return

          const nextNorm = normalizeUrl(absoluteUrl)
          if (!visited.has(nextNorm) && queue.length < maxPages * 3) {
            queue.push({ url: nextNorm, depth: depth + 1 })
          }
        })
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

// ─── Product Extraction ─────────────────────────────────────────────────────

function extractProductsFromPage(
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
        if (!node['@type']) continue
        const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']]
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
    const name = $el.find('[itemprop="name"]').first().text().trim()
    if (!name) return

    // Skip if already found via JSON-LD
    if (items.some(i => i.name.toLowerCase() === name.toLowerCase())) return

    const desc = $el.find('[itemprop="description"]').first().text().trim()
    const priceEl = $el.find('[itemprop="price"]').first()
    const priceVal = priceEl.attr('content') || priceEl.text().trim()
    const currency = $el.find('[itemprop="priceCurrency"]').first().attr('content') || 'USD'
    const imageEl = $el.find('[itemprop="image"]').first()
    const image = imageEl.attr('src') || imageEl.attr('content') || undefined

    items.push({
      name,
      description: desc.slice(0, 1000),
      price: priceVal ? `${currency} ${priceVal}` : undefined,
      price_amount: priceVal ? parseFloat(priceVal) : undefined,
      currency,
      image_url: image,
      images: image ? [image] : [],
      url: pageUrl,
      brand: source.name,
      raw_data: { microdata: true },
    })
  })

  return items
}

// ─── Event Extraction ───────────────────────────────────────────────────────

function extractEventsFromPage(
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
          venue_name: typeof loc === 'string' ? loc : loc.name || undefined,
          city: addr?.addressLocality || undefined,
          country: addr?.addressCountry || undefined,
          event_type: (config.event_type as string) || 'LGBTQ+ Event',
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

      const dateText = selectors.date
        ? $el.find(selectors.date).first().text().trim()
        : ''
      const location = selectors.location
        ? $el.find(selectors.location).first().text().trim()
        : ''
      const desc = selectors.description
        ? $el.find(selectors.description).first().text().trim()
        : $el.find('p, .description, .excerpt').first().text().trim()
      const image = $el.find('img').first().attr('src') || undefined
      const link = $el.find('a').first().attr('href') || undefined

      let parsedDate: string | undefined
      if (dateText) {
        try {
          const d = new Date(dateText)
          if (!isNaN(d.getTime()) && d.getFullYear() >= 2024) {
            parsedDate = d.toISOString()
          }
        } catch { /* ignore */ }
      }

      items.push({
        title,
        name: title,
        description: desc.slice(0, 1000) || undefined,
        start_date: parsedDate,
        city: location || undefined,
        event_type: (config.event_type as string) || 'LGBTQ+ Event',
        url: link && link.startsWith('http') ? link : link ? new URL(link, source.url).href : pageUrl,
        image_url: image && image.startsWith('http') ? image : image ? new URL(image, source.url).href : undefined,
        images: [],
        raw_data: { html_card: true, date_text: dateText, location_text: location },
      })
    })
  }

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
          event_type: (config.event_type as string) || 'Event',
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

function extractWikiList(
  html: string,
  pageUrl: string,
  source: ScrapeSource,
): ExtractedItem[] {
  const items: ExtractedItem[] = []
  const $ = cheerio.load(html)
  const config = source.scrape_config
  const skipHeadings = new Set(['contents', 'references', 'see also', 'notes', 'external links', 'further reading'])

  let currentCountry = ''
  $('h2, h3, ul > li').each((_, el) => {
    const tag = (el as Record<string, unknown>).tagName?.toLowerCase()
    if (tag === 'h2' || tag === 'h3') {
      const text = $(el).find('.mw-headline').text().trim() || $(el).text().replace(/\[edit\]/gi, '').trim()
      if (text && !skipHeadings.has(text.toLowerCase())) {
        currentCountry = text
      }
      return
    }
    if (tag === 'li' && currentCountry) {
      const link = $(el).find('a').first()
      const city = link.text().trim()
      if (!city || city.length < 2) return
      const rawText = $(el).text().trim()

      if (source.content_type === 'events') {
        items.push({
          title: `${(config.event_type as string) || 'Event'} - ${city}`,
          name: `${(config.event_type as string) || 'Event'} - ${city}`,
          city,
          country: currentCountry,
          event_type: (config.event_type as string) || 'Event',
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

function extractWikiCountryTables(
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
      const tag = (prev[0] as unknown).tagName?.toLowerCase()
      if (tag === 'h2' || tag === 'h3') {
        country = prev.find('.mw-headline').text().trim() || prev.text().replace(/\[edit\]/gi, '').trim()
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
        price: item.price || null,
        price_amount: item.price_amount || null,
        currency: item.currency || 'USD',
        external_url: item.url || null,
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
        event_type: item.event_type || 'LGBTQ+ Event',
        start_date: item.start_date || new Date().toISOString(),
        end_date: item.end_date || null,
        venue_name: item.venue_name || null,
        city: item.city || 'Unknown',
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

function extractFromPage(html: string, pageUrl: string, source: ScrapeSource): ExtractedItem[] {
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
  } else if (config.extract === 'timeline_items') {
    return extractTimelineItems(html, pageUrl, source)
  } else {
    return extractEventsFromPage(html, pageUrl, source)
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

async function processSource(
  supabase: ReturnType<typeof getServiceClient>,
  source: ScrapeSource,
  dryRun: boolean,
): Promise<{
  source_slug: string
  items_found: number
  items_staged: number
  pages_crawled: number
  error?: string
  preview?: ExtractedItem[]
}> {
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

      case 'firecrawl': {
        // Legacy: External Firecrawl API (requires FIRECRAWL_API_KEY)
        // Falls back to sitemap → native_crawl if key not set
        const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY')
        if (!firecrawlKey) {
          console.log(`[${source.slug}] FIRECRAWL_API_KEY not set, using sitemap fallback`)
          const { pages, error } = await crawlViaSitemap(source)
          if (error) {
            const fallback = await crawlNative(source)
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

        const { pages, error } = await crawlWithFirecrawl(source)
        if (error) {
          console.error(`[${source.slug}] Firecrawl error: ${error}`)
          throw new Error(error)
        }
        pagesCrawled = pages.length
        for (const page of pages) {
          if (!page.html) continue
          allItems.push(...extractFromPage(page.html, page.url, source))
        }
        break
      }

      case 'html_fetch': {
        const html = await fetchPage(source.url, source.user_agent)
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
      return { source_slug: source.slug, items_found: 0, items_staged: 0, pages_crawled: pagesCrawled }
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
    const stagingRows = allItems.map(item => ({
      job_id: job.id,
      source_type: source.slug,
      target_table: source.target_table,
      raw_data: item.raw_data || item,
      normalized_data: normalizeItem(item, source),
    }))

    // Insert in chunks of 100
    let itemsStaged = 0
    for (let i = 0; i < stagingRows.length; i += 100) {
      const chunk = stagingRows.slice(i, i + 100)
      const { error: insertError } = await supabase.from('ingestion_staging').insert(chunk)
      if (insertError) {
        console.error(`[${source.slug}] Staging insert error:`, insertError.message)
      } else {
        itemsStaged += chunk.length
      }
    }

    // ── Update scrape_run ────────────────────────────────────
    const duration = Date.now() - startTime
    if (run) {
      await supabase.from('scrape_runs').update({
        status: itemsStaged > 0 ? 'completed' : 'failed',
        items_staged: itemsStaged,
        completed_at: new Date().toISOString(),
        duration_ms: duration,
      }).eq('id', run.id)
    }

    // ── Update scrape_source ─────────────────────────────────
    await supabase.from('scrape_sources').update({
      last_run_at: new Date().toISOString(),
      last_success_at: itemsStaged > 0 ? new Date().toISOString() : source.last_success_at,
      last_error: itemsStaged === 0 ? 'No items staged' : null,
      total_runs: (source.total_runs || 0) + 1,
      total_items_fetched: (source.total_items_fetched || 0) + itemsStaged,
      consecutive_failures: itemsStaged > 0 ? 0 : (source.consecutive_failures || 0) + 1,
    }).eq('id', source.id)

    // ── Update import job ────────────────────────────────────
    await supabase.from('import_jobs_enhanced').update({
      items_fetched: itemsStaged,
      pipeline_stage: itemsStaged > 0 ? 'ai_validation' : 'completed',
      status: itemsStaged > 0 ? 'processing' : 'completed',
    }).eq('id', job.id)

    // ── Trigger ingestion pipeline ───────────────────────────
    if (itemsStaged > 0) {
      supabase.functions.invoke('ingestion-pipeline', {
        body: { job_id: job.id, stage: 'ai_validation' },
      }).catch(err => console.error(`[${source.slug}] Pipeline trigger failed:`, err))
    }

    return {
      source_slug: source.slug,
      items_found: itemsFound,
      items_staged: itemsStaged,
      pages_crawled: pagesCrawled,
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

    // Require admin for manual invocations (cron/workflow-dispatcher passes service role)
    const authHeader = req.headers.get('Authorization')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '___none___'
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '___none___'
    const isServiceRole = authHeader?.includes(serviceRoleKey)
    const isAnon = authHeader?.includes(anonKey)
    if (authHeader && !isServiceRole && !isAnon) {
      const authResult = await requireAdmin(req, supabase)
      if (authResult instanceof Response) return authResult
    }

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
      // @ts-ignore — EdgeRuntime is available in Supabase Deno runtime
      if (typeof EdgeRuntime !== 'undefined') {
        // @ts-ignore
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
