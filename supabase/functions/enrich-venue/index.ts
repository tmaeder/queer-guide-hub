import { getCorsHeaders, getServiceClient, requireAdmin } from '../_shared/supabase-client.ts'
import { providerFetch, providerResults, ProviderUnavailable } from './provider-outcomes.ts'
import { searchFoursquare } from './foursquare.ts'
import { collectContactEvidence, contactCaptureCoordinates, type ContactVenue } from './contact-evidence.ts'
import { reserveFoursquareApiCalls, type FoursquareBudgetVerdict } from '../_shared/foursquare-budget.ts'

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

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const serviceClient = getServiceClient()
    const authResult = await requireAdmin(req, serviceClient)
    if (authResult instanceof Response) return authResult

    const body = await req.json()
    // Read-only, bounded source capture for known native identities. This mode
    // never stages new places, proposes claims, or writes venue/source data.
    if (body.mode === 'contact_evidence') {
      const ids = body.venue_ids
      if (!Array.isArray(ids) || !ids.length || ids.length > 5 || new Set(ids).size !== ids.length
        || ids.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
        return new Response(JSON.stringify({ error: 'Provide one to five unique venue UUIDs' }), { status: 400, headers: corsHeaders })
      }
      const apiKey = Deno.env.get('FOURSQUARE_API_KEY')
      if (!apiKey) throw new ProviderUnavailable()
      const { data: venues, error } = await serviceClient.from('venues')
        .select('id,name,latitude,longitude,address,country_id,city_id,organization_id,updated_at,category')
        .in('id', ids).is('duplicate_of_id', null).is('closed_at', null)
      if (error) throw new Error('Could not read native venue identities')
      const { data: countries, error: countryError } = await serviceClient.from('countries')
        .select('id,code').in('id', [...new Set((venues ?? []).map(v => v.country_id).filter(Boolean))])
      if (countryError) throw new Error('Could not read native country identities')
      const { data: cities, error: cityError } = await serviceClient.from('cities')
        .select('id,name').in('id', [...new Set((venues ?? []).map(v => v.city_id).filter(Boolean))])
      if (cityError) throw new Error('Could not read native city identities')
      const eligible = (venues ?? []).flatMap(venue => {
        const country = countries?.find(c => c.id === venue.country_id)
        const coordinates = contactCaptureCoordinates(venue)
        return country && coordinates ? [{ ...venue, ...coordinates, country_code: country.code,
          city_name: cities?.find(c => c.id === venue.city_id)?.name }] : []
      })
      if (!eligible.length) return new Response(JSON.stringify({ success: true, read_only: true, captures: [], eligible: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
      const budget = await reserveFoursquareApiCalls(serviceClient, 'contact-evidence', eligible.length)
      if (!budget.allowed) return new Response(JSON.stringify({ success: false, read_only: true, capped: true, captures: [], budget }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
      const captures = []
      for (const venue of eligible) {
        captures.push(await collectContactEvidence(venue as ContactVenue, apiKey))
      }
      return new Response(JSON.stringify({ success: true, read_only: true, captures }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { venueName, currentData = {} } = body
    
    if (typeof venueName !== 'string' || venueName.trim().length < 2 || venueName.length > 200) {
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

    const providers: { source: string; run: () => Promise<VenueData | null> }[] = []
    let foursquareBudget: FoursquareBudgetVerdict | undefined

    // Foursquare search
    if (foursquareKey) {
      providers.push({ source: 'foursquare', run: async () => {
        foursquareBudget = await reserveFoursquareApiCalls(serviceClient, 'enrichment-preview', 1)
        if (!foursquareBudget.allowed) throw new ProviderUnavailable()
        return searchFoursquare(venueName, foursquareKey)
      } })
    }

    // Google Places search
    if (googleKey) {
      providers.push({ source: 'google', run: () => searchGooglePlaces(venueName, googleKey) })
    }

    // TomTom search
    if (tomtomKey) {
      providers.push({ source: 'tomtom', run: () => searchTomTom(venueName, tomtomKey) })
    }

    // TripAdvisor search
    if (tripadvisorKey) {
      providers.push({ source: 'tripadvisor', run: () => searchTripAdvisor(venueName, tripadvisorKey) })
    }

    // Execute all searches in parallel
    const results = await Promise.allSettled(providers.map(provider => provider.run()))
    console.log(`Completed ${results.length} API searches`)

    // Return individual results for preview
    const individualResults = providerResults(providers.map(p => p.source), results)
    const unavailable = individualResults.filter(r => r.outcome === 'unavailable').length
    const available = results.length - unavailable
    const success = available > 0

    // Also provide merged data for convenience
    const enrichedData = mergeVenueData(currentData, results)

    return new Response(
      JSON.stringify({ 
        success,
        individualResults,
        mergedData: enrichedData,
        totalSources: results.length,
        sources_available: available,
        sources_unavailable: unavailable,
        degraded: unavailable > 0,
        foursquare_budget: foursquareBudget,
        ...(success ? {} : { error: results.length ? 'All configured enrichment providers are unavailable' : 'No enrichment providers configured' })
      }),
      { 
        status: success ? 200 : 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in enrich-venue function:', error)
    
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

async function searchGooglePlaces(venueName: string, apiKey: string): Promise<VenueData | null> {
  try {
    console.log('Searching Google Places for:', venueName)
    
    // First, search for the place
    const searchUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(venueName)}&inputtype=textquery&fields=place_id,name,formatted_address,geometry,rating,price_level&key=${apiKey}`
    
    const searchResponse = await providerFetch(searchUrl)
    


    const searchData = await searchResponse.json()
    if (searchData.status && !['OK', 'ZERO_RESULTS'].includes(searchData.status)) throw new ProviderUnavailable()
    
    if (!searchData.candidates || searchData.candidates.length === 0) {
      console.log('No Google Places results found')
      return null
    }

    const place = searchData.candidates[0]
    
    // Get detailed information
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,address_components,geometry,international_phone_number,website,rating,price_level,opening_hours,photos&key=${apiKey}`
    
    const detailsResponse = await providerFetch(detailsUrl)
    const detailsData = await detailsResponse.json()
    if (detailsData.status && !['OK', 'ZERO_RESULTS'].includes(detailsData.status)) throw new ProviderUnavailable()
    
    if (!detailsData.result) {
      return null
    }

    const details = detailsData.result
    console.log('Found Google Places venue:', details.name)

    // Parse address components
    const addressComponents = details.address_components || []
    const getComponent = (types: string[]) => {
      const component = addressComponents.find((comp: { types: string[]; long_name: string }) =>
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
    throw error instanceof ProviderUnavailable ? error : new ProviderUnavailable()
  }
}

async function searchTomTom(venueName: string, apiKey: string): Promise<VenueData | null> {
  try {
    console.log('Searching TomTom for:', venueName)
    
    const searchUrl = `https://api.tomtom.com/search/2/search/${encodeURIComponent(venueName)}.json?key=${apiKey}&typeahead=false&limit=1`
    
    const response = await providerFetch(searchUrl)
    


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
    throw error instanceof ProviderUnavailable ? error : new ProviderUnavailable()
  }
}

async function searchTripAdvisor(venueName: string, apiKey: string): Promise<VenueData | null> {
  try {
    console.log('Searching TripAdvisor for:', venueName)
    
    const searchUrl = `https://api.content.tripadvisor.com/api/v1/location/search?key=${apiKey}&searchQuery=${encodeURIComponent(venueName)}&language=en`
    
    const response = await providerFetch(searchUrl)
    


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
      const detailsResponse = await providerFetch(detailsUrl)
      if (detailsResponse.ok) {
        details = await detailsResponse.json()
      }
    } catch (error) {
      throw error instanceof ProviderUnavailable ? error : new ProviderUnavailable()
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
    throw error instanceof ProviderUnavailable ? error : new ProviderUnavailable()
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
        Object.assign(merged, { [key]: value })
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
