/** Keep authored public browse documents intact across the CDN. */
const PUBLIC_DOCUMENTS = new Set([
  '/',
  '/venues',
  '/events',
  '/cities',
  '/travel',
  '/news',
  '/about',
]);

function acceptsGzip(header: string): boolean {
  const entries = header
    .toLowerCase()
    .split(',')
    .map((value) => value.split(';').map((part) => part.trim()));
  const entry = entries.find(([name]) => name === 'gzip') ?? entries.find(([name]) => name === '*');
  if (!entry) return false;
  const quality = entry.slice(1).find((value) => value.trim().startsWith('q='));
  return !quality || Number(quality.trim().slice(2)) > 0;
}

/**
 * Cloudflare documents that no-transform prevents automatic JS Detections
 * injection. It also disables CDN compression, so gzip the authored HTML here
 * for clients accepting it. Restrict this to published browse documents; auth,
 * admin, APIs, detail routes and non-HTML responses retain their existing policy.
 * https://developers.cloudflare.com/cache/concepts/cache-control/
 */
export function publicDocumentDelivery(
  request: Request,
  basePath: string,
  response: Response,
): Response {
  if (
    !PUBLIC_DOCUMENTS.has(basePath) ||
    response.status !== 200 ||
    !['GET', 'HEAD'].includes(request.method) ||
    !response.headers.get('Content-Type')?.includes('text/html')
  )
    return response;
  const headers = new Headers(response.headers);
  const policy = headers.get('Cache-Control');
  if (!/(?:^|,)\s*no-transform\b/i.test(policy ?? ''))
    headers.set('Cache-Control', [policy, 'no-transform'].filter(Boolean).join(', '));
  headers.delete('Content-Length');
  const vary =
    headers
      .get('Vary')
      ?.split(',')
      .map((value) => value.trim()) ?? [];
  if (!vary.some((value) => value.toLowerCase() === 'accept-encoding' || value === '*'))
    vary.push('Accept-Encoding');
  headers.set('Vary', vary.join(', '));
  const encoding = headers.get('Content-Encoding');
  let body = response.body;
  if (
    !encoding &&
    acceptsGzip(request.headers.get('Accept-Encoding') ?? '') &&
    body &&
    request.method === 'GET'
  ) {
    body = body.pipeThrough(new CompressionStream('gzip'));
    headers.set('Content-Encoding', 'gzip');
  }
  return new Response(request.method === 'HEAD' ? null : body, {
    // This stream is already compressed. Workers' default would gzip it again.
    encodeBody: 'manual',
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
