// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- Generated ambient Worker declarations require a type reference without a runtime import.
/// <reference path="./worker-configuration.d.ts" />
import {
  nativeRedirectRequested,
  nativeHandoffRequest,
  nativeProblem,
  nativeUpstreamResponse,
  forwardNativeHeaders,
} from '../../supabase/functions/_shared/redirect-native-resolution';
import { proxyAppAssociation } from '../../supabase/functions/_shared/redirect-app-association-proxy';
import { forwardVisitorGeo } from '../../supabase/functions/_shared/redirect-visitor-geo';
import type { IncomingRequestCfProperties } from '@cloudflare/workers-types';
import {
  DOMAIN_HEALTH_PATH,
  domainLinkSlug,
  domainRelayHeaders,
  signDomainRelay,
} from '../../supabase/functions/_shared/redirect-domain-relay';

const publicHeaders = {
  'Cache-Control': 'no-store',
  Vary: 'Accept',
  'X-Robots-Tag': 'noindex',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
const healthOrigins = new Set([
  'https://queer.guide',
  'https://www.queer.guide',
  'http://localhost:4178',
  'http://localhost:5173',
]);
async function passwordBody(request: Request) {
  if (
    !request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded') ||
    !request.body
  )
    throw new Error('Invalid form');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 4096) {
      await reader.cancel();
      throw new Error('Form too large');
    }
    chunks.push(value);
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
/** Deploy only to the dedicated SaaS fallback zone after its routing is reviewed. */
export default {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    const association = await proxyAppAssociation(request, env);
    if (association) return association;
    const head = request.method === 'HEAD',
      native = nativeRedirectRequested(request);
    const error = (status: number, message = 'Link unavailable') =>
      native
        ? nativeProblem(status, head)
        : new Response(head ? null : message, { status, headers: publicHeaders });
    if (!['GET', 'HEAD', 'POST'].includes(request.method))
      return native
        ? nativeProblem(405, request.method === 'HEAD')
        : new Response('Method not allowed', {
            status: 405,
            headers: {
              ...publicHeaders,
              Allow: 'GET, HEAD, POST',
            },
          });
    try {
      nativeHandoffRequest(request);
    } catch {
      return error(400, 'Invalid handoff request');
    }
    try {
      const actualUrl = new URL(request.url);
      if (actualUrl.pathname === DOMAIN_HEALTH_PATH && request.method !== 'GET')
        return new Response(null, { status: 405, headers: { ...publicHeaders, Allow: 'GET' } });
      if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.REDIRECT_RELAY_SECRET)
        return error(503);
      const upstream = new URL('/functions/v1/redirect-handler', env.SUPABASE_URL);
      if (
        upstream.protocol !== 'https:' ||
        !upstream.hostname.endsWith('.supabase.co') ||
        upstream.port ||
        upstream.username ||
        upstream.password
      )
        return error(503);
      // Cloudflare supplies CF-Connecting-IP. Ignore all customer-supplied relay,
      // Host, X-Forwarded-Host, cookie and authorization headers.
      const relay = await signDomainRelay(
        request.method,
        actualUrl,
        request.headers.get('cf-connecting-ip') ?? 'unknown',
        env.REDIRECT_RELAY_SECRET,
      );
      if (!relay) return error(404, 'Link not found');
      upstream.searchParams.set('slug', domainLinkSlug(relay.path));
      if (relay.query) upstream.searchParams.set('q', relay.query);
      const forwarded = new Headers({
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        apikey: env.SUPABASE_ANON_KEY,
        ...domainRelayHeaders(relay),
        'x-qg-visitor-domain': relay.hostname,
      });
      forwardNativeHeaders(request, forwarded);
      for (const name of ['referer', 'user-agent']) {
        const value = request.headers.get(name);
        if (value) forwarded.set(name, value);
      }
      const geo = (request as Request & { cf?: IncomingRequestCfProperties }).cf;
      if (typeof geo?.country === 'string') forwarded.set('x-qg-visitor-country', geo.country);
      forwardVisitorGeo(forwarded, geo);
      const body = request.method === 'POST' ? await passwordBody(request) : undefined;
      if (body) forwarded.set('Content-Type', 'application/x-www-form-urlencoded');
      const response = await fetch(upstream, {
        method: request.method,
        headers: forwarded,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      });
      if (native) return nativeUpstreamResponse(request, response);
      const headers = new Headers(publicHeaders);
      const location = response.headers.get('Location');
      if ([301, 302, 303, 307, 308].includes(response.status) && location) {
        const target = new URL(location);
        if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password)
          return error(502);
        headers.set('Location', target.href);
        return new Response(null, { status: response.status, headers });
      }
      if (
        actualUrl.pathname === DOMAIN_HEALTH_PATH &&
        response.status === 200 &&
        response.headers.get('Content-Type')?.startsWith('application/json')
      ) {
        headers.set('Content-Type', 'application/json');
        headers.set('Vary', 'Origin');
        const origin = request.headers.get('Origin');
        if (origin && healthOrigins.has(origin)) headers.set('Access-Control-Allow-Origin', origin);
        return new Response(response.body, { status: 200, headers });
      }
      if (
        [200, 401, 410, 429].includes(response.status) &&
        response.headers.get('Content-Type')?.startsWith('text/html')
      ) {
        headers.set('Content-Type', 'text/html; charset=utf-8');
        const csp = response.headers.get('Content-Security-Policy');
        if (csp) headers.set('Content-Security-Policy', csp);
        const retry = response.headers.get('Retry-After');
        if (response.status === 429 && retry && /^\d{1,3}$/.test(retry))
          headers.set('Retry-After', retry);
        return new Response(head ? null : response.body, { status: response.status, headers });
      }
      return error(response.status === 404 ? 404 : 502);
    } catch {
      return error(502);
    }
  },
};
