/**
 * Outsavvy Guide connector.
 *
 * URL: https://www.outsavvy.com/guide
 * Outsavvy is a React SPA – uses Playwright for rendering.
 *
 * Per their ToS: public guide/venue listings are fair game.
 * We do NOT scrape user profiles, private event data, or payment flows.
 */
import { chromium } from 'playwright'
import { BaseConnector, browserSemaphore } from '../base.js'
import { parseOutsavvyGuide } from './parser.js'
import { saveSnapshot } from '../../utils/snapshot.js'
import { rateLimit } from '../../utils/rateLimit.js'
import { config } from '../../utils/config.js'
import type { DiscoverOptions } from '../base.js'
import type { SourceRawEntity, EntityType } from '../../normalize/schema.js'
import type { SourceName } from '../../utils/config.js'

const GUIDE_URL = 'https://www.outsavvy.com/guide'
const BASE_URL = 'https://www.outsavvy.com'

export class OutsavvyConnector extends BaseConnector {
  readonly source: SourceName = 'outsavvy'
  readonly supportedTypes: EntityType[] = ['venue', 'event']

  async *discover(opts?: DiscoverOptions): AsyncGenerator<string> {
    yield GUIDE_URL
    // City sub-pages can be discovered dynamically in fetchDetail
  }

  async fetchDetail(url: string): Promise<SourceRawEntity[]> {
    const isAllowed = await this['beforeFetch'](url)
    if (!isAllowed) return []

    await rateLimit(url)
    await browserSemaphore.acquire()

    let browser
    let page
    try {
      browser = await chromium.launch({ headless: true })
      page = await browser.newPage()
      await page.setExtraHTTPHeaders({ 'User-Agent': config.scraperUserAgent })

      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })

      // Accept cookie banner if present
      try {
        await page.click(
          '[class*="cookie"] button[class*="accept"], button:has-text("Accept"), button:has-text("OK")',
          { timeout: 3_000 }
        )
      } catch {
        // No cookie banner, continue
      }

      // Wait for content to render
      await page.waitForSelector('h1, h2, article, [class*="venue"], [class*="event"]', {
        timeout: 10_000,
      }).catch(() => {})

      // Scroll to trigger lazy-loading
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
      await page.waitForTimeout(1_500)

      const html = await page.content()
      const httpStatus = 200

      await saveSnapshot({
        url,
        source: this.source,
        content: html,
        contentType: 'html',
        httpStatus,
      }).catch(() => {})

      const entities = parseOutsavvyGuide(html, url)
      this.logger.info({ url, count: entities.length }, 'Outsavvy entities parsed')
      return entities
    } catch (err) {
      const e = err as Error
      this.logger.error({ url, err }, 'Outsavvy Playwright fetch failed')

      // If it looks like a login wall or anti-bot, log appropriately
      if (
        e.message.includes('captcha') ||
        e.message.includes('403') ||
        e.message.includes('login')
      ) {
        this.logger.warn(
          { url },
          'Outsavvy: needs manual or official partnership (login/captcha detected)'
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
