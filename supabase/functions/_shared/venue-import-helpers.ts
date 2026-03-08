import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

/**
 * Shared helper functions for venue import edge functions.
 * These are used by import-foursquare-venues, import-google-places-venues,
 * import-tripadvisor-venues, and import-tomtom-venues.
 */

export async function getOrCreateCity(
  supabase: SupabaseClient,
  cityName: string,
  countryCode: string,
  lat: number,
  lon: number
) {
  const { data: existingCity } = await supabase
    .from('cities')
    .select('id')
    .eq('name', cityName)
    .maybeSingle()

  if (existingCity) {
    return existingCity.id
  }

  const { data: country } = await supabase
    .from('countries')
    .select('id')
    .eq('code', countryCode)
    .maybeSingle()

  const { data: newCity, error } = await supabase
    .from('cities')
    .insert({
      name: cityName,
      country_id: country?.id || null,
      latitude: lat,
      longitude: lon,
      is_major_city: false
    })
    .select('id')
    .maybeSingle()

  if (!error && newCity) {
    console.log(`Created new city: ${cityName}`)
    return newCity.id
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

export async function getOrCreateAmenity(
  supabase: SupabaseClient,
  amenityName: string,
  amenitySlug: string,
  source: string = 'import'
) {
  const { data: existing } = await supabase
    .from('venue_amenities')
    .select('id')
    .eq('slug', amenitySlug)
    .maybeSingle()

  if (existing) {
    return existing.id
  }

  // Determine icon based on slug (merged from all import sources)
  let icon = 'MapPin'
  if (amenitySlug.includes('wifi')) icon = 'Wifi'
  else if (amenitySlug.includes('parking')) icon = 'Car'
  else if (amenitySlug.includes('wheelchair') || amenitySlug.includes('accessible')) icon = 'Accessibility'
  else if (amenitySlug.includes('outdoor')) icon = 'Trees'
  else if (amenitySlug.includes('phone')) icon = 'Phone'

  const { data: newAmenity, error } = await supabase
    .from('venue_amenities')
    .insert({
      name: amenityName,
      slug: amenitySlug,
      description: `Auto-created from ${source} import`,
      icon
    })
    .select('id')
    .maybeSingle()

  if (!error && newAmenity) {
    console.log(`Created new amenity: ${amenityName}`)
    return newAmenity.id
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
