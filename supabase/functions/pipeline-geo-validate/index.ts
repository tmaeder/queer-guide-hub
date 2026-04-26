import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

// Geo-validation worker. Reverse-geocodes a small batch of venues via
// Nominatim and writes to geo_validations. Country mismatch is the primary
// signal — distance-based detection is intentionally out of scope (too many
// false positives for venues vs. their administrative city).
//
// Rate limit: Nominatim asks for ≤1 req/sec. We sleep 1100ms between calls.
// Batch size 30 → ~33 sec runtime, well under the edge-function timeout.
//
// Run daily via cron OR manually with {batch_size, only_new} body.

// Self-host: set NOMINATIM_URL=https://nominatim.queer.guide and
// optional NOMINATIM_BASIC_AUTH=user:pass to bypass the 1 req/sec
// public-Nominatim limit. With self-host we drop sleep to 50ms.
const NOMINATIM_BASE = (Deno.env.get('NOMINATIM_URL') || 'https://nominatim.openstreetmap.org').replace(/\/$/, '')
const NOMINATIM = `${NOMINATIM_BASE}/reverse`
const NOMINATIM_AUTH = Deno.env.get('NOMINATIM_BASIC_AUTH') || ''
const SLEEP_MS = Deno.env.get('NOMINATIM_URL') ? 50 : 1100

interface VenueRow {
  id: string
  latitude: number | null
  longitude: number | null
  country: string | null
  city: string | null
}

interface NominatimResult {
  display_name?: string
  address?: {
    country?: string
    country_code?: string
    city?: string
    town?: string
    village?: string
    state?: string
  }
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

function normalizeCountry(s: string | null | undefined): string {
  return (s || '').trim().toLowerCase()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const batchSize = Math.min(body.batch_size ?? 30, 50)
    const onlyNew = body.only_new ?? true

    // Pick venues missing or with stale geo_validations rows.
    // only_new=true → just last 24h of updates; else oldest unvalidated.
    const cutoff = onlyNew
      ? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      : '1970-01-01'
    const { data: venues, error: loadErr } = await supabase
      .from('venues')
      .select('id, latitude, longitude, country, city, updated_at')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .is('closed_at', null)
      .gte('updated_at', cutoff)
      .limit(batchSize) as { data: VenueRow[] | null, error: { message: string } | null }
    if (loadErr) return errorResponse(`load: ${loadErr.message}`, 500, req)
    if (!venues || venues.length === 0) {
      return jsonResponse({ success: true, validated: 0, message: 'no venues to validate' }, 200, req)
    }

    // Skip venues already validated recently (within 30 days)
    const venueIds = venues.map((v) => v.id)
    const { data: existingValidations } = await supabase
      .from('geo_validations')
      .select('content_id, last_validated_at')
      .eq('content_type', 'venue')
      .in('content_id', venueIds)
      .gte('last_validated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    const skipSet = new Set((existingValidations ?? []).map((r: { content_id: string }) => r.content_id))
    const toValidate = venues.filter((v) => !skipSet.has(v.id))

    let validated = 0, mismatches = 0, errors = 0

    for (const v of toValidate) {
      if (v.latitude == null || v.longitude == null) continue
      try {
        const url = `${NOMINATIM}?format=json&lat=${v.latitude}&lon=${v.longitude}&zoom=10&addressdetails=1`
        const headers: Record<string, string> = {
          'User-Agent': 'queer.guide geo-validator',
          'Accept-Language': 'en',
        }
        if (NOMINATIM_AUTH) {
          headers['Authorization'] = `Basic ${btoa(NOMINATIM_AUTH)}`
        }
        const resp = await fetch(url, { headers })
        if (!resp.ok) { errors++; await sleep(SLEEP_MS); continue }
        const json = await resp.json() as NominatimResult
        const addr = json.address || {}
        const geocodedCountry = addr.country || null
        const geocodedCity = addr.city || addr.town || addr.village || null
        const geocodedAddress = json.display_name || null

        const expected = normalizeCountry(v.country)
        const actual   = normalizeCountry(geocodedCountry)
        const hasMismatch = expected !== '' && actual !== '' && expected !== actual
        if (hasMismatch) mismatches++

        await supabase.from('geo_validations').upsert({
          content_type: 'venue',
          content_id: v.id,
          original_lat: v.latitude,
          original_lng: v.longitude,
          validated_lat: v.latitude,
          validated_lng: v.longitude,
          geocoded_address: geocodedAddress,
          country: geocodedCountry,
          city: geocodedCity,
          confidence: hasMismatch ? 0.4 : 0.9,
          has_mismatch: hasMismatch,
          mismatch_details: hasMismatch
            ? `Stored country '${v.country}' ≠ geocoded '${geocodedCountry}'`
            : null,
          source: 'nominatim',
          last_validated_at: new Date().toISOString(),
        }, { onConflict: 'content_type,content_id' })

        validated++
      } catch (e) {
        console.error(`validate ${v.id}:`, (e as Error).message)
        errors++
      }
      await sleep(SLEEP_MS)
    }

    return jsonResponse({
      success: true,
      validated, mismatches, errors,
      candidates: venues.length,
      skipped_recent: skipSet.size,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-geo-validate:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
