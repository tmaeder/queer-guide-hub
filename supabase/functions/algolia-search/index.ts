import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SearchRequest {
  query: string;
  filters?: {
    types?: string[];
    location?: string;
    categories?: string[];
    priceRange?: [number, number];
    dateRange?: [Date, Date];
    rating?: number;
    featured?: boolean;
    verified?: boolean;
  };
  hitsPerPage?: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { query, filters = {}, hitsPerPage = 20 }: SearchRequest = await req.json()

    // Get Algolia credentials from environment
    const algoliaAppId = Deno.env.get('ALGOLIA_APP_ID')
    const algoliaApiKey = Deno.env.get('ALGOLIA_SEARCH_API_KEY')

    if (!algoliaAppId || !algoliaApiKey) {
      console.error('Missing Algolia credentials')
      return new Response(
        JSON.stringify({ error: 'Algolia credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use fetch-based approach for Deno compatibility
    const algoliaBaseUrl = `https://${algoliaAppId}-dsn.algolia.net/1/indexes`
    
    // Helper function to search an index
    const searchIndex = async (indexName: string, searchParams: any) => {
      const response = await fetch(`${algoliaBaseUrl}/${indexName}/query`, {
        method: 'POST',
        headers: {
          'X-Algolia-Application-Id': algoliaAppId,
          'X-Algolia-API-Key': algoliaApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchParams)
      })
      
      if (!response.ok) {
        throw new Error(`Algolia search failed: ${response.statusText}`)
      }
      
      return response.json()
    }

    // Define index names for different content types
    const indices = {
      venues: 'venues',
      events: 'events', 
      users: 'users',
      news: 'news',
      marketplace: 'marketplace',
      locations: 'locations',
      content: 'content',
      personalities: 'personalities'
    }

    const searchPromises = []
    const enabledTypes = filters.types?.length ? filters.types : Object.keys(indices)

    // Build Algolia filter string
    let algoliaFilters = ''
    if (filters.location) {
      algoliaFilters += `location:"${filters.location}"`
    }
    if (filters.categories?.length) {
      const categoryFilter = filters.categories.map(cat => `category:"${cat}"`).join(' OR ')
      algoliaFilters += algoliaFilters ? ` AND (${categoryFilter})` : categoryFilter
    }
    if (filters.rating) {
      algoliaFilters += algoliaFilters ? ` AND rating >= ${filters.rating}` : `rating >= ${filters.rating}`
    }
    if (filters.featured) {
      algoliaFilters += algoliaFilters ? ` AND featured:true` : `featured:true`
    }
    if (filters.verified) {
      algoliaFilters += algoliaFilters ? ` AND verified:true` : `verified:true`
    }

    // Search across enabled indices
    for (const type of enabledTypes) {
      if (indices[type as keyof typeof indices]) {
        const indexName = indices[type as keyof typeof indices]
        searchPromises.push(
          searchIndex(indexName, {
            query,
            hitsPerPage: Math.floor(hitsPerPage / enabledTypes.length) || 5,
            filters: algoliaFilters,
            attributesToHighlight: ['title', 'description', 'name'],
            highlightPreTag: '<mark>',
            highlightPostTag: '</mark>',
          }).then(result => ({
            type,
            hits: result.hits.map((hit: any) => ({
              ...hit,
              type,
              objectID: hit.objectID,
              title: hit.title || hit.name || hit.headline,
              description: hit.description || hit.content || hit.bio,
              category: hit.category,
              location: hit.location || hit.city || hit.address,
              price: hit.price,
              date: hit.date || hit.start_date || hit.event_date,
              rating: hit.rating,
              imageUrl: hit.image_url || hit.avatar_url || hit.photo_url,
              metadata: {
                isCountry: hit.is_country,
                slug: hit.slug,
                verified: hit.verified,
                featured: hit.featured
              }
            }))
          }))
        )
      }
    }

    // Execute all searches in parallel
    const searchResults = await Promise.all(searchPromises)
    
    // Combine and sort results by relevance
    const allHits = searchResults.flatMap(result => result.hits)
    allHits.sort((a, b) => {
      // Prioritize exact matches in title
      const aExact = a.title?.toLowerCase().includes(query.toLowerCase()) ? 1 : 0
      const bExact = b.title?.toLowerCase().includes(query.toLowerCase()) ? 1 : 0
      if (aExact !== bExact) return bExact - aExact
      
      // Then sort by rating if available
      if (a.rating && b.rating) return b.rating - a.rating
      
      // Finally by relevance score if available
      return 0
    })

    // Generate suggestions (top 5 results)
    const suggestions = allHits.slice(0, 5)

    return new Response(
      JSON.stringify({
        hits: allHits,
        suggestions,
        nbHits: allHits.length,
        processingTimeMS: 50 // Approximate
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )

  } catch (error) {
    console.error('Algolia search error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Search failed',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )
  }
})