import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

/**
 * Shared helper functions for venue import edge functions.
 * Sole remaining consumer: import-tripadvisor-venues (the other import-*
 * venue fetchers were folded into their source-* peers, overhaul P7).
 */

/**
 * Turn an imported city name into a city_id.
 *
 * Delegates to `city_resolve_or_create`. The probe that used to live here —
 * country + ilike(name), excluding merged rows — was right about the country
 * scoping and wrong in two ways the RPC fixes: it only ever matched the string,
 * so an exonym or an official long form read as a new city; and by filtering
 * `duplicate_of_id IS NULL` it was blind to the two TOTAL unique indexes, so a
 * name whose only twin had been merged away probed clean and then collided on
 * insert. The 23505 re-read that compensated for that is now inside the RPC,
 * under the same advisory lock as the insert.
 *
 * Contract is unchanged for the caller: a city_id, or null when we decline to
 * guess. `import-tripadvisor-venues` treats null as "leave city_id unset",
 * which stays the right behaviour — a venue with no city is recoverable.
 */
export async function getOrCreateCity(
  supabase: SupabaseClient,
  cityName: string,
  countryCode: string,
  lat: number,
  lon: number
) {
  const { data, error } = await supabase.rpc('city_resolve_or_create', {
    p_name: cityName,
    p_country_code: countryCode,
    p_lat: lat ?? null,
    p_lng: lon ?? null,
    p_source_slug: 'tripadvisor-import',
    p_actor: 'venue-import',
  })

  if (error) {
    console.error(
      `getOrCreateCity: resolver failed for "${cityName}" (${countryCode}): ${error.message}`,
    )
    return null
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { city_id: string | null; action: string; reason: string | null }
    | undefined

  if (!row || row.action === 'refused' || !row.city_id) {
    console.warn(
      `getOrCreateCity: not linking "${cityName}" (${countryCode}) — ${row?.reason ?? 'no result'}`,
    )
    return null
  }

  if (row.action === 'created') {
    console.log(`Created new city: ${cityName} (${countryCode})`)
  }
  return row.city_id
}

export async function getOrCreateService(
  supabase: SupabaseClient,
  serviceName: string,
  serviceSlug: string,
  source: string = 'import'
) {
  const { data: existing } = await supabase
    .from('venue_services')
    .select('id')
    .eq('slug', serviceSlug)
    .maybeSingle()

  if (existing) {
    return existing.id
  }

  // Determine icon based on slug (merged from all import sources)
  let icon = 'MapPin'
  if (serviceSlug.includes('beverage')) icon = 'Wine'
  else if (serviceSlug.includes('dine') || serviceSlug.includes('dining') || serviceSlug.includes('food')) icon = 'UtensilsCrossed'
  else if (serviceSlug.includes('delivery')) icon = 'Truck'
  else if (serviceSlug.includes('community') || serviceSlug.includes('social')) icon = 'Users'
  else if (serviceSlug.includes('accommodation') || serviceSlug.includes('lodging')) icon = 'Bed'
  else if (serviceSlug.includes('wellness') || serviceSlug.includes('health')) icon = 'Heart'

  const { data: newService, error } = await supabase
    .from('venue_services')
    .insert({
      name: serviceName,
      slug: serviceSlug,
      description: `Auto-created from ${source} import`,
      icon
    })
    .select('id')
    .maybeSingle()

  if (!error && newService) {
    console.log(`Created new service: ${serviceName}`)
    return newService.id
  }

  return null
}
