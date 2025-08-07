import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface VenueData {
  name?: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  phone?: string;
  email?: string;
  website?: string;
  category?: string;
  price_range?: number;
  latitude?: number;
  longitude?: number;
  rating?: number;
  hours?: string;
  images?: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { venueName, currentData = {} } = await req.json()
    
    if (!venueName) {
      return new Response(
        JSON.stringify({ error: 'Venue name is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`Starting venue enrichment for: ${venueName}`)

    // Get API keys
    const foursquareKey = Deno.env.get('FOURSQUARE_API_KEY')
    const googleKey = Deno.env.get('GOOGLE_PLACES_API_KEY')
    const tomtomKey = Deno.env.get('TOMTOM_API_KEY')
    const tripadvisorKey = Deno.env.get('TRIPADVISOR_API_KEY')

    const enrichmentPromises = []

    // Foursquare search
    if (foursquareKey) {
      enrichmentPromises.push(searchFoursquare(venueName, foursquareKey))
    }

    // Google Places search
    if (googleKey) {
      enrichmentPromises.push(searchGooglePlaces(venueName, googleKey))
    }

    // TomTom search
    if (tomtomKey) {
      enrichmentPromises.push(searchTomTom(venueName, tomtomKey))
    }

    // TripAdvisor search
    if (tripadvisorKey) {
      enrichmentPromises.push(searchTripAdvisor(venueName, tripadvisorKey))
    }

    // Execute all searches in parallel
    const results = await Promise.allSettled(enrichmentPromises)
    console.log(`Completed ${results.length} API searches`)

    // Merge results
    const enrichedData = mergeVenueData(currentData, results)

    return new Response(
      JSON.stringify({ 
        success: true, 
        enrichedData,
        sources: results.map((r, i) => ({
          source: ['foursquare', 'google', 'tomtom', 'tripadvisor'][i],
          status: r.status,
          hasData: r.status === 'fulfilled' && r.value !== null
        }))
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in enrich-venue function:', error)
    
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

async function searchFoursquare(venueName: string, apiKey: string): Promise<VenueData | null> {
  try {
    console.log('Searching Foursquare for:', venueName)
    
    const searchUrl = `https://api.foursquare.com/v3/places/search?query=${encodeURIComponent(venueName)}&limit=1`
    
    const response = await fetch(searchUrl, {
      headers: {
        'Authorization': apiKey,
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      console.error('Foursquare API error:', response.status)
      return null
    }

    const data = await response.json()
    
    if (!data.results || data.results.length === 0) {
      console.log('No Foursquare results found')
      return null
    }

    const venue = data.results[0]
    console.log('Found Foursquare venue:', venue.name)

    return {
      name: venue.name,
      address: venue.location?.formatted_address,
      city: venue.location?.locality,
      state: venue.location?.region,
      country: venue.location?.country,
      postal_code: venue.location?.postcode,
      latitude: venue.geocodes?.main?.latitude,
      longitude: venue.geocodes?.main?.longitude,
      category: venue.categories?.[0]?.name,
      website: venue.website,
      phone: venue.tel,
      rating: venue.rating
    }
  } catch (error) {
    console.error('Foursquare search error:', error)
    return null
  }
}

async function searchGooglePlaces(venueName: string, apiKey: string): Promise<VenueData | null> {
  try {
    console.log('Searching Google Places for:', venueName)
    
    // First, search for the place
    const searchUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(venueName)}&inputtype=textquery&fields=place_id,name,formatted_address,geometry,rating,price_level&key=${apiKey}`
    
    const searchResponse = await fetch(searchUrl)
    
    if (!searchResponse.ok) {
      console.error('Google Places search error:', searchResponse.status)
      return null
    }

    const searchData = await searchResponse.json()
    
    if (!searchData.candidates || searchData.candidates.length === 0) {
      console.log('No Google Places results found')
      return null
    }

    const place = searchData.candidates[0]
    
    // Get detailed information
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,address_components,geometry,international_phone_number,website,rating,price_level,opening_hours,photos&key=${apiKey}`
    
    const detailsResponse = await fetch(detailsUrl)
    const detailsData = await detailsResponse.json()
    
    if (!detailsData.result) {
      return null
    }

    const details = detailsData.result
    console.log('Found Google Places venue:', details.name)

    // Parse address components
    const addressComponents = details.address_components || []
    const getComponent = (types: string[]) => {
      const component = addressComponents.find((comp: any) => 
        types.some(type => comp.types.includes(type))
      )
      return component?.long_name
    }

    return {
      name: details.name,
      address: details.formatted_address,
      city: getComponent(['locality']),
      state: getComponent(['administrative_area_level_1']),
      country: getComponent(['country']),
      postal_code: getComponent(['postal_code']),
      latitude: details.geometry?.location?.lat,
      longitude: details.geometry?.location?.lng,
      phone: details.international_phone_number,
      website: details.website,
      rating: details.rating,
      price_range: details.price_level,
      hours: details.opening_hours?.weekday_text?.join('; ')
    }
  } catch (error) {
    console.error('Google Places search error:', error)
    return null
  }
}

async function searchTomTom(venueName: string, apiKey: string): Promise<VenueData | null> {
  try {
    console.log('Searching TomTom for:', venueName)
    
    const searchUrl = `https://api.tomtom.com/search/2/search/${encodeURIComponent(venueName)}.json?key=${apiKey}&typeahead=false&limit=1`
    
    const response = await fetch(searchUrl)
    
    if (!response.ok) {
      console.error('TomTom API error:', response.status)
      return null
    }

    const data = await response.json()
    
    if (!data.results || data.results.length === 0) {
      console.log('No TomTom results found')
      return null
    }

    const venue = data.results[0]
    console.log('Found TomTom venue:', venue.poi?.name || venue.address?.freeformAddress)

    return {
      name: venue.poi?.name,
      address: venue.address?.freeformAddress,
      city: venue.address?.municipality,
      state: venue.address?.countrySubdivision,
      country: venue.address?.country,
      postal_code: venue.address?.postalCode,
      latitude: venue.position?.lat,
      longitude: venue.position?.lon,
      phone: venue.poi?.phone,
      website: venue.poi?.url,
      category: venue.poi?.categories?.[0]
    }
  } catch (error) {
    console.error('TomTom search error:', error)
    return null
  }
}

async function searchTripAdvisor(venueName: string, apiKey: string): Promise<VenueData | null> {
  try {
    console.log('Searching TripAdvisor for:', venueName)
    
    const searchUrl = `https://api.content.tripadvisor.com/api/v1/location/search?key=${apiKey}&searchQuery=${encodeURIComponent(venueName)}&language=en`
    
    const response = await fetch(searchUrl)
    
    if (!response.ok) {
      console.error('TripAdvisor API error:', response.status)
      return null
    }

    const data = await response.json()
    
    if (!data.data || data.data.length === 0) {
      console.log('No TripAdvisor results found')
      return null
    }

    const venue = data.data[0]
    console.log('Found TripAdvisor venue:', venue.name)

    // Get additional details
    let details = null
    try {
      const detailsUrl = `https://api.content.tripadvisor.com/api/v1/location/${venue.location_id}/details?key=${apiKey}&language=en`
      const detailsResponse = await fetch(detailsUrl)
      if (detailsResponse.ok) {
        details = await detailsResponse.json()
      }
    } catch (e) {
      console.log('Could not fetch TripAdvisor details')
    }

    return {
      name: venue.name,
      description: details?.description,
      address: venue.address_obj?.address_string,
      city: venue.address_obj?.city,
      state: venue.address_obj?.state,
      country: venue.address_obj?.country,
      latitude: parseFloat(venue.latitude),
      longitude: parseFloat(venue.longitude),
      rating: venue.rating ? parseFloat(venue.rating) : undefined,
      website: details?.website,
      phone: details?.phone
    }
  } catch (error) {
    console.error('TripAdvisor search error:', error)
    return null
  }
}

function mergeVenueData(currentData: VenueData, results: PromiseSettledResult<VenueData | null>[]): VenueData {
  const merged = { ...currentData }
  
  // Priority order: Google Places > Foursquare > TomTom > TripAdvisor
  const sources = results
    .filter((r): r is PromiseFulfilledResult<VenueData> => 
      r.status === 'fulfilled' && r.value !== null
    )
    .map(r => r.value)
    .reverse() // Reverse so higher priority sources overwrite lower priority ones

  for (const source of sources) {
    // Only fill empty fields, don't overwrite existing data
    Object.entries(source).forEach(([key, value]) => {
      if (value && (!merged[key as keyof VenueData] || merged[key as keyof VenueData] === '')) {
        (merged as any)[key] = value
      }
    })
  }

  // Special handling for images
  const allImages: string[] = []
  sources.forEach(source => {
    if (source.images) {
      allImages.push(...source.images)
    }
  })
  
  if (allImages.length > 0 && (!merged.images || merged.images.length === 0)) {
    merged.images = [...new Set(allImages)] // Remove duplicates
  }

  console.log('Merged venue data:', Object.keys(merged).filter(k => merged[k as keyof VenueData]))
  
  return merged
}