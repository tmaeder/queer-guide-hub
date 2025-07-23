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

// Specific LGBTQ+ venue keywords
const TOMTOM_SEARCH_TERMS = [
  'gay sauna',
  'lgbt',
  'sexual health clinic',
  'gay bar',
  'gay beach',
  'nude beach'
]

// Major cities to search in
const MAJOR_CITIES = [
  { name: 'New York', lat: 40.7128, lon: -74.0060, country: 'US' },
  { name: 'San Francisco', lat: 37.7749, lon: -122.4194, country: 'US' },
  { name: 'Los Angeles', lat: 34.0522, lon: -118.2437, country: 'US' },
  { name: 'Chicago', lat: 41.8781, lon: -87.6298, country: 'US' },
  { name: 'Miami', lat: 25.7617, lon: -80.1918, country: 'US' },
  { name: 'London', lat: 51.5074, lon: -0.1278, country: 'GB' },
  { name: 'Berlin', lat: 52.5200, lon: 13.4050, country: 'DE' },
  { name: 'Amsterdam', lat: 52.3676, lon: 4.9041, country: 'NL' },
  { name: 'Barcelona', lat: 41.3851, lon: 2.1734, country: 'ES' },
  { name: 'Paris', lat: 48.8566, lon: 2.3522, country: 'FR' }
]

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('Starting TomTom venues import...')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const tomtomApiKey = Deno.env.get('TOMTOM_API_KEY')!

    console.log('TomTom API Key configured:', tomtomApiKey ? 'Yes' : 'No')
    console.log('API Key length:', tomtomApiKey?.length || 0)

    if (!tomtomApiKey) {
      throw new Error('TomTom API key not configured')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    let totalImported = 0
    let totalSkipped = 0
    
    // Process in batches to avoid overwhelming the API
    const BATCH_SIZE = 3 // Process 3 cities at a time
    const cityBatches = []
    
    for (let i = 0; i < MAJOR_CITIES.length; i += BATCH_SIZE) {
      cityBatches.push(MAJOR_CITIES.slice(i, i + BATCH_SIZE))
    }

    console.log(`Processing ${MAJOR_CITIES.length} cities in ${cityBatches.length} batches of ${BATCH_SIZE}`)

    for (let batchIndex = 0; batchIndex < cityBatches.length; batchIndex++) {
      const cityBatch = cityBatches[batchIndex]
      console.log(`Processing batch ${batchIndex + 1}/${cityBatches.length}`)
      
      for (const city of cityBatch) {
        console.log(`Searching venues in ${city.name}...`)
        
        for (const searchTerm of TOMTOM_SEARCH_TERMS) {
        try {
          console.log(`Searching for "${searchTerm}" in ${city.name}...`)
          
          // TomTom Places API - Search
          const searchUrl = `https://api.tomtom.com/search/2/search/${encodeURIComponent(searchTerm)}.json` +
            `?key=${tomtomApiKey}` +
            `&lat=${city.lat}` +
            `&lon=${city.lon}` +
            `&radius=10000` + // 10km radius
            `&limit=20` +
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
                .single()

              if (existingVenue) {
                console.log(`Skipping existing venue: ${poi.poi.name}`)
                totalSkipped++
                continue
              }

              // Extract venue data
              const venueData = {
                name: poi.poi.name || 'Unknown',
                description: poi.info || null,
                address: poi.address.freeformAddress || 
                         `${poi.address.streetName || ''} ${poi.address.streetNumber || ''}`.trim() ||
                         poi.address.localName || null,
                city: poi.address.municipality || city.name,
                state: poi.address.countrySubdivision || null,
                country: poi.address.countryCode || city.country,
                postal_code: poi.address.postalCode || null,
                latitude: poi.position.lat,
                longitude: poi.position.lon,
                phone: poi.poi.phone || null,
                website: poi.poi.url || null,
                email: poi.poi.email || null,
                category: 'bar', // Default category
                tags: ['lgbt-friendly'], // Base tag
                amenities: [],
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

              // Determine category from TomTom classifications
              if (poi.poi.classifications) {
                const classification = poi.poi.classifications.find(c => c.names?.[0]?.name)
                if (classification) {
                  const categoryName = classification.names[0].name.toLowerCase()
                  if (categoryName.includes('bar') || categoryName.includes('pub')) {
                    venueData.category = 'bar'
                  } else if (categoryName.includes('restaurant')) {
                    venueData.category = 'restaurant'
                  } else if (categoryName.includes('club') || categoryName.includes('nightlife')) {
                    venueData.category = 'club'
                  } else if (categoryName.includes('center') || categoryName.includes('organization')) {
                    venueData.category = 'organization'
                  } else if (categoryName.includes('cafe')) {
                    venueData.category = 'cafe'
                  }
                }
              }

              // Add search term specific tags
              const enhancedTags = ['lgbt-friendly']
              if (searchTerm.includes('gay')) enhancedTags.push('gay-friendly')
              if (searchTerm.includes('lesbian')) enhancedTags.push('lesbian-friendly')
              if (searchTerm.includes('trans')) enhancedTags.push('trans-friendly')
              if (searchTerm.includes('drag')) enhancedTags.push('drag-shows')
              if (searchTerm.includes('club')) enhancedTags.push('nightclub')
              if (searchTerm.includes('center') || searchTerm.includes('organization')) {
                enhancedTags.push('community-center')
                venueData.category = 'organization'
              }

              venueData.tags = Array.from(new Set(enhancedTags))

              // Insert venue
              const { error: insertError } = await supabase
                .from('venues')
                .insert(venueData)

              if (insertError) {
                console.error(`Error inserting venue ${poi.poi.name}:`, insertError)
                continue
              }

              console.log(`Imported venue: ${poi.poi.name}`)
              totalImported++

              // Add delay to avoid rate limiting
              await new Promise(resolve => setTimeout(resolve, 200))

            } catch (venueError) {
              console.error(`Error processing venue ${poi.poi.name}:`, venueError)
              continue
            }
          }

          // Add delay between search terms
          await new Promise(resolve => setTimeout(resolve, 500))

        } catch (searchError) {
          console.error(`Error searching for "${searchTerm}" in ${city.name}:`, searchError)
          continue
        }

        // Add delay between cities
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      
      // Add longer delay between batches
      if (batchIndex < cityBatches.length - 1) {
        console.log(`Waiting 5 seconds before next batch...`)
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }

    console.log(`TomTom import completed. Imported: ${totalImported}, Skipped: ${totalSkipped}`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `TomTom import completed successfully. Imported ${totalImported} venues, skipped ${totalSkipped} duplicates.`,
        imported: totalImported,
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