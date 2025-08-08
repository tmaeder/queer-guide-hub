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
    const { pattern = '*' } = await req.json()

    // Get Redis connection details from Supabase secrets
    const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL')
    const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN')

    if (!redisUrl || !redisToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Redis configuration not found' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Make request to Upstash Redis REST API
    const response = await fetch(`${redisUrl}/keys/${encodeURIComponent(pattern)}`, {
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
        keys: data.result || [],
        pattern 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Redis KEYS error:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Internal server error',
        message: (error as any)?.message || 'Unknown error',
        code: 'UPSTASH_ERROR'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})