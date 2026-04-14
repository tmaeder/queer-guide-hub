import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
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

serve(async (req) => {
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

          if (newCity) {
            return jsonResponse({
              success: true,
              city_id: newCity.id,
              city_name: newCity.name,
              country_id: r.resolved_country_id,
              country_name: r.resolved_country_name,
              created: true,
            }, 200, req)
          }
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
            success: true,
            city_id: newCity?.id || null,
            city_name: newCity?.name || city_name.trim(),
            country_id: byCode[0].id,
            country_name: byCode[0].name,
            created: !!newCity,
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
      success: true,
      city_id: newCity?.id || null,
      city_name: newCity?.name || city_name.trim(),
      country_id: country.id,
      country_name: country.name,
      created: !!newCity,
    }, 200, req)
  } catch (err: unknown) {
    console.error('resolve-or-create-city error:', err)
    return errorResponse('Internal server error', 500, req)
  }
})

async function createCity(
  supabase: unknown,
  cityName: string,
  countryId: string,
  countryName: string,
  latitude?: number,
  longitude?: number,
): Promise<{ id: string; name: string } | null> {
  try {
    // Geocode if no coordinates provided
    let lat = latitude
    let lng = longitude

    if (!lat || !lng) {
      try {
        const geocodeUrl = `https://photon.komoot.io/api?q=${encodeURIComponent(`${cityName}, ${countryName}`)}&limit=1&lang=en`
        const geoRes = await fetch(geocodeUrl)
        if (geoRes.ok) {
          const geoData = await geoRes.json()
          if (geoData.features?.length > 0) {
            const coords = geoData.features[0].geometry?.coordinates
            if (coords) {
              lng = coords[0]
              lat = coords[1]
            }
            // Also get region_name from Photon properties
            const props = geoData.features[0].properties || {}
            const _regionName = props.state || null
          }
        }
      } catch (geoErr) {
        console.warn('Geocoding failed for new city, inserting without coordinates:', geoErr)
      }
    }

    // Insert with ON CONFLICT handling (race condition safe)
    const insertData: Record<string, unknown> = {
      name: cityName,
      country_id: countryId,
    }
    if (lat != null) insertData.latitude = lat
    if (lng != null) insertData.longitude = lng
    if (typeof regionName === 'string') insertData.region_name = regionName

    const { data: inserted, error: insertErr } = await supabase
      .from('cities')
      .insert(insertData)
      .select('id, name')
      .single()

    if (insertErr) {
      // If duplicate, try to find existing
      if (insertErr.code === '23505') {
        const { data: existing } = await supabase
          .from('cities')
          .select('id, name')
          .eq('country_id', countryId)
          .ilike('name', cityName)
          .limit(1)
          .single()

        return existing || null
      }
      console.error('Error inserting city:', insertErr)
      return null
    }

    console.log(`Created new city: ${cityName} (${countryName}) with id ${inserted.id}`)
    return inserted
  } catch (err) {
    console.error('createCity error:', err)
    return null
  }
}
