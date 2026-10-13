import type { Env } from '../_lib/sitemap';

/** Keep the public branded URL while the existing resolver owns rules and visits. */
export const onRequest: PagesFunction<Env> = async ({ request, params, env }) => {
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response('Method not allowed', {
      status: 405,
      headers: { ...headers, Allow: 'GET, HEAD' },
    });
  const slug = String(params.slug ?? '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug))
    return new Response('Link not found', { status: 404, headers });
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY)
    return new Response('Short links are temporarily unavailable', { status: 503, headers });
  const resolver = new URL('/functions/v1/redirect-handler', env.SUPABASE_URL);
  resolver.searchParams.set('slug', slug);
  const query = new URL(request.url).searchParams.toString();
  if (query) resolver.searchParams.set('q', query);
  const forwarded = new Headers({
    Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
    apikey: env.SUPABASE_ANON_KEY,
  });
  for (const name of ['referer', 'user-agent', 'cf-connecting-ip', 'cf-ipcountry']) {
    const value = request.headers.get(name);
    if (value) forwarded.set(name, value);
  }
  try {
    const response = await fetch(resolver, {
      method: request.method,
      headers: forwarded,
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    const status = response.status;
    const location = response.headers.get('Location');
    if ([301, 302, 303, 307, 308].includes(status) && location)
      return new Response(null, { status, headers: { ...headers, Location: location } });
    if (status === 404)
      return new Response(request.method === 'HEAD' ? null : 'Link not found or expired', {
        status: 404,
        headers,
      });
    return new Response('Short links are temporarily unavailable', { status: 502, headers });
  } catch {
    return new Response('Short links are temporarily unavailable', { status: 502, headers });
  }
};
