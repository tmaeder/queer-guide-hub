import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

/**
 * Shared helper functions for venue import edge functions.
 * Sole remaining consumer: import-tripadvisor-venues (the other import-*
 * venue fetchers were folded into their source-* peers, overhaul P7).
 */

export async function getOrCreateCity(
  supabase: SupabaseClient,
  cityName: string,
  countryCode: string,
  lat: number,
  lon: number
) {
  // Resolve the country FIRST — every lookup below is scoped to it.
  //
  // This used to match on `.eq('name', cityName)` alone, across all countries:
  // the collision class documented for run_event_city_link (Portland ME →
  // Portland OR). `cities` holds at most one row per (name, country), so a
  // name-only hit cannot be told apart from an unrepresentable twin, and there
  // is no safe way to read one.
  const { data: country } = await supabase
    .from('countries')
    .select('id')
    .eq('code', countryCode)
    .maybeSingle()

  if (!country?.id) {
    // The insert below used to pass `country_id: country?.id || null` into a
    // NOT NULL column, so an unresolved country failed at the database and the
    // error was swallowed by `if (!error && newCity)` — the caller only saw
    // null. Refuse out loud instead; a venue with no city_id is recoverable.
    console.warn(
      `getOrCreateCity: unresolved country code "${countryCode}" for "${cityName}" — not linking`,
    )
    return null
  }

  // Exclude merged duplicates: a merged row keeps its name, so without this
  // an importer stamps a city_id that a merge already consolidated away.
  const { data: existingCity } = await supabase
    .from('cities')
    .select('id')
    .eq('country_id', country.id)
    .ilike('name', cityName)
    .is('duplicate_of_id', null)
    .maybeSingle()

  if (existingCity) {
    return existingCity.id
  }

  const { data: newCity, error } = await supabase
    .from('cities')
    .insert({
      name: cityName,
      country_id: country.id,
      latitude: lat,
      longitude: lon,
      is_major_city: false
    })
    .select('id')
    .maybeSingle()

  if (newCity) {
    console.log(`Created new city: ${cityName} (${countryCode})`)
    return newCity.id
  }

  // A unique violation means either a concurrent caller won the race, or the
  // name normalized onto an existing row — trg_cities_aa_split_name strips a
  // recognised region suffix, so "Springfield, Illinois" lands on
  // "Springfield". Re-read instead of reporting failure.
  if (error?.code === '23505') {
    const { data: raced } = await supabase
      .from('cities')
      .select('id')
      .eq('country_id', country.id)
      .ilike('name', cityName)
      .is('duplicate_of_id', null)
      .maybeSingle()
    if (raced) return raced.id
  }

  if (error) {
    console.error(
      `getOrCreateCity: insert failed for "${cityName}" (${countryCode}): ${error.message}`,
    )
  }
  return null
}

export async function getOrCreateVenueCategory(
  supabase: SupabaseClient,
  categoryName: string,
  categorySlug: string,
  source: string = 'import'
) {
  const { data: existing } = await supabase
    .from('venue_categories')
    .select('id')
    .eq('slug', categorySlug)
    .maybeSingle()

  if (existing) {
    return existing.id
  }

  // Determine icon based on slug (merged from all import sources)
  let icon = 'MapPin'
  if (categorySlug.includes('entertainment')) icon = 'Music'
  else if (categorySlug.includes('restaurant') || categorySlug.includes('dining')) icon = 'UtensilsCrossed'
  else if (categorySlug.includes('community')) icon = 'Users'
  else if (categorySlug.includes('lodging') || categorySlug.includes('hotel') || categorySlug.includes('accommodation')) icon = 'Bed'
  else if (categorySlug.includes('bar')) icon = 'Wine'

  // Determine color based on slug (merged from all import sources)
  let color = '#6366f1'
  if (categorySlug.includes('entertainment')) color = '#8b5cf6'
  else if (categorySlug.includes('community')) color = '#10b981'
  else if (categorySlug.includes('restaurant') || categorySlug.includes('dining') || categorySlug.includes('bar')) color = '#ef4444'
  else if (categorySlug.includes('lodging') || categorySlug.includes('hotel') || categorySlug.includes('accommodation')) color = '#f59e0b'

  const { data: newCategory, error } = await supabase
    .from('venue_categories')
    .insert({
      name: categoryName,
      slug: categorySlug,
      description: `Auto-created from ${source} import`,
      icon,
      color
    })
    .select('id')
    .maybeSingle()

  if (!error && newCategory) {
    console.log(`Created new venue category: ${categoryName}`)
    return newCategory.id
  }

  return null
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
