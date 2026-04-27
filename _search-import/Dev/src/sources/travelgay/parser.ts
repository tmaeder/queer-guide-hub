/**
 * TravelGay parser.
 *
 * URL: https://www.travelgay.com/
 * TravelGay is a JS-heavy site (React). Playwright is required.
 *
 * The site lists LGBTQ+ venues (bars, clubs, saunas, etc.) by city.
 * Parsing strategy:
 *   1. Try JSON-LD LocalBusiness schema
 *   2. Fallback: HTML card selectors
 */
import { safeUrl, stripHtml } from '../../utils/text.js'
import type { SourceRawEntity } from '../../normalize/schema.js'

const BASE_URL = 'https://www.travelgay.com'

export function parseTravelGayPage(html: string, pageUrl: string): SourceRawEntity[] {
  const { load } = require('cheerio') as typeof import('cheerio')
  const $ = load(html)
  const results: SourceRawEntity[] = []
  const fetchedAt = new Date().toISOString()

  // --- JSON-LD ---
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      const raw = JSON.parse($(el).html() ?? '')
      const items = Array.isArray(raw) ? raw : [raw]

      for (const item of items) {
        if (typeof item !== 'object' || item === null) continue
        const obj = item as Record<string, unknown>
        const schemaType = String(obj['@type'] ?? '')

        const venueTypes: Record<string, string> = {
          BarOrPub: 'bar',
          NightClub: 'club',
          LocalBusiness: 'venue',
          FoodEstablishment: 'cafe',
          Restaurant: 'restaurant',
          SpaOrBeautyParlor: 'sauna',
          Hotel: 'hotel',
          LodgingBusiness: 'accommodation',
        }

        if (!venueTypes[schemaType]) continue

        const name = String(obj['name'] ?? '').trim()
        if (!name) continue

        const address = (obj['address'] ?? {}) as Record<string, unknown>
        const geo = obj['geo'] as Record<string, unknown> | undefined

        const img = obj['image']
        const images: string[] = typeof img === 'string' ? [img] : Array.isArray(img) ? img.map(String) : []

        results.push({
          source: 'travelgay',
          sourceId: `travelgay-venue-${name.toLowerCase().replace(/\s+/g, '-')}`,
          entityType: 'venue',
          url: String(obj['url'] ?? pageUrl),
          name,
          description: String(obj['description'] ?? '').trim() || null,
          tags: ['lgbtq+', venueTypes[schemaType] ?? 'venue'],
          city: String(address['addressLocality'] ?? '').trim() || null,
          region: String(address['addressRegion'] ?? '').trim() || null,
          country: String(address['addressCountry'] ?? '').trim() || null,
          address: String(address['streetAddress'] ?? '').trim() || null,
          geo:
            geo && geo['latitude'] && geo['longitude']
              ? { lat: Number(geo['latitude']), lng: Number(geo['longitude']) }
              : null,
          website: safeUrl(String(obj['url'] ?? '')),
          phone: String(obj['telephone'] ?? '').trim() || null,
          images: images.map(safeUrl).filter((u): u is string => u !== null),
          openingHours: String(obj['openingHours'] ?? '').trim() || null,
          venueType: venueTypes[schemaType] ?? null,
          amenities: [],
          fetchedAt,
        })
      }
    } catch {
      // Ignore invalid JSON-LD
    }
  })

  if (results.length > 0) return results

  // --- HTML card fallback ---
  const cardSelectors = [
    '[class*="venue-card"]',
    '[class*="VenueCard"]',
    '[class*="place-card"]',
    '[class*="listing"]',
    'article[class*="venue"]',
    '.card',
  ]

  for (const selector of cardSelectors) {
    if ($(selector).length === 0) continue

    $(selector).each((_i, el) => {
      const titleEl = $(el).find('h2, h3, h4, [class*="title"], [class*="name"]').first()
      const name = titleEl.text().trim()
      if (!name || name.length < 2) return

      const link = $(el).find('a').first().attr('href')
      const itemUrl = link
        ? safeUrl(link.startsWith('http') ? link : `${BASE_URL}${link}`) ?? pageUrl
        : pageUrl

      const description = stripHtml(
        $(el).find('p, [class*="description"]').first().html() ?? ''
      )

      const imgSrc = $(el).find('img').first().attr('src')
      const images: string[] = imgSrc
        ? [safeUrl(imgSrc.startsWith('http') ? imgSrc : `${BASE_URL}${imgSrc}`) ?? ''].filter(Boolean)
        : []

      const cityEl = $(el).find('[class*="city"], [class*="location"], [class*="area"]').first()
      const city = cityEl.text().trim() || null

      const categoryEl = $(el).find('[class*="category"], [class*="type"]').first()
      const venueType = categoryEl.text().trim().toLowerCase() || null

      results.push({
        source: 'travelgay',
        sourceId: `travelgay-venue-${name.toLowerCase().replace(/\s+/g, '-')}`,
        entityType: 'venue',
        url: itemUrl,
        name,
        description: description || null,
        tags: ['lgbtq+', ...(venueType ? [venueType] : [])],
        city,
        venueType,
        images: images as string[],
        amenities: [],
        fetchedAt,
      })
    })

    if (results.length > 0) break
  }

  return results
}

/** Parse a single TravelGay venue detail page. */
export function parseTravelGayDetail(html: string, url: string): SourceRawEntity | null {
  const { load } = require('cheerio') as typeof import('cheerio')
  const $ = load(html)
  const fetchedAt = new Date().toISOString()

  const name =
    ($('h1').first().text().trim() || $('meta[property="og:title"]').attr('content')) ?? ''
  if (!name) return null

  const description =
    $('meta[property="og:description"]').attr('content') ??
    stripHtml($('[class*="description"], .venue-description, .about').first().html() ?? '')

  const city =
    $('[class*="city"], [itemprop="addressLocality"]').first().text().trim() || null
  const country =
    $('[class*="country"], [itemprop="addressCountry"]').first().text().trim() || null
  const address =
    $('[itemprop="streetAddress"], [class*="address"]').first().text().trim() || null

  const phone =
    $('[itemprop="telephone"], a[href^="tel:"]').first().text().trim() || null
  const website =
    safeUrl($('a[href*="official"], [itemprop="url"]').first().attr('href'))

  const imgSrc =
    $('meta[property="og:image"]').attr('content') ??
    $('img.venue-image, .hero-image img').first().attr('src')

  const openingHours =
    $('[itemprop="openingHours"], [class*="hours"]').first().text().trim() || null

  return {
    source: 'travelgay',
    sourceId: `travelgay-venue-${name.toLowerCase().replace(/\s+/g, '-')}`,
    entityType: 'venue',
    url,
    name,
    description: description || null,
    tags: ['lgbtq+'],
    city,
    country,
    address,
    website,
    phone,
    openingHours,
    images: imgSrc ? [imgSrc] : [],
    amenities: [],
    fetchedAt,
  }
}
