import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'
import { getCorsHeaders, requireAdmin, errorResponse, getServiceClient } from '../_shared/supabase-client.ts'

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
]

const BASE_URL = 'https://spartacus.gayguide.travel'

// Default cities to scrape — major LGBTQ+ destinations
const DEFAULT_CITIES: Record<string, { continent: string; country: string; cities: string[] }> = {
  germany: { continent: 'europe', country: 'germany', cities: ['berlin', 'muenchen', 'koeln', 'hamburg', 'frankfurt'] },
  spain: { continent: 'europe', country: 'spain', cities: ['barcelona', 'madrid', 'sitges'] },
  uk: { continent: 'europe', country: 'unitedkingdom', cities: ['london', 'manchester', 'brighton'] },
  france: { continent: 'europe', country: 'france', cities: ['paris'] },
  netherlands: { continent: 'europe', country: 'netherlands', cities: ['amsterdam'] },
  thailand: { continent: 'asia', country: 'thailand', cities: ['bangkok', 'pattaya', 'chiangmai'] },
  usa: { continent: 'northamerica', country: 'usa', cities: ['newyork', 'sanfrancisco', 'losangeles', 'chicago', 'miami', 'fortlauderdale'] },
}

const fetchAttemptCounter = { value: 0 }

async function fetchPage(url: string, attempt = 0): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    fetchAttemptCounter.value++
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENTS[fetchAttemptCounter.value % USER_AGENTS.length],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': BASE_URL,
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.text()
  } catch (err) {
    clearTimeout(timeout)
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
      return fetchPage(url, attempt + 1)
    }
    throw err
  }
}

interface ScrapedVenue {
  name: string
  description?: string
  address?: string
  city: string
  country: string
  latitude?: number
  longitude?: number
  category: string
  venue_subtype?: string
  website?: string
  amenities?: string[]
  source_url: string
  spartacus_id?: string
}

// Map marker icon filenames to venue subtypes
const ICON_TO_SUBTYPE: Record<string, string> = {
  'saunamarker.png': 'Sauna',
  'barsmarker.png': 'Bar',
  'danceclubmarker.png': 'Club',
  'restaurantsmarker.png': 'Restaurant',
  'cafesmarker.png': 'Café',
  'shopsmarker.png': 'Shop',
  'hotelsmarker.png': 'Hotel',
  'cruisingmarker.png': 'Cruising',
  'beachesmarker.png': 'Beach',
}

/**
 * Fix double-encoded UTF-8 and HTML entities in marker names.
 * Cheerio's html() can produce double-encoded UTF-8 like "B\u00c3\u00a4r" instead of "Bär"
 */
function fixMarkerName(name: string): string {
  let fixed = name
  // Unescape JS unicode escapes if present
  fixed = fixed.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  )
  // Fix double-encoded UTF-8: bytes like C3 A4 → ä
  try {
    // Check if string contains characters in C2-C3 range (Latin-1 supplement range)
    if (/[\u00c0-\u00ff]/.test(fixed)) {
      const bytes = new Uint8Array(fixed.length)
      for (let i = 0; i < fixed.length; i++) bytes[i] = fixed.charCodeAt(i)
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      if (decoded.length < fixed.length) fixed = decoded
    }
  } catch { /* not double-encoded, keep as-is */ }
  // Decode HTML entities
  fixed = fixed.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  return fixed
}

/**
 * Parse a Spartacus city page (e.g. /saunas/europe/germany/berlin/)
 *
 * Main data source: `var markers = [...]` JavaScript array in the page.
 * Each marker: [lat, lng, "iconType.png", "Name", "<b><a href='...'>Name</a></b>"]
 *
 * Fallback: <li> elements with <h3> venue names (only featured/highlighted venues)
 */
function parseCityPage(html: string, pageUrl: string, venueType: string, cityName: string, countryName: string): ScrapedVenue[] {
  const $ = cheerio.load(html)
  const venues: ScrapedVenue[] = []
  const existingNames = new Set<string>()
  const defaultCategory = venueType === 'saunas' ? 'Sauna' : 'Bar / Club'

  // === PRIMARY: Extract from `var markers = [...]` JavaScript array ===
  // This contains ALL venues on the map (typically 50-300 per city)
  const scriptContent = $('script').map((_, el) => $(el).html()).get().join('\n')

  // Find the markers array: var markers = [[...], [...], ...]
  const markersMatch = scriptContent.match(/var\s+markers\s*=\s*(\[[\s\S]*?\])\s*;/)
  if (markersMatch) {
    try {
      // The markers array contains HTML strings with quotes, so we need careful parsing
      // Format: [lat, lng, "icon.png", "Name", "<b><a href=\"url\">Name</a></b>"]
      const markersStr = markersMatch[1]

      // Parse each marker entry using regex since JSON.parse won't work due to embedded HTML
      // Match individual marker arrays: [number, number, "string", "string", "string"]
      const markerEntryRegex = /\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*"([^"]*?)"\s*,\s*"([^"]*?)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\]/g
      let markerMatch
      while ((markerMatch = markerEntryRegex.exec(markersStr)) !== null) {
        const lat = parseFloat(markerMatch[1])
        const lng = parseFloat(markerMatch[2])
        const icon = markerMatch[3]
        const name = fixMarkerName(markerMatch[4])
        const popupHtml = markerMatch[5].replace(/\\"/g, '"').replace(/\\'/g, "'")

        if (!name || name.length < 2) continue
        if (existingNames.has(name.toLowerCase())) continue
        existingNames.add(name.toLowerCase())

        // Extract spartacus ID from popup HTML (but NOT the URL — it's a scraper source, not the venue's website)
        // Format: <b><a href="https://spartacus.gayguide.travel/goingout/berlin/37240_Bärenhöhle">Name</a></b>
        let spartacusId = ''
        const hrefMatch = popupHtml.match(/href=["']([^"']+)["']/)
        if (hrefMatch) {
          const idMatch = hrefMatch[1].match(/\/(\d+)_/)
          if (idMatch) spartacusId = idMatch[1]
        }

        // Determine subtype from icon
        const subtype = ICON_TO_SUBTYPE[icon] || defaultCategory

        venues.push({
          name,
          city: cityName,
          country: countryName,
          latitude: isNaN(lat) ? undefined : lat,
          longitude: isNaN(lng) ? undefined : lng,
          category: defaultCategory,
          venue_subtype: subtype,
          website: undefined, // Never store scraper source URLs
          source_url: pageUrl,
          spartacus_id: spartacusId || undefined,
        })
      }
    } catch (err) {
      console.error('Failed to parse markers array:', err)
    }
  }

  // === FALLBACK: Parse <li> items with venue details (featured venues with descriptions) ===
  $('li').each((_, el) => {
    const $el = $(el)

    const $h3 = $el.find('h3').first()
    if (!$h3.length) return

    const name = $h3.text().trim()
    if (!name || name.length < 2) return

    // If this venue was already found via markers, enrich it with description/address
    const existingIdx = venues.findIndex(v => v.name.toLowerCase() === name.toLowerCase())

    const venueLink = $h3.find('a').attr('href') || $el.find('a').first().attr('href') || ''

    // Extract address from first <a> (pattern: "Address | City")
    let address = ''
    const $firstLink = $el.find('a').first()
    const firstLinkText = $firstLink.text().trim()
    if (firstLinkText && firstLinkText !== name && firstLinkText.includes('|')) {
      address = firstLinkText.split('|')[0].trim()
    } else if (firstLinkText && firstLinkText !== name && firstLinkText.length > 3 && firstLinkText.length < 100) {
      address = firstLinkText
    }

    const description = $el.find('p').first().text().trim().replace(/more…$/i, '').trim()

    const amenities: string[] = []
    $el.find('img').each((_, img) => {
      const alt = $(img).attr('alt')?.trim()
      if (alt && alt.length > 2) amenities.push(alt)
    })

    let spartacusId = ''
    const idMatch = venueLink.match(/\/(\d+)_/)
    if (idMatch) spartacusId = idMatch[1]

    // venueLink is a Spartacus directory URL — never store as venue website

    if (existingIdx >= 0) {
      // Enrich existing marker venue with description, address, amenities
      if (address) venues[existingIdx].address = address
      if (description) venues[existingIdx].description = description.slice(0, 1000)
      if (amenities.length > 0) venues[existingIdx].amenities = amenities
      if (spartacusId && !venues[existingIdx].spartacus_id) venues[existingIdx].spartacus_id = spartacusId
    } else {
      // New venue not in markers
      existingNames.add(name.toLowerCase())
      venues.push({
        name,
        description: description ? description.slice(0, 1000) : undefined,
        address: address || undefined,
        city: cityName,
        country: countryName,
        category: defaultCategory,
        website: undefined, // Never store scraper source URLs
        amenities: amenities.length > 0 ? amenities : undefined,
        source_url: pageUrl,
        spartacus_id: spartacusId || undefined,
      })
    }
  })

  return venues
}

/**
 * Parse a country page (e.g. /saunas/europe/germany/) to get city links
 */
function parseCityLinks(html: string, venueType: string, continent: string, country: string): string[] {
  const $ = cheerio.load(html)
  const cityLinks: string[] = []
  const basePath = `/${venueType}/${continent}/${country}/`

  // Find all links that point to city pages under this country
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || ''
    // Match links like /saunas/europe/germany/berlin/ or full URLs
    const normalized = href.replace(BASE_URL, '')
    if (normalized.startsWith(basePath) && normalized !== basePath) {
      const citySlug = normalized.replace(basePath, '').replace(/\/$/, '').split('/')[0]
      if (citySlug && !citySlug.includes('?') && !citySlug.includes('#') && !citySlug.includes('_')) {
        if (!cityLinks.includes(citySlug)) {
          cityLinks.push(citySlug)
        }
      }
    }
  })

  return cityLinks
}

// Format country name for display
function formatName(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace('Unitedkingdom', 'United Kingdom')
    .replace('Usa', 'USA')
    .replace('Muenchen', 'Munich')
    .replace('Koeln', 'Cologne')
    .replace('Newyork', 'New York')
    .replace('Sanfrancisco', 'San Francisco')
    .replace('Losangeles', 'Los Angeles')
    .replace('Fortlauderdale', 'Fort Lauderdale')
    .replace('Chiangmai', 'Chiang Mai')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    const supabase = getServiceClient()

    // Require admin authentication
    const authResult = await requireAdmin(req, supabase)
    if (authResult instanceof Response) return authResult

    const body = await req.json().catch(() => ({}))

    // Config options:
    // venue_types: ['saunas', 'goingout'] — which venue categories to scrape
    // countries: ['germany', 'spain', 'usa'] — which countries (uses DEFAULT_CITIES for city list)
    // custom_cities: [{ continent, country, cities: [] }] — override city list
    // max_cities_per_country: number — limit cities per country (default: 5)
    // discover_cities: boolean — if true, also discover cities from country pages (default: false)
    const venueTypes = body.venue_types || body.paths?.map((p: string) =>
      p.includes('saunas') ? 'saunas' : 'goingout'
    ) || ['saunas', 'goingout']
    const countries = body.countries || Object.keys(DEFAULT_CITIES)
    const maxCitiesPerCountry = Math.min(Math.max(1, body.max_cities_per_country || 5), 20)
    const discoverCities = body.discover_cities || false

    // Get source
    const { data: source } = await supabase
      .from('ingestion_sources')
      .select('id')
      .eq('slug', 'spartacus')
      .single()

    // Create job
    const { data: job, error: jobError } = await supabase
      .from('import_jobs_enhanced')
      .insert({
        user_id: '00000000-0000-0000-0000-000000000000',
        source_id: source?.id || null,
        source_type: 'web_scraping',
        type: 'web-scraping',
        status: 'processing',
        pipeline_stage: 'fetching',
      })
      .select('id')
      .single()

    if (jobError || !job) {
      throw new Error(`Failed to create job: ${jobError?.message}`)
    }

    const jobId = job.id
    let totalFetched = 0
    const errors: string[] = []
    const log: string[] = []

    for (const venueType of venueTypes) {
      for (const countryKey of countries) {
        const countryConfig = DEFAULT_CITIES[countryKey]
        if (!countryConfig) {
          log.push(`Unknown country key: ${countryKey}, skipping`)
          continue
        }

        const { continent, country } = countryConfig
        let citiesToScrape = [...countryConfig.cities]

        // Optionally discover more cities from the country page
        if (discoverCities) {
          try {
            const countryUrl = `${BASE_URL}/${venueType}/${continent}/${country}/`
            log.push(`Discovering cities from ${countryUrl}`)
            const countryHtml = await fetchPage(countryUrl)
            const discoveredCities = parseCityLinks(countryHtml, venueType, continent, country)
            log.push(`Discovered ${discoveredCities.length} cities for ${country}`)

            // Merge discovered cities with defaults (defaults first for priority)
            for (const city of discoveredCities) {
              if (!citiesToScrape.includes(city)) {
                citiesToScrape.push(city)
              }
            }
            await new Promise(r => setTimeout(r, 1500))
          } catch (err) {
            errors.push(`Failed to discover cities for ${country}: ${(err as Error).message}`)
          }
        }

        // Limit cities
        citiesToScrape = citiesToScrape.slice(0, maxCitiesPerCountry)

        for (const city of citiesToScrape) {
          const cityUrl = `${BASE_URL}/${venueType}/${continent}/${country}/${city}/`
          log.push(`Scraping: ${cityUrl}`)
          console.log(`Scraping: ${cityUrl}`)

          try {
            const html = await fetchPage(cityUrl)
            const venues = parseCityPage(html, cityUrl, venueType, formatName(city), formatName(country))

            if (venues.length === 0) {
              log.push(`No venues found on ${cityUrl}`)
              continue
            }

            log.push(`Found ${venues.length} venues in ${formatName(city)}, ${formatName(country)}`)

            const rows = venues.map(venue => ({
              job_id: jobId,
              source_type: 'spartacus',
              target_table: 'venues',
              raw_data: venue,
              normalized_data: {
                name: venue.name,
                description: venue.description || null,
                address: venue.address || '',
                city: venue.city,
                country: venue.country,
                latitude: venue.latitude || null,
                longitude: venue.longitude || null,
                category: venue.category,
                venue_subtype: venue.venue_subtype || venue.category,
                website: venue.website || null,
                images: [],
                data_source: 'spartacus',
                external_id: venue.spartacus_id
                  ? `spartacus-${venue.spartacus_id}`
                  : `spartacus-${venue.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}`,
                sync_status: 'synced',
                last_synced_at: new Date().toISOString(),
                verified: false,
                featured: false,
              },
            }))

            const { error: insertError } = await supabase.from('ingestion_staging').insert(rows)
            if (insertError) {
              errors.push(`Staging insert failed for ${cityUrl}: ${insertError.message}`)
            } else {
              totalFetched += venues.length
            }

            // Rate limiting: 1.5s between city pages
            await new Promise(r => setTimeout(r, 1500))
          } catch (err) {
            errors.push(`Failed to scrape ${cityUrl}: ${(err as Error).message}`)
          }
        }

        // Rate limiting: 2s between countries
        await new Promise(r => setTimeout(r, 2000))
      }
    }

    // Update job
    await supabase.from('import_jobs_enhanced').update({
      items_fetched: totalFetched,
      pipeline_stage: totalFetched > 0 ? 'ai_validation' : 'completed',
      status: totalFetched > 0 ? 'processing' : (errors.length > 0 ? 'failed' : 'completed'),
      ...(errors.length > 0 || log.length > 0 ? { error_report: { errors, log } } : {}),
    }).eq('id', jobId)

    // Update source
    if (source?.id) {
      await supabase.from('ingestion_sources').update({
        last_run_at: new Date().toISOString(),
        total_items_fetched: totalFetched,
        ...(totalFetched > 0 ? { last_success_at: new Date().toISOString(), last_error: null } : {}),
        ...(errors.length > 0 && totalFetched === 0 ? { last_error: errors[0] } : {}),
      }).eq('id', source.id)
    }

    // Trigger pipeline
    if (totalFetched > 0) {
      supabase.functions.invoke('ingestion-pipeline', {
        body: { job_id: jobId, stage: 'ai_validation' },
      }).catch(err => console.error('Pipeline trigger failed:', err))
    }

    return new Response(JSON.stringify({
      success: true,
      job_id: jobId,
      total_fetched: totalFetched,
      log: log.slice(0, 50),
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Spartacus scraper error:', error)
    return errorResponse('Internal server error')
  }
})
