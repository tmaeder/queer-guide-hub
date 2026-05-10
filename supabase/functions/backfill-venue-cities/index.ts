import { getServiceClient, requireAdmin, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

// Batch geocode venues missing city data.
// Two modes controlled by `mode` param:
//   "reverse" (default) — venues with coords but no city_id → reverse geocode
//   "forward"           — venues with address but no coords → forward geocode
//
// Uses Nominatim (public or self-hosted). Public rate limit: 1 req/sec.
// Call with: { "mode": "forward", "batch_size": 25 }
// Idempotent & resumable — always picks the next unprocessed batch.

const NOMINATIM_BASE = (Deno.env.get('NOMINATIM_URL') || 'https://nominatim.openstreetmap.org').replace(/\/$/, '')
const NOMINATIM_AUTH = Deno.env.get('NOMINATIM_BASIC_AUTH') || ''
const SLEEP_MS = Deno.env.get('NOMINATIM_URL') ? 50 : 1100

interface NominatimAddress {
  city?: string
  town?: string
  village?: string
  municipality?: string
  county?: string
  state?: string
  country?: string
  country_code?: string
}

interface NominatimResult {
  lat?: string
  lon?: string
  address?: NominatimAddress
}

interface VenueResult {
  id: string
  status: string
  city_name?: string
  city_id?: string
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

function nominatimHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': 'QueerGuide/1.0 (https://queer.guide)',
    'Accept': 'application/json',
  }
  if (NOMINATIM_AUTH) {
    h['Authorization'] = `Basic ${btoa(NOMINATIM_AUTH)}`
  }
  return h
}

// Shared: match a city name (+ optional country code) against our cities table
async function matchCity(
  supabase: ReturnType<typeof getServiceClient>,
  cityName: string,
  countryCode: string | null,
): Promise<{ id: string; country_id: string } | null> {
  // Try name + country first
  if (countryCode) {
    const { data } = await supabase
      .from('cities')
      .select('id, country_id')
      .ilike('name', cityName)
      .eq('country_code', countryCode)
      .is('duplicate_of_id', null)
      .order('population', { ascending: false, nullsFirst: false })
      .limit(1)
      .single()
    if (data) return data
  }
  // Fallback: name only, largest by population
  const { data } = await supabase
    .from('cities')
    .select('id, country_id')
    .ilike('name', cityName)
    .is('duplicate_of_id', null)
    .order('population', { ascending: false, nullsFirst: false })
    .limit(1)
    .single()
  return data || null
}

async function resolveCountryId(
  supabase: ReturnType<typeof getServiceClient>,
  countryCode: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('countries')
    .select('id')
    .eq('code', countryCode)
    .is('duplicate_of_id', null)
    .limit(1)
    .single()
  return data?.id || null
}

function extractCity(addr: NominatimAddress): string | null {
  return addr.city || addr.town || addr.village || addr.municipality || null
}

// ── Reverse geocode: coords → city ──────────────────────────────────────────

async function processReverse(
  supabase: ReturnType<typeof getServiceClient>,
  batchSize: number,
): Promise<{ results: VenueResult[]; remaining: number }> {
  const { data: venues, error } = await supabase
    .from('venues')
    .select('id, latitude, longitude, city, country, country_id')
    .is('city_id', null)
    .is('duplicate_of_id', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('id')
    .limit(batchSize)

  if (error) throw error
  if (!venues?.length) return { results: [], remaining: 0 }

  const { count } = await supabase
    .from('venues')
    .select('id', { count: 'exact', head: true })
    .is('city_id', null)
    .is('duplicate_of_id', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)

  const results: VenueResult[] = []

  for (const venue of venues) {
    try {
      const url = `${NOMINATIM_BASE}/reverse?format=json&lat=${venue.latitude}&lon=${venue.longitude}&zoom=10&addressdetails=1`
      const res = await fetch(url, { headers: nominatimHeaders() })
      if (!res.ok) {
        results.push({ id: venue.id, status: `nominatim_error_${res.status}` })
        await sleep(SLEEP_MS)
        continue
      }

      const data = await res.json() as NominatimResult
      if (!data.address) {
        results.push({ id: venue.id, status: 'no_address' })
        await sleep(SLEEP_MS)
        continue
      }

      const cityName = extractCity(data.address)
      const countryCode = data.address.country_code?.toUpperCase() || null

      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

      if (cityName) {
        if (!venue.city) update.city = cityName
        const cityMatch = await matchCity(supabase, cityName, countryCode)
        if (cityMatch) {
          update.city_id = cityMatch.id
          if (!venue.country_id) update.country_id = cityMatch.country_id
        }
      }

      if (!venue.country_id && countryCode) {
        const cid = await resolveCountryId(supabase, countryCode)
        if (cid) update.country_id = cid
      }
      if (!venue.country && countryCode) update.country = countryCode

      await supabase.from('venues').update(update).eq('id', venue.id)
      results.push({ id: venue.id, status: update.city_id ? 'matched' : cityName ? 'city_text_only' : 'no_city_in_response', city_name: cityName || undefined })
    } catch (err) {
      results.push({ id: venue.id, status: `error: ${(err as Error).message}` })
    }
    await sleep(SLEEP_MS)
  }

  return { results, remaining: (count || 0) - results.length }
}

// ── Forward geocode: address → coords + city ────────────────────────────────

function isUsableAddress(address: string, name: string): boolean {
  // Skip addresses that are just the venue name repeated, or too short
  const a = address.trim().toLowerCase()
  const n = name.trim().toLowerCase()
  if (a === n) return false
  if (a.length < 5) return false
  // Must contain at least a comma or number (looks like a real address)
  if (!a.includes(',') && !/\d/.test(a) && a.split(/\s+/).length < 3) return false
  return true
}

async function processForward(
  supabase: ReturnType<typeof getServiceClient>,
  batchSize: number,
): Promise<{ results: VenueResult[]; remaining: number }> {
  // Venues with address but no coords and no city_id, not yet attempted
  const { data: venues, error } = await supabase
    .from('venues')
    .select('id, name, address, city, country, country_id')
    .is('city_id', null)
    .is('duplicate_of_id', null)
    .or('latitude.is.null,longitude.is.null')
    .not('address', 'is', null)
    .neq('address', '')
    .or('geocode_attempted.is.null,geocode_attempted.eq.false')
    .order('id')
    .limit(batchSize * 2) // fetch extra since we skip bad addresses

  if (error) throw error
  if (!venues?.length) return { results: [], remaining: 0 }

  // Filter to usable addresses
  const usable = venues.filter(v => isUsableAddress(v.address!, v.name))
  const batch = usable.slice(0, batchSize)

  // Mark skipped venues so we don't re-fetch them (null out address for junk ones)
  const skipped = venues.filter(v => !isUsableAddress(v.address!, v.name))
  if (skipped.length > 0) {
    // Set a geocode_skipped flag via city field marker so we don't loop
    for (const v of skipped) {
      await supabase.from('venues').update({
        geocode_attempted: true,
        updated_at: new Date().toISOString(),
      }).eq('id', v.id)
    }
  }

  const { count } = await supabase
    .from('venues')
    .select('id', { count: 'exact', head: true })
    .is('city_id', null)
    .is('duplicate_of_id', null)
    .or('latitude.is.null,longitude.is.null')
    .not('address', 'is', null)
    .neq('address', '')
    .or('geocode_attempted.is.null,geocode_attempted.eq.false')

  if (!batch.length) return { results: [], remaining: count || 0 }

  const results: VenueResult[] = []

  for (const venue of batch) {
    try {
      const q = encodeURIComponent(venue.address!)
      const url = `${NOMINATIM_BASE}/search?format=json&q=${q}&limit=1&addressdetails=1`
      const res = await fetch(url, { headers: nominatimHeaders() })
      if (!res.ok) {
        results.push({ id: venue.id, status: `nominatim_error_${res.status}` })
        await sleep(SLEEP_MS)
        continue
      }

      const data = (await res.json()) as NominatimResult[]
      if (!data?.length) {
        // Mark as attempted so we skip next time
        await supabase.from('venues').update({
          geocode_attempted: true,
          updated_at: new Date().toISOString(),
        }).eq('id', venue.id)
        results.push({ id: venue.id, status: 'no_results' })
        await sleep(SLEEP_MS)
        continue
      }

      const hit = data[0]
      const lat = hit.lat ? parseFloat(hit.lat) : null
      const lon = hit.lon ? parseFloat(hit.lon) : null
      const addr = hit.address
      const cityName = addr ? extractCity(addr) : null
      const countryCode = addr?.country_code?.toUpperCase() || null

      const update: Record<string, unknown> = {
        geocode_attempted: true,
        updated_at: new Date().toISOString(),
      }

      // Set coordinates
      if (lat && lon && lat !== 0 && lon !== 0) {
        update.latitude = lat
        update.longitude = lon
      }

      // Set city
      if (cityName) {
        if (!venue.city) update.city = cityName
        const cityMatch = await matchCity(supabase, cityName, countryCode)
        if (cityMatch) {
          update.city_id = cityMatch.id
          if (!venue.country_id) update.country_id = cityMatch.country_id
        }
      }

      // Set country
      if (!venue.country_id && countryCode) {
        const cid = await resolveCountryId(supabase, countryCode)
        if (cid) update.country_id = cid
      }
      if (!venue.country && countryCode) update.country = countryCode

      await supabase.from('venues').update(update).eq('id', venue.id)
      results.push({
        id: venue.id,
        status: update.city_id ? 'matched' : cityName ? 'geocoded_no_city_match' : lat ? 'coords_only' : 'no_useful_data',
        city_name: cityName || undefined,
        city_id: update.city_id as string | undefined,
      })
    } catch (err) {
      results.push({ id: venue.id, status: `error: ${(err as Error).message}` })
    }
    await sleep(SLEEP_MS)
  }

  return { results, remaining: (count || 0) - results.length }
}

// ── Single venue (trigger mode) ────────────────────────────────────────────

async function processSingleVenue(
  supabase: ReturnType<typeof getServiceClient>,
  venueId: string,
): Promise<{ venue_id: string; status: string; city_name?: string; city_id?: string }> {
  const { data: venue, error } = await supabase
    .from('venues')
    .select('id, name, address, latitude, longitude, city, country, country_id, city_id')
    .eq('id', venueId)
    .single()

  if (error || !venue) return { venue_id: venueId, status: 'not_found' }
  if (venue.city_id) return { venue_id: venueId, status: 'already_has_city_id' }

  const hasCoords = venue.latitude && venue.longitude && venue.latitude !== 0 && venue.longitude !== 0
  const hasAddress = venue.address && isUsableAddress(venue.address, venue.name)

  if (!hasCoords && !hasAddress) return { venue_id: venueId, status: 'no_geocodable_data' }

  try {
    let nominatimData: NominatimResult | null = null

    if (hasCoords) {
      const url = `${NOMINATIM_BASE}/reverse?format=json&lat=${venue.latitude}&lon=${venue.longitude}&zoom=10&addressdetails=1`
      const res = await fetch(url, { headers: nominatimHeaders() })
      if (res.ok) nominatimData = await res.json() as NominatimResult
    } else if (hasAddress) {
      const url = `${NOMINATIM_BASE}/search?format=json&q=${encodeURIComponent(venue.address!)}&limit=1&addressdetails=1`
      const res = await fetch(url, { headers: nominatimHeaders() })
      if (res.ok) {
        const arr = await res.json() as NominatimResult[]
        if (arr?.length) nominatimData = arr[0]
      }
    }

    if (!nominatimData?.address) return { venue_id: venueId, status: 'no_nominatim_result' }

    const cityName = extractCity(nominatimData.address)
    const countryCode = nominatimData.address.country_code?.toUpperCase() || null
    const update: Record<string, unknown> = { geocode_attempted: true, updated_at: new Date().toISOString() }

    // Set coords from forward geocode
    if (!hasCoords && nominatimData.lat && nominatimData.lon) {
      const lat = parseFloat(nominatimData.lat)
      const lon = parseFloat(nominatimData.lon)
      if (lat !== 0 && lon !== 0) { update.latitude = lat; update.longitude = lon }
    }

    if (cityName) {
      if (!venue.city) update.city = cityName
      const cityMatch = await matchCity(supabase, cityName, countryCode)
      if (cityMatch) {
        update.city_id = cityMatch.id
        if (!venue.country_id) update.country_id = cityMatch.country_id
      }
    }

    if (!venue.country_id && countryCode) {
      const cid = await resolveCountryId(supabase, countryCode)
      if (cid) update.country_id = cid
    }
    if (!venue.country && countryCode) update.country = countryCode

    const { error: updateErr } = await supabase.from('venues').update(update).eq('id', venue.id)
    if (updateErr) {
      console.error('Venue update failed:', updateErr)
      return { venue_id: venueId, status: `update_error: ${updateErr.message}` }
    }

    return {
      venue_id: venueId,
      status: update.city_id ? 'matched' : cityName ? 'geocoded_no_city_match' : 'no_city_in_response',
      city_name: cityName || undefined,
      city_id: update.city_id as string | undefined,
    }
  } catch (err) {
    return { venue_id: venueId, status: `error: ${(err as Error).message}` }
  }
}

// ── Single event (trigger mode) ────────────────────────────────────────────

async function processSingleEvent(
  supabase: ReturnType<typeof getServiceClient>,
  eventId: string,
): Promise<{ event_id: string; status: string; city_name?: string; city_id?: string }> {
  const { data: event, error } = await supabase
    .from('events')
    .select('id, title, venue_id, latitude, longitude, city_id, country_id')
    .eq('id', eventId)
    .single()

  if (error || !event) return { event_id: eventId, status: 'not_found' }
  if (event.city_id) return { event_id: eventId, status: 'already_has_city_id' }

  // Try inheriting from venue first
  if (event.venue_id) {
    const { data: venue } = await supabase
      .from('venues')
      .select('city_id, country_id')
      .eq('id', event.venue_id)
      .single()
    if (venue?.city_id) {
      const upd: Record<string, unknown> = { city_id: venue.city_id, updated_at: new Date().toISOString() }
      if (!event.country_id && venue.country_id) upd.country_id = venue.country_id
      const { error: updateErr } = await supabase.from('events').update(upd).eq('id', event.id)
      if (updateErr) return { event_id: eventId, status: `update_error: ${updateErr.message}` }
      return { event_id: eventId, status: 'inherited_from_venue', city_id: venue.city_id }
    }
  }

  // Fall back to Nominatim reverse geocode
  const hasCoords = event.latitude && event.longitude && event.latitude !== 0 && event.longitude !== 0
  if (!hasCoords) return { event_id: eventId, status: 'no_geocodable_data' }

  try {
    const url = `${NOMINATIM_BASE}/reverse?format=json&lat=${event.latitude}&lon=${event.longitude}&zoom=10&addressdetails=1`
    const res = await fetch(url, { headers: nominatimHeaders() })
    if (!res.ok) return { event_id: eventId, status: `nominatim_error_${res.status}` }

    const data = await res.json() as NominatimResult
    if (!data.address) return { event_id: eventId, status: 'no_nominatim_result' }

    const cityName = extractCity(data.address)
    const countryCode = data.address.country_code?.toUpperCase() || null
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (cityName) {
      const cityMatch = await matchCity(supabase, cityName, countryCode)
      if (cityMatch) {
        update.city_id = cityMatch.id
        if (!event.country_id) update.country_id = cityMatch.country_id
      }
    }

    if (!event.country_id && !update.country_id && countryCode) {
      const cid = await resolveCountryId(supabase, countryCode)
      if (cid) update.country_id = cid
    }

    if (Object.keys(update).length > 1) {
      const { error: updateErr } = await supabase.from('events').update(update).eq('id', event.id)
      if (updateErr) return { event_id: eventId, status: `update_error: ${updateErr.message}` }
    }

    return {
      event_id: eventId,
      status: update.city_id ? 'matched' : cityName ? 'geocoded_no_city_match' : 'no_city_in_response',
      city_name: cityName || undefined,
      city_id: update.city_id as string | undefined,
    }
  } catch (err) {
    return { event_id: eventId, status: `error: ${(err as Error).message}` }
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  try {
    const supabase = getServiceClient()
    const isAdmin = await requireAdmin(req, supabase).catch(() => false)
    const webhookSecret = req.headers.get('x-webhook-secret')
    const expectedSecret = Deno.env.get('WEBHOOK_SECRET') || 'meilisearch-sync-webhook-2026'
    const isWebhook = webhookSecret === expectedSecret

    if (!isAdmin && !isWebhook) {
      return errorResponse('Unauthorized', 401, req)
    }

    const body = await req.json().catch(() => ({}))
    const mode = body.mode || 'reverse'
    const batchSize = Math.min(body.batch_size || 25, 50)
    const venueId = body.venue_id as string | undefined
    const eventId = body.event_id as string | undefined

    // Single-record mode (called from DB triggers)
    if (venueId) {
      const singleResult = await processSingleVenue(supabase, venueId)
      return jsonResponse({ success: true, mode: 'single', ...singleResult }, 200, req)
    }
    if (eventId) {
      const singleResult = await processSingleEvent(supabase, eventId)
      return jsonResponse({ success: true, mode: 'single', ...singleResult }, 200, req)
    }

    let result: { results: VenueResult[]; remaining: number }

    switch (mode) {
      case 'reverse':
        result = await processReverse(supabase, batchSize)
        break
      case 'forward':
        result = await processForward(supabase, batchSize)
        break
      default:
        return errorResponse(`Unknown mode: ${mode}. Use "reverse" or "forward".`, 400, req)
    }

    if (!result.results.length) {
      return jsonResponse({ success: true, mode, message: 'No venues to process', processed: 0, remaining: 0 }, 200, req)
    }

    const matched = result.results.filter(r => r.status === 'matched').length
    const geocoded = result.results.filter(r => ['geocoded_no_city_match', 'coords_only', 'city_text_only'].includes(r.status)).length
    const skipped = result.results.filter(r => ['no_results', 'no_address', 'no_city_in_response'].includes(r.status)).length
    const errors = result.results.filter(r => r.status.startsWith('error') || r.status.startsWith('nominatim_error')).length

    return jsonResponse({
      success: true,
      mode,
      processed: result.results.length,
      matched,
      geocoded,
      skipped,
      errors,
      remaining: result.remaining,
      results: result.results,
    }, 200, req)
  } catch (error) {
    console.error('Backfill error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
