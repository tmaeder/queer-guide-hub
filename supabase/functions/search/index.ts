import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { getCorsHeaders } from '../_shared/supabase-client.ts'

// Map frontend type names to DB function content_types
const TYPE_MAP: Record<string, string> = {
  venues: 'venues',
  events: 'events',
  users: 'personalities',  // legacy: "users" mapped to personalities
  news: 'news',
  marketplace: 'marketplace',
  locations: 'cities',      // legacy: "locations" mapped to cities
  cities: 'cities',
  countries: 'countries',
  content: 'tags',          // legacy: "content" mapped to tags
  tags: 'tags',
  personalities: 'personalities',
}

interface SearchRequest {
  query: string
  filters?: {
    types?: string[]
    location?: string
    categories?: string[]
    priceRange?: [number, number]
    dateRange?: [string, string]
    rating?: number
    featured?: boolean
    verified?: boolean
    lat?: number
    lng?: number
    radius?: number
  }
  hitsPerPage?: number
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const startTime = Date.now()

  try {
    const { query, filters = {}, hitsPerPage = 20 }: SearchRequest = await req.json()

    if (!query || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ hits: [], suggestions: [], nbHits: 0, processingTimeMS: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Map requested types to DB content_types
    const requestedTypes = filters.types?.length
      ? [...new Set(filters.types.map(t => TYPE_MAP[t]).filter(Boolean))]
      : ['venues', 'events', 'cities', 'countries', 'news', 'marketplace', 'personalities', 'tags']

    // Calculate per-type limit to stay within total hitsPerPage
    const perTypeLimit = Math.max(3, Math.ceil(hitsPerPage / requestedTypes.length))

    // Call the universal_search DB function
    const { data, error } = await supabase.rpc('universal_search', {
      search_query: query.trim(),
      content_types: requestedTypes,
      result_limit: perTypeLimit,
      location_filter: filters.location || null,
      featured_only: filters.featured || false,
      geo_lat: filters.lat || null,
      geo_lng: filters.lng || null,
      radius_km: filters.radius || null,
      category_filter: filters.categories?.[0] || null,
    })

    if (error) {
      console.error('Search error:', error)
      throw new Error(`Search failed: ${error.message}`)
    }

    // Transform results to the search response format
    const hits = (data || []).map((row: any) => ({
      objectID: row.id,
      id: row.id,
      type: row.type === 'personality' ? 'personality' : row.type,
      title: row.title || row.highlighted_title,
      name: row.title,
      description: row.description,
      content: row.description,
      bio: row.type === 'personality' ? row.description : undefined,
      category: row.category,
      location: row.location,
      city: row.location,
      address: row.metadata?.address,
      latitude: row.latitude,
      longitude: row.longitude,
      _geoloc: row.latitude && row.longitude ? { lat: row.latitude, lng: row.longitude } : undefined,
      rating: row.rating,
      image_url: row.image_url,
      imageUrl: row.image_url,
      avatar_url: row.type === 'personality' ? row.image_url : undefined,
      photo_url: row.image_url,
      tags: row.tags || [],
      featured: row.featured,
      verified: row.verified,
      price: row.metadata?.price,
      date: row.metadata?.start_date || row.metadata?.published_at,
      start_date: row.metadata?.start_date,
      event_date: row.metadata?.start_date,
      metadata: {
        isCountry: row.type === 'country',
        slug: row.metadata?.slug,
        verified: row.verified,
        featured: row.featured,
        ...row.metadata,
      },
      _highlightResult: {
        title: { value: row.highlighted_title || row.title, matchLevel: row.rank > 0 ? 'full' : 'none' },
        description: { value: row.highlighted_description || row.description, matchLevel: row.rank > 0 ? 'partial' : 'none' },
        name: { value: row.highlighted_title || row.title, matchLevel: row.rank > 0 ? 'full' : 'none' },
      },
      _rankScore: row.rank,
      _similarityScore: row.similarity_score,
    }))

    // Sort combined results by relevance
    hits.sort((a: any, b: any) => {
      // Exact title matches first
      const aExact = a.title?.toLowerCase() === query.toLowerCase() ? 1 : 0
      const bExact = b.title?.toLowerCase() === query.toLowerCase() ? 1 : 0
      if (aExact !== bExact) return bExact - aExact

      // Title contains query
      const aContains = a.title?.toLowerCase().includes(query.toLowerCase()) ? 1 : 0
      const bContains = b.title?.toLowerCase().includes(query.toLowerCase()) ? 1 : 0
      if (aContains !== bContains) return bContains - aContains

      // Then by FTS rank
      const rankDiff = (b._rankScore || 0) - (a._rankScore || 0)
      if (Math.abs(rankDiff) > 0.01) return rankDiff

      // Then by similarity
      return (b._similarityScore || 0) - (a._similarityScore || 0)
    })

    // Trim to requested limit
    const trimmedHits = hits.slice(0, hitsPerPage)

    // Generate suggestions (top 5 unique titles)
    const suggestions = trimmedHits.slice(0, 5)

    const processingTimeMS = Date.now() - startTime

    return new Response(
      JSON.stringify({
        hits: trimmedHits,
        suggestions,
        nbHits: trimmedHits.length,
        processingTimeMS,
        query,
        engine: 'postgresql-fts',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Search error:', error)
    return new Response(
      JSON.stringify({ error: 'Search failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
