import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FoursquareVenue {
  fsq_id: string
  name: string
  geocodes: {
    main: {
      latitude: number
      longitude: number
    }
  }
  location: {
    formatted_address?: string
    address?: string
    locality?: string
    region?: string
    postcode?: string
    country?: string
  }
  tel?: string
  website?: string
  email?: string
  categories: Array<{
    id: number
    name: string
    short_name: string
  }>
  hours?: {
    display?: string
    open_now?: boolean
    regular?: Array<{
      day: number
      open: string
      close: string
    }>
  }
  rating?: number
  photos?: Array<{
    id: string
    created_at: string
    prefix: string
    suffix: string
    width: number
    height: number
  }>
  description?: string
  verified?: boolean
}

const FOURSQUARE_CATEGORIES = {
  'LGBTQ Organization': '19065',
  'Gay Bar': '13003'
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const foursquareApiKey = Deno.env.get('FOURSQUARE_API_KEY')!

    if (!foursquareApiKey) {
      throw new Error('FOURSQUARE_API_KEY is not configured')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('Starting Foursquare venue import...')

    let totalImported = 0
    let totalUpdated = 0

    // Search for venues in major cities worldwide
    const majorCities = [
      { name: 'New York', lat: 40.7128, lng: -74.0060, country: 'US' },
      { name: 'Los Angeles', lat: 34.0522, lng: -118.2437, country: 'US' },
      { name: 'San Francisco', lat: 37.7749, lng: -122.4194, country: 'US' },
      { name: 'Chicago', lat: 41.8781, lng: -87.6298, country: 'US' },
      { name: 'London', lat: 51.5074, lng: -0.1278, country: 'GB' },
      { name: 'Paris', lat: 48.8566, lng: 2.3522, country: 'FR' },
      { name: 'Berlin', lat: 52.5200, lng: 13.4050, country: 'DE' },
      { name: 'Amsterdam', lat: 52.3676, lng: 4.9041, country: 'NL' },
      { name: 'Toronto', lat: 43.6532, lng: -79.3832, country: 'CA' },
      { name: 'Sydney', lat: -33.8688, lng: 151.2093, country: 'AU' },
      { name: 'Tokyo', lat: 35.6762, lng: 139.6503, country: 'JP' },
      { name: 'Madrid', lat: 40.4168, lng: -3.7038, country: 'ES' },
      { name: 'Barcelona', lat: 41.3851, lng: 2.1734, country: 'ES' },
      { name: 'Rome', lat: 41.9028, lng: 12.4964, country: 'IT' },
      { name: 'Milan', lat: 45.4642, lng: 9.1900, country: 'IT' },
    ]

    for (const city of majorCities) {
      console.log(`Searching venues in ${city.name}...`)

      for (const [categoryName, categoryId] of Object.entries(FOURSQUARE_CATEGORIES)) {
        try {
          // Search for venues using Foursquare Places API
          const searchUrl = `https://api.foursquare.com/v3/places/search?ll=${city.lat},${city.lng}&radius=50000&categories=${categoryId}&limit=50&fields=fsq_id,name,geocodes,location,tel,website,email,categories,hours,rating,photos,description,verified`
          
          const response = await fetch(searchUrl, {
            headers: {
              'Authorization': foursquareApiKey,
              'Accept': 'application/json'
            }
          })

          if (!response.ok) {
            console.error(`Foursquare API error for ${city.name} ${categoryName}: ${response.status}`)
            continue
          }

          const data = await response.json()
          const venues: FoursquareVenue[] = data.results || []

          console.log(`Found ${venues.length} ${categoryName} venues in ${city.name}`)

          for (const venue of venues) {
            try {
              // Check if venue already exists
              const { data: existingVenue } = await supabase
                .from('venues')
                .select('id, foursquare_id')
                .eq('foursquare_id', venue.fsq_id)
                .single()

              // Prepare venue data
              const venueData = {
                name: venue.name,
                description: venue.description || null,
                address: venue.location.formatted_address || venue.location.address || '',
                city: venue.location.locality || city.name,
                state: venue.location.region || null,
                country: venue.location.country || city.country,
                postal_code: venue.location.postcode || null,
                latitude: venue.geocodes.main.latitude.toString(),
                longitude: venue.geocodes.main.longitude.toString(),
                phone: venue.tel || null,
                website: venue.website || null,
                email: venue.email || null,
                category: categoryName === 'Gay Bar' ? 'bar' : 'organization',
                tags: [
                  'lgbt-friendly',
                  categoryName === 'Gay Bar' ? 'gay-bar' : 'lgbtq-organization',
                  ...(venue.categories?.map(cat => cat.short_name.toLowerCase().replace(/\s+/g, '-')) || [])
                ],
                amenities: [],
                services: [],
                verified: venue.verified || false,
                foursquare_id: venue.fsq_id,
                foursquare_rating: venue.rating || null,
                foursquare_data: {
                  categories: venue.categories,
                  hours: venue.hours,
                  photos: venue.photos?.slice(0, 5) // Limit to 5 photos
                }
              }

              if (existingVenue) {
                // Update existing venue
                const { error } = await supabase
                  .from('venues')
                  .update({
                    ...venueData,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', existingVenue.id)

                if (error) {
                  console.error(`Error updating venue ${venue.name}:`, error)
                } else {
                  totalUpdated++
                  console.log(`Updated venue: ${venue.name}`)
                }
              } else {
                // Create new venue
                const { error } = await supabase
                  .from('venues')
                  .insert([venueData])

                if (error) {
                  console.error(`Error creating venue ${venue.name}:`, error)
                } else {
                  totalImported++
                  console.log(`Imported new venue: ${venue.name}`)
                }
              }

              // Add delay to avoid rate limiting
              await new Promise(resolve => setTimeout(resolve, 100))

            } catch (venueError) {
              console.error(`Error processing venue ${venue.name}:`, venueError)
            }
          }

          // Add delay between category searches
          await new Promise(resolve => setTimeout(resolve, 1000))

        } catch (categoryError) {
          console.error(`Error searching ${categoryName} in ${city.name}:`, categoryError)
        }
      }

      // Add delay between cities
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    const result = {
      success: true,
      message: `Foursquare venue import completed. Imported: ${totalImported}, Updated: ${totalUpdated}`,
      totalImported,
      totalUpdated,
      timestamp: new Date().toISOString()
    }

    console.log(result.message)

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    console.error('Error in Foursquare venue import:', error)

    return new Response(
      JSON.stringify({
        error: error.message,
        success: false,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})