/**
 * /api/geo — returns the visitor's country code from CF edge geolocation.
 * No IP stored, no per-request logging. CORS-restricted to queer.guide.
 */

interface Env {
  ALLOWED_ORIGINS: string;
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

    // request.cf is provided by Cloudflare in production.
    const cf = (request as unknown as { cf?: { country?: string } }).cf ?? {};
    const country = (cf.country ?? '').toUpperCase() || null;

    return new Response(JSON.stringify({ country }), { headers });
  },
};
