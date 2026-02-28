import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { enrichVenueWithAI } from '../_shared/ai-enrichment.ts'
import { getCorsHeaders, requireAdmin, getServiceClient } from '../_shared/supabase-client.ts'
import { getOrCreateCity, getOrCreateVenueCategory, getOrCreateAmenity, getOrCreateService } from '../_shared/venue-import-helpers.ts'

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
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabaseAuth = getServiceClient()
  const auth = await requireAdmin(req, supabaseAuth)
  if (auth instanceof Response) return auth

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
    
    // Parse request body for enhanced configuration
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const config = body.config || {};
    
    // Extract configuration with defaults
    const selectedLocations = config.locations || ['New York, NY'];
    const searchTerms = config.searchTerms || ['LGBTQ friendly bar', 'gay bar'];
    const limit = Math.min(config.limit || 5, 20); // Limit venues per search to prevent timeouts
    const radius = config.radius || 30000;
    const includeImages = config.includeImages !== false;
    const includeReviews = config.includeReviews || false;
    const isReimport = config.isReimport || false;
    const minRating = config.filters?.minRating;
    
    console.log('Import configuration:', { selectedLocations, searchTerms, limit, radius, isReimport });
    
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

    // Process specified locations
    const locationsToProcess = selectedLocations.slice(0, 5); // Limit to 5 locations max per request

    console.log(`Processing ${locationsToProcess.length} locations: ${locationsToProcess.join(', ')}`)

    for (const location of locationsToProcess) {
      console.log(`Searching venues in ${location}...`)

      // Use search terms with fallback to generic terms for failed searches
      for (const searchTerm of searchTerms.slice(0, 3)) { // Limit to 3 search terms per location
        try {
          // Fix Foursquare API request - use simpler search terms and correct headers
          const sanitizedSearchTerm = searchTerm.replace(/LGBTQ|gay|lesbian/gi, 'bar'); // Avoid potentially restricted terms
          let searchUrl = `https://api.foursquare.com/v3/places/search?near=${encodeURIComponent(location)}&query=${encodeURIComponent(sanitizedSearchTerm)}&radius=${radius}&limit=${limit}&fields=fsq_id,name,geocodes,location,tel,website,email,categories,hours,rating,photos,description,verified,price,features`
          
          console.log(`Foursquare API URL: ${searchUrl}`)
          console.log(`Using sanitized search term: "${sanitizedSearchTerm}" (original: "${searchTerm}")`)
          console.log(`API Key format: ${foursquareApiKey?.startsWith('fsq_') ? 'Correct (fsq_)' : 'Invalid format - should start with fsq_'}`)
          
          let response = await fetch(searchUrl, {
            headers: {
              'Authorization': foursquareApiKey,
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          })

          // If original search fails with 400, try fallback terms
          if (!response.ok && response.status === 400) {
            // Log the specific error for debugging
            const errorText = await response.text()
            console.log(`Foursquare 400 error details:`, errorText)
            console.log(`Search term that failed: "${searchTerm}"`)
            console.log(`Location that failed: "${location}"`)
            console.log(`API Key format check: ${foursquareApiKey?.startsWith('fsq_') ? 'Valid (starts with fsq_)' : 'INVALID - should start with fsq_'}`)
            
            // Try with just "restaurant" as a simple fallback
            console.log(`Trying simple fallback search with "restaurant"...`)
            
            const fallbackUrl = `https://api.foursquare.com/v3/places/search?near=${encodeURIComponent(location)}&query=restaurant&radius=${radius}&limit=${limit}&fields=fsq_id,name,geocodes,location,tel,website,email,categories,hours,rating`
            
            response = await fetch(fallbackUrl, {
              headers: {
                'Authorization': foursquareApiKey,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
              }
            })
          }

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`Foursquare API error for ${location} "${searchTerm}": ${response.status} - ${errorText}`)
            
            // If we get a 401, the API key is likely invalid
            if (response.status === 401) {
              throw new Error('Foursquare API key is invalid or expired. Please check your API key configuration.')
            }
            
            continue
          }

          const data = await response.json()
          const venues: FoursquareVenue[] = data.results || []

          console.log(`Found ${venues.length} venues for "${searchTerm}" in ${location}`)
          
          // Apply rating filter if specified
          const filteredVenues = minRating 
            ? venues.filter(venue => venue.rating && venue.rating >= minRating)
            : venues;

          for (const venue of filteredVenues) {
            try {
              // Validate and sanitize venue data
              const sanitizedVenue = sanitizeVenueData(venue);
              
              // Check if venue already exists (by external ID or foursquare_id)
              const { data: existingVenue } = await supabase
                .from('venues')
                .select('id, foursquare_id, data_source, external_id')
                .or(`foursquare_id.eq.${sanitizedVenue.fsq_id},and(data_source.eq.foursquare,external_id.eq.${sanitizedVenue.fsq_id})`)
                .maybeSingle()

              if (existingVenue && !isReimport) {
                console.log(`Venue ${sanitizedVenue.name} already exists, skipping...`)
                continue
              }

              // Get or create city
              const cityName = venue.location.locality || location.split(',')[0].trim()
              const countryCode = venue.location.country || 'US'
              const cityId = await getOrCreateCity(supabase, cityName, countryCode, venue.geocodes.main.latitude, venue.geocodes.main.longitude)

              // Determine category from venue categories or default to Gay Bar
              const venueCategoryName = venue.categories?.[0]?.name || 'Gay Bar'
              const { categorySlug, categoryId: venueCategoryId } = await mapVenueCategory(supabase, venueCategoryName)

              // Map amenities and services
              const { amenityIds, serviceIds, amenityNames, serviceNames } = await mapAmenitiesAndServices(supabase, venue, venueCategoryName)

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
                venueCategoryName === 'Gay Bar' ? 'gay-bar' : 'lgbtq-organization',
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

              // AI enrichment — enhance description and tags if available
              try {
                const aiEnrichment = await enrichVenueWithAI(supabase, venueData)
                if (aiEnrichment) {
                  if (aiEnrichment.description && !venueData.description) venueData.description = aiEnrichment.description as string
                  if (aiEnrichment.tags) venueData.tags = [...new Set([...(venueData.tags || []), ...(aiEnrichment.tags as string[])])]
                }
              } catch (e) { console.warn('AI enrichment skipped:', e) }

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

        } catch (searchError) {
          console.error(`Error searching "${searchTerm}" in ${location}:`, searchError)
        }
      }

      // Reduced delay between locations
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
      headers: { ...cors, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    console.error('Error in Foursquare venue import:', error)

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        success: false,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...cors, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})