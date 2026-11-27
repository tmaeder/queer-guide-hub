import { checkIpRateLimit } from '../_shared/ip-rate-limit.ts';
import { photonReverse, photonSearch, type PhotonResult } from '../_shared/photon-client.ts';
import { parseLngLat, photonLang, photonToMapbox } from './photon.ts';

// Despite the name, this function has never called Mapbox: it returns a
// Mapbox-SHAPED FeatureCollection for the frontend address autocomplete.
// Upstream is Photon (OSM data) because public Nominatim answers 403 to the
// Supabase egress — see ./photon.ts. Which Photon (our NAS or komoot) is
// decided by _shared/photon-client.ts.
const CALLER = 'mapbox-geocoding';

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

// Bound each client's geocoding traffic independently of the browser CORS check.
const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_WINDOW_SECONDS = 600;

function buildCors(origin: string) {
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : '';
  return {
    ...baseCorsHeaders,
    ...(allowOrigin ? { 'Access-Control-Allow-Origin': allowOrigin, Vary: 'Origin' } : {}),
  } as Record<string, string>;
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

  if (!(await checkIpRateLimit(req, 'mapbox-geocoding', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS))) {
    return new Response(JSON.stringify({ error: 'Too many requests. Please try again shortly.' }), {
      status: 429,
      headers: { ...buildCors(origin), 'Content-Type': 'application/json', 'Retry-After': String(RATE_LIMIT_WINDOW_SECONDS) },
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

    const lang = photonLang(req.headers.get('Accept-Language'));

    // Graceful degradation on an upstream failure: an empty collection so the
    // autocomplete shows "no match" rather than a toast per keystroke. The
    // x-geocoder-degraded header and the console.error keep that distinguishable
    // from a genuine no-match. Never log the query: it can be a home address.
    const degraded = (reason: string) => {
      console.error(`Photon geocoding failed: ${reason} (reverse=${!!isReverseGeocode})`);
      return new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), {
        headers: {
          ...buildCors(origin),
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'x-geocoder-degraded': reason,
        },
      });
    };

    let result: PhotonResult;
    if (isReverseGeocode) {
      // query format: "lng,lat" (Mapbox convention)
      const point = parseLngLat(String(query));
      if (!point) {
        return new Response(
          JSON.stringify({ error: 'Reverse geocode query must be "lng,lat"' }),
          { status: 400, headers: { ...buildCors(origin), 'Content-Type': 'application/json' } }
        );
      }
      result = await photonReverse(point.lat, point.lng, { caller: CALLER, lang, limit: 1 });
    } else {
      const q = String(query).trim().slice(0, 200);
      result = await photonSearch(q, { caller: CALLER, lang, limit: 5 });
    }
    if (!result.ok || !result.data) return degraded(result.reason ?? `http_${result.status}`);
    const body = result.data;

    const features = (body.features ?? [])
      .map(photonToMapbox)
      .filter((f): f is NonNullable<typeof f> => f !== null);

    return new Response(JSON.stringify({ type: 'FeatureCollection', features }), {
      headers: {
        ...buildCors(origin),
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400',
        'x-geocoder-upstream': result.upstream,
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
