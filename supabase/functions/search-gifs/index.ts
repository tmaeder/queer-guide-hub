import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query, limit = 12, rating = 'pg' } = await req.json()
    
    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

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

    const giphyUrl = `https://api.giphy.com/v1/gifs/search?api_key=${giphyApiKey}&q=${encodeURIComponent(query)}&limit=${limit}&rating=${rating}`
    
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
        error: 'Failed to search GIFs',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})