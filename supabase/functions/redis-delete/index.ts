import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { key } = await req.json()

    if (!key) {
      return new Response(
        JSON.stringify({ error: 'Key is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get Redis connection details from Supabase secrets
    const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL')
    const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN')

    if (!redisUrl || !redisToken) {
      return new Response(
        JSON.stringify({ error: 'Redis configuration not found' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Make request to Upstash Redis REST API
    const response = await fetch(`${redisUrl}/del/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${redisToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Redis error: ${response.statusText}`)
    }

    const data = await response.json()

    return new Response(
      JSON.stringify({ 
        success: true, 
        deleted: data.result === 1,
        key 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Redis DELETE error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})