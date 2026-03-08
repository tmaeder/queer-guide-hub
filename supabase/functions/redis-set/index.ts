import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getOrigin, getClientIp, buildCors, getRedisCredentials, validateRedisRequest } from '../_shared/redis-client.ts'

serve(async (req) => {
  const origin = getOrigin(req);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCors(origin) })
  }

  try {
    // Validate origin + rate limit
    const rejection = await validateRedisRequest(req, origin, {
      identifier: getClientIp(req),
      maxAttempts: 120,
      timeWindowMinutes: 1,
    });
    if (rejection) return rejection;

    const { key, value, ttl } = await req.json()

    if (!key || value === undefined) {
      return new Response(
        JSON.stringify({ error: 'Key and value are required' }),
        { status: 400, headers: { ...buildCors(origin), 'Content-Type': 'application/json' } }
      )
    }

    if (!key.startsWith('app:') && !key.startsWith('cache:')) {
      return new Response(
        JSON.stringify({ error: 'Invalid key prefix' }),
        { status: 400, headers: { ...buildCors(origin), 'Content-Type': 'application/json' } }
      )
    }

    const { url, token } = getRedisCredentials();

    // Prepare the Redis command
    const command = ['SET', key, JSON.stringify(value)] as string[]


    // Add TTL if provided (in seconds)
    if (ttl && ttl > 0) {
      command.push('EX', String(ttl))
    }

    // Make request to Upstash Redis REST API
    const response = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([command])
    })

    if (!response.ok) {
      throw new Error(`Redis error: ${response.statusText}`)
    }

    const data = await response.json()

    return new Response(
      JSON.stringify({ success: true, data: data[0].result, key, ttl: ttl || null }),
      { headers: { ...buildCors(origin), 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Redis SET error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...buildCors(origin), 'Content-Type': 'application/json' } }
    )
  }
})
