/**
 * IGLTA Pride Calendar connector.
 *
 * URL: https://www.iglta.org/events/pride-calendar/
 * Strategy: fetch listing page → parse JSON-LD or HTML → optionally fetch detail pages.
 * Cheerio only (mostly static server-rendered HTML).
 */
import { BaseConnector } from '../base.js'
import { parseIgltaCalendar, parseIgltaEventDetail } from './parser.js'
import { saveSnapshot } from '../../utils/snapshot.js'
import { safeUrl } from '../../utils/text.js'
import { load } from 'cheerio'
import type { DiscoverOptions } from '../base.js'
import type { SourceRawEntity, EntityType } from '../../normalize/schema.js'
import type { SourceName } from '../../utils/config.js'

const LISTING_URL = 'https://www.iglta.org/events/pride-calendar/'
const BASE_URL = 'https://www.iglta.org'

export class IgltaConnector extends BaseConnector {
  readonly source: SourceName = 'iglta'
  readonly supportedTypes: EntityType[] = ['event']

  async *discover(opts?: DiscoverOptions): AsyncGenerator<string> {
    yield LISTING_URL

    // Try to find pagination links
    const html = await this.fetchHtml(LISTING_URL)
    if (!html) return

    const $ = load(html)
    const seen = new Set([LISTING_URL])
    let count = 1

    // Common pagination patterns
    $('a[href*="page"], a.next, a[rel="next"], .pager a, .pagination a').each(
      (_i, el) => {
        if (opts?.maxPages && count >= opts.maxPages) return
        const href = $(el).attr('href')
        if (!href) return
        const url = safeUrl(href.startsWith('http') ? href : `${BASE_URL}${href}`)
        if (url && !seen.has(url) && url.includes('iglta.org')) {
          seen.add(url)
          count++
        }
      }
    )

    for (const url of seen) {
      if (url !== LISTING_URL) yield url
    }
  }

  async fetchDetail(url: string): Promise<SourceRawEntity[]> {
    const html = await this.fetchHtml(url)
    if (!html) return []

    await saveSnapshot({
      url,
      source: this.source,
      content: html,
      contentType: 'html',
      httpStatus: 200,
    }).catch(() => {})

    const listEntities = parseIgltaCalendar(html)

    // If we got results from the listing page, optionally deep-fetch details
    // For now, return listing results directly to avoid too many requests
    if (listEntities.length > 0) {
      this.logger.info(
        { url, count: listEntities.length },
        'Parsed IGLTA events'
      )
      return listEntities
    }

    // If this is a detail page (not the listing), parse as single event
    const single = parseIgltaEventDetail(html, url)
    return single ? [single] : []
  }
}
