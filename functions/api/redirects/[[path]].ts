import { signRedirectRelay } from '../../../supabase/functions/_shared/redirect-relay';
import type { Env } from '../../_lib/sitemap';

/** Branded API entry point; credentials and authorization remain owned by the resolver API. */
export const onRequest: PagesFunction<Env> = async ({ request, params, env }) => {
  const headers = {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    'X-Robots-Tag': 'noindex',
    'Referrer-Policy': 'no-referrer',
    Vary: 'Authorization, X-Qg-Redirect-Workspace',
  };
  const error = (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status, headers });
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(request.method))
    return error('Method not allowed', 405);
  if (!env.SUPABASE_URL) return error('Redirect API unavailable', 503);
  const segments = Array.isArray(params.path) ? params.path : [];
  if (segments.some((part) => !part || !/^[a-zA-Z0-9_-]+$/.test(part)))
    return error('Endpoint not found', 404);
  const upstream = new URL('/functions/v1/redirect-api/' + segments.join('/'), env.SUPABASE_URL);
  upstream.search = new URL(request.url).search;
  const forwarded = new Headers();
  for (const name of ['authorization', 'content-type', 'origin', 'x-qg-redirect-workspace']) {
    const value = request.headers.get(name);
    if (value !== null) forwarded.set(name, value);
  }
  if (segments.join('/') === 'public-report' && env.REDIRECT_RELAY_SECRET) {
    const id = request.headers
      .get('authorization')
      ?.match(/^Bearer qg_report_([a-f0-9-]{36})$/i)?.[1]
      ?.toLowerCase();
    if (id) {
      const relay = await signRedirectRelay(
        request.headers.get('cf-connecting-ip') ?? '',
        'report:' + id,
        env.REDIRECT_RELAY_SECRET,
      );
      if (relay) {
        forwarded.set('x-qg-relay-ip', relay.ip);
        forwarded.set('x-qg-relay-time', relay.timestamp);
        forwarded.set('x-qg-relay-signature', relay.signature);
      }
    }
  }
  if (env.SUPABASE_ANON_KEY) forwarded.set('apikey', env.SUPABASE_ANON_KEY);
  try {
    const response = await fetch(upstream, {
      method: request.method,
      headers: forwarded,
      body: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) ? request.body : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
    if (response.status >= 300 && response.status < 400)
      return error('Redirect API unavailable', 502);
    const result = new Headers(headers);
    for (const name of [
      'access-control-allow-origin',
      'access-control-allow-methods',
      'access-control-allow-headers',
      'vary',
      'retry-after',
    ]) {
      const value = response.headers.get(name);
      if (value) result.set(name, value);
    }
    if (!result.get('vary')?.toLowerCase().split(/,\s*/).includes('authorization'))
      result.append('Vary', 'Authorization');
    if (!result.get('vary')?.toLowerCase().split(/,\s*/).includes('x-qg-redirect-workspace'))
      result.append('Vary', 'X-Qg-Redirect-Workspace');
    return new Response(response.body, { status: response.status, headers: result });
  } catch {
    return error('Redirect API unavailable', 502);
  }
};
