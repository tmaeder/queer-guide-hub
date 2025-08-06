import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface LocationData {
  city?: string
  country?: string
  latitude?: number
  longitude?: number
}

interface VenueRow {
  id: string
  name: string
  city?: string
  country?: string
  latitude?: number
  longitude?: number
  city_id?: string
  country_id?: string
}

interface EventRow {
  id: string
  title: string
  city?: string
  country?: string
  latitude?: number
  longitude?: number
  venue_id?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { scheduled = false } = req.method === 'POST' ? await req.json() : {}
    const triggerType = scheduled ? 'scheduled' : 'manual'
    
    console.log(`Starting location linking process (${triggerType} trigger)...`)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    let processedVenues = 0
    let processedEvents = 0
    let createdCities = 0
    let createdCountries = 0

    // First, process venues that need linking
    console.log('Processing venues...')
    const { data: venues, error: venuesError } = await supabase
      .from('venues')
      .select('id, name, city, country, latitude, longitude, city_id, country_id')
      .or('city_id.is.null,country_id.is.null')
      .not('city', 'is', null)
      .not('country', 'is', null)

    if (venuesError) {
      console.error('Error fetching venues:', venuesError)
      throw venuesError
    }

    console.log(`Found ${venues?.length || 0} venues to process`)

    // Process each venue
    for (const venue of venues || []) {
      try {
        const result = await linkVenueToLocation(supabase, venue)
        if (result.createdCity) createdCities++
        if (result.createdCountry) createdCountries++
        processedVenues++
      } catch (error) {
        console.error(`Error processing venue ${venue.id}:`, error)
      }
    }

    // Next, process events that need linking
    console.log('Processing events...')
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id, title, city, country, latitude, longitude, venue_id')
      .is('venue_id', null)
      .not('city', 'is', null)
      .not('country', 'is', null)

    if (eventsError) {
      console.error('Error fetching events:', eventsError)
      throw eventsError
    }

    console.log(`Found ${events?.length || 0} events to process`)

    // Process each event
    for (const event of events || []) {
      try {
        await linkEventToLocation(supabase, event)
        processedEvents++
      } catch (error) {
        console.error(`Error processing event ${event.id}:`, error)
      }
    }

    const summary = {
      processedVenues,
      processedEvents,
      createdCities,
      createdCountries,
      triggerType,
      timestamp: new Date().toISOString()
    }

    console.log(`Location linking completed (${triggerType}):`, summary)

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error in link-locations function:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function linkVenueToLocation(supabase: any, venue: VenueRow) {
  let createdCity = false
  let createdCountry = false

  // First, find or create country
  let countryId = venue.country_id
  if (!countryId && venue.country) {
    const { data: existingCountry } = await supabase
      .from('countries')
      .select('id')
      .or(`code.ilike.${venue.country},name.ilike.%${venue.country}%`)
      .single()

    if (existingCountry) {
      countryId = existingCountry.id
    } else {
      // Create basic country record
      console.log(`Creating country: ${venue.country}`)
      const { data: newCountry, error: countryError } = await supabase
        .from('countries')
        .insert({
          name: venue.country,
          code: venue.country.substring(0, 2).toUpperCase(), // Basic code
        })
        .select('id')
        .single()

      if (!countryError && newCountry) {
        countryId = newCountry.id
        createdCountry = true
        console.log(`Created country ${venue.country} with ID: ${countryId}`)
      } else {
        console.error('Error creating country:', countryError)
      }
    }
  }

  // Next, find or create city
  let cityId = venue.city_id
  if (!cityId && venue.city && countryId) {
    const { data: existingCity } = await supabase
      .from('cities')
      .select('id')
      .ilike('name', venue.city)
      .eq('country_id', countryId)
      .single()

    if (existingCity) {
      cityId = existingCity.id
    } else {
      // Create basic city record
      console.log(`Creating city: ${venue.city} in country ID: ${countryId}`)
      const { data: newCity, error: cityError } = await supabase
        .from('cities')
        .insert({
          name: venue.city,
          country_id: countryId,
          latitude: venue.latitude,
          longitude: venue.longitude,
        })
        .select('id')
        .single()

      if (!cityError && newCity) {
        cityId = newCity.id
        createdCity = true
        console.log(`Created city ${venue.city} with ID: ${cityId}`)
      } else {
        console.error('Error creating city:', cityError)
      }
    }
  }

  // Update venue with linked IDs
  if (cityId || countryId) {
    const updateData: any = {}
    if (cityId && !venue.city_id) updateData.city_id = cityId
    if (countryId && !venue.country_id) updateData.country_id = countryId

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from('venues')
        .update(updateData)
        .eq('id', venue.id)

      if (updateError) {
        console.error(`Error updating venue ${venue.id}:`, updateError)
      } else {
        console.log(`Updated venue ${venue.name} with location links`)
      }
    }
  }

  return { createdCity, createdCountry }
}

async function linkEventToLocation(supabase: any, event: EventRow) {
  // Try to find a venue in the same city/country
  if (event.city && event.country) {
    const { data: matchingVenue } = await supabase
      .from('venues')
      .select('id, city_id, country_id')
      .ilike('city', event.city)
      .ilike('country', event.country)
      .not('city_id', 'is', null)
      .limit(1)
      .single()

    if (matchingVenue) {
      // Link event to the venue found in the same location
      const { error: updateError } = await supabase
        .from('events')
        .update({ venue_id: matchingVenue.id })
        .eq('id', event.id)

      if (!updateError) {
        console.log(`Linked event ${event.title} to venue in ${event.city}`)
      } else {
        console.error(`Error linking event ${event.id}:`, updateError)
      }
    } else {
      console.log(`No matching venue found for event ${event.title} in ${event.city}, ${event.country}`)
    }
  }
}