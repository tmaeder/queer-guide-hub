import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TomTomPOI {
  id: string
  poi: {
    name: string
    categorySet?: Array<{
      id: number
      name: string
    }>
    categories?: string[]
    phone?: string
    url?: string
    email?: string
    brands?: Array<{
      name: string
    }>
    classifications?: Array<{
      code: string
      names: Array<{
        nameLocale: string
        name: string
      }>
    }>
  }
  address: {
    streetNumber?: string
    streetName?: string
    municipality?: string
    countrySubdivision?: string
    postalCode?: string
    countryCode?: string
    country?: string
    freeformAddress?: string
    localName?: string
  }
  position: {
    lat: number
    lon: number
  }
  viewport?: {
    topLeftPoint: {
      lat: number
      lon: number
    }
    btmRightPoint: {
      lat: number
      lon: number
    }
  }
  entryPoints?: Array<{
    type: string
    position: {
      lat: number
      lon: number
    }
  }>
  detourTime?: number
  score?: number
  dist?: number
  info?: string
  entityType?: string
  relatedPois?: {
    relatedPoi: Array<{
      id: string
    }>
  }
  dataSources?: {
    poiDetails?: Array<{
      id: string
      sourceName: string
    }>
    geometry?: {
      id: string
    }
  }
}

// Helper functions for data management
async function getOrCreateCity(supabase: any, cityName: string, countryCode: string, lat: number, lon: number) {
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

async function getOrCreateVenueCategory(supabase: any, categoryName: string, categorySlug: string) {
  const { data: existing } = await supabase
    .from('venue_categories')
    .select('id')
    .eq('slug', categorySlug)
    .maybeSingle()

  if (existing) {
    return existing.id
  }

  // Create new category
  const { data: newCategory, error } = await supabase
    .from('venue_categories')
    .insert({
      name: categoryName,
      slug: categorySlug,
      description: `Auto-created from TomTom import`,
      icon: categorySlug.includes('bar') ? 'Wine' : categorySlug.includes('restaurant') ? 'UtensilsCrossed' : 'MapPin',
      color: categorySlug.includes('bar') ? '#8b5cf6' : categorySlug.includes('restaurant') ? '#ef4444' : '#6366f1'
    })
    .select('id')
    .maybeSingle()

  if (!error && newCategory) {
    console.log(`Created new venue category: ${categoryName}`)
    return newCategory.id
  }

  return null
}

async function getOrCreateAmenity(supabase: any, amenityName: string, amenitySlug: string) {
  const { data: existing } = await supabase
    .from('venue_amenities')
    .select('id')
    .eq('slug', amenitySlug)
    .maybeSingle()

  if (existing) {
    return existing.id
  }

  const { data: newAmenity, error } = await supabase
    .from('venue_amenities')
    .insert({
      name: amenityName,
      slug: amenitySlug,
      description: `Auto-created from TomTom import`,
      icon: amenitySlug.includes('wifi') ? 'Wifi' : amenitySlug.includes('parking') ? 'Car' : 'MapPin'
    })
    .select('id')
    .maybeSingle()

  if (!error && newAmenity) {
    console.log(`Created new amenity: ${amenityName}`)
    return newAmenity.id
  }

  return null
}

async function getOrCreateService(supabase: any, serviceName: string, serviceSlug: string) {
  const { data: existing } = await supabase
    .from('venue_services')
    .select('id')
    .eq('slug', serviceSlug)
    .maybeSingle()

  if (existing) {
    return existing.id
  }

  const { data: newService, error } = await supabase
    .from('venue_services')
    .insert({
      name: serviceName,
      slug: serviceSlug,
      description: `Auto-created from TomTom import`,
      icon: serviceSlug.includes('beverage') ? 'Wine' : serviceSlug.includes('food') ? 'UtensilsCrossed' : 'MapPin'
    })
    .select('id')
    .maybeSingle()

  if (!error && newService) {
    console.log(`Created new service: ${serviceName}`)
    return newService.id
  }

  return null
}

async function mapVenueCategory(supabase: any, classifications: any[], searchTerm: string) {
  let categoryName = 'Entertainment & Nightlife'
  let categorySlug = 'entertainment-nightlife'

  if (classifications) {
    const classification = classifications.find(c => c.names?.[0]?.name)
    if (classification) {
      const classificationName = classification.names[0].name.toLowerCase()
      if (classificationName.includes('restaurant')) {
        categoryName = 'Restaurants & Dining'
        categorySlug = 'restaurants-dining'
      } else if (classificationName.includes('center') || classificationName.includes('organization')) {
        categoryName = 'Community Organizations'
        categorySlug = 'community-organizations'
      } else if (classificationName.includes('health')) {
        categoryName = 'Health & Wellness'
        categorySlug = 'health-wellness'
      }
    }
  }

  // Override based on search term
  if (searchTerm.includes('center') || searchTerm.includes('organization')) {
    categoryName = 'Community Organizations'
    categorySlug = 'community-organizations'
  } else if (searchTerm.includes('health') || searchTerm.includes('clinic')) {
    categoryName = 'Health & Wellness'
    categorySlug = 'health-wellness'
  }

  const categoryId = await getOrCreateVenueCategory(supabase, categoryName, categorySlug)

  return {
    categorySlug: categorySlug.includes('entertainment') ? 'bar' : 
                 categorySlug.includes('restaurants') ? 'restaurant' :
                 categorySlug.includes('community') ? 'organization' : 'other',
    categoryId
  }
}

async function mapAmenitiesAndServices(supabase: any, poi: TomTomPOI, searchTerm: string) {
  const amenityIds = []
  const serviceIds = []
  const amenityNames = []
  const serviceNames = []

  // Basic amenities from POI data
  if (poi.poi.phone) {
    amenityNames.push('Phone Service')
    const amenityId = await getOrCreateAmenity(supabase, 'Phone Service', 'phone-service')
    if (amenityId) amenityIds.push(amenityId)
  }
  
  if (poi.poi.url) {
    amenityNames.push('WiFi')
    const amenityId = await getOrCreateAmenity(supabase, 'WiFi', 'wifi')
    if (amenityId) amenityIds.push(amenityId)
  }
  
  if (poi.entryPoints && poi.entryPoints.length > 1) {
    amenityNames.push('Multiple Entrances')
    const amenityId = await getOrCreateAmenity(supabase, 'Multiple Entrances', 'multiple-entrances')
    if (amenityId) amenityIds.push(amenityId)
  }

  // Services based on search term and classification
  if (searchTerm.includes('bar') || searchTerm.includes('club')) {
    serviceNames.push('Beverages', 'Entertainment')
    const beverageId = await getOrCreateService(supabase, 'Beverages', 'beverages')
    const entertainmentId = await getOrCreateService(supabase, 'Entertainment', 'entertainment')
    if (beverageId) serviceIds.push(beverageId)
    if (entertainmentId) serviceIds.push(entertainmentId)
  } else if (searchTerm.includes('restaurant') || searchTerm.includes('cafe')) {
    serviceNames.push('Dine-In', 'Food Service')
    const dineInId = await getOrCreateService(supabase, 'Dine-In', 'dine-in')
    const foodServiceId = await getOrCreateService(supabase, 'Food Service', 'food-service')
    if (dineInId) serviceIds.push(dineInId)
    if (foodServiceId) serviceIds.push(foodServiceId)
  } else if (searchTerm.includes('health') || searchTerm.includes('clinic')) {
    serviceNames.push('Health Services', 'Counseling')
    const healthId = await getOrCreateService(supabase, 'Health Services', 'health-services')
    const counselingId = await getOrCreateService(supabase, 'Counseling', 'counseling')
    if (healthId) serviceIds.push(healthId)
    if (counselingId) serviceIds.push(counselingId)
  } else if (searchTerm.includes('center') || searchTerm.includes('organization')) {
    serviceNames.push('Community Support', 'Social Services')
    const communityId = await getOrCreateService(supabase, 'Community Support', 'community-support')
    const socialId = await getOrCreateService(supabase, 'Social Services', 'social-services')
    if (communityId) serviceIds.push(communityId)
    if (socialId) serviceIds.push(socialId)
  }

  return { 
    amenityIds, 
    serviceIds, 
    amenityNames, 
    serviceNames 
  }
}

// Specific LGBTQ+ venue keywords
const TOMTOM_SEARCH_TERMS = [
  'gay sauna',
  'lgbt',
  'sexual health clinic',
  'gay bar',
  'gay beach',
  'nude beach'
]

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Starting TomTom venues import...')

    // Parse request body for city selection
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const selectedCities = body.cities || ['New York']; // Default to single city
    const limit = Math.min(body.limit || 5, 15); // Reduced limit

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const tomtomApiKey = Deno.env.get('TOMTOM_API_KEY')!

    console.log('TomTom API Key configured:', tomtomApiKey ? 'Yes' : 'No')

    if (!tomtomApiKey) {
      throw new Error('TomTom API key not configured')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    let totalImported = 0
    let totalUpdated = 0
    const totalSkipped = 0
    
    // Reduced city list
    const allCities = [
      { name: 'New York', lat: 40.7128, lon: -74.0060, country: 'US' },
      { name: 'San Francisco', lat: 37.7749, lon: -122.4194, country: 'US' },
      { name: 'Los Angeles', lat: 34.0522, lon: -118.2437, country: 'US' },
      { name: 'London', lat: 51.5074, lon: -0.1278, country: 'GB' },
      { name: 'Berlin', lat: 52.5200, lon: 13.4050, country: 'DE' },
      { name: 'Amsterdam', lat: 52.3676, lon: 4.9041, country: 'NL' },
      { name: 'Paris', lat: 48.8566, lon: 2.3522, country: 'FR' }
    ]

    // Filter cities based on request  
    const citiesToProcess = allCities.filter(city => 
      selectedCities.includes(city.name) || selectedCities.includes('all')
    ).slice(0, 2); // Limit to 2 cities max per request

    console.log(`Processing ${citiesToProcess.length} cities: ${citiesToProcess.map(c => c.name).join(', ')}`)

    for (const city of citiesToProcess) {
      console.log(`Searching venues in ${city.name}...`)
      
      // Reduced search terms for faster processing
      const searchTerms = TOMTOM_SEARCH_TERMS.slice(0, 3); // Only first 3 terms
      
      for (const searchTerm of searchTerms) {
        try {
          console.log(`Searching for "${searchTerm}" in ${city.name}...`)
          
          // TomTom Places API - Search with reduced radius and limit
          const searchUrl = `https://api.tomtom.com/search/2/search/${encodeURIComponent(searchTerm)}.json` +
            `?key=${tomtomApiKey}` +
            `&lat=${city.lat}` +
            `&lon=${city.lon}` +
            `&radius=5000` + // Reduced to 5km radius
            `&limit=${limit}` +
            `&categorySet=7315,7318,9361,9362,9663` + // Entertainment, Nightlife, Community Centers
            `&extendedPostalCodesFor=POI`

          const searchResponse = await fetch(searchUrl)
          
          if (!searchResponse.ok) {
            console.error(`TomTom search failed for "${searchTerm}" in ${city.name}: ${searchResponse.status} ${searchResponse.statusText}`)
            continue
          }

          const searchData = await searchResponse.json()
          const pois = searchData.results || []

          console.log(`Found ${pois.length} ${searchTerm} venues in ${city.name}`)

          for (const poi of pois) {
            try {
              // Check if venue already exists by external ID or TomTom ID
              const { data: existingVenue } = await supabase
                .from('venues')
                .select('id, tomtom_id, data_source, external_id')
                .or(`tomtom_id.eq.${poi.id},and(data_source.eq.tomtom,external_id.eq.${poi.id})`)
                .maybeSingle()

              // Get or create city
              const cityName = poi.address.municipality || city.name
              const countryCode = poi.address.countryCode || city.country
              const cityId = await getOrCreateCity(supabase, cityName, countryCode, poi.position.lat, poi.position.lon)

              // Map category
              const { categorySlug, categoryId } = await mapVenueCategory(supabase, poi.poi.classifications, searchTerm)

              // Map amenities and services
              const { amenityIds, serviceIds, amenityNames, serviceNames } = await mapAmenitiesAndServices(supabase, poi, searchTerm)

              // Add search term specific tags
              const enhancedTags = ['lgbt-friendly']
              if (searchTerm.includes('gay')) enhancedTags.push('gay-friendly')
              if (searchTerm.includes('lesbian')) enhancedTags.push('lesbian-friendly')
              if (searchTerm.includes('trans')) enhancedTags.push('trans-friendly')
              if (searchTerm.includes('drag')) enhancedTags.push('drag-shows')
              if (searchTerm.includes('club')) enhancedTags.push('nightclub')
              if (searchTerm.includes('center') || searchTerm.includes('organization')) {
                enhancedTags.push('community-center')
              }

              // Extract venue data
              const venueData = {
                name: poi.poi.name || 'Unknown',
                description: poi.info || null,
                address: poi.address.freeformAddress || 
                         `${poi.address.streetName || ''} ${poi.address.streetNumber || ''}`.trim() ||
                         poi.address.localName || null,
                city: cityName,
                state: poi.address.countrySubdivision || null,
                country: countryCode,
                postal_code: poi.address.postalCode || null,
                latitude: poi.position.lat,
                longitude: poi.position.lon,
                phone: poi.poi.phone || null,
                website: poi.poi.url || null,
                email: poi.poi.email || null,
                category: categorySlug,
                tags: Array.from(new Set(enhancedTags)),
                amenities: amenityNames,
                services: serviceNames,
                verified: false,
                featured: false,
                tomtom_id: poi.id,
                tomtom_rating: poi.score ? Math.round(poi.score * 10) / 10 : null,
                tomtom_data: {
                  categories: poi.poi.categories || [],
                  categorySet: poi.poi.categorySet || [],
                  classifications: poi.poi.classifications || [],
                  brands: poi.poi.brands || [],
                  entryPoints: poi.entryPoints || [],
                  dataSources: poi.dataSources || {},
                  entityType: poi.entityType || null,
                  viewport: poi.viewport || null
                },
                data_source: 'tomtom',
                external_id: poi.id,
                last_synced_at: new Date().toISOString(),
                sync_status: 'synced',
                created_by: null // System import
              }

              if (existingVenue) {
                // Update existing venue
                const { error: updateError } = await supabase
                  .from('venues')
                  .update({
                    ...venueData,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', existingVenue.id)

                if (updateError) {
                  console.error(`Error updating venue ${poi.poi.name}:`, updateError)
                  continue
                }

                console.log(`Updated venue: ${poi.poi.name} with ${amenityNames.length} amenities and ${serviceNames.length} services`)
                totalUpdated++
              } else {
                // Insert new venue
                const { error: insertError } = await supabase
                  .from('venues')
                  .insert(venueData)

                if (insertError) {
                  console.error(`Error inserting venue ${poi.poi.name}:`, insertError)
                  continue
                }

                console.log(`Imported venue: ${poi.poi.name} with ${amenityNames.length} amenities and ${serviceNames.length} services`)
                totalImported++
              }

              // Reduced delay
              await new Promise(resolve => setTimeout(resolve, 100))

            } catch (venueError) {
              console.error(`Error processing venue ${poi.poi.name}:`, venueError)
              continue
            }
          }

          // Reduced delay between search terms
          await new Promise(resolve => setTimeout(resolve, 200))

        } catch (searchError) {
          console.error(`Error searching for "${searchTerm}" in ${city.name}:`, searchError)
          continue
        }
      }

      // Reduced delay between cities
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    console.log(`TomTom import completed. Imported: ${totalImported}, Updated: ${totalUpdated}, Skipped: ${totalSkipped}`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `TomTom import completed successfully. Imported ${totalImported} venues, updated ${totalUpdated} venues, skipped ${totalSkipped} duplicates.`,
        imported: totalImported,
        updated: totalUpdated,
        skipped: totalSkipped
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Error in TomTom venues import:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})