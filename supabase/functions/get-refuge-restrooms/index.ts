import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const lat = url.searchParams.get('lat')
    const lng = url.searchParams.get('lng')
    const page = url.searchParams.get('page') || '1'
    const per_page = url.searchParams.get('per_page') || '100'

    console.log('Fetching restrooms with params:', { lat, lng, page, per_page })

    // Build the API URL
    let apiUrl = 'https://www.refugerestrooms.org/api/v1/restrooms'
    const params = new URLSearchParams({
      page,
      per_page
    })

    // Add location-based search if coordinates provided
    if (lat && lng) {
      params.append('lat', lat)
      params.append('lng', lng)
    }

    apiUrl += `?${params.toString()}`

    console.log('Calling Refuge Restrooms API:', apiUrl)

    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Queer Guide App',
      }
    })

    if (!response.ok) {
      console.error('API response not ok:', response.status, response.statusText)
      throw new Error(`Failed to fetch restrooms: ${response.status}`)
    }

    const data = await response.json()
    console.log(`Fetched ${data.length} restrooms`)

    // Transform the data to match our needs
    const restrooms = data.map((restroom: any) => ({
      id: restroom.id,
      name: restroom.name,
      street: restroom.street,
      city: restroom.city,
      state: restroom.state,
      country: restroom.country,
      latitude: restroom.latitude,
      longitude: restroom.longitude,
      accessible: restroom.accessible,
      unisex: restroom.unisex,
      changing_table: restroom.changing_table,
      comment: restroom.comment,
      directions: restroom.directions,
      created_at: restroom.created_at,
      updated_at: restroom.updated_at,
      upvote: restroom.upvote,
      downvote: restroom.downvote
    }))

    return new Response(
      JSON.stringify(restrooms),
      {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        },
      },
    )
  } catch (error) {
    console.error('Error fetching restrooms:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        },
      },
    )
  }
})