import { getCorsHeaders } from '../_shared/supabase-client.ts'

const REFUGE_API = 'https://www.refugerestrooms.org/api/v1/restrooms'

// The Refuge Restrooms API rejects per_page > 100 with a 400. Clamp to its max.
const MAX_PER_PAGE = 100

Deno.serve(async (req) => {
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

    // Clamp per_page to the upstream max; values > 100 return a 400.
    const perPageNum = Number(perPage)
    const clampedPerPage = String(
      Number.isFinite(perPageNum) ? Math.min(Math.max(perPageNum, 1), MAX_PER_PAGE) : 100,
    )

    const params = new URLSearchParams({ page, per_page: clampedPerPage })
    if (hasLocation) {
      params.append('lat', lat!)
      params.append('lng', lng!)
    }

    const apiUrl = `${basePath}?${params.toString()}`
    console.log('Calling Refuge API:', apiUrl)

    const response = await fetch(apiUrl, {
      headers: { 'User-Agent': 'Queer Guide App' },
    })

    // Refuge is an external, best-effort source. If it errors (4xx/5xx) or
    // returns a non-array body, degrade gracefully to an empty list so the
    // map layer simply shows no restrooms instead of spamming 500s on pan/zoom.
    if (!response.ok) {
      console.warn(`Refuge API error: ${response.status} for ${apiUrl}`)
      return new Response('[]', {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await response.json()

    if (!Array.isArray(data)) {
      console.warn('Refuge API returned non-array body')
      return new Response('[]', {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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
    // Network failure / timeout reaching the external Refuge API. Degrade to an
    // empty list rather than surfacing a 500 to every map pan/zoom.
    console.error('Error fetching restrooms:', error instanceof Error ? error.message : error)
    return new Response('[]', {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})
