/**
 * Outsavvy Guide parser.
 *
 * URL: https://www.outsavvy.com/guide
 * Outsavvy is a React SPA – Playwright is required.
 *
 * The guide lists LGBTQ+ venues and events by city.
 * This parser handles:
 *   - Venue cards in the guide section
 *   - Event cards linked from the guide
 */
import { safeUrl, stripHtml } from '../../utils/text.js'
import type { SourceRawEntity } from '../../normalize/schema.js'

const BASE_URL = 'https://www.outsavvy.com'

/** Parse rendered HTML (after Playwright has evaluated JS). */
export function parseOutsavvyGuide(html: string, pageUrl: string): SourceRawEntity[] {
  // Dynamic import to avoid loading cheerio in tests that don't need it
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
        const type = obj['@type']

        if (type === 'LocalBusiness' || type === 'BarOrPub' || type === 'NightClub') {
          const name = String(obj['name'] ?? '').trim()
          if (!name) continue

          const address = (obj['address'] ?? {}) as Record<string, unknown>
          const geo = obj['geo'] as Record<string, unknown> | undefined

          results.push({
            source: 'outsavvy',
            sourceId: `outsavvy-venue-${name.toLowerCase().replace(/\s+/g, '-')}`,
            entityType: 'venue',
            url: String(obj['url'] ?? pageUrl),
            name,
            description: String(obj['description'] ?? '').trim() || null,
            tags: ['lgbtq+', String(type).toLowerCase()],
            city: String(address['addressLocality'] ?? '').trim() || null,
            country: String(address['addressCountry'] ?? '').trim() || null,
            address: String(address['streetAddress'] ?? '').trim() || null,
            geo:
              geo?.latitude && geo?.longitude
                ? { lat: Number(geo['latitude']), lng: Number(geo['longitude']) }
                : null,
            website: safeUrl(obj['url'] as string),
            phone: String(obj['telephone'] ?? '').trim() || null,
            images: [],
            openingHours: String(obj['openingHours'] ?? '').trim() || null,
            amenities: [],
            fetchedAt,
          })
        }

        if (type === 'Event') {
          const name = String(obj['name'] ?? '').trim()
          if (!name) continue

          const location = (obj['location'] ?? {}) as Record<string, unknown>
          const locAddress = (location['address'] ?? {}) as Record<string, unknown>

          results.push({
            source: 'outsavvy',
            sourceId: `outsavvy-event-${name.toLowerCase().replace(/\s+/g, '-')}-${obj['startDate'] ?? ''}`,
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
      // Ignore malformed JSON-LD
    }
  })

  if (results.length > 0) return results

  // HTML fallback: Outsavvy uses a.search-nav-item cards
  const seen = new Set<string>()
  $('a.search-nav-item[href*="/event/"]').each((_i, el) => {
    const href = $(el).attr('href') ?? ''
    const idMatch = href.match(/\/event\/(\d+)/)
    if (!idMatch) return
    const eventId = idMatch[1]!
    if (seen.has(eventId)) return
    seen.add(eventId)

    const name = $(el).find('p.search-nav-title').first().text().trim()
    if (!name || name.length < 2) return

    const dateText = $(el).find('p.search-nav-description-date').first().text().trim()
    const descPs = $(el).find('p.search-nav-description').not('.search-nav-description-date')
    const locationText = descPs.first().text().trim().replace(/\s+/g, ' ')
    const price = $(el).find('.feature-price').text().trim()
    const imgSrc = $(el).find('img.search-nav-item-theimage').first().attr('src') ||
      $(el).find('img').first().attr('src')
    const images: string[] = imgSrc
      ? [safeUrl(imgSrc.startsWith('http') ? imgSrc : `${BASE_URL}${imgSrc}`) ?? ''].filter(Boolean)
      : []

    const locParts = locationText.split(',').map((s) => s.trim())
    const city = locParts.length >= 2 ? locParts[locParts.length - 1] : null

    results.push({
      source: 'outsavvy',
      sourceId: `outsavvy-${eventId}`,
      entityType: 'event',
      url: safeUrl(`${BASE_URL}${href}`) ?? pageUrl,
      name,
      description: price || null,
      tags: ['lgbtq+', 'event'],
      city,
      images: images as string[],
      startDatetime: dateText || null,
      ticketUrl: safeUrl(`${BASE_URL}${href}`),
      amenities: [],
      fetchedAt,
    })
  })

  // Legacy fallback: try old-style card selectors too
  if (results.length === 0) {
    const cardSelectors = ['[class*="venue-card"]', '[class*="listing-card"]', 'article']
    for (const sel of cardSelectors) {
      if ($(sel).length === 0) continue
      $(sel).each((_i, el) => {
        const titleEl = $(el).find('h2, h3, h4, [class*="title"], [class*="name"]').first()
        const name = titleEl.text().trim()
        if (!name || name.length < 2) return
        const link = $(el).find('a').first().attr('href')
        const itemUrl = link
          ? safeUrl(link.startsWith('http') ? link : `${BASE_URL}${link}`) ?? pageUrl
          : pageUrl
        results.push({
          source: 'outsavvy',
          sourceId: `outsavvy-venue-${name.toLowerCase().replace(/\s+/g, '-')}`,
          entityType: 'venue',
          url: itemUrl,
          name,
          description: null,
          tags: ['lgbtq+'],
          images: [],
          amenities: [],
          fetchedAt,
        })
      })
      if (results.length > 0) break
    }
  }

  return results
}

/** Parse a single Outsavvy venue/event detail page. */
export function parseOutsavvyDetail(
  html: string,
  url: string
): SourceRawEntity | null {
  const { load } = require('cheerio') as typeof import('cheerio')
  const $ = load(html)
  const fetchedAt = new Date().toISOString()

  const name =
    ($('h1').first().text().trim() || $('meta[property="og:title"]').attr('content')) ?? ''
  if (!name) return null

  const description =
    $('meta[property="og:description"]').attr('content') ??
    stripHtml($('[class*="description"], .event-body, .venue-description').first().html() ?? '')

  const hasDate = $('time, [class*="date"]').length > 0

  return {
    source: 'outsavvy',
    sourceId: `outsavvy-detail-${name.toLowerCase().replace(/\s+/g, '-')}`,
    entityType: hasDate ? 'event' : 'venue',
    url,
    name,
    description: description || null,
    tags: ['lgbtq+'],
    startDatetime: hasDate
      ? ($('time').first().attr('datetime') ?? ($('time').first().text().trim() || null))
      : undefined,
    images: [],
    amenities: [],
    fetchedAt,
  }
}
