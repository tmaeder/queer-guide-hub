import { checkIpRateLimit } from '../_shared/ip-rate-limit.ts';
import { parseLngLat, photonLang, photonToMapbox, type PhotonFeature } from './photon.ts';

// Despite the name, this function has never called Mapbox: it returns a
// Mapbox-SHAPED FeatureCollection for the frontend address autocomplete.
// Upstream is Photon (OSM data) because public Nominatim answers 403 to the
// Supabase egress — see ./photon.ts.
const PHOTON_SEARCH = Deno.env.get('PHOTON_SEARCH_URL') || 'https://photon.komoot.io/api';
const PHOTON_REVERSE = Deno.env.get('PHOTON_REVERSE_URL') || 'https://photon.komoot.io/reverse';
const UPSTREAM_TIMEOUT_MS = 8000;

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
    let upstreamUrl: string;
    if (isReverseGeocode) {
      // query format: "lng,lat" (Mapbox convention)
      const point = parseLngLat(String(query));
      if (!point) {
        return new Response(
          JSON.stringify({ error: 'Reverse geocode query must be "lng,lat"' }),
          { status: 400, headers: { ...buildCors(origin), 'Content-Type': 'application/json' } }
        );
      }
      upstreamUrl = `${PHOTON_REVERSE}?lat=${point.lat}&lon=${point.lng}&lang=${lang}&limit=1`;
    } else {
      const q = String(query).trim().slice(0, 200);
      upstreamUrl = `${PHOTON_SEARCH}?q=${encodeURIComponent(q)}&limit=5&lang=${lang}`;
    }

    // Graceful degradation on an upstream failure: an empty collection so the
    // autocomplete shows "no match" rather than a toast per keystroke. The
    // x-geocoder-degraded header and the console.error keep that distinguishable
    // from a genuine no-match — the previous version logged only a warn, which
    // is how a 100% Nominatim 403 rate read as quiet for weeks.
    const degraded = (reason: string) => {
      console.error(`Photon geocoding failed: ${reason} (reverse=${!!isReverseGeocode}) for query "${String(query).slice(0, 80)}"`);
      return new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), {
        headers: {
          ...buildCors(origin),
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'x-geocoder-degraded': reason,
        },
      });
    };

    let upstream: Response;
    try {
      upstream = await fetch(upstreamUrl, {
        headers: { 'User-Agent': 'queer.guide geocoding service (https://queer.guide)' },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch (e) {
      return degraded(`fetch_${e instanceof Error ? e.name : 'error'}`);
    }
    if (!upstream.ok) return degraded(`http_${upstream.status}`);

    let body: { features?: PhotonFeature[] };
    try {
      body = await upstream.json();
    } catch {
      return degraded('bad_json');
    }

    const features = (body.features ?? [])
      .map(photonToMapbox)
      .filter((f): f is NonNullable<typeof f> => f !== null);

    return new Response(JSON.stringify({ type: 'FeatureCollection', features }), {
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
