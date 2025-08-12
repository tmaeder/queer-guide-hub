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

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCors(origin) });
  }

  // Enforce origin allowlist
  if (!ALLOWED_ORIGINS.has(origin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { ...buildCors(origin), 'Content-Type': 'application/json' },
    });
  }

  // Supabase client for rate limiting/logging
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  try {
    const { query, isReverseGeocode = false } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        { status: 400, headers: { ...buildCors(origin), 'Content-Type': 'application/json' } }
      );
    }

    const mapboxToken = Deno.env.get('MAPBOX_PUBLIC_TOKEN');
    if (!mapboxToken) {
      return new Response(
        JSON.stringify({ error: 'Mapbox token not configured' }),
        { status: 500, headers: { ...buildCors(origin), 'Content-Type': 'application/json' } }
      );
    }

    // Basic IP-based rate limiting via RPC (SECURITY DEFINER)
    const ip = getClientIp(req);
    if (supabase) {
      const { data: allowed, error: rlError } = await supabase.rpc('check_rate_limit_key', {
        identifier: ip,
        max_attempts: 60,
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

    let mapboxUrl: string;
    if (isReverseGeocode) {
      mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}&types=place,locality,neighborhood,address&limit=1`;
    } else {
      mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}&types=place,locality,neighborhood,address&limit=5`;
    }

    const mapboxResponse = await fetch(mapboxUrl);
    if (!mapboxResponse.ok) {
      throw new Error(`Mapbox API error: ${mapboxResponse.status}`);
    }

    const data = await mapboxResponse.json();

    return new Response(JSON.stringify(data), {
      headers: { ...buildCors(origin), 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in mapbox-geocoding function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...buildCors(origin), 'Content-Type': 'application/json' } }
    );
  }
});