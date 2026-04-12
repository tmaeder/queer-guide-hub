import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Map frontend type names to DB function content_types
const TYPE_MAP: Record<string, string> = {
  venues: 'venues',
  events: 'events',
  users: 'personalities',
  news: 'news',
  marketplace: 'marketplace',
  locations: 'cities',
  cities: 'cities',
  countries: 'countries',
  content: 'tags',
  tags: 'tags',
  personalities: 'personalities',
  hotels: 'hotels',
  queer_villages: 'queer_villages',
  festivals: 'festivals',
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
    const allTypes = ['venues', 'events', 'cities', 'countries', 'news', 'marketplace', 'personalities', 'tags', 'hotels', 'queer_villages', 'festivals']
    const requestedTypes = filters.types?.length
      ? [...new Set(filters.types.map(t => TYPE_MAP[t] || t))]
      : allTypes

    // Per-type limit: each subquery returns up to this many results
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

    // Transform results - DB returns: id, content_type, title, subtitle, description,
    // image_url, latitude, longitude, slug, featured, relevance_score, similarity_score
    const hits = (data || []).map((row: any) => ({
      objectID: row.id,
      id: row.id,
      type: row.content_type,
      title: row.title,
      name: row.title,
      description: row.description,
      content: row.description,
      bio: row.content_type === 'personalities' ? row.description : undefined,
      category: row.subtitle,
      location: row.subtitle,
      city: row.subtitle,
      latitude: row.latitude,
      longitude: row.longitude,
      _geoloc: row.latitude && row.longitude ? { lat: row.latitude, lng: row.longitude } : undefined,
      image_url: row.image_url,
      imageUrl: row.image_url,
      avatar_url: row.content_type === 'personalities' ? row.image_url : undefined,
      photo_url: row.image_url,
      tags: [],
      featured: row.featured,
      slug: row.slug,
      metadata: {
        isCountry: row.content_type === 'countries',
        slug: row.slug,
        featured: row.featured,
      },
      _highlightResult: {
        title: { value: row.title, matchLevel: row.relevance_score > 0 ? 'full' : 'none' },
        description: { value: row.description, matchLevel: row.relevance_score > 0 ? 'partial' : 'none' },
        name: { value: row.title, matchLevel: row.relevance_score > 0 ? 'full' : 'none' },
      },
      _rankScore: row.relevance_score,
      _similarityScore: row.similarity_score,
    }))

    const queryLower = query.toLowerCase().trim()

    // Compute a composite relevance score for sorting
    hits.sort((a: any, b: any) => {
      const scoreA = computeRelevance(a, queryLower)
      const scoreB = computeRelevance(b, queryLower)
      return scoreB - scoreA
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
      JSON.stringify({ error: 'Search failed', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

function computeRelevance(hit: any, queryLower: string): number {
  const title = (hit.title || '').toLowerCase()
  let score = 0

  // Exact title match
  if (title === queryLower) {
    score += 100
  }
  // Title starts with query
  else if (title.startsWith(queryLower)) {
    score += 50
  }
  // Title contains query
  else if (title.includes(queryLower)) {
    // Focused match bonus: higher ratio = title is more about the query
    const ratio = queryLower.length / title.length
    score += 10 + ratio * 30
  }

  // FTS rank contribution (typically 0–0.1 range)
  score += (hit._rankScore || 0) * 50

  // Similarity contribution (0–1 range)
  score += (hit._similarityScore || 0) * 5

  return score
}
