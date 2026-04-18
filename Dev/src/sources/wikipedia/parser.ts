/**
 * Wikipedia "List of gay villages" HTML parser.
 *
 * The page at https://en.wikipedia.org/wiki/List_of_gay_villages
 * contains a table (or multiple tables) with columns:
 *   Name | City | Country | Notes
 *
 * This parser extracts all rows and maps them to SourceRawEntity objects.
 */
import { load } from 'cheerio'
import { safeUrl } from '../../utils/text.js'
import type { SourceRawEntity } from '../../normalize/schema.js'

const WIKIPEDIA_BASE = 'https://en.wikipedia.org'
const PAGE_URL = `${WIKIPEDIA_BASE}/wiki/List_of_gay_villages`

export function parseGayVillages(html: string): SourceRawEntity[] {
  const $ = load(html)
  const results: SourceRawEntity[] = []
  const fetchedAt = new Date().toISOString()
  const skipHeadings = new Set(['contents', 'references', 'see also', 'notes', 'external links', 'further reading'])

  // The page has per-country wikitables. Country is the section heading above each table.
  // Table columns: Name | City | Reference (NOT country)
  $('table.wikitable').each((_i, table) => {
    // Find country from preceding h2/h3 heading
    let country = ''
    let prev = $(table).prev()
    while (prev.length) {
      const tag = (prev[0] as unknown as { tagName?: string }).tagName?.toLowerCase()
      if (tag === 'h2' || tag === 'h3') {
        country = prev.find('.mw-headline').text().trim() || prev.text().replace(/\[edit\]/gi, '').trim()
        break
      }
      prev = prev.prev()
    }
    if (!country || skipHeadings.has(country.toLowerCase())) return

    $(table).find('tbody tr').each((_j, row) => {
      const cells = $(row).find('td')
      if (cells.length < 2) return

      const nameCell = cells.eq(0)
      const cityCell = cells.eq(1)

      const name = nameCell.find('a').first().text().trim() || nameCell.text().trim()
      if (!name || name.toLowerCase() === 'name') return

      const nameLink = nameCell.find('a').first().attr('href')
      const wikipediaUrl = nameLink
        ? safeUrl(
            nameLink.startsWith('http')
              ? nameLink
              : `${WIKIPEDIA_BASE}${nameLink}`
          )
        : null

      const city = cityCell.find('a').first().text().trim() || cityCell.text().trim()

      let geo: { lat: number; lng: number } | null = null
      const geoSpan = $(row).find('.geo')
      if (geoSpan.length) {
        const [latStr, lngStr] = geoSpan.text().split(';')
        const lat = parseFloat(latStr?.trim() ?? '')
        const lng = parseFloat(lngStr?.trim() ?? '')
        if (!isNaN(lat) && !isNaN(lng)) geo = { lat, lng }
      }

      const sourceId = `wikipedia-place-${name.toLowerCase().replace(/\s+/g, '-')}-${country.toLowerCase().replace(/\s+/g, '-')}`

      results.push({
        source: 'wikipedia',
        sourceId,
        entityType: 'place',
        url: PAGE_URL,
        name,
        description: null,
        tags: ['gay village', 'lgbtq+'],
        city: city || null,
        country: country || null,
        geo,
        placeType: 'gay village',
        wikipediaUrl,
        images: [],
        amenities: [],
        fetchedAt,
      })
    })
  })

  // Fallback: try list-based structure (some Wikipedia pages use <ul>)
  if (results.length === 0) {
    parseListFormat($, results, fetchedAt)
  }

  return results.filter((r) => r.name.length > 0)
}

/**
 * Fallback parser for list-based page structure.
 * Handles country sections with <h2>/<h3> headings followed by <ul> lists.
 */
function parseListFormat(
  $: ReturnType<typeof load>,
  results: SourceRawEntity[],
  fetchedAt: string
): void {
  let currentCountry = ''

  $('h2, h3, ul li').each((_i, el) => {
    const tag = (el as { tagName?: string }).tagName?.toLowerCase()

    if (tag === 'h2' || tag === 'h3') {
      const text = $(el).text().replace(/\[edit\]/gi, '').trim()
      if (text && !['contents', 'references', 'see also', 'notes'].includes(text.toLowerCase())) {
        currentCountry = text
      }
      return
    }

    if (tag === 'li' && currentCountry) {
      const link = $(el).find('a').first()
      const name = link.text().trim() || $(el).text().split('–')[0]?.trim() || ''
      if (!name || name.length < 2) return

      const href = link.attr('href')
      const wikipediaUrl = href
        ? safeUrl(href.startsWith('http') ? href : `https://en.wikipedia.org${href}`)
        : null

      const rawText = $(el).text()
      // Try to extract city from "Name, City" pattern
      const parts = rawText.split(/[,\-–]/)
      const city = parts.length > 1 ? parts[1]?.trim() ?? null : null

      const sourceId = `wikipedia-place-${name.toLowerCase().replace(/\s+/g, '-')}-${currentCountry.toLowerCase().replace(/\s+/g, '-')}`

      results.push({
        source: 'wikipedia',
        sourceId,
        entityType: 'place',
        url: 'https://en.wikipedia.org/wiki/List_of_gay_villages',
        name,
        description: rawText.trim() || null,
        tags: ['gay village', 'lgbtq+'],
        city,
        country: currentCountry,
        placeType: 'gay village',
        wikipediaUrl,
        images: [],
        amenities: [],
        fetchedAt,
      })
    }
  })
}
