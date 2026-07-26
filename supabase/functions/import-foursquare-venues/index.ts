import { getCorsHeaders, requireAdmin, getServiceClient } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'

// ============================================================
// Admin-triggered Foursquare fetcher.
// Fetch + parse only — venues are staged into ingestion_staging
// (source_type 'import-foursquare') and flow through the standard
// validate → dedupe → review-gate → commit pipeline. No direct
// writes to venues/cities/venue_categories/services.
// ============================================================

function sanitizeVenueData(venue: FoursquareVenue): FoursquareVenue {
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
    ...venue,
    fsq_id: String(venue.fsq_id).slice(0, 50), // Limit ID length
    name: String(venue.name).slice(0, 200), // Limit name length
    tel: venue.tel ? String(venue.tel).slice(0, 20) : undefined,
    website: venue.website ? String(venue.website).slice(0, 500) : undefined,
    email: venue.email ? String(venue.email).slice(0, 100) : undefined,
    categories: venue.categories?.slice(0, 10), // Limit categories
    hours_popular: venue.hours_popular?.slice(0, 7), // Max 7 days
    rating: venue.rating && !isNaN(venue.rating) ? Number(venue.rating) : undefined,
    photos: venue.photos?.slice(0, 20) // Limit photos
  };
}

// Pure amenity/service name extraction (the legacy getOrCreate* entity
// writes are gone — names ride along in normalized_data and the Amenity
// Truth Engine vocabulary gate classifies them post-commit).
function extractAmenitiesAndServices(venue: FoursquareVenue, categoryName: string) {
  const amenityNames: string[] = []
  const serviceNames: string[] = []

  if (Array.isArray(venue.features)) {
    for (const feature of venue.features) {
      const featureName = feature.name.toLowerCase()
      if (featureName.includes('wifi') || featureName.includes('internet')) amenityNames.push('WiFi')
      else if (featureName.includes('parking')) amenityNames.push('Parking')
      else if (featureName.includes('wheelchair') || featureName.includes('accessible')) amenityNames.push('Wheelchair Accessible')
      else if (featureName.includes('outdoor') || featureName.includes('patio')) amenityNames.push('Outdoor Seating')
      else if (featureName.includes('credit') || featureName.includes('card')) amenityNames.push('Accepts Credit Cards')
    }
  }

  if (categoryName === 'Gay Bar') {
    serviceNames.push('Beverages', 'Entertainment')
    if (Array.isArray(venue.features)) {
      for (const feature of venue.features) {
        const featureName = feature.name.toLowerCase()
        let serviceName = ''
        if (featureName.includes('food') || featureName.includes('kitchen')) serviceName = 'Dine-In'
        else if (featureName.includes('delivery')) serviceName = 'Delivery'
        else if (featureName.includes('takeout')) serviceName = 'Takeout'
        if (serviceName && !serviceNames.includes(serviceName)) serviceNames.push(serviceName)
      }
    }
  } else {
    serviceNames.push('Community Support', 'Social Services')
  }

  return { amenityNames: [...new Set(amenityNames)], serviceNames }
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

// Staging adapter: normalizes a fetched venue into the standard
// NormalizedItem shape the venue pipeline (validate/dedupe/commit) expects.
const foursquareImportAdapter: SourceAdapter = {
  name: 'foursquare',
  entityType: 'venue',

  // fetch is driven inline by the handler (location × search-term loops).
  fetch(_config: AdapterConfig): Promise<RawItem[]> {
    return Promise.resolve([])
  },

  normalize(raw: RawItem): NormalizedItem {
    const venue = raw.data as unknown as FoursquareVenue & { _search_location?: string }
    const cityName = venue.location.locality || String(venue._search_location || '').split(',')[0].trim()
    const countryCode = venue.location.country || 'US'

    const venueCategoryName = venue.categories?.[0]?.name || 'Gay Bar'
    const categorySlug = venueCategoryName === 'Gay Bar' ? 'bar' : 'organization'
    const { amenityNames, serviceNames } = extractAmenitiesAndServices(venue, venueCategoryName)

    // Process photos from Foursquare
    const imageUrls = venue.photos?.slice(0, 3).map(photo => `${photo.prefix}300x300${photo.suffix}`) || []

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

    return {
      entityType: 'venue',
      sourceId: raw.sourceId,
      sourceName: 'foursquare',
      name: venue.name,
      description: venue.description || '',
      category: categorySlug,
      location: {
        lat: venue.geocodes.main.latitude,
        lng: venue.geocodes.main.longitude,
        address: venue.location.formatted_address || venue.location.address || '',
        city: cityName,
        country: countryCode,
      },
      urls: venue.website ? [String(venue.website)] : [],
      images: imageUrls,
      tags: enhancedTags,
      contacts: {
        phone: venue.tel || undefined,
        website: venue.website || undefined,
        email: venue.email || undefined,
      },
      metadata: {
        foursquare_id: venue.fsq_id,
        foursquare_rating: venue.rating ?? null,
        price_range: venue.price ?? null,
        hours: hoursData,
        state: venue.location.region ?? null,
        postal_code: venue.location.postcode ?? null,
        amenity_candidates: amenityNames,
        services: serviceNames,
        categories: venue.categories?.map(c => c.name),
        features: venue.features,
        popularity: venue.popularity ?? null,
        stats: venue.stats ?? null,
        tastes: venue.tastes ?? null,
        social_media: venue.social_media ?? null,
        social_links: socialMedia,
        date_closed: venue.date_closed ?? null,
        closed_bucket: venue.closed_bucket ?? null,
        store_id: venue.store_id ?? null,
        platform_ids: { foursquare: venue.fsq_id },
        data_source: 'foursquare',
      },
    } as NormalizedItem
  },

  getSourceId(raw: RawItem): string {
    return raw.sourceId
  },
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = getServiceClient()
  const auth = await requireAdmin(req, supabase)
  if (auth instanceof Response) return auth

  try {
    // Parse request body for enhanced configuration
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const config = body.config || {};

    // Extract configuration with defaults
    const selectedLocations = config.locations || ['New York, NY'];
    const searchTerms = config.searchTerms || ['LGBTQ friendly bar', 'gay bar'];
    const limit = Math.min(config.limit || 5, 20); // Limit venues per search to prevent timeouts
    const radius = config.radius || 30000;
    const minRating = config.filters?.minRating;

    console.log('Fetch configuration:', { selectedLocations, searchTerms, limit, radius });

    const foursquareApiKey = Deno.env.get('FOURSQUARE_API_KEY')!

    if (!foursquareApiKey) {
      throw new Error('FOURSQUARE_API_KEY is not configured')
    }

    console.log('Starting Foursquare venue fetch...')

    const rawItems: RawItem[] = []
    const seen = new Set<string>()

    // Process specified locations
    const locationsToProcess = selectedLocations.slice(0, 5); // Limit to 5 locations max per request

    console.log(`Processing ${locationsToProcess.length} locations: ${locationsToProcess.join(', ')}`)

    for (const location of locationsToProcess) {
      console.log(`Searching venues in ${location}...`)

      for (const searchTerm of searchTerms.slice(0, 3)) { // Limit to 3 search terms per location
        try {
          // Use simpler search terms — avoid potentially restricted terms
          const sanitizedSearchTerm = searchTerm.replace(/LGBTQ|gay|lesbian/gi, 'bar');
          const searchUrl = `https://api.foursquare.com/v3/places/search?near=${encodeURIComponent(location)}&query=${encodeURIComponent(sanitizedSearchTerm)}&radius=${radius}&limit=${limit}&fields=fsq_id,name,geocodes,location,tel,website,email,categories,hours,rating,photos,description,verified,price,features`

          console.log(`Using sanitized search term: "${sanitizedSearchTerm}" (original: "${searchTerm}")`)

          let response = await fetch(searchUrl, {
            headers: {
              'Authorization': foursquareApiKey,
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          })

          // If original search fails with 400, try fallback terms
          if (!response.ok && response.status === 400) {
            const errorText = await response.text()
            console.log(`Foursquare 400 error details:`, errorText)

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
              if (seen.has(sanitizedVenue.fsq_id)) continue
              seen.add(sanitizedVenue.fsq_id)

              rawItems.push({
                sourceId: sanitizedVenue.fsq_id,
                data: {
                  ...(sanitizedVenue as unknown as Record<string, unknown>),
                  _search_location: location,
                  _search_term: searchTerm,
                },
              })
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

    // Stage everything for the review pipeline (idempotent per source id).
    const staged = await writeToStaging(supabase, foursquareImportAdapter, rawItems, {
      batchSize: rawItems.length,
      targetTable: 'venues',
      sourceType: 'import-foursquare',
    })

    const result = {
      success: true,
      message: `Staged ${staged} venues for the review pipeline`,
      staged,
      total_processed: rawItems.length,
      timestamp: new Date().toISOString()
    }

    console.log(result.message)

    return new Response(JSON.stringify(result), {
      headers: { ...cors, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    console.error('Error in Foursquare venue fetch:', error)

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
