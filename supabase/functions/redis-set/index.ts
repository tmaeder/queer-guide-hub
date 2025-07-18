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
    const { key, value, ttl } = await req.json()

    if (!key || value === undefined) {
      return new Response(
        JSON.stringify({ error: 'Key and value are required' }),
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

    // Prepare the Redis command
    let command = ['SET', key, JSON.stringify(value)]
    
    // Add TTL if provided (in seconds)
    if (ttl && ttl > 0) {
      command.push('EX', ttl.toString())
    }

    // Make request to Upstash Redis REST API
    const response = await fetch(`${redisUrl}/pipeline`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${redisToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([command])
    })

    if (!response.ok) {
      throw new Error(`Redis error: ${response.statusText}`)
    }

    const data = await response.json()

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: data[0].result,
        key,
        ttl: ttl || null
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Redis SET error:', error)
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