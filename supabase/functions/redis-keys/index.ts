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

    let { pattern = '*' } = await req.json()

    if (pattern === '*') pattern = 'app:*';

    const { url, token } = getRedisCredentials();

    // Make request to Upstash Redis REST API
    const response = await fetch(`${url}/keys/${encodeURIComponent(pattern)}`, {
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
      JSON.stringify({
        success: true,
        keys: data.result || [],
        pattern
      }),
      { headers: { ...buildCors(origin), 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Redis KEYS error:', error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error'
      }),
      { status: 500, headers: { ...buildCors(origin), 'Content-Type': 'application/json' } }
    )
  }
})
