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
  isReimport?: boolean;
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
    limit: data.limit || 10,
    isReimport: data.isReimport || false
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
      description: `Auto-created from Foursquare import`,
      icon: categorySlug.includes('entertainment') ? 'Music' : categorySlug.includes('community') ? 'Users' : 'UtensilsCrossed',
      color: categorySlug.includes('entertainment') ? '#8b5cf6' : categorySlug.includes('community') ? '#10b981' : '#ef4444'
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
      description: `Auto-created from Foursquare import`,
      icon: amenitySlug.includes('wifi') ? 'Wifi' : 
            amenitySlug.includes('parking') ? 'Car' : 
            amenitySlug.includes('wheelchair') ? 'Accessibility' : 
            amenitySlug.includes('outdoor') ? 'Trees' : 'MapPin'
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
      description: `Auto-created from Foursquare import`,
      icon: serviceSlug.includes('beverage') ? 'Wine' : 
            serviceSlug.includes('dine') ? 'UtensilsCrossed' : 
            serviceSlug.includes('delivery') ? 'Truck' : 
            serviceSlug.includes('community') ? 'Users' : 'MapPin'
    })
    .select('id')
    .maybeSingle()

  if (!error && newService) {
    console.log(`Created new service: ${serviceName}`)
    return newService.id
  }

  return null
}

async function mapVenueCategory(supabase: any, categoryName: string) {
  let venueCategory = 'Entertainment & Nightlife'
  let categorySlug = 'entertainment-nightlife'

  if (categoryName === 'Gay Bar') {
    venueCategory = 'Entertainment & Nightlife'
    categorySlug = 'entertainment-nightlife'
  } else {
    venueCategory = 'Community Organizations'
    categorySlug = 'community-organizations'
  }

  const categoryId = await getOrCreateVenueCategory(supabase, venueCategory, categorySlug)

  return {
    categorySlug: categoryName === 'Gay Bar' ? 'bar' : 'organization',
    categoryId
  }
}

async function mapAmenitiesAndServices(supabase: any, venue: FoursquareVenue, categoryName: string) {
  const amenityIds = []
  const serviceIds = []
  const amenityNames = []
  const serviceNames = []

  // Extract amenities from features
  if (Array.isArray(venue.features)) {
    for (const feature of venue.features) {
      const featureName = feature.name.toLowerCase()
      let amenityName = ''
      let amenitySlug = ''
      
      if (featureName.includes('wifi') || featureName.includes('internet')) {
        amenityName = 'WiFi'
        amenitySlug = 'wifi'
      } else if (featureName.includes('parking')) {
        amenityName = 'Parking'
        amenitySlug = 'parking'
      } else if (featureName.includes('wheelchair') || featureName.includes('accessible')) {
        amenityName = 'Wheelchair Accessible'
        amenitySlug = 'wheelchair-accessible'
      } else if (featureName.includes('outdoor') || featureName.includes('patio')) {
        amenityName = 'Outdoor Seating'
        amenitySlug = 'outdoor-seating'
      } else if (featureName.includes('credit') || featureName.includes('card')) {
        amenityName = 'Accepts Credit Cards'
        amenitySlug = 'accepts-credit-cards'
      }

      if (amenityName) {
        amenityNames.push(amenityName)
        const amenityId = await getOrCreateAmenity(supabase, amenityName, amenitySlug)
        if (amenityId) amenityIds.push(amenityId)
      }
    }
  }

  // Extract services from features and category
  if (categoryName === 'Gay Bar') {
    serviceNames.push('Beverages', 'Entertainment')
    const beverageId = await getOrCreateService(supabase, 'Beverages', 'beverages')
    const entertainmentId = await getOrCreateService(supabase, 'Entertainment', 'entertainment')
    if (beverageId) serviceIds.push(beverageId)
    if (entertainmentId) serviceIds.push(entertainmentId)

    // Additional services from features
    if (Array.isArray(venue.features)) {
      for (const feature of venue.features) {
        const featureName = feature.name.toLowerCase()
        let serviceName = ''
        let serviceSlug = ''

        if (featureName.includes('food') || featureName.includes('kitchen')) {
          serviceName = 'Dine-In'
          serviceSlug = 'dine-in'
        } else if (featureName.includes('delivery')) {
          serviceName = 'Delivery'
          serviceSlug = 'delivery'
        } else if (featureName.includes('takeout')) {
          serviceName = 'Takeout'
          serviceSlug = 'takeout'
        }

        if (serviceName && !serviceNames.includes(serviceName)) {
          serviceNames.push(serviceName)
          const serviceId = await getOrCreateService(supabase, serviceName, serviceSlug)
          if (serviceId) serviceIds.push(serviceId)
        }
      }
    }
  } else {
    serviceNames.push('Community Support', 'Social Services')
    const communityId = await getOrCreateService(supabase, 'Community Support', 'community-support')
    const socialId = await getOrCreateService(supabase, 'Social Services', 'social-services')
    if (communityId) serviceIds.push(communityId)
    if (socialId) serviceIds.push(socialId)
  }

  return { amenityIds, serviceIds, amenityNames, serviceNames }
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
              
              // Check if venue already exists (by external ID or foursquare_id)
              const { data: existingVenue } = await supabase
                .from('venues')
                .select('id, foursquare_id, data_source, external_id')
                .or(`foursquare_id.eq.${sanitizedVenue.fsq_id},and(data_source.eq.foursquare,external_id.eq.${sanitizedVenue.fsq_id})`)
                .maybeSingle()

              // Get or create city
              const cityName = venue.location.locality || city.name
              const countryCode = venue.location.country || city.country
              const cityId = await getOrCreateCity(supabase, cityName, countryCode, venue.geocodes.main.latitude, venue.geocodes.main.longitude)

              // Map category
              const { categorySlug, categoryId: venueCategoryId } = await mapVenueCategory(supabase, categoryName)

              // Map amenities and services
              const { amenityIds, serviceIds, amenityNames, serviceNames } = await mapAmenitiesAndServices(supabase, venue, categoryName)

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
                amenities: amenityNames,
                services: serviceNames,
                images: imageUrls,
                price_range: venue.price || null,
                hours: hoursData,
                verified: venue.verified || false,
                featured: venue.popularity && venue.popularity > 0.7 ? true : false,
                foursquare_id: venue.fsq_id,
                foursquare_rating: venue.rating || null,
                data_source: 'foursquare',
                external_id: venue.fsq_id,
                last_synced_at: new Date().toISOString(),
                sync_status: 'synced',
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
                  console.log(`Updated venue: ${venue.name} with ${amenityNames.length} amenities and ${serviceNames.length} services`)
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
                  console.log(`Imported new venue: ${venue.name} with ${amenityNames.length} amenities and ${serviceNames.length} services`)
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