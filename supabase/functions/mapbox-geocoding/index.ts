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

/**
 * Build a Mapbox-compatible place_name string from Photon properties.
 */
function buildPlaceName(props: Record<string, any>): string {
  const parts: string[] = [];
  if (props.housenumber && props.street) {
    parts.push(`${props.street} ${props.housenumber}`);
  } else if (props.street) {
    parts.push(props.street);
  } else if (props.name) {
    parts.push(props.name);
  }
  if (props.city && !parts.includes(props.city)) parts.push(props.city);
  if (props.state && !parts.includes(props.state)) parts.push(props.state);
  if (props.country && !parts.includes(props.country)) parts.push(props.country);
  return parts.join(', ') || props.name || 'Unknown';
}

/**
 * Transform a Photon GeoJSON feature into a Mapbox-compatible feature.
 * The frontend expects: { id, place_name, center: [lng, lat], context }
 */
function photonToMapbox(feature: any): any {
  const props = feature.properties || {};
  const coords = feature.geometry?.coordinates || [0, 0]; // [lng, lat]

  const context: Array<{ id: string; text: string }> = [];
  if (props.city) context.push({ id: 'place', text: props.city });
  if (props.state) context.push({ id: 'region', text: props.state });
  if (props.country) context.push({ id: 'country', text: props.country });
  if (props.postcode) context.push({ id: 'postcode', text: props.postcode });

  return {
    id: `photon.${props.osm_id || Math.random().toString(36).slice(2)}`,
    place_name: buildPlaceName(props),
    center: coords, // [lng, lat] — same order as Mapbox
    context,
    properties: props,
    geometry: feature.geometry,
    type: 'Feature',
  };
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

  // Supabase client for rate limiting
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

    // Basic IP-based rate limiting via RPC
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

    let photonUrl: string;
    if (isReverseGeocode) {
      // query format: "lng,lat" (Mapbox convention) — split and use Photon reverse
      const [lng, lat] = query.split(',').map((s: string) => s.trim());
      photonUrl = `https://photon.komoot.io/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&limit=1`;
    } else {
      photonUrl = `https://photon.komoot.io/api?q=${encodeURIComponent(query)}&limit=5&lang=en`;
    }

    const photonResponse = await fetch(photonUrl);
    if (!photonResponse.ok) {
      throw new Error(`Photon API error: ${photonResponse.status}`);
    }

    const photonData = await photonResponse.json();

    // Transform Photon response to Mapbox-compatible format
    const transformedFeatures = (photonData.features || []).map(photonToMapbox);

    const response = {
      type: 'FeatureCollection',
      features: transformedFeatures,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...buildCors(origin), 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in geocoding function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...buildCors(origin), 'Content-Type': 'application/json' } }
    );
  }
});
