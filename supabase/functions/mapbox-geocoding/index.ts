import { getServiceClient } from '../_shared/supabase-client.ts';
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

// Same precedence as create-checkout-session's rate limit.
function getClientIp(req: Request) {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const rip = req.headers.get('x-real-ip');
  if (rip) return rip.trim();
  return 'unknown';
}

// Per-IP lookup budget. The Origin/Referer allowlist below only stops other
// websites' browsers: any script can send `Origin: https://queer.guide`, so it
// is not access control. Without a limit, one script could push enough traffic
// through this proxy for Nominatim to block our address, breaking geocoding
// site-wide (its usage policy is about 1 request/second). Autocomplete is
// debounced 300 ms with a 3-character minimum, ~10 calls per address typed, so
// 120 per 10 minutes covers many searches and shared office/mobile IPs.
const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_WINDOW_MINUTES = 10;

async function withinRateLimit(req: Request): Promise<boolean> {
  const ip = getClientIp(req);
  if (ip === 'unknown') return true;
  try {
    const { data, error } = await getServiceClient().rpc('check_rate_limit_enhanced', {
      identifier: ip,
      max_attempts: RATE_LIMIT_MAX,
      time_window_minutes: RATE_LIMIT_WINDOW_MINUTES,
      action_type: 'geocoding',
    });
    // Fail open: a rate-limit outage must not break every address field.
    return error ? true : data !== false;
  } catch {
    return true;
  }
}

function buildCors(origin: string) {
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : '';
  return {
    ...baseCorsHeaders,
    ...(allowOrigin ? { 'Access-Control-Allow-Origin': allowOrigin, Vary: 'Origin' } : {}),
  } as Record<string, string>;
}

/**
 * Build a Mapbox-compatible place_name string from Nominatim properties.
 */
function _buildPlaceName(displayName: string, _address: Record<string, unknown>): string {
  return displayName || 'Unknown';
}

/**
 * Transform a Nominatim result into a Mapbox-compatible feature.
 * Nominatim returns: { place_id, osm_id, display_name, lat, lon, address, ... }
 * The frontend expects: { id, place_name, center: [lng, lat], context }
 */
function nominatimToMapbox(result: Record<string, unknown>): unknown {
  const lat = parseFloat(result.lat as string) || 0;
  const lng = parseFloat(result.lon as string) || 0;
  const displayName = (result.display_name as string) || 'Unknown';
  const address = (result.address as Record<string, unknown>) || {};

  const context: Array<{ id: string; text: string }> = [];
  if (address.city) context.push({ id: 'place', text: address.city });
  if (address.state) context.push({ id: 'region', text: address.state });
  if (address.country) context.push({ id: 'country', text: address.country });
  if (address.postcode) context.push({ id: 'postcode', text: address.postcode });

  return {
    id: `nominatim.${result.osm_id || result.place_id || Math.random().toString(36).slice(2)}`,
    place_name: displayName,
    center: [lng, lat], // [lng, lat] — same order as Mapbox
    context,
    properties: address,
    geometry: {
      type: 'Point',
      coordinates: [lng, lat],
    },
    type: 'Feature',
  };
}

Deno.serve(async (req) => {
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

  if (!(await withinRateLimit(req))) {
    return new Response(JSON.stringify({ error: 'Too many requests. Please try again shortly.' }), {
      status: 429,
      headers: { ...buildCors(origin), 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
  }

  try {
    const { query, isReverseGeocode = false } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        { status: 400, headers: { ...buildCors(origin), 'Content-Type': 'application/json' } }
      );
    }

    // Use Nominatim (OpenStreetMap free geocoding service)
    let nominatimUrl: string;
    if (isReverseGeocode) {
      // query format: "lng,lat" (Mapbox convention)
      const [lng, lat] = query.split(',').map((s: string) => s.trim());
      nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    } else {
      nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;
    }

    const acceptLanguage = req.headers.get('Accept-Language') || 'en';
    const emptyResult = {
      type: 'FeatureCollection',
      features: [] as unknown[],
    };

    const nominatimResponse = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'queer.guide geocoding service',
        'Accept-Language': acceptLanguage,
      },
    });

    // Degrade gracefully on 3rd-party hiccup: return an empty feature collection
    // so the autocomplete UI shows "no match" instead of "save failed".
    if (!nominatimResponse.ok) {
      console.warn(`Nominatim API non-OK: ${nominatimResponse.status} for query "${query}"`);
      return new Response(JSON.stringify(emptyResult), {
        headers: {
          ...buildCors(origin),
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60',
        },
      });
    }

    const nominatimData = await nominatimResponse.json();

    // Transform Nominatim response to Mapbox-compatible format
    // Nominatim returns array for search, single object for reverse
    const results = Array.isArray(nominatimData) ? nominatimData : [nominatimData];
    const transformedFeatures = results.map(nominatimToMapbox);

    const response = {
      type: 'FeatureCollection',
      features: transformedFeatures,
    };

    return new Response(JSON.stringify(response), {
      headers: {
        ...buildCors(origin),
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('Error in geocoding function:', error);
    // Same graceful degradation for parse/network errors.
    return new Response(
      JSON.stringify({ type: 'FeatureCollection', features: [] }),
      { status: 200, headers: { ...buildCors(origin), 'Content-Type': 'application/json' } }
    );
  }
});
