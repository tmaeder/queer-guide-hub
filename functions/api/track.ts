/**
 * POST /api/track — first-party analytics ingest proxy.
 *
 * public/umami.js posts here (same-origin, adblock-resistant) instead of
 * hitting the Supabase edge function directly. The proxy forwards the payload
 * to the umami-analytics edge function and attaches what only the Cloudflare
 * edge knows: the visitor's country (`request.cf.country`) and connecting IP
 * (used server-side for a daily-rotating cookieless visitor hash — the IP
 * itself is never stored). `_middleware.ts` skips `/api/`, so no meta
 * rewriting interferes.
 */

const UPSTREAM =
  'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/umami-analytics';

export const onRequestPost: PagesFunction = async ({ request }) => {
  const cf = (request.cf ?? {}) as { country?: string };

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': request.headers.get('user-agent') ?? 'unknown',
  };
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) headers['x-qg-ip'] = ip;
  if (cf.country) headers['x-qg-country'] = cf.country;

  const upstream = await fetch(UPSTREAM, {
    method: 'POST',
    headers,
    body: await request.text(),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
};
