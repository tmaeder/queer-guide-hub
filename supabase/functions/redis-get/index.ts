import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = new Set<string>([
  'https://queer.guide',
  'https://www.queer.guide',
  'http://localhost:5173',
  'http://localhost:3000',
]);

const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function getOrigin(req: Request) {
  const o = req.headers.get('Origin') || '';
  if (o) return o;
  const ref = req.headers.get('Referer') || '';
  try {
    return ref ? new URL(ref).origin : '';
  } catch {
    return '';
  }
}

function getClientIp(req: Request) {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const rip = req.headers.get('x-real-ip');
  if (rip) return rip.trim();
  return 'unknown';
}

function buildCors(origin: string) {
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : '';
  return {
    ...baseCorsHeaders,
    ...(allowOrigin ? { 'Access-Control-Allow-Origin': allowOrigin, Vary: 'Origin' } : {}),
  } as Record<string, string>;
}

serve(async (req) => {
  const origin = getOrigin(req);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCors(origin) })
  }

  if (!ALLOWED_ORIGINS.has(origin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { ...buildCors(origin), 'Content-Type': 'application/json' },
    });
  }

  // Supabase client for rate limiting
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  try {
    const { key } = await req.json()

    if (!key) {
      return new Response(
        JSON.stringify({ error: 'Key is required' }),
        { status: 400, headers: { ...buildCors(origin), 'Content-Type': 'application/json' } }
      )
    }

    // Rate limit by IP
    const ip = getClientIp(req);
    if (supabase) {
      const { data: allowed, error: rlError } = await supabase.rpc('check_rate_limit_key', {
        identifier: ip,
        max_attempts: 240,
        time_window_minutes: 1,
      });
      if (rlError) console.error('Rate limit RPC error:', rlError);
      if (allowed === false) {
        return new Response(JSON.stringify({ error: 'Too many requests' }), {
          status: 429,
          headers: { ...buildCors(origin), 'Content-Type': 'application/json' },
        });
      }
    }

    // Get Redis connection details from Supabase secrets
    const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL')
    const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN')

    if (!redisUrl || !redisToken) {
      return new Response(
        JSON.stringify({ error: 'Redis configuration not found' }),
        { status: 500, headers: { ...buildCors(origin), 'Content-Type': 'application/json' } }
      )
    }

    // Make request to Upstash Redis REST API
    const response = await fetch(`${redisUrl}/get/${encodeURIComponent(key)}`, {
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