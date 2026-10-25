import {
  nativeRedirectRequested,
  nativeHandoffRequest,
  nativeProblem,
  nativeUpstreamResponse,
  forwardNativeHeaders,
} from '../../supabase/functions/_shared/redirect-native-resolution';
import { signRedirectRelay } from '../../supabase/functions/_shared/redirect-relay';
import { forwardVisitorGeo } from '../../supabase/functions/_shared/redirect-visitor-geo';
import type { Env } from '../_lib/sitemap';

/** Keep the public branded URL while the existing resolver owns rules and visits. */
export const onRequest: PagesFunction<Env> = async ({ request, params, env }) => {
  const headers = {
    'Cache-Control': 'no-store',
    Vary: 'Accept',
    'X-Robots-Tag': 'noindex',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  };
  const native = nativeRedirectRequested(request);
  const failure = (status: number, message: string) =>
    native
      ? nativeProblem(status, request.method === 'HEAD')
      : new Response(request.method === 'HEAD' ? null : message, { status, headers });
  if (!['GET', 'HEAD', 'POST'].includes(request.method))
    return native
      ? nativeProblem(405, request.method === 'HEAD')
      : new Response('Method not allowed', {
          status: 405,
          headers: { ...headers, Allow: 'GET, HEAD, POST' },
        });
  try {
    nativeHandoffRequest(request);
  } catch {
    return failure(400, 'Invalid handoff request');
  }
  const slug = String(params.slug ?? '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) return failure(404, 'Link not found');
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY)
    return failure(503, 'Short links are temporarily unavailable');
  const resolver = new URL('/functions/v1/redirect-handler', env.SUPABASE_URL);
  resolver.searchParams.set('slug', slug);
  const query = new URL(request.url).searchParams.toString();
  if (query) resolver.searchParams.set('q', query);
  const forwarded = new Headers({
    Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
    apikey: env.SUPABASE_ANON_KEY,
  });
  forwardNativeHeaders(request, forwarded);
  for (const name of ['referer', 'user-agent', 'cf-connecting-ip', 'cf-ipcountry']) {
    const value = request.headers.get(name);
    if (value) forwarded.set(name, value);
  }
  // The resolver's CDN can replace cf-ipcountry with the relay's country.
  const country =
    typeof request.cf?.country === 'string'
      ? request.cf.country
      : request.headers.get('cf-ipcountry');
  if (country) forwarded.set('x-qg-visitor-country', country);
  forwardVisitorGeo(forwarded, request.cf);
  forwarded.set('x-qg-visitor-domain', new URL(request.url).hostname);
  const relay = env.REDIRECT_RELAY_SECRET
    ? await signRedirectRelay(
        request.headers.get('cf-connecting-ip') ?? '',
        slug,
        env.REDIRECT_RELAY_SECRET,
      )
    : null;
  if (relay) {
    forwarded.set('x-qg-relay-ip', relay.ip);
    forwarded.set('x-qg-relay-time', relay.timestamp);
    forwarded.set('x-qg-relay-signature', relay.signature);
  }
  if (request.method === 'POST')
    forwarded.set('Content-Type', request.headers.get('Content-Type') ?? '');
  try {
    const response = await fetch(resolver, {
      method: request.method,
      headers: forwarded,
      body: request.method === 'POST' ? request.body : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    if (native) return nativeUpstreamResponse(request, response);
    const status = response.status;
    const location = response.headers.get('Location');
    if ([301, 302, 303, 307, 308].includes(status) && location)
      return new Response(null, { status, headers: { ...headers, Location: location } });
    if (status === 404)
      return new Response(request.method === 'HEAD' ? null : 'Link not found or expired', {
        status: 404,
        headers,
      });
    if (
      [200, 401, 410, 429].includes(status) &&
      response.headers.get('Content-Type')?.startsWith('text/html')
    ) {
      const htmlHeaders = new Headers(headers);
      htmlHeaders.set('Content-Type', 'text/html; charset=utf-8');
      const csp = response.headers.get('Content-Security-Policy');
      if (csp) htmlHeaders.set('Content-Security-Policy', csp);
      const retry = response.headers.get('Retry-After');
      if (status === 429 && retry && /^\d{1,3}$/.test(retry)) htmlHeaders.set('Retry-After', retry);
      return new Response(request.method === 'HEAD' ? null : response.body, {
        status,
        headers: htmlHeaders,
      });
    }
    return failure(502, 'Short links are temporarily unavailable');
  } catch {
    return failure(502, 'Short links are temporarily unavailable');
  }
};
