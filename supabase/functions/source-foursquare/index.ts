import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { withCircuitBreaker } from '../_shared/circuit-breaker.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging, MissingCredentialsError, InvalidCredentialsError, skippedResponse } from '../_shared/source-adapter.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// ============================================================
// Source: Foursquare Places API v3
// Replaces: import-foursquare-venues
// ============================================================

const FSQ_BASE = 'https://api.foursquare.com/v3/places/search'
const FSQ_FIELDS = 'fsq_id,name,geocodes,location,categories,description,tel,website,email,hours,rating,price,photos,features,tastes'

const SEARCH_TERMS = ['gay bar', 'lgbtq', 'pride', 'queer', 'drag', 'leather bar']
// Foursquare v3 category IDs for accommodations (https://docs.foursquare.com/data-products/docs/categories)
const HOTEL_CATEGORY_IDS = '19014,19015,19016,19009,19021,19011' // hotel, hostel, b&b, resort, motel, lodging
const HOTEL_TERMS = ['gay friendly hotel', 'lgbtq hotel', 'gay bed and breakfast', 'gay guesthouse', 'gay resort']

const DEFAULT_CITIES = [
  'New York, NY', 'San Francisco, CA', 'Los Angeles, CA', 'Chicago, IL',
  'London, UK', 'Berlin, Germany', 'Amsterdam, Netherlands', 'Paris, France',
  'Barcelona, Spain', 'Sydney, Australia', 'Toronto, Canada', 'Bangkok, Thailand',
  'Tel Aviv, Israel', 'Buenos Aires, Argentina', 'Mexico City, Mexico',
  'Sao Paulo, Brazil', 'Madrid, Spain', 'Lisbon, Portugal', 'Montreal, Canada', 'Miami, FL',
]

const foursquareAdapter: SourceAdapter = {
  name: 'foursquare',
  entityType: 'venue',

  async fetch(config: AdapterConfig): Promise<RawItem[]> {
    const apiKey = config.apiKey || Deno.env.get('FOURSQUARE_API_KEY')
    if (!apiKey) throw new MissingCredentialsError('FOURSQUARE_API_KEY')

    const supabase = getServiceClient()
    const cities = (config.filters?.cities as string[]) || getCityForHour()
    const limit = config.batchSize || 20
    const radius = String(config.filters?.radius || 30000)
    const mode  = (config.filters?.mode as string) || 'all'  // 'venues' | 'hotels' | 'all'
    // Custom terms (admin import dialog) override the curated term sets.
    const customTerms = config.filters?.terms as string[] | undefined
    const terms = customTerms?.length ? customTerms
                : mode === 'hotels' ? HOTEL_TERMS
                : mode === 'venues' ? SEARCH_TERMS
                : [...SEARCH_TERMS, ...HOTEL_TERMS]
    const allItems: RawItem[] = []
    let attempts = 0
    let failures = 0

    for (const city of cities) {
      for (const term of terms) {
        try {
          attempts++
          const isHotelTerm = HOTEL_TERMS.includes(term)
          const items = await withCircuitBreaker(supabase, 'foursquare', async () => {
            const params = new URLSearchParams({
              near: city,
              query: term,
              limit: String(limit),
              radius,
              fields: FSQ_FIELDS,
            })
            if (isHotelTerm) params.set('categories', HOTEL_CATEGORY_IDS)
            const res = await fetch(`${FSQ_BASE}?${params}`, {
              headers: { 'Authorization': apiKey, 'Accept': 'application/json' },
            })
            // A rejected credential is NOT an API failure and must not be thrown
            // from inside the breaker. `withCircuitBreaker` calls recordFailure
            // before the error can propagate, so the old `throw` on 401 burned a
            // breaker failure that the handler's skippedResponse('invalid_
            // credentials') branch could never take back — 350 recorded
            // failures, success_count 0, and the automation layer none the wiser.
            // The repo contract already says a MISSING credential returns 200
            // skipped so an unset key does not look like an outage; an INVALID
            // one is the same class. The round-trip itself succeeded, so the
            // breaker is told the truth: Foursquare answered.
            if (res.status === 401 || res.status === 403) {
              return { authFailed: res.status }
            }
            if (!res.ok) throw new Error(`Foursquare API ${res.status}`)
            const json = await res.json()
            return json.results || []
          })

          if (!Array.isArray(items) && items?.authFailed) {
            throw new InvalidCredentialsError('FOURSQUARE_API_KEY', items.authFailed)
          }

          for (const place of items) {
            allItems.push({
              sourceId: place.fsq_id || `fsq-${Date.now()}`,
              data: { ...place, _search_city: city, _search_term: term, _is_accommodation: isHotelTerm },
            })
          }

          // Rate limit between search terms
          await new Promise(r => setTimeout(r, 200))
        } catch (e) {
          if (e instanceof InvalidCredentialsError) throw e // key issue, stop entirely
          failures++
          console.error(`Foursquare error for "${term}" in ${city}:`, (e as Error).message)
        }
      }
      // Rate limit between cities
      await new Promise(r => setTimeout(r, 500))
    }

    // A per-item catch that only logs, plus a handler that returns
    // {success:true, items:0} at HTTP 200, is how a source can fail every single
    // upstream call for months while `admin_automation_runs` records 'success'
    // and `consecutive_failures` stays 0 — which makes auto_pause_threshold
    // structurally unreachable. (Measured on the eventbrite twin: breaker at 500
    // failures, the 12:30 cron run logged 'success' at 12:32.) `source-awin` is
    // the control: its breaker call is not inside a per-item catch, so it
    // surfaces a 500 and auto-paused correctly at 33.
    //
    // Total failure only. A partial failure still returns its rows — losing 19
    // good cities because the 20th 500s would be worse than the bug.
    if (attempts > 0 && failures === attempts && allItems.length === 0) {
      throw new Error(`Foursquare: all ${attempts} requests failed, 0 items fetched`)
    }

    // Deduplicate by fsq_id within the batch
    const seen = new Set<string>()
    return allItems.filter(item => {
      const id = item.sourceId
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
  },

  normalize(raw: RawItem): NormalizedItem {
    const d = raw.data
    const geo = (d.geocodes as Record<string, Record<string, number>>)?.main || {}
    const loc = (d.location as Record<string, unknown>) || {}
    const cats = (d.categories as Array<Record<string, unknown>>) || []
    const catNames = cats.map(c => String(c.name ?? '').toLowerCase())
    const isHotel = Boolean(d._is_accommodation) ||
      catNames.some(n => /(hotel|hostel|bed.*breakfast|b&b|resort|motel|guesthouse|guest house|inn|lodging)/.test(n))
    const accType = isHotel
      ? (catNames.find(n => /b&b|bed.*breakfast/.test(n)) ? 'bnb'
       : catNames.find(n => /hostel/.test(n))           ? 'hostel'
       : catNames.find(n => /resort/.test(n))           ? 'resort'
       : catNames.find(n => /guest/.test(n))            ? 'guesthouse'
       : 'hotel')
      : null

    return {
      entityType: 'venue',
      sourceId: raw.sourceId,
      sourceName: 'foursquare',
      name: String(d.name || '').slice(0, 200),
      description: String(d.description || ''),
      location: {
        lat: geo.latitude || null,
        lng: geo.longitude || null,
        address: String(loc.formatted_address || loc.address || ''),
        city: String(loc.locality || loc.region || d._search_city || ''),
        country: String(loc.country || ''),
        countryCode: String(loc.country_code || '').toUpperCase(),
      },
      urls: d.website ? [String(d.website)] : [],
      images: extractPhotos(d.photos as Array<Record<string, unknown>>),
      tags: extractFsqTags(cats, d.tastes as string[], d.features as Record<string, unknown>),
      contacts: {
        phone: d.tel ? String(d.tel) : undefined,
        website: d.website ? String(d.website) : undefined,
        email: d.email ? String(d.email) : undefined,
      },
      ...(accType ? { accommodation_type: accType } : {}),
      metadata: {
        foursquare_id: raw.sourceId,
        foursquare_rating: d.rating,
        price_range: d.price,
        hours: d.hours,
        categories: cats.map(c => c.name),
        features: d.features,
        platform_ids: { foursquare: raw.sourceId },
        data_source: 'foursquare',
      },
    } as NormalizedItem
  },

  getSourceId(raw: RawItem): string {
    return raw.sourceId
  },
}

function getCityForHour(): string[] {
  const hour = new Date().getUTCHours()
  return [DEFAULT_CITIES[hour % DEFAULT_CITIES.length]]
}

function extractPhotos(photos: Array<Record<string, unknown>> | undefined): string[] {
  if (!photos) return []
  return photos.slice(0, 3).map(p => `${p.prefix}300x300${p.suffix}`).filter(Boolean)
}

function extractFsqTags(
  categories: Array<Record<string, unknown>>,
  tastes: string[] | undefined,
  _features: Record<string, unknown> | undefined
): string[] {
  const tags = new Set<string>()
  for (const cat of categories) {
    if (cat.name) tags.add(String(cat.name).toLowerCase())
  }
  if (tastes) {
    for (const taste of tastes.slice(0, 10)) tags.add(taste.toLowerCase())
  }
  return [...tags].slice(0, 15)
}

// ─── HTTP Handler ────────────────────────────────────────────

Deno.serve(withErrorReporting('source-foursquare', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth

  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const config: AdapterConfig = {
      batchSize: body.limit || body.batch_size || 20,
      filters: { cities: body.cities, mode: body.mode || 'all', terms: body.terms, radius: body.radius },
      apiKey: body.apiKey || Deno.env.get('FOURSQUARE_API_KEY'),
      dryRun: body.dry_run || false,
      pipelineRunId: body.pipeline_run_id,
      nodeId: body.node_id,
    }

    const rawItems = await foursquareAdapter.fetch(config)

    if (config.dryRun) {
      return jsonResponse({ success: true, items: rawItems.length, dry_run: true }, 200, req)
    }

    const written = await writeToStaging(supabase, foursquareAdapter, rawItems, {
      ...config,
      targetTable: 'venues',
      // Admin-triggered imports tag their staged rows 'import-foursquare' so
      // ingestion_staging.source_type continuity survives the import-* removal.
      sourceType: body.sourceType,
    })

    return jsonResponse({
      success: true,
      items: written,
      items_total: rawItems.length,
      items_processed: written,
      items_succeeded: written,
      items_failed: 0,
    }, 200, req)
  } catch (error) {
    if (error instanceof MissingCredentialsError) {
      return jsonResponse(skippedResponse('missing_credentials', error.missing), 200, req)
    }
    if (error instanceof InvalidCredentialsError) {
      // Typed, not a message substring: the old `.includes('401')` also matched
      // any upstream body or message that happened to contain "401", and it ran
      // only after the breaker had already recorded the failure.
      return jsonResponse(skippedResponse('invalid_credentials', error.missing), 200, req)
    }
    console.error('source-foursquare error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
