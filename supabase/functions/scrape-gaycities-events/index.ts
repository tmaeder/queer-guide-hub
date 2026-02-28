import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'
import { getCorsHeaders, requireAdmin, errorResponse } from '../_shared/supabase-client.ts'
import { normalizeScrapedContent } from '../_shared/ai-enrichment.ts'

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
]

const BASE_URL = 'https://www.gaytravel4u.com'

// Major LGBTQ+ event cities available on GayTravel4u
const DEFAULT_CITIES = [
  'amsterdam', 'barcelona', 'berlin', 'london', 'paris',
  'new-york', 'san-francisco', 'los-angeles', 'miami', 'chicago',
  'sydney', 'bangkok', 'madrid', 'cologne', 'lisbon',
  'rome', 'tel-aviv', 'toronto', 'montreal', 'mexico-city',
]

// Map city slugs to display names and countries
const CITY_INFO: Record<string, { displayName: string; country: string }> = {
  'amsterdam': { displayName: 'Amsterdam', country: 'Netherlands' },
  'barcelona': { displayName: 'Barcelona', country: 'Spain' },
  'berlin': { displayName: 'Berlin', country: 'Germany' },
  'london': { displayName: 'London', country: 'United Kingdom' },
  'paris': { displayName: 'Paris', country: 'France' },
  'new-york': { displayName: 'New York', country: 'USA' },
  'san-francisco': { displayName: 'San Francisco', country: 'USA' },
  'los-angeles': { displayName: 'Los Angeles', country: 'USA' },
  'miami': { displayName: 'Miami', country: 'USA' },
  'chicago': { displayName: 'Chicago', country: 'USA' },
  'sydney': { displayName: 'Sydney', country: 'Australia' },
  'bangkok': { displayName: 'Bangkok', country: 'Thailand' },
  'madrid': { displayName: 'Madrid', country: 'Spain' },
  'cologne': { displayName: 'Cologne', country: 'Germany' },
  'lisbon': { displayName: 'Lisbon', country: 'Portugal' },
  'rome': { displayName: 'Rome', country: 'Italy' },
  'tel-aviv': { displayName: 'Tel Aviv', country: 'Israel' },
  'toronto': { displayName: 'Toronto', country: 'Canada' },
  'montreal': { displayName: 'Montreal', country: 'Canada' },
  'mexico-city': { displayName: 'Mexico City', country: 'Mexico' },
  'fort-lauderdale': { displayName: 'Fort Lauderdale', country: 'USA' },
  'seattle': { displayName: 'Seattle', country: 'USA' },
  'portland': { displayName: 'Portland', country: 'USA' },
  'austin': { displayName: 'Austin', country: 'USA' },
  'denver': { displayName: 'Denver', country: 'USA' },
  'atlanta': { displayName: 'Atlanta', country: 'USA' },
  'boston': { displayName: 'Boston', country: 'USA' },
  'philadelphia': { displayName: 'Philadelphia', country: 'USA' },
  'washington-dc': { displayName: 'Washington DC', country: 'USA' },
  'houston': { displayName: 'Houston', country: 'USA' },
  'dallas': { displayName: 'Dallas', country: 'USA' },
  'munich': { displayName: 'Munich', country: 'Germany' },
  'vienna': { displayName: 'Vienna', country: 'Austria' },
  'zurich': { displayName: 'Zurich', country: 'Switzerland' },
  'brussels': { displayName: 'Brussels', country: 'Belgium' },
  'dublin': { displayName: 'Dublin', country: 'Ireland' },
  'copenhagen': { displayName: 'Copenhagen', country: 'Denmark' },
  'stockholm': { displayName: 'Stockholm', country: 'Sweden' },
  'prague': { displayName: 'Prague', country: 'Czech Republic' },
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

interface ScrapedEvent {
  title: string
  description?: string
  start_date?: string
  end_date?: string
  venue_name?: string
  city: string
  country: string
  address?: string
  website?: string
  images?: string[]
  event_type: string
  source_url: string
}

/**
 * Parse GayTravel4u date format: "Feb. 13.2026" or "Mar. 05.2026"
 * Returns ISO date string or undefined
 */
function parseGT4UDate(dateStr: string): string | undefined {
  if (!dateStr) return undefined
  const cleaned = dateStr.trim()

  // Format: "Feb. 13.2026" or "Mar. 05.2026"
  const gt4uMatch = cleaned.match(/^([A-Za-z]{3})\.?\s*(\d{1,2})\.(\d{4})$/)
  if (gt4uMatch) {
    const monthNames: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    }
    const month = monthNames[gt4uMatch[1].toLowerCase()]
    if (month !== undefined) {
      const day = parseInt(gt4uMatch[2], 10)
      const year = parseInt(gt4uMatch[3], 10)
      const d = new Date(year, month, day)
      if (!isNaN(d.getTime())) return d.toISOString()
    }
  }

  // Fallback: standard date formats like "2026-03-05" or "Feb 14, 2026"
  try {
    const d = new Date(cleaned)
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2024) return d.toISOString()
  } catch { /* ignore */ }

  return undefined
}

/**
 * Parse a GayTravel4u city events page
 *
 * Actual DOM structure (Enfold/Avia WordPress theme):
 *   article.slide-entry
 *     └── div.slide-content
 *          ├── header.entry-content-header
 *          │    └── h3.slide-entry-title > a[href] → Event Title
 *          ├── div (no class) → "From: Feb. 13.2026 - To: Feb. 13.2026"
 *          ├── div.slide-meta
 *          │    └── time.slide-meta-time → "Sunday, Feb 27th, 2022" (WP published date — IGNORE)
 *          └── div.slide-entry-excerpt.entry-content → Description text
 */
function parseEventsPage(html: string, pageUrl: string, citySlug: string): ScrapedEvent[] {
  const $ = cheerio.load(html)
  const events: ScrapedEvent[] = []
  const cityInfo = CITY_INFO[citySlug] || {
    displayName: citySlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    country: 'Unknown'
  }

  // Strategy 1: Look for JSON-LD Event structured data
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || '{}')
      const items = Array.isArray(json) ? json : json['@graph'] ? json['@graph'] : [json]
      for (const item of items) {
        if (item['@type'] === 'Event' || item['@type']?.includes('Event')) {
          events.push({
            title: item.name || '',
            description: item.description || undefined,
            start_date: item.startDate || undefined,
            end_date: item.endDate || undefined,
            venue_name: item.location?.name || undefined,
            city: item.location?.address?.addressLocality || cityInfo.displayName,
            country: item.location?.address?.addressCountry || cityInfo.country,
            address: item.location?.address?.streetAddress || undefined,
            website: null, // Never store scraper source URLs — only real event websites
            images: item.image ? [typeof item.image === 'string' ? item.image : item.image.url] : [],
            event_type: 'LGBTQ+ Event',
            source_url: pageUrl,
          })
        }
      }
    } catch { /* ignore invalid JSON-LD */ }
  })

  // Strategy 2: Parse HTML article/card elements
  // GayTravel4u uses Enfold theme with article.slide-entry cards
  let $cards = $('article.slide-entry')
  if ($cards.length === 0) $cards = $('article')
  if ($cards.length === 0) $cards = $('.post, .entry, .hentry')

  const existingTitles = new Set(events.map(e => e.title.toLowerCase()))

  $cards.each((_, el) => {
    const $el = $(el)

    // Get title from h3 (inside header.entry-content-header) or h2
    const $titleEl = $el.find('h3 a, h2 a, .entry-title a, .slide-entry-title a').first()
    const title = $titleEl.text().trim()
    if (!title || title.length < 3) return

    // Skip if already found via JSON-LD
    if (existingTitles.has(title.toLowerCase())) return
    existingTitles.add(title.toLowerCase())

    // Get event link
    const eventLink = $titleEl.attr('href') || ''

    // Get image
    const image = $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src') || ''

    // Parse dates and description from child elements
    let startDate = ''
    let endDate = ''
    let description = ''

    // Get description from the excerpt div (specific class)
    const excerptText = $el.find('.slide-entry-excerpt, .entry-content').first().text().trim()
    if (excerptText && excerptText.length > 10) {
      description = excerptText
    }

    // Search ALL child divs and p tags inside slide-content for "From:" date
    const $slideContent = $el.find('.slide-content').first()
    const $searchContext = $slideContent.length > 0 ? $slideContent : $el

    $searchContext.children('div, p, span').each((_, childEl) => {
      const childText = $(childEl).text().trim()

      // Check for "From: ... - To: ..." pattern
      const fromToMatch = childText.match(/^From:\s*(.+?)\s*-\s*To:\s*(.+?)$/i)
      if (fromToMatch) {
        startDate = fromToMatch[1].trim()
        endDate = fromToMatch[2].trim()
        return
      }

      // Check for just "From: ..." (no end date)
      const fromOnlyMatch = childText.match(/^From:\s*(.+?)$/i)
      if (fromOnlyMatch) {
        startDate = fromOnlyMatch[1].trim()
        return
      }
    })

    // If still no date, try the fullText approach on the entire card
    if (!startDate) {
      const fullText = $el.text()
      const fromToFullMatch = fullText.match(/From:\s*([A-Za-z]{3}\.?\s*\d{1,2}\.\d{4})\s*-\s*To:\s*([A-Za-z]{3}\.?\s*\d{1,2}\.\d{4})/i)
      if (fromToFullMatch) {
        startDate = fromToFullMatch[1].trim()
        endDate = fromToFullMatch[2].trim()
      }
    }

    // If still no description, grab longest non-date text
    if (!description) {
      $searchContext.children('div, p').each((_, childEl) => {
        const $child = $(childEl)
        const childText = $child.text().trim()
        // Skip date divs and WP published date (slide-meta)
        if (childText.startsWith('From:')) return
        if ($child.hasClass('slide-meta') || $child.find('time').length > 0) return
        if (/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s/i.test(childText)) return
        if (childText.length > description.length && childText.length > 10) {
          description = childText
        }
      })
    }

    events.push({
      title,
      description: description ? description.slice(0, 1000) : undefined,
      start_date: parseGT4UDate(startDate) || undefined,
      end_date: parseGT4UDate(endDate) || undefined,
      city: cityInfo.displayName,
      country: cityInfo.country,
      website: null, // Never store scraper source URLs — only real event websites
      images: image ? [image.startsWith('http') ? image : `${BASE_URL}${image}`] : [],
      event_type: 'LGBTQ+ Event',
      source_url: pageUrl,
    })
  })

  return events
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Require admin authentication
    const authResult = await requireAdmin(req, supabase)
    if (authResult instanceof Response) return authResult

    const body = await req.json().catch(() => ({}))

    // Config options:
    // cities: string[] — city slugs to scrape (default: top 20 LGBTQ+ cities)
    // city_info: Record<string, {displayName, country}> — optional overrides for city display names/countries
    // max_cities: number — limit number of cities to scrape (default: 20)
    const rawMaxCities = body.max_cities || 20
    const cities = body.cities || DEFAULT_CITIES
    const maxCities = Math.min(Math.max(1, rawMaxCities), 50)

    // Create a local copy of CITY_INFO merged with any overrides from the request
    const cityInfoLookup: Record<string, { displayName: string; country: string }> = { ...CITY_INFO }
    if (body.city_info && typeof body.city_info === 'object') {
      for (const [slug, info] of Object.entries(body.city_info)) {
        if (!cityInfoLookup[slug] && info && typeof info === 'object') {
          cityInfoLookup[slug] = info as { displayName: string; country: string }
        }
      }
    }

    // Get or create source
    const { data: source } = await supabase
      .from('ingestion_sources')
      .select('id')
      .eq('slug', 'gaycities-events')
      .single()

    // Create ingestion job
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

    const citiesToScrape = cities.slice(0, maxCities)

    for (const city of citiesToScrape) {
      // GayTravel4u URL pattern: /gay-{city}-events/
      const url = `${BASE_URL}/gay-${city}-events/`
      log.push(`Scraping: ${url}`)
      console.log(`Scraping: ${url}`)

      try {
        const html = await fetchPage(url)
        const events = parseEventsPage(html, url, city)

        if (events.length === 0) {
          log.push(`No events found for ${city}`)
          continue
        }

        log.push(`Found ${events.length} events in ${cityInfoLookup[city]?.displayName || city}`)

        // AI enrichment — normalize scraped content before staging
        const rows = []
        for (const event of events) {
          const normalized: Record<string, any> = {
            title: event.title,
            description: event.description || null,
            event_type: event.event_type,
            start_date: event.start_date || new Date().toISOString(),
            end_date: event.end_date || null,
            venue_name: event.venue_name || null,
            city: event.city,
            country: event.country,
            address: event.address || null,
            website: event.website || null,
            images: event.images || [],
            featured: false,
            status: 'active',
            is_public: true,
          }

          // Enrich with AI if available
          try {
            const aiNormalized = await normalizeScrapedContent(supabase, event, 'events')
            if (aiNormalized) {
              if (aiNormalized.description && !normalized.description) normalized.description = aiNormalized.description
              if (aiNormalized.tags) normalized.tags = aiNormalized.tags
              if (aiNormalized.title) normalized.title = aiNormalized.title
            }
          } catch (e) { console.warn('AI normalization skipped for event:', event.title, e) }

          rows.push({
            job_id: jobId,
            source_type: 'gaytravel4u',
            target_table: 'events',
            raw_data: event,
            normalized_data: normalized,
          })
        }

        const { error: insertError } = await supabase.from('ingestion_staging').insert(rows)
        if (insertError) {
          errors.push(`Staging insert failed for ${url}: ${insertError.message}`)
        } else {
          totalFetched += events.length
        }

        // Rate limit between cities (2s to be respectful)
        await new Promise(r => setTimeout(r, 2000))
      } catch (err) {
        errors.push(`Failed to scrape ${url}: ${(err as Error).message}`)
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

    // Trigger pipeline if we have items
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
    console.error('Event scraper error:', error)
    return errorResponse('Internal server error')
  }
})
