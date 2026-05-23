/**
 * /api/geo — returns the visitor's coarse geo from CF edge geolocation.
 * No IP stored, no per-request logging. CORS-restricted to queer.guide.
 */

interface Env {
  ALLOWED_ORIGINS: string;
}

interface CfGeo {
  country?: string;
  city?: string;
  region?: string;
  latitude?: string;
  longitude?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? '';
    const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
    const corsOrigin = allowed.includes(origin) ? origin : allowed[0];

    const headers: HeadersInit = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cache-Control': 'private, max-age=300',
      'Content-Type': 'application/json; charset=utf-8',
      Vary: 'Origin',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers, status: 204 });
    }

    const cf = (request as unknown as { cf?: CfGeo }).cf ?? {};
    const country = (cf.country ?? '').toUpperCase() || null;
    const lat = cf.latitude ? parseFloat(cf.latitude) : null;
    const lon = cf.longitude ? parseFloat(cf.longitude) : null;

    const body = {
      country,
      city: cf.city ?? null,
      region: cf.region ?? null,
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lon) ? lon : null,
    };

    return new Response(JSON.stringify(body), { headers });
  },
};
