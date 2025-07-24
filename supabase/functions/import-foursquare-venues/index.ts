import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Input validation schema
interface VenueImportRequest {
  location: string;
  query?: string;
  limit?: number;
}

// Validation functions
function validateImportRequest(data: any): VenueImportRequest {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid request body');
  }
  
  if (!data.location || typeof data.location !== 'string' || data.location.trim().length < 2) {
    throw new Error('Location must be a string with at least 2 characters');
  }
  
  if (data.query && (typeof data.query !== 'string' || data.query.length > 100)) {
    throw new Error('Query must be a string with maximum 100 characters');
  }
  
  if (data.limit && (!Number.isInteger(data.limit) || data.limit < 1 || data.limit > 50)) {
    throw new Error('Limit must be an integer between 1 and 50');
  }
  
  return {
    location: data.location.trim(),
    query: data.query?.trim(),
    limit: data.limit || 10
  };
}

function sanitizeVenueData(venue: FoursquareVenue): any {
  // Remove any potentially harmful data and validate required fields
  if (!venue.fsq_id || !venue.name || !venue.geocodes?.main) {
    throw new Error('Invalid venue data: missing required fields');
  }
  
  // Validate coordinates
  const lat = venue.geocodes.main.latitude;
  const lng = venue.geocodes.main.longitude;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('Invalid coordinates');
  }
  
  return {
    fsq_id: String(venue.fsq_id).slice(0, 50), // Limit ID length
    name: String(venue.name).slice(0, 200), // Limit name length
    geocodes: venue.geocodes,
    location: venue.location,
    tel: venue.tel ? String(venue.tel).slice(0, 20) : undefined,
    website: venue.website ? String(venue.website).slice(0, 500) : undefined,
    email: venue.email ? String(venue.email).slice(0, 100) : undefined,
    categories: venue.categories?.slice(0, 10), // Limit categories
    hours: venue.hours,
    hours_popular: venue.hours_popular?.slice(0, 7), // Max 7 days
    rating: venue.rating && !isNaN(venue.rating) ? Number(venue.rating) : undefined,
    photos: venue.photos?.slice(0, 20) // Limit photos
  };
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

async function mapVenueCategory(supabase: any, categoryName: string) {
  let categorySlug = 'entertainment-nightlife' // Default

  if (categoryName === 'Gay Bar') {
    categorySlug = 'entertainment-nightlife'
  } else {
    categorySlug = 'community-organizations'
  }

  // Get category ID
  const { data: category } = await supabase
    .from('venue_categories')
    .select('id')
    .eq('slug', categorySlug)
    .maybeSingle()

  return {
    categorySlug: categoryName === 'Gay Bar' ? 'bar' : 'organization',
    categoryId: category?.id || null
  }
}

function mapAmenitiesAndServices(venue: FoursquareVenue, categoryName: string) {
  const amenities = []
  const services = []

  // Extract amenities from features
  if (Array.isArray(venue.features)) {
    venue.features.forEach(feature => {
      const featureName = feature.name.toLowerCase()
      if (featureName.includes('wifi') || featureName.includes('internet')) {
        amenities.push('wifi')
      } else if (featureName.includes('parking')) {
        amenities.push('parking')
      } else if (featureName.includes('wheelchair') || featureName.includes('accessible')) {
        amenities.push('wheelchair-accessible')
      } else if (featureName.includes('outdoor') || featureName.includes('patio')) {
        amenities.push('outdoor-seating')
      } else if (featureName.includes('credit') || featureName.includes('card')) {
        amenities.push('accepts-credit-cards')
      }
    })
  }

  // Add services based on category and features
  if (categoryName === 'Gay Bar') {
    services.push('beverages', 'entertainment')
    if (Array.isArray(venue.features)) {
      venue.features.forEach(feature => {
        const featureName = feature.name.toLowerCase()
        if (featureName.includes('food') || featureName.includes('kitchen')) {
          services.push('dine-in')
        } else if (featureName.includes('delivery')) {
          services.push('delivery')
        } else if (featureName.includes('takeout')) {
          services.push('takeout')
        }
      })
    }
  } else {
    services.push('community-support', 'social-services')
  }

  return { amenities, services }
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
    // Add request timeout - reduced for better reliability
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), 120000); // 2 minutes timeout
    
    // Log security event for function access
    const userAgent = req.headers.get('user-agent') || '';
    const authHeader = req.headers.get('authorization') || '';
    
    console.log(`Function accessed - User-Agent: ${userAgent}, Auth: ${authHeader ? 'Present' : 'Missing'}`);
    
    // Rate limiting check (basic implementation)
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    console.log(`Request from IP: ${clientIp}`);
    
    // Parse request body for city selection
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const selectedCities = body.cities || ['New York']; // Default to single city for quick testing
    const limit = Math.min(body.limit || 5, 20); // Limit venues per category to prevent timeouts
    
    // Clear timeout on completion
    clearTimeout(timeoutId);
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

    // Reduced city list for faster processing
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
    ]

    // Filter cities based on request
    const citiesToProcess = majorCities.filter(city => 
      selectedCities.includes(city.name) || selectedCities.includes('all')
    ).slice(0, 3); // Limit to 3 cities max per request

    console.log(`Processing ${citiesToProcess.length} cities: ${citiesToProcess.map(c => c.name).join(', ')}`)

    for (const city of citiesToProcess) {
      console.log(`Searching venues in ${city.name}...`)

      for (const [categoryName, categoryId] of Object.entries(FOURSQUARE_CATEGORIES)) {
        try {
          // Search for venues using Foursquare Places API with reduced limit
          const searchUrl = `https://api.foursquare.com/v3/places/search?ll=${city.lat},${city.lng}&radius=30000&categories=${categoryId}&limit=${limit}&fields=fsq_id,name,geocodes,location,tel,website,email,categories,hours,rating,photos,description,verified,price,features,popularity,stats,tastes,social_media,date_closed,closed_bucket,hours_popular,store_id`
          
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
              // Validate and sanitize venue data
              const sanitizedVenue = sanitizeVenueData(venue);
              
              // Check if venue already exists
              const { data: existingVenue } = await supabase
                .from('venues')
                .select('id, foursquare_id')
                .eq('foursquare_id', sanitizedVenue.fsq_id)
                .maybeSingle()

              // Get or create city
              const cityName = venue.location.locality || city.name
              const countryCode = venue.location.country || city.country
              const cityId = await getOrCreateCity(supabase, cityName, countryCode, venue.geocodes.main.latitude, venue.geocodes.main.longitude)

              // Map category
              const { categorySlug, categoryId: venueCategoryId } = await mapVenueCategory(supabase, categoryName)

              // Map amenities and services
              const { amenities, services } = mapAmenitiesAndServices(venue, categoryName)

              // Process photos from Foursquare
              const imageUrls = venue.photos?.slice(0, 3).map(photo => {
                const size = '300x300'
                return `${photo.prefix}${size}${photo.suffix}`
              }) || []

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

              // Enhanced tags from categories, features, and tastes
              const enhancedTags = [
                'lgbt-friendly',
                categoryName === 'Gay Bar' ? 'gay-bar' : 'lgbtq-organization',
                ...(venue.categories?.map(cat => cat.short_name.toLowerCase().replace(/\s+/g, '-')) || []),
                ...(Array.isArray(venue.features) ? venue.features.map(feature => feature.name.toLowerCase().replace(/\s+/g, '-')) : []),
                ...(Array.isArray(venue.tastes) ? venue.tastes.map(taste => taste.toLowerCase().replace(/\s+/g, '-')) : [])
              ].filter((tag, index, self) => self.indexOf(tag) === index)

              // Prepare venue data
              const venueData = {
                name: venue.name,
                description: venue.description || null,
                address: venue.location.formatted_address || venue.location.address || '',
                city: cityName,
                state: venue.location.region || null,
                country: countryCode,
                postal_code: venue.location.postcode || null,
                latitude: venue.geocodes.main.latitude,
                longitude: venue.geocodes.main.longitude,
                phone: venue.tel || null,
                website: venue.website || null,
                email: venue.email || null,
                category: categorySlug,
                category_id: venueCategoryId,
                city_id: cityId,
                tags: enhancedTags,
                amenities: amenities,
                services: services,
                images: imageUrls,
                price_range: venue.price || null,
                hours: hoursData,
                verified: venue.verified || false,
                featured: venue.popularity && venue.popularity > 0.7 ? true : false,
                foursquare_id: venue.fsq_id,
                foursquare_rating: venue.rating || null,
                foursquare_data: {
                  categories: venue.categories,
                  hours: venue.hours,
                  hours_popular: venue.hours_popular,
                  photos: venue.photos?.slice(0, 3),
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

              // Reduced delay
              await new Promise(resolve => setTimeout(resolve, 50))

            } catch (venueError) {
              console.error(`Error processing venue ${venue.name}:`, venueError)
            }
          }

          // Reduced delay between category searches
          await new Promise(resolve => setTimeout(resolve, 200))

        } catch (categoryError) {
          console.error(`Error searching ${categoryName} in ${city.name}:`, categoryError)
        }
      }

      // Reduced delay between cities
      await new Promise(resolve => setTimeout(resolve, 500))
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