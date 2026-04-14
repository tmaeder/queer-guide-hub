interface Env {
  MEILISEARCH_URL: string
  MEILISEARCH_SEARCH_KEY: string
  ALLOWED_ORIGINS: string
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

// Map frontend type names to Meilisearch index names
const INDEX_MAP: Record<string, string> = {
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
  queer_villages: 'queer_villages',
}

const ALL_INDEXES = ['venues', 'events', 'cities', 'countries', 'news', 'marketplace', 'personalities', 'tags', 'queer_villages']

const INDEX_FACETS: Record<string, string[]> = {
  venues: ['type', 'city', 'country', 'category', 'featured'],
  events: ['type', 'city', 'country', 'event_type', 'featured'],
  cities: ['type', 'country'],
  countries: ['type', 'continent'],
  news: ['type', 'category', 'is_featured'],
  marketplace: ['type', 'category', 'featured'],
  personalities: ['type', 'profession', 'nationality'],
  tags: ['type', 'category'],
  queer_villages: ['type', 'city', 'country', 'featured'],
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = getCorsHeaders(request, env)

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, corsHeaders)
    }

    const startTime = Date.now()

    try {
      const body: SearchRequest = await request.json()
      const { query, filters = {}, hitsPerPage = 20 } = body

      if (!query?.trim()) {
        return json({ hits: [], suggestions: [], nbHits: 0, processingTimeMS: 0, facetDistribution: {} }, 200, corsHeaders)
      }

      // Determine which indexes to search
      const requestedIndexes = filters.types?.length
        ? [...new Set(filters.types.map(t => INDEX_MAP[t] || t).filter(t => ALL_INDEXES.includes(t)))]
        : ALL_INDEXES

      // Build Meilisearch filter string
      const filterParts = buildFilters(filters)

      // Use multi-search (federated) to search all indexes at once
      const useHybrid = query.trim().split(/\s+/).length >= 3
      const buildQueries = (hybrid: boolean) => requestedIndexes.map(indexUid => ({
        indexUid,
        q: query.trim(),
        limit: Math.max(3, Math.ceil(hitsPerPage / requestedIndexes.length)),
        filter: filterParts,
        facets: INDEX_FACETS[indexUid] || ['type'],
        attributesToHighlight: ['title', 'description'],
        showRankingScore: true,
        ...(hybrid ? { hybrid: { semanticRatio: 0.5, embedder: 'default' } } : {}),
      }))

      let meiliResponse = await fetch(`${env.MEILISEARCH_URL}/multi-search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.MEILISEARCH_SEARCH_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ queries: buildQueries(useHybrid) }),
      })

      // If hybrid search fails (embeddings not ready), retry without it
      if (!meiliResponse.ok && useHybrid) {
        meiliResponse = await fetch(`${env.MEILISEARCH_URL}/multi-search`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.MEILISEARCH_SEARCH_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ queries: buildQueries(false) }),
        })
      }

      if (!meiliResponse.ok) {
        const errText = await meiliResponse.text()
        console.error('Meilisearch error:', errText)
        throw new Error(`Meilisearch: ${meiliResponse.status}`)
      }

      const meiliData: { results: MeiliResult[] } = await meiliResponse.json()

      // Merge results from all indexes
      const allHits: any[] = []
      const mergedFacets: Record<string, Record<string, number>> = {}

      for (const result of meiliData.results) {
        for (const hit of result.hits) {
          allHits.push(mapHit(hit, result.indexUid))
        }

        // Merge facet distributions
        if (result.facetDistribution) {
          for (const [key, values] of Object.entries(result.facetDistribution)) {
            if (!mergedFacets[key]) mergedFacets[key] = {}
            for (const [val, count] of Object.entries(values)) {
              mergedFacets[key][val] = (mergedFacets[key][val] || 0) + count
            }
          }
        }
      }

      // Sort by ranking score (Meilisearch provides this)
      allHits.sort((a, b) => (b._rankingScore || 0) - (a._rankingScore || 0))

      const trimmedHits = allHits.slice(0, hitsPerPage)
      const processingTimeMS = Date.now() - startTime

      return json({
        hits: trimmedHits,
        suggestions: trimmedHits.slice(0, 5),
        nbHits: trimmedHits.length,
        totalHits: meiliData.results.reduce((sum, r) => sum + (r.estimatedTotalHits || 0), 0),
        processingTimeMS,
        query,
        engine: 'meilisearch',
        facetDistribution: mergedFacets,
      }, 200, corsHeaders)

    } catch (error: any) {
      console.error('Search proxy error:', error)
      return json({ error: 'Search failed', details: error.message }, 500, corsHeaders)
    }
  },
}

// --- Helpers ---

interface MeiliResult {
  indexUid: string
  hits: any[]
  estimatedTotalHits?: number
  facetDistribution?: Record<string, Record<string, number>>
}

function buildFilters(filters: SearchRequest['filters']): string | undefined {
  if (!filters) return undefined

  const parts: string[] = []

  if (filters.featured) {
    parts.push('featured = true OR is_featured = true')
  }

  if (filters.location) {
    parts.push(`(city = "${esc(filters.location)}" OR country = "${esc(filters.location)}")`)
  }

  if (filters.categories?.length) {
    const cats = filters.categories.map(c => `category = "${esc(c)}"`).join(' OR ')
    parts.push(`(${cats})`)
  }

  if (filters.lat != null && filters.lng != null && filters.radius) {
    parts.push(`_geoRadius(${filters.lat}, ${filters.lng}, ${filters.radius * 1000})`)
  }

  return parts.length ? parts.join(' AND ') : undefined
}

function esc(s: string): string {
  return s.replace(/"/g, '\\"')
}

function mapHit(hit: any, indexUid: string): any {
  return {
    objectID: hit.id,
    id: hit.id,
    type: hit.type || indexUid,
    title: hit.title,
    name: hit.title,
    description: hit.description,
    content: hit.description,
    bio: indexUid === 'personalities' ? hit.description : undefined,
    category: hit.category || hit.event_type || hit.profession,
    location: hit.city || hit.country || hit.address,
    city: hit.city,
    country: hit.country,
    latitude: hit._geo?.lat,
    longitude: hit._geo?.lng,
    _geoloc: hit._geo ? { lat: hit._geo.lat, lng: hit._geo.lng } : undefined,
    image_url: hit.image_url || hit.logo_url,
    imageUrl: hit.image_url || hit.logo_url,
    avatar_url: indexUid === 'personalities' ? hit.image_url : undefined,
    photo_url: hit.image_url,
    tags: hit.tags || [],
    featured: hit.featured || hit.is_featured || false,
    slug: hit.slug,
    start_date: hit.start_date,
    end_date: hit.end_date,
    price: hit.price,
    metadata: {
      isCountry: indexUid === 'countries',
      slug: hit.slug,
      featured: hit.featured || hit.is_featured || false,
    },
    _highlightResult: hit._formatted ? {
      title: { value: hit._formatted.title || hit.title, matchLevel: 'full' },
      description: { value: hit._formatted.description || hit.description, matchLevel: 'partial' },
      name: { value: hit._formatted.title || hit.title, matchLevel: 'full' },
    } : undefined,
    _rankingScore: hit._rankingScore || 0,
  }
}

function getCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') || ''
  const allowed = new Set(env.ALLOWED_ORIGINS.split(','))
  return {
    'Access-Control-Allow-Origin': allowed.has(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function json(data: any, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}
