/**
 * TravelGay connector.
 *
 * URL: https://www.travelgay.com/
 * JS-heavy SPA – uses Playwright.
 *
 * Strategy:
 *   1. Fetch city/category listing pages (discovered from sitemap or navigation)
 *   2. Parse venue cards per page
 *   3. Optionally deep-fetch individual venue detail pages
 */
import { chromium } from 'playwright'
import { load } from 'cheerio'
import { BaseConnector, browserSemaphore } from '../base.js'
import { parseTravelGayPage, parseTravelGayDetail } from './parser.js'
import { saveSnapshot } from '../../utils/snapshot.js'
import { rateLimit } from '../../utils/rateLimit.js'
import { safeUrl } from '../../utils/text.js'
import { config } from '../../utils/config.js'
import type { DiscoverOptions } from '../base.js'
import type { SourceRawEntity, EntityType } from '../../normalize/schema.js'
import type { SourceName } from '../../utils/config.js'

const BASE_URL = 'https://www.travelgay.com'
const SITEMAP_URL = `${BASE_URL}/sitemap.xml`

export class TravelGayConnector extends BaseConnector {
  readonly source: SourceName = 'travelgay'
  readonly supportedTypes: EntityType[] = ['venue', 'event']

  async *discover(opts?: DiscoverOptions): AsyncGenerator<string> {
    // Try sitemap first
    const sitemapUrls = await this.discoverFromSitemap()
    if (sitemapUrls.length > 0) {
      let count = 0
      for (const url of sitemapUrls) {
        if (opts?.maxPages && count >= opts.maxPages) break
        yield url
        count++
      }
      return
    }

    // Fallback: known category pages
    const fallbackPaths = [
      '/united-kingdom/',
      '/united-states/',
      '/germany/',
      '/spain/',
      '/netherlands/',
      '/france/',
      '/australia/',
      '/canada/',
    ]
    for (const path of fallbackPaths) {
      yield `${BASE_URL}${path}`
    }
  }

  private async discoverFromSitemap(): Promise<string[]> {
    const isAllowed = await this['beforeFetch'](SITEMAP_URL)
    if (!isAllowed) return []

    const xml = await this.fetchHtml(SITEMAP_URL)
    if (!xml) return []

    const $ = load(xml, { xmlMode: true })
    const urls: string[] = []

    $('url loc').each((_i, el) => {
      const loc = $(el).text().trim()
      // Only venue/place category pages, not blog posts
      if (
        loc.includes('travelgay.com') &&
        !loc.includes('/blog/') &&
        !loc.includes('/about') &&
        !loc.includes('/contact')
      ) {
        urls.push(loc)
      }
    })

    return urls.slice(0, 200) // cap at 200 pages per run
  }

  async fetchDetail(url: string): Promise<SourceRawEntity[]> {
    const isAllowed = await this['beforeFetch'](url)
    if (!isAllowed) {
      return []
    }

    await rateLimit(url)
    await browserSemaphore.acquire()

    let browser
    let page
    try {
      browser = await chromium.launch({ headless: true })
      page = await browser.newPage()
      await page.setExtraHTTPHeaders({ 'User-Agent': config.scraperUserAgent })

      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
      const httpStatus = response?.status() ?? 0

      // Handle potential blocks
      if (httpStatus === 403 || httpStatus === 429) {
        this.logger.warn({ url, httpStatus }, 'TravelGay: access blocked')
        return []
      }

      // Accept consent dialogs
      try {
        await page.click(
          'button:has-text("Accept"), button:has-text("I agree"), [class*="consent"] button',
          { timeout: 3_000 }
        )
      } catch {
        // No dialog
      }

      await page.waitForSelector('h1, article, [class*="venue"], [class*="card"]', {
        timeout: 8_000,
      }).catch(() => {})

      const html = await page.content()

      await saveSnapshot({
        url,
        source: this.source,
        content: html,
        contentType: 'html',
        httpStatus,
      }).catch(() => {})

      // Decide if this is a listing or detail page
      const $ = load(html)
      const isListing =
        $('[class*="venue-card"], [class*="card"], article').length > 2 ||
        url.endsWith('/') ||
        url.match(/\/(country|city|category)\//)

      if (isListing) {
        const entities = parseTravelGayPage(html, url)
        this.logger.info({ url, count: entities.length }, 'TravelGay listing parsed')
        return entities
      } else {
        const entity = parseTravelGayDetail(html, url)
        return entity ? [entity] : []
      }
    } catch (err) {
      const e = err as Error
      this.logger.error({ url, err }, 'TravelGay Playwright fetch failed')
      if (
        e.message.toLowerCase().includes('captcha') ||
        e.message.toLowerCase().includes('cloudflare')
      ) {
        this.logger.warn(
          { url },
          'TravelGay: anti-bot protection detected – needs manual or official partnership'
        )
      }
      return []
    } finally {
      await page?.close().catch(() => {})
      await browser?.close().catch(() => {})
      browserSemaphore.release()
    }
  }
}
