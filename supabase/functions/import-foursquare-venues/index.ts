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
  hours_popular?: Array<{
    day: number
    open: string
    close: string
    popularity: number
  }>
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
  price?: number // 1-4 price level
  features?: Array<{
    id: string
    name: string
  }>
  popularity?: number
  stats?: {
    total_photos?: number
    total_ratings?: number
    total_tips?: number
  }
  tastes?: Array<string>
  social_media?: {
    facebook_id?: string
    instagram?: string
    twitter?: string
  }
  date_closed?: string
  closed_bucket?: string
  store_id?: string
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

    // Process in batches to avoid overwhelming the API
    const BATCH_SIZE = 3 // Process 3 cities at a time
    const cityBatches = []
    
    for (let i = 0; i < majorCities.length; i += BATCH_SIZE) {
      cityBatches.push(majorCities.slice(i, i + BATCH_SIZE))
    }

    console.log(`Processing ${majorCities.length} cities in ${cityBatches.length} batches of ${BATCH_SIZE}`)

    for (let batchIndex = 0; batchIndex < cityBatches.length; batchIndex++) {
      const cityBatch = cityBatches[batchIndex]
      console.log(`Processing batch ${batchIndex + 1}/${cityBatches.length}`)
      
      for (const city of cityBatch) {
        console.log(`Searching venues in ${city.name}...`)

        for (const [categoryName, categoryId] of Object.entries(FOURSQUARE_CATEGORIES)) {
          try {
          // Search for venues using Foursquare Places API with comprehensive field selection
          const searchUrl = `https://api.foursquare.com/v3/places/search?ll=${city.lat},${city.lng}&radius=50000&categories=${categoryId}&limit=50&fields=fsq_id,name,geocodes,location,tel,website,email,categories,hours,rating,photos,description,verified,price,features,popularity,stats,tastes,social_media,date_closed,closed_bucket,hours_popular,store_id`
          
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
                .maybeSingle()

              // Process photos from Foursquare
              const imageUrls = venue.photos?.slice(0, 5).map(photo => {
                // Foursquare photo URLs are constructed from prefix + size + suffix
                const size = '300x300' // Use a reasonable size for venue photos
                return `${photo.prefix}${size}${photo.suffix}`
              }) || []

              // Extract amenities from features and tastes (with proper type checking)
              const amenities = [
                ...(Array.isArray(venue.features) ? venue.features.map(feature => feature.name.toLowerCase().replace(/\s+/g, '-')) : []),
                ...(Array.isArray(venue.tastes) ? venue.tastes.map(taste => taste.toLowerCase().replace(/\s+/g, '-')) : [])
              ]

              // Process hours information
              const hoursData = venue.hours?.regular ? {
                regular: venue.hours.regular,
                display: venue.hours.display,
                open_now: venue.hours.open_now,
                popular: venue.hours_popular || []
              } : null

              // Extract social media information
              const socialMedia = venue.social_media ? {
                facebook: venue.social_media.facebook_id ? `https://facebook.com/${venue.social_media.facebook_id}` : null,
                instagram: venue.social_media.instagram ? `https://instagram.com/${venue.social_media.instagram}` : null,
                twitter: venue.social_media.twitter ? `https://twitter.com/${venue.social_media.twitter}` : null
              } : {}

              // Enhanced tags from categories, features, and tastes (with proper type checking)
              const enhancedTags = [
                'lgbt-friendly',
                categoryName === 'Gay Bar' ? 'gay-bar' : 'lgbtq-organization',
                ...(venue.categories?.map(cat => cat.short_name.toLowerCase().replace(/\s+/g, '-')) || []),
                ...(Array.isArray(venue.features) ? venue.features.map(feature => feature.name.toLowerCase().replace(/\s+/g, '-')) : []),
                ...(Array.isArray(venue.tastes) ? venue.tastes.map(taste => taste.toLowerCase().replace(/\s+/g, '-')) : [])
              ].filter((tag, index, self) => self.indexOf(tag) === index) // Remove duplicates

              // Prepare venue data with comprehensive Foursquare information
              const venueData = {
                name: venue.name,
                description: venue.description || null,
                address: venue.location.formatted_address || venue.location.address || '',
                city: venue.location.locality || city.name,
                state: venue.location.region || null,
                country: venue.location.country || city.country,
                postal_code: venue.location.postcode || null,
                latitude: venue.geocodes.main.latitude,
                longitude: venue.geocodes.main.longitude,
                phone: venue.tel || null,
                website: venue.website || null,
                email: venue.email || null,
                category: categoryName === 'Gay Bar' ? 'bar' : 'organization',
                tags: enhancedTags,
                amenities: amenities,
                images: imageUrls,
                price_range: venue.price || null, // Foursquare price level (1-4)
                hours: hoursData,
                verified: venue.verified || false,
                featured: venue.popularity && venue.popularity > 0.7 ? true : false, // Feature popular venues
                foursquare_id: venue.fsq_id,
                foursquare_rating: venue.rating || null,
                foursquare_data: {
                  categories: venue.categories,
                  hours: venue.hours,
                  hours_popular: venue.hours_popular,
                  photos: venue.photos?.slice(0, 5),
                  features: venue.features,
                  popularity: venue.popularity,
                  stats: venue.stats,
                  tastes: venue.tastes,
                  social_media: venue.social_media,
                  date_closed: venue.date_closed,
                  closed_bucket: venue.closed_bucket,
                  store_id: venue.store_id,
                  social_links: socialMedia
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
      
      // Add longer delay between batches
      if (batchIndex < cityBatches.length - 1) {
        console.log(`Waiting 5 seconds before next batch...`)
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
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