import { getServiceClient, requireAdmin, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

// Batch reverse-geocode venues that have coordinates but no city_id.
// Uses Nominatim (public or self-hosted) to resolve lat/lng → city name,
// then matches against the cities table to set city_id + country_id.
//
// Call with: { "batch_size": 25 }
// Idempotent & resumable — always picks the next batch of unprocessed venues.
// At 1.1s/req public Nominatim, batch of 25 = ~28s (under 60s timeout).

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

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

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
    const batchSize = Math.min(body.batch_size || 25, 50)

    // Fetch venues needing city_id backfill
    const { data: venues, error: fetchErr } = await supabase
      .from('venues')
      .select('id, latitude, longitude, city, country, country_id')
      .is('city_id', null)
      .is('duplicate_of_id', null)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('id')
      .limit(batchSize)

    if (fetchErr) throw fetchErr
    if (!venues || venues.length === 0) {
      return jsonResponse({ success: true, message: 'No venues to process', processed: 0, remaining: 0 }, 200, req)
    }

    // Count remaining for progress reporting
    const { count: remaining } = await supabase
      .from('venues')
      .select('id', { count: 'exact', head: true })
      .is('city_id', null)
      .is('duplicate_of_id', null)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)

    const results: { id: string; status: string; city_name?: string; city_id?: string }[] = []

    for (const venue of venues) {
      try {
        // Reverse geocode
        const url = `${NOMINATIM_BASE}/reverse?format=json&lat=${venue.latitude}&lon=${venue.longitude}&zoom=10&addressdetails=1`
        const headers: Record<string, string> = {
          'User-Agent': 'QueerGuide/1.0 (https://queer.guide)',
          'Accept': 'application/json',
        }
        if (NOMINATIM_AUTH) {
          headers['Authorization'] = `Basic ${btoa(NOMINATIM_AUTH)}`
        }

        const res = await fetch(url, { headers })
        if (!res.ok) {
          results.push({ id: venue.id, status: `nominatim_error_${res.status}` })
          await sleep(SLEEP_MS)
          continue
        }

        const data = await res.json() as { address?: NominatimAddress }
        const addr = data.address
        if (!addr) {
          results.push({ id: venue.id, status: 'no_address' })
          await sleep(SLEEP_MS)
          continue
        }

        // Extract city name from Nominatim response (tries multiple fields)
        const cityName = addr.city || addr.town || addr.village || addr.municipality || null
        const countryCode = addr.country_code?.toUpperCase() || null

        if (!cityName) {
          // No city found — at least update the city text field with county/state
          const fallback = addr.county || addr.state || null
          if (fallback && !venue.city) {
            await supabase
              .from('venues')
              .update({ city: fallback, updated_at: new Date().toISOString() })
              .eq('id', venue.id)
          }
          results.push({ id: venue.id, status: 'no_city_in_response' })
          await sleep(SLEEP_MS)
          continue
        }

        // Try to match city in our cities table
        // First: exact name + country match
        let cityMatch = null as { id: string; country_id: string } | null

        if (countryCode) {
          const { data: match } = await supabase
            .from('cities')
            .select('id, country_id')
            .ilike('name', cityName)
            .eq('country_code', countryCode)
            .is('duplicate_of_id', null)
            .order('population', { ascending: false, nullsFirst: false })
            .limit(1)
            .single()
          if (match) cityMatch = match
        }

        // Fallback: name-only match (pick largest by population)
        if (!cityMatch) {
          const { data: match } = await supabase
            .from('cities')
            .select('id, country_id')
            .ilike('name', cityName)
            .is('duplicate_of_id', null)
            .order('population', { ascending: false, nullsFirst: false })
            .limit(1)
            .single()
          if (match) cityMatch = match
        }

        // Also resolve country_id if missing
        let resolvedCountryId = venue.country_id
        if (!resolvedCountryId && countryCode) {
          const { data: country } = await supabase
            .from('countries')
            .select('id')
            .eq('code', countryCode)
            .is('duplicate_of_id', null)
            .limit(1)
            .single()
          if (country) resolvedCountryId = country.id
        }

        // Build update payload
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

        if (cityMatch) {
          update.city_id = cityMatch.id
          if (!resolvedCountryId) resolvedCountryId = cityMatch.country_id
        }

        // Always set city text if empty
        if (!venue.city && cityName) {
          update.city = cityName
        }

        if (resolvedCountryId && !venue.country_id) {
          update.country_id = resolvedCountryId
        }

        // Also set country text if we have it from Nominatim and venue is missing it
        if (!venue.country && addr.country) {
          update.country = addr.country
        }

        await supabase.from('venues').update(update).eq('id', venue.id)

        results.push({
          id: venue.id,
          status: cityMatch ? 'matched' : 'city_text_only',
          city_name: cityName,
          city_id: cityMatch?.id,
        })
      } catch (err) {
        results.push({ id: venue.id, status: `error: ${err.message}` })
      }

      await sleep(SLEEP_MS)
    }

    const matched = results.filter(r => r.status === 'matched').length
    const textOnly = results.filter(r => r.status === 'city_text_only').length
    const errors = results.filter(r => r.status.startsWith('error') || r.status.startsWith('nominatim_error')).length

    return jsonResponse({
      success: true,
      processed: results.length,
      matched,
      text_only: textOnly,
      errors,
      remaining: (remaining || 0) - results.length,
      results,
    }, 200, req)
  } catch (error) {
    console.error('Backfill error:', error)
    return errorResponse(error.message, 500, req)
  }
})
