import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireAdmin } from '../_shared/supabase-client.ts'
import { COUNTRY_ALIASES } from '../_shared/automation-utils.ts'

/**
 * resolve-or-create-city
 *
 * Given a city name and country name (or nationality demonym), resolves to existing
 * city_id + country_id. If the city doesn't exist, creates it with coordinates
 * from geocoding and optional Wikipedia enrichment.
 *
 * POST /functions/v1/resolve-or-create-city
 * Body: { city_name, country_name, latitude?, longitude? }
 * Returns: { success, city_id?, city_name?, country_id?, country_name?, created? }
 */

function resolveCountryName(raw: string): string {
  if (!raw) return raw
  const lower = raw.trim().toLowerCase()
  return COUNTRY_ALIASES[lower] || raw.trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  try {
    const supabase = getServiceClient()

    // Require admin authentication
    const authResult = await requireAdmin(req, supabase)
    if (authResult instanceof Response) return authResult

    const { city_name, country_name, latitude, longitude } = await req.json()

    if (!country_name) {
      return errorResponse('country_name is required', 400, req)
    }
    const resolvedCountryName = resolveCountryName(country_name)

    // Step 1: Try the DB function first (fast path)
    if (city_name) {
      const { data: resolved, error: rpcError } = await supabase.rpc(
        'resolve_city_and_country',
        { p_city_name: city_name.trim(), p_country_name: resolvedCountryName }
      )

      if (!rpcError && resolved && resolved.length > 0) {
        const r = resolved[0]
        if (r.city_found && r.country_found) {
          return jsonResponse({
            success: true,
            city_id: r.resolved_city_id,
            city_name: r.resolved_city_name,
            country_id: r.resolved_country_id,
            country_name: r.resolved_country_name,
            created: false,
          }, 200, req)
        }

        // Country found but city not found → create city
        if (r.country_found && !r.city_found) {
          const newCity = await createCity(
            supabase,
            city_name.trim(),
            r.resolved_country_id,
            r.resolved_country_name,
            latitude,
            longitude,
          )

          if (newCity.ok) {
            return jsonResponse({
              success: true,
              city_id: newCity.id,
              city_name: newCity.name,
              country_id: r.resolved_country_id,
              country_name: r.resolved_country_name,
              created: newCity.created,
            }, 200, req)
          }
          // A refusal is reported, not swallowed. Falling through to the
          // country-only branches would answer `city_id: null, success: true`
          // and leave the caller unable to tell "we declined to guess between
          // two candidates" from "no such country".
          return jsonResponse({
            success: false,
            error: `City not resolved: ${newCity.reason}`,
            reason: newCity.reason,
            candidates: newCity.candidates ?? null,
            country_id: r.resolved_country_id,
            country_name: r.resolved_country_name,
          }, 200, req)
        }
      }
    }

    // Step 2: Resolve country only (for nationality-only lookups)
    const { data: countries, error: countryErr } = await supabase
      .from('countries')
      .select('id, name')
      .ilike('name', resolvedCountryName)
      .limit(1)

    if (countryErr || !countries?.length) {
      // Try by code
      const { data: byCode } = await supabase
        .from('countries')
        .select('id, name')
        .ilike('code', country_name.trim())
        .limit(1)

      if (byCode?.length) {
        if (city_name) {
          const newCity = await createCity(
            supabase,
            city_name.trim(),
            byCode[0].id,
            byCode[0].name,
            latitude,
            longitude,
          )

          return jsonResponse({
            success: newCity.ok,
            city_id: newCity.ok ? newCity.id : null,
            city_name: newCity.ok ? newCity.name : city_name.trim(),
            country_id: byCode[0].id,
            country_name: byCode[0].name,
            created: newCity.ok && newCity.created,
            ...(newCity.ok ? {} : { reason: newCity.reason, candidates: newCity.candidates ?? null }),
          }, 200, req)
        }

        return jsonResponse({
          success: true,
          city_id: null,
          city_name: null,
          country_id: byCode[0].id,
          country_name: byCode[0].name,
          created: false,
        }, 200, req)
      }

      return jsonResponse({
        success: false,
        error: `Country not found: ${country_name}`,
        resolved_country_attempt: resolvedCountryName,
      }, 200, req)
    }

    const country = countries[0]

    if (!city_name) {
      return jsonResponse({
        success: true,
        city_id: null,
        city_name: null,
        country_id: country.id,
        country_name: country.name,
        created: false,
      }, 200, req)
    }

    // Create city under resolved country
    const newCity = await createCity(
      supabase,
      city_name.trim(),
      country.id,
      country.name,
      latitude,
      longitude,
    )

    return jsonResponse({
      success: newCity.ok,
      city_id: newCity.ok ? newCity.id : null,
      city_name: newCity.ok ? newCity.name : city_name.trim(),
      country_id: country.id,
      country_name: country.name,
      created: newCity.ok && newCity.created,
      ...(newCity.ok ? {} : { reason: newCity.reason, candidates: newCity.candidates ?? null }),
    }, 200, req)
  } catch (err: unknown) {
    console.error('resolve-or-create-city error:', err)
    return errorResponse('Internal server error', 500, req)
  }
})

/**
 * Resolve a city name to a city_id, creating one only when nothing matches and
 * there is evidence to justify it.
 *
 * THE NAME IS NOW A LIE IN ONE DIRECTION, DELIBERATELY: this can return a
 * refusal. Both callers below used to reach the raw insert with no probe of any
 * kind — the fast path at the top of the handler probes via
 * `resolve_city_and_country`, but the two country fallbacks (country-by-code,
 * and country-resolved-by-name) skipped straight to creation. That is how a
 * name the database already holds under a different spelling becomes a second
 * row.
 *
 * GEOCODING MOVED AHEAD OF THE DECISION. It used to happen inside the insert
 * path, i.e. after the resolve had already been given up on. Coordinates are
 * evidence: they let the resolver see that a city 40 m away already exists, and
 * they clear its bar for creating a genuinely new one. Fetching them first is
 * what makes the probe worth running.
 *
 * The country-checked Photon lookup below is unchanged and is the reason this
 * wrapper still exists at all: a country-constrained query like
 * "Lucerne, Germany" returns Berlin, and accepting it would mislocate the city.
 */
type CityResolution =
  | { ok: true; id: string; name: string; created: boolean }
  | { ok: false; reason: string; candidates?: unknown }

async function createCity(
  supabase: SupabaseClient,
  cityName: string,
  countryId: string,
  countryName: string,
  latitude?: number,
  longitude?: number,
): Promise<CityResolution> {
  let lat = latitude
  let lng = longitude
  let regionName: string | null = null

  if (lat == null || lng == null) {
    // Resolve the expected ISO-2 country code so we can reject a geocode hit
    // that landed in the wrong country.
    let expectedCode: string | null = null
    try {
      const { data: co } = await supabase.from('countries').select('code').eq('id', countryId).single()
      expectedCode = co?.code ? String(co.code).toUpperCase() : null
    } catch { /* fall through — validate against name only */ }

    try {
      const geocodeUrl = `https://photon.komoot.io/api?q=${encodeURIComponent(`${cityName}, ${countryName}`)}&limit=5&lang=en`
      const geoRes = await fetch(geocodeUrl)
      if (geoRes.ok) {
        const geoData = await geoRes.json()
        const features = Array.isArray(geoData.features) ? geoData.features : []
        // Accept only a result whose country matches the expected one.
        const match = features.find((f: { properties?: { countrycode?: string } }) => {
          const cc = (f?.properties?.countrycode || '').toUpperCase()
          return !expectedCode || cc === expectedCode
        })
        if (match) {
          const coords = match.geometry?.coordinates
          if (Array.isArray(coords) && coords.length === 2) {
            lng = coords[0]
            lat = coords[1]
          }
          regionName = match.properties?.state || null
        }
        // No same-country match → leave coords null rather than snap to a
        // wrong-country capital. The resolver will then refuse to create for
        // lack of evidence, which is the correct outcome: a city we cannot
        // place is a city we could never de-duplicate later.
      }
    } catch (geoErr) {
      console.warn('Geocoding failed for new city, resolving without coordinates:', geoErr)
    }
  }

  const { data, error } = await supabase.rpc('city_resolve_or_create', {
    p_name: cityName,
    p_country_id: countryId,
    p_region_hint: regionName,
    p_lat: lat ?? null,
    p_lng: lng ?? null,
    p_source_slug: 'admin-resolver',
    // An admin is on the other end of this endpoint (requireAdmin gates the
    // handler), so a deliberate create with no coordinates is allowed here —
    // unlike the automated geocode drain, where it is exactly the shape that
    // produced unreconcilable duplicates.
    p_actor: 'admin',
  })

  if (error) {
    console.error('city_resolve_or_create failed:', error.message)
    return { ok: false, reason: 'resolver_error' }
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { city_id: string | null; action: string; reason: string | null; candidates: unknown }
    | undefined
  if (!row) return { ok: false, reason: 'resolver_empty' }

  if (row.action === 'refused' || !row.city_id) {
    return { ok: false, reason: row.reason ?? 'refused', candidates: row.candidates }
  }

  const { data: city } = await supabase
    .from('cities')
    .select('id, name')
    .eq('id', row.city_id)
    .maybeSingle()
  if (!city) return { ok: false, reason: 'resolved_city_missing' }

  if (row.action === 'created') {
    console.log(`Created new city: ${city.name} (${countryName}) with id ${city.id}`)
  }
  return { ok: true, id: city.id, name: city.name, created: row.action === 'created' }
}
