import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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

function _getClientIp(req: Request) {
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
