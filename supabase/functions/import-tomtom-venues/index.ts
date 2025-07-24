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

// Helper functions for city and category management
async function getOrCreateCity(supabase: any, cityName: string, countryCode: string, lat: number, lon: number) {
  // First try to find existing city
  const { data: existingCity } = await supabase
    .from('cities')
    .select('id')
    .eq('name', cityName)
    .maybeSingle()

  if (existingCity) {
    return existingCity.id
  }

  // Get country_id from countries table
  const { data: country } = await supabase
    .from('countries')
    .select('id')
    .eq('code', countryCode)
    .maybeSingle()

  // Create new city
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

async function mapVenueCategory(supabase: any, classifications: any[], searchTerm: string) {
  let categorySlug = 'restaurants-dining' // Default

  if (classifications) {
    const classification = classifications.find(c => c.names?.[0]?.name)
    if (classification) {
      const categoryName = classification.names[0].name.toLowerCase()
      if (categoryName.includes('bar') || categoryName.includes('pub')) {
        categorySlug = 'entertainment-nightlife'
      } else if (categoryName.includes('restaurant')) {
        categorySlug = 'restaurants-dining'
      } else if (categoryName.includes('club') || categoryName.includes('nightlife')) {
        categorySlug = 'entertainment-nightlife'
      } else if (categoryName.includes('center') || categoryName.includes('organization')) {
        categorySlug = 'community-organizations'
      } else if (categoryName.includes('cafe')) {
        categorySlug = 'restaurants-dining'
      }
    }
  }

  // Override based on search term
  if (searchTerm.includes('center') || searchTerm.includes('organization')) {
    categorySlug = 'community-organizations'
  }

  // Get category ID
  const { data: category } = await supabase
    .from('venue_categories')
    .select('id')
    .eq('slug', categorySlug)
    .maybeSingle()

  return {
    categorySlug: categorySlug === 'entertainment-nightlife' ? 'bar' : 
                 categorySlug === 'community-organizations' ? 'organization' : 'restaurant',
    categoryId: category?.id || null
  }
}

function mapAmenitiesAndServices(poi: TomTomPOI, searchTerm: string) {
  const amenities = []
  const services = []

  // Basic amenities from POI data
  if (poi.poi.phone) amenities.push('phone-service')
  if (poi.poi.url) amenities.push('wifi')
  if (poi.entryPoints && poi.entryPoints.length > 1) amenities.push('multiple-entrances')
  
  // Services based on search term and classification
  if (searchTerm.includes('bar') || searchTerm.includes('club')) {
    services.push('beverages', 'entertainment')
  } else if (searchTerm.includes('restaurant') || searchTerm.includes('cafe')) {
    services.push('dine-in', 'food-service')
  } else if (searchTerm.includes('health') || searchTerm.includes('clinic')) {
    services.push('health-services', 'counseling')
  } else if (searchTerm.includes('center') || searchTerm.includes('organization')) {
    services.push('community-support', 'social-services')
  }

  return { amenities, services }
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
    let totalSkipped = 0
    
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
              // Check if venue already exists
              const { data: existingVenue } = await supabase
                .from('venues')
                .select('id, tomtom_id')
                .eq('tomtom_id', poi.id)
                .maybeSingle()

              // Get or create city
              const cityName = poi.address.municipality || city.name
              const countryCode = poi.address.countryCode || city.country
              const cityId = await getOrCreateCity(supabase, cityName, countryCode, poi.position.lat, poi.position.lon)

              // Map category
              const { categorySlug, categoryId } = await mapVenueCategory(supabase, poi.poi.classifications, searchTerm)

              // Map amenities and services
              const { amenities, services } = mapAmenitiesAndServices(poi, searchTerm)

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
                category_id: categoryId,
                city_id: cityId,
                tags: Array.from(new Set(enhancedTags)),
                amenities: amenities,
                services: services,
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

                console.log(`Updated venue: ${poi.poi.name}`)
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

                console.log(`Imported venue: ${poi.poi.name}`)
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