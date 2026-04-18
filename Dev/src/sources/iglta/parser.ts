/**
 * IGLTA Pride Calendar parser.
 *
 * Tries JSON-LD first, then falls back to HTML scraping.
 * URL: https://www.iglta.org/events/pride-calendar/
 */
import { load } from 'cheerio'
import { safeUrl, stripHtml } from '../../utils/text.js'
import { parseDate } from '../../utils/date.js'
import type { SourceRawEntity } from '../../normalize/schema.js'

const BASE_URL = 'https://www.iglta.org'

/** Extract JSON-LD Event schema objects from the page. */
function extractJsonLd(html: string): SourceRawEntity[] {
  const $ = load(html)
  const results: SourceRawEntity[] = []
  const fetchedAt = new Date().toISOString()

  $('script[type="application/ld+json"]').each((_i, el) => {
    let data: unknown
    try {
      data = JSON.parse($(el).html() ?? '')
    } catch {
      return
    }

    const items = Array.isArray(data) ? data : [data]
    for (const item of items) {
      if (
        typeof item !== 'object' ||
        item === null ||
        !('@type' in item)
      ) continue

      const obj = item as Record<string, unknown>
      if (obj['@type'] !== 'Event') continue

      const name = String(obj['name'] ?? '').trim()
      if (!name) continue

      const location = (obj['location'] ?? {}) as Record<string, unknown>
      const address = (location['address'] ?? {}) as Record<string, unknown>
      const city = String(address['addressLocality'] ?? location['name'] ?? '').trim() || null
      const country = String(address['addressCountry'] ?? '').trim() || null

      const startRaw = obj['startDate'] as string | undefined
      const endRaw = obj['endDate'] as string | undefined

      const website = safeUrl(
        (obj['url'] ?? obj['sameAs']) as string | undefined
      )

      const images: string[] = []
      const imageRaw = obj['image']
      if (typeof imageRaw === 'string') images.push(imageRaw)
      else if (Array.isArray(imageRaw)) images.push(...imageRaw.map(String))

      const sourceId = `iglta-event-${name.toLowerCase().replace(/\s+/g, '-')}-${startRaw ?? ''}`

      results.push({
        source: 'iglta',
        sourceId,
        entityType: 'event',
        url: `${BASE_URL}/events/pride-calendar/`,
        name,
        description: String(obj['description'] ?? '').trim() || null,
        tags: ['pride', 'lgbtq+', 'festival'],
        city,
        country,
        website,
        images: images.filter(Boolean) as string[],
        startDatetime: startRaw ?? null,
        endDatetime: endRaw ?? null,
        amenities: [],
        fetchedAt,
      })
    }
  })

  return results
}

/** HTML fallback: parse event cards from the IGLTA calendar page. */
export function parseIgltaCalendar(html: string): SourceRawEntity[] {
  // Try structured data first
  const jsonLdResults = extractJsonLd(html)
  if (jsonLdResults.length > 0) return jsonLdResults

  // HTML fallback
  const $ = load(html)
  const results: SourceRawEntity[] = []
  const fetchedAt = new Date().toISOString()

  // IGLTA uses various card layouts – try common selectors
  const cardSelectors = [
    '.event-card',
    '.tribe-event',
    'article[class*="event"]',
    '.views-row',
    '.event-item',
    '.event-listing-item',
  ]

  for (const selector of cardSelectors) {
    if ($(selector).length === 0) continue

    $(selector).each((_i, el) => {
      const titleEl = $(el).find('h2, h3, h4, .event-title, .tribe-event-url').first()
      const name = titleEl.text().trim()
      if (!name) return

      const link = titleEl.find('a').attr('href') ?? $(el).find('a').first().attr('href')
      const eventUrl = link
        ? safeUrl(link.startsWith('http') ? link : `${BASE_URL}${link}`) ?? `${BASE_URL}/events/pride-calendar/`
        : `${BASE_URL}/events/pride-calendar/`

      const dateEl = $(el).find('[class*="date"], time, .tribe-event-date-start').first()
      const dateText = dateEl.attr('datetime') ?? dateEl.text().trim()

      const locationEl = $(el).find('[class*="location"], [class*="venue"], .tribe-venue').first()
      const locationText = locationEl.text().trim()

      // Try to parse city/country from location text
      const locationParts = locationText.split(',').map((s) => s.trim())
      const city = locationParts[locationParts.length - 2] ?? null
      const country = locationParts[locationParts.length - 1] ?? null

      const description = stripHtml(
        $(el).find('[class*="description"], [class*="excerpt"], p').first().html() ?? ''
      )

      const imgSrc = $(el).find('img').first().attr('src')
      const images: string[] = imgSrc ? [safeUrl(imgSrc.startsWith('http') ? imgSrc : `${BASE_URL}${imgSrc}`) ?? ''].filter(Boolean) : []

      const sourceId = `iglta-event-${name.toLowerCase().replace(/\s+/g, '-')}-${dateText}`

      results.push({
        source: 'iglta',
        sourceId,
        entityType: 'event',
        url: eventUrl,
        name,
        description: description || null,
        tags: ['pride', 'lgbtq+'],
        city: city || null,
        country: country || null,
        startDatetime: dateText || null,
        images: images as string[],
        amenities: [],
        fetchedAt,
      })
    })

    if (results.length > 0) break
  }

  return results
}

/** Parse a single IGLTA event detail page. */
export function parseIgltaEventDetail(html: string, url: string): SourceRawEntity | null {
  // Try JSON-LD first
  const fromJsonLd = extractJsonLd(html)
  if (fromJsonLd[0]) {
    return { ...fromJsonLd[0], url }
  }

  const $ = load(html)
  const fetchedAt = new Date().toISOString()

  const name =
    ($('h1').first().text().trim() || $('meta[property="og:title"]').attr('content')) ?? ''
  if (!name) return null

  const description =
    $('meta[property="og:description"]').attr('content') ??
    stripHtml($('.event-description, .entry-content').first().html() ?? '')

  const dateEl = $('time').first()
  const startDatetime = dateEl.attr('datetime') ?? (dateEl.text().trim() || null)

  const locationText = $('[class*="location"], [class*="venue"]').first().text().trim()
  const locationParts = locationText.split(',').map((s) => s.trim())

  const imgSrc =
    $('meta[property="og:image"]').attr('content') ??
    $('img.event-image, .wp-post-image').first().attr('src')

  const ticketUrl = safeUrl(
    $('a[href*="ticket"], a[href*="register"], a.buy-tickets').first().attr('href')
  )

  const sourceId = `iglta-event-detail-${name.toLowerCase().replace(/\s+/g, '-')}`

  return {
    source: 'iglta',
    sourceId,
    entityType: 'event',
    url,
    name,
    description: description || null,
    tags: ['pride', 'lgbtq+'],
    city: locationParts[locationParts.length - 2] ?? null,
    country: locationParts[locationParts.length - 1] ?? null,
    startDatetime,
    ticketUrl,
    images: imgSrc ? [imgSrc].filter(Boolean) : [],
    amenities: [],
    fetchedAt,
  }
}
