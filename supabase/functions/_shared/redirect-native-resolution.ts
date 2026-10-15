import { validPublicTarget } from './link-policy.ts';
export const NATIVE_REDIRECT_MEDIA = 'application/vnd.queer-guide.redirect+json';
export const NATIVE_CONSENT_HEADER = 'x-qg-attribution-consent';
export interface NativeResolution {
  protocol: 1;
  canonicalUrl: string;
  destination: string;
  statusCode: number;
  mode: 'navigate' | 'web';
  clickId: string | null;
}
const nativeProblems: Record<number, string> = {
  400: 'invalid_request',
  401: 'password_required',
  404: 'not_found',
  405: 'method_not_allowed',
  410: 'unavailable',
  429: 'rate_limited',
  502: 'upstream_unavailable',
  503: 'temporarily_unavailable',
  508: 'loop',
};
const nativeHeaders = {
  'Content-Type': NATIVE_REDIRECT_MEDIA + '; charset=utf-8',
  'Cache-Control': 'no-store',
  Vary: 'Accept, X-QG-Attribution-Consent',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
};
export function nativeRedirectRequested(request: Request) {
  return (request.headers.get('accept') ?? '').split(',').some((part) => {
    const [media, ...parameters] = part.toLowerCase().split(';');
    if (media.trim() !== NATIVE_REDIRECT_MEDIA) return false;
    const quality = parameters.map((value) => value.trim()).find((value) => value.startsWith('q='));
    return (
      quality === undefined ||
      (/^q=(?:1(?:\.0{0,3})?|0(?:\.\d{0,3})?)$/.test(quality) && Number(quality.slice(2)) > 0)
    );
  });
}
export function nativeAttributionConsent(request: Request) {
  return (
    nativeRedirectRequested(request) && request.headers.get(NATIVE_CONSENT_HEADER) === 'granted'
  );
}
export function forwardNativeHeaders(request: Request, headers: Headers) {
  if (nativeRedirectRequested(request)) {
    headers.set('Accept', NATIVE_REDIRECT_MEDIA);
    headers.set(NATIVE_CONSENT_HEADER, nativeAttributionConsent(request) ? 'granted' : 'denied');
  }
}
export function nativeProblem(status: number, head = false) {
  const actual = nativeProblems[status] ? status : 503;
  return new Response(
    head ? null : JSON.stringify({ protocol: 1, error: nativeProblems[actual] }),
    {
      status: actual,
      headers: { ...nativeHeaders, ...(actual === 405 ? { Allow: 'GET, HEAD, POST' } : {}) },
    },
  );
}
function nativePublicUrl(value: unknown, max: number, https = false) {
  if (typeof value !== 'string' || !value || value.length > max || /[\r\n\\]/.test(value))
    throw new Error('Invalid native URL');
  const url = new URL(value);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    (https && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    (https && !!url.port) ||
    url.href.length > max ||
    !validPublicTarget(url.origin)
  )
    throw new Error('Invalid native URL');
  return url;
}
export function parseNativePayload(
  value: unknown,
  status: number,
  source?: URL,
): NativeResolution | { protocol: 1; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid native response');
  const data = value as Record<string, unknown>;
  if (data.protocol !== 1) throw new Error('Unsupported native protocol');
  if (status !== 200) {
    if (
      !nativeProblems[status] ||
      data.error !== nativeProblems[status] ||
      Object.keys(data).some((key) => !['protocol', 'error'].includes(key))
    )
      throw new Error('Invalid native error');
    return { protocol: 1, error: String(data.error) };
  }
  if (
    Object.keys(data).length !== 6 ||
    Object.keys(data).some(
      (key) =>
        !['protocol', 'canonicalUrl', 'destination', 'statusCode', 'mode', 'clickId'].includes(key),
    )
  )
    throw new Error('Invalid native result');
  const canonical = nativePublicUrl(data.canonicalUrl, 4096, true),
    destination = nativePublicUrl(data.destination, 60000);
  if (
    canonical.search ||
    canonical.hash ||
    !['navigate', 'web'].includes(String(data.mode)) ||
    ![301, 302, 303, 307, 308].includes(Number(data.statusCode)) ||
    typeof data.statusCode !== 'number' ||
    (data.clickId !== null &&
      (typeof data.clickId !== 'string' ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(data.clickId)))
  )
    throw new Error('Invalid native result');
  if (source) {
    const builtin = ['queer.guide', 'www.queer.guide'];
    if (
      (canonical.hostname !== source.hostname &&
        !(builtin.includes(canonical.hostname) && builtin.includes(source.hostname))) ||
      decodeURIComponent(canonical.pathname).toLowerCase() !==
        decodeURIComponent(source.pathname).toLowerCase()
    )
      throw new Error('Native source mismatch');
  }
  const ids = destination.searchParams.getAll('qg_click_id');
  if (data.clickId === null ? ids.length !== 0 : ids.length !== 1 || ids[0] !== data.clickId)
    throw new Error('Invalid native attribution');
  return {
    protocol: 1,
    canonicalUrl: canonical.href,
    destination: destination.href,
    statusCode: data.statusCode,
    mode: data.mode as 'navigate' | 'web',
    clickId: data.clickId as string | null,
  };
}
export function nativeResolution(
  canonicalUrl: string,
  destination: string,
  statusCode: number,
  mode: 'navigate' | 'web',
  clickId: string | null,
  head = false,
) {
  const body = parseNativePayload(
    { protocol: 1, canonicalUrl, destination, statusCode, mode, clickId },
    200,
  );
  return new Response(head ? null : JSON.stringify(body), { status: 200, headers: nativeHeaders });
}
/** No compatibility redirect/HTML parsing: native clients need the explicit protocol. */
export async function nativeUpstreamResponse(
  request: Request,
  response: Response,
): Promise<Response> {
  try {
    if (
      response.headers.get('content-type')?.toLowerCase().split(';')[0].trim() !==
      NATIVE_REDIRECT_MEDIA
    ) {
      await response.body?.cancel();
      return nativeProblem(502, request.method === 'HEAD');
    }
    if (response.status !== 200 && !nativeProblems[response.status]) {
      await response.body?.cancel();
      return nativeProblem(502, request.method === 'HEAD');
    }
    const headers = new Headers(nativeHeaders),
      retry = response.headers.get('retry-after');
    if (
      response.status === 429 &&
      retry &&
      /^\d{1,3}$/.test(retry) &&
      Number(retry) > 0 &&
      Number(retry) <= 900
    )
      headers.set('Retry-After', retry);
    if (response.status === 405) headers.set('Allow', 'GET, HEAD, POST');
    if (request.method === 'HEAD') {
      await response.body?.cancel();
      return new Response(null, { status: response.status, headers });
    }
    if (!response.body || Number(response.headers.get('content-length') ?? 0) > 65536) {
      await response.body?.cancel();
      throw new Error('Invalid native body');
    }
    const reader = response.body.getReader(),
      parts: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 65536) {
        await reader.cancel();
        throw new Error('Native body too large');
      }
      parts.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    const body = parseNativePayload(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
      response.status,
      new URL(request.url),
    );
    return new Response(JSON.stringify(body), { status: response.status, headers });
  } catch {
    return nativeProblem(502, request.method === 'HEAD');
  }
}
