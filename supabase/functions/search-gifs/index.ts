import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders } from '../_shared/supabase-client.ts'

const VALID_RATINGS = ['g', 'pg', 'pg-13', 'r'];

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query, limit, rating } = await req.json()

    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const safeLimit = Math.min(Math.max(1, limit || 25), 50);
    const safeRating = VALID_RATINGS.includes(rating) ? rating : 'pg';

    const giphyApiKey = Deno.env.get('GIPHY_API_KEY')
    if (!giphyApiKey) {
      return new Response(
        JSON.stringify({ error: 'Giphy API key not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const giphyUrl = `https://api.giphy.com/v1/gifs/search?api_key=${giphyApiKey}&q=${encodeURIComponent(query)}&limit=${safeLimit}&rating=${safeRating}`

    const response = await fetch(giphyUrl)

    if (!response.ok) {
      throw new Error(`Giphy API error: ${response.status}`)
    }

    const data = await response.json()

    return new Response(
      JSON.stringify({
        data: data.data || [],
        pagination: data.pagination || {}
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error searching GIFs:', error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
