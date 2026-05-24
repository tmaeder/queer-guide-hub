// geo-resolve
//
// Anonymous IP-geo resolution for personalizing /marketplace and other
// soft-personalized surfaces before sign-in. The frontend hits this once
// per session and caches in localStorage.qg.softPrefs.
//
// We don't have Cloudflare's `request.cf` here (this runs on Supabase
// edge, not a CF Worker), so we read the country from the Cloudflare
// proxy headers that the CF Pages frontend passes through, and look up
// the matching `cities` / `countries` row. Falls back to country-only
// when there's no city match.
//
// Privacy: no IP storage, no logging of resolved city per request.

import {
  getServiceClient,
  jsonResponse,
  corsResponse,
} from '../_shared/supabase-client.ts'

interface GeoResponse {
  country_code: string | null
  country_id: string | null
  city_id: string | null
  city_name: string | null
  source: 'cf_headers' | 'none'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  // Cloudflare injects these on every request that traverses the CDN.
  // CF-IPCountry is reliable; CF-IPCity exists on Enterprise plans only,
  // so country-only fallback is the realistic default.
  const cfCountry = (req.headers.get('CF-IPCountry') ?? '').trim().toUpperCase()
  const cfCity = (req.headers.get('CF-IPCity') ?? '').trim()

  if (!cfCountry || cfCountry === 'XX' || cfCountry === 'T1') {
    return jsonResponse(
      {
        country_code: null,
        country_id: null,
        city_id: null,
        city_name: null,
        source: 'none',
      } satisfies GeoResponse,
      200,
      req,
    )
  }

  const supabase = getServiceClient()

  // 1. Resolve country first — cheap lookup, single index hit.
  const { data: country } = await supabase
    .from('countries')
    .select('id, code')
    .eq('code', cfCountry)
    .maybeSingle()

  const country_id = country?.id ?? null
  const country_code = country?.code ?? cfCountry

  // 2. If CF told us a city name, try to match within this country.
  // Loose ilike so "Berlin" matches "Berlin" but not "West Berlin".
  let city_id: string | null = null
  let city_name: string | null = null
  if (cfCity && country_id) {
    const { data: city } = await supabase
      .from('cities')
      .select('id, name')
      .eq('country_id', country_id)
      .ilike('name', cfCity)
      .order('population', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    city_id = city?.id ?? null
    city_name = city?.name ?? null
  }

  return jsonResponse(
    {
      country_code,
      country_id,
      city_id,
      city_name,
      source: 'cf_headers',
    } satisfies GeoResponse,
    200,
    req,
  )
})
