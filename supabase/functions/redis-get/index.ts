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
      maxAttempts: 240,
      timeWindowMinutes: 1,
    });
    if (rejection) return rejection;

    const { key } = await req.json()

    if (!key) {
      return new Response(
        JSON.stringify({ error: 'Key is required' }),
        { status: 400, headers: { ...buildCors(origin), 'Content-Type': 'application/json' } }
      )
    }

    const { url, token } = getRedisCredentials();

    // Make request to Upstash Redis REST API
    const response = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Redis error: ${response.statusText}`)
    }

    const data = await response.json()

    return new Response(
      JSON.stringify({ success: true, data: data.result, key }),
      { headers: { ...buildCors(origin), 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Redis GET error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...buildCors(origin), 'Content-Type': 'application/json' } }
    )
  }
})
