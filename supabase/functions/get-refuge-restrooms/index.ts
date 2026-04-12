import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders } from '../_shared/supabase-client.ts'

const REFUGE_API = 'https://www.refugerestrooms.org/api/v1/restrooms'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Accept params from GET query string or POST body
    let lat: string | null = null
    let lng: string | null = null
    let page = '1'
    let perPage = '100'

    if (req.method === 'GET') {
      const url = new URL(req.url)
      lat = url.searchParams.get('lat')
      lng = url.searchParams.get('lng')
      page = url.searchParams.get('page') || '1'
      perPage = url.searchParams.get('per_page') || '100'
    } else {
      try {
        const body = await req.json()
        lat = body.lat?.toString() ?? null
        lng = body.lng?.toString() ?? null
        page = body.page?.toString() ?? '1'
        perPage = body.per_page?.toString() ?? '100'
      } catch { /* empty body, use defaults */ }
    }

    // Use /by_location endpoint when coordinates are provided
    const hasLocation = lat && lng
    const basePath = hasLocation ? `${REFUGE_API}/by_location` : REFUGE_API

    const params = new URLSearchParams({ page, per_page: perPage })
    if (hasLocation) {
      params.append('lat', lat!)
      params.append('lng', lng!)
    }

    const apiUrl = `${basePath}?${params.toString()}`
    console.log('Calling Refuge API:', apiUrl)

    const response = await fetch(apiUrl, {
      headers: { 'User-Agent': 'Queer Guide App' },
    })

    if (!response.ok) {
      throw new Error(`Refuge API error: ${response.status}`)
    }

    const data = await response.json()

    const restrooms = data.map((r: Record<string, unknown>) => ({
      id: r.id,
      name: r.name,
      street: r.street,
      city: r.city,
      state: r.state,
      country: r.country,
      latitude: r.latitude,
      longitude: r.longitude,
      accessible: r.accessible,
      unisex: r.unisex,
      changing_table: r.changing_table,
      comment: r.comment,
      directions: r.directions,
      created_at: r.created_at,
      updated_at: r.updated_at,
      upvote: r.upvote,
      downvote: r.downvote,
    }))

    return new Response(JSON.stringify(restrooms), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error fetching restrooms:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
