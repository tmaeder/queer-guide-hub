/**
 * Patroc connector.
 *
 * URL: https://www.patroc.com/
 * Checks robots.txt rigorously before fetching.
 * Uses Playwright for JS rendering; gracefully degrades if blocked.
 */
import { chromium } from 'playwright'
import { load } from 'cheerio'
import { BaseConnector, browserSemaphore } from '../base.js'
import { parsePatrocPage } from './parser.js'
import { saveSnapshot } from '../../utils/snapshot.js'
import { rateLimit } from '../../utils/rateLimit.js'
import { isAllowed } from '../../utils/robots.js'
import { safeUrl } from '../../utils/text.js'
import { config } from '../../utils/config.js'
import type { DiscoverOptions } from '../base.js'
import type { SourceRawEntity, EntityType } from '../../normalize/schema.js'
import type { SourceName } from '../../utils/config.js'

const BASE_URL = 'https://www.patroc.com'

export class PatrocConnector extends BaseConnector {
  readonly source: SourceName = 'patroc'
  readonly supportedTypes: EntityType[] = ['venue', 'event']

  async *discover(opts?: DiscoverOptions): AsyncGenerator<string> {
    const homeUrl = `${BASE_URL}/`
    if (!(await isAllowed(homeUrl))) {
      this.logger.warn('Patroc home: blocked by robots.txt – yielding zero URLs')
      return
    }

    yield homeUrl

    // Try sitemap
    const sitemapUrl = `${BASE_URL}/sitemap.xml`
    if (await isAllowed(sitemapUrl)) {
      const xml = await this.fetchHtml(sitemapUrl)
      if (xml) {
        const $ = load(xml, { xmlMode: true })
        let count = 1

        $('url loc').each((_i, el) => {
          if (opts?.maxPages && count >= opts.maxPages) return
          const loc = $(el).text().trim()
          if (loc && !loc.includes('/blog/') && !loc.includes('/about')) {
            count++
          }
        })
      }
    }
  }

  async fetchDetail(url: string): Promise<SourceRawEntity[]> {
    const allowed = await this['beforeFetch'](url)
    if (!allowed) {
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

      if (httpStatus === 401 || httpStatus === 403) {
        this.logger.warn(
          { url, httpStatus },
          'Patroc: needs manual or official partnership (auth required)'
        )
        return []
      }

      // Dismiss consent banners
      try {
        await page.click(
          'button:has-text("Accept"), button:has-text("Agree"), [aria-label*="Accept"]',
          { timeout: 3_000 }
        )
      } catch {
        // No banner
      }

      await page.waitForSelector('h1, article, [class*="venue"]', { timeout: 8_000 }).catch(() => {})

      const html = await page.content()

      await saveSnapshot({
        url,
        source: this.source,
        content: html,
        contentType: 'html',
        httpStatus,
      }).catch(() => {})

      const entities = parsePatrocPage(html, url)
      this.logger.info({ url, count: entities.length }, 'Patroc entities parsed')
      return entities
    } catch (err) {
      this.logger.error({ url, err }, 'Patroc Playwright fetch failed')
      return []
    } finally {
      await page?.close().catch(() => {})
      await browser?.close().catch(() => {})
      browserSemaphore.release()
    }
  }
}
