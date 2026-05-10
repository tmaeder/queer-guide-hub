/**
 * Patroc parser.
 *
 * URL: https://www.patroc.com/
 * Patroc lists LGBTQ+ venues and events.
 * May be JS-heavy; parser handles both static and rendered HTML.
 */
import { safeUrl, stripHtml } from '../../utils/text.js'
import type { SourceRawEntity } from '../../normalize/schema.js'

const BASE_URL = 'https://www.patroc.com'

export function parsePatrocPage(html: string, pageUrl: string): SourceRawEntity[] {
  const { load } = require('cheerio') as typeof import('cheerio')
  const $ = load(html)
  const results: SourceRawEntity[] = []
  const fetchedAt = new Date().toISOString()

  // Try JSON-LD first
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      const data = JSON.parse($(el).html() ?? '')
      const items = Array.isArray(data) ? data : [data]

      for (const item of items) {
        if (typeof item !== 'object' || item === null) continue
        const obj = item as Record<string, unknown>
        const schemaType = String(obj['@type'] ?? '')

        const isVenueType = ['LocalBusiness', 'BarOrPub', 'NightClub', 'FoodEstablishment', 'SpaOrBeautyParlor'].includes(schemaType)
        const isEventType = schemaType === 'Event'

        if (!isVenueType && !isEventType) continue

        const name = String(obj['name'] ?? '').trim()
        if (!name) continue

        if (isVenueType) {
          const address = (obj['address'] ?? {}) as Record<string, unknown>
          const geo = obj['geo'] as Record<string, unknown> | undefined

          results.push({
            source: 'patroc',
            sourceId: `patroc-venue-${name.toLowerCase().replace(/\s+/g, '-')}`,
            entityType: 'venue',
            url: String(obj['url'] ?? pageUrl),
            name,
            description: String(obj['description'] ?? '').trim() || null,
            tags: ['lgbtq+'],
            city: String(address['addressLocality'] ?? '').trim() || null,
            country: String(address['addressCountry'] ?? '').trim() || null,
            address: String(address['streetAddress'] ?? '').trim() || null,
            geo:
              geo?.latitude && geo?.longitude
                ? { lat: Number(geo['latitude']), lng: Number(geo['longitude']) }
                : null,
            website: safeUrl(String(obj['url'] ?? '')),
            phone: String(obj['telephone'] ?? '').trim() || null,
            images: [],
            amenities: [],
            fetchedAt,
          })
        } else {
          // Event
          const location = (obj['location'] ?? {}) as Record<string, unknown>
          const locAddress = (location['address'] ?? {}) as Record<string, unknown>

          results.push({
            source: 'patroc',
            sourceId: `patroc-event-${name.toLowerCase().replace(/\s+/g, '-')}-${obj['startDate'] ?? ''}`,
            entityType: 'event',
            url: String(obj['url'] ?? pageUrl),
            name,
            description: String(obj['description'] ?? '').trim() || null,
            tags: ['lgbtq+', 'event'],
            city: String(locAddress['addressLocality'] ?? location['name'] ?? '').trim() || null,
            country: String(locAddress['addressCountry'] ?? '').trim() || null,
            startDatetime: obj['startDate'] as string ?? null,
            endDatetime: obj['endDate'] as string ?? null,
            ticketUrl: safeUrl(obj['url'] as string),
            images: [],
            amenities: [],
            fetchedAt,
          })
        }
      }
    } catch {
      // Ignore
    }
  })

  if (results.length > 0) return results

  // HTML card fallback
  const cardSelectors = [
    '[class*="venue"]',
    '[class*="event-card"]',
    '[class*="listing"]',
    'article',
    '.card',
  ]

  for (const selector of cardSelectors) {
    if ($(selector).length === 0) continue

    $(selector).each((_i, el) => {
      const nameEl = $(el).find('h2, h3, h4, [class*="title"], [class*="name"]').first()
      const name = nameEl.text().trim()
      if (!name || name.length < 2) return

      const link = $(el).find('a').first().attr('href')
      const itemUrl = link
        ? safeUrl(link.startsWith('http') ? link : `${BASE_URL}${link}`) ?? pageUrl
        : pageUrl

      const description = stripHtml($(el).find('p').first().html() ?? '') || null

      const imgSrc = $(el).find('img').first().attr('src')
      const images: string[] = imgSrc
        ? [safeUrl(imgSrc.startsWith('http') ? imgSrc : `${BASE_URL}${imgSrc}`) ?? ''].filter(Boolean)
        : []

      const hasDate = $(el).find('time, [class*="date"]').length > 0
      const entityType = hasDate ? 'event' : 'venue'
      const dateEl = $(el).find('time, [class*="date"]').first()
      const startDatetime = hasDate
        ? (dateEl.attr('datetime') ?? (dateEl.text().trim() || null))
        : undefined

      const cityEl = $(el).find('[class*="city"], [class*="location"]').first()
      const city = cityEl.text().trim() || null

      results.push({
        source: 'patroc',
        sourceId: `patroc-${entityType}-${name.toLowerCase().replace(/\s+/g, '-')}`,
        entityType,
        url: itemUrl,
        name,
        description,
        tags: ['lgbtq+'],
        city,
        images: images as string[],
        startDatetime,
        amenities: [],
        fetchedAt,
      })
    })

    if (results.length > 0) break
  }

  return results
}
