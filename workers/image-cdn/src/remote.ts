/**
 * GET/HEAD /r/{base64url(sourceUrl)} — pull-through R2 mirror.
 *
 * The site never hotlinks an external image: the client rewrites every
 * non-R2 URL to this route (src/utils/imageHost.ts `toR2ImageUrl`). The first
 * request fetches the source once and stores it in R2 under
 * `remote/{sha256(sourceUrl)}`; every later request is served from R2.
 *
 * Abuse surface: the zone's WAF already 403s img.queer.guide for foreign
 * Referers, sources must be http(s) images under MAX_BYTES, and failures are
 * negative-cached so a dead URL costs one origin fetch per NEGATIVE_TTL.
 */

const MAX_BYTES = 20 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const CACHE_TTL = 60 * 60 * 24 * 365;
const NEGATIVE_TTL = 60 * 60 * 6;
const PREFIX = 'remote/';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 QueerGuideImageMirror/1.0';

export function decodeSource(token: string): URL | null {
  try {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const url = new URL(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const host = url.hostname.toLowerCase();
    // Loop / internal-network guard.
    if (host === 'img.queer.guide' || host === 'localhost' || /^(127|10|192\.168|169\.254)\./.test(host)) return null;
    return url;
  } catch {
    return null;
  }
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function okHeaders(cors: Record<string, string>, contentType: string, size: number, etag?: string) {
  const h: Record<string, string> = {
    ...cors,
    'Content-Type': contentType,
    'Content-Length': String(size),
    'Cache-Control': `public, max-age=${CACHE_TTL}, immutable`,
    'X-Content-Type-Options': 'nosniff',
  };
  if (etag) h.ETag = etag;
  return h;
}

/** Raster type from magic bytes — some CDNs serve images as octet-stream/text. */
export function sniffImageType(buf: ArrayBuffer): string | null {
  const b = new Uint8Array(buf.slice(0, 16));
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'GIF8') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(4, 8) === 'ftyp') return /avi[fs]/.test(ascii(8, 12)) ? 'image/avif' : 'image/heic';
  return null;
}

/**
 * The content type to store, or null when the body is not a raster image we
 * accept. SVG is never mirrored (it can carry script).
 */
export function acceptableImage(contentType: string, body: ArrayBuffer): string | null {
  if (body.byteLength < 100 || body.byteLength > MAX_BYTES) return null;
  const ct = contentType.toLowerCase();
  if (ct.includes('svg')) return null;
  if (ct.startsWith('image/')) return ct;
  return sniffImageType(body);
}

export async function handleRemote(
  req: Request,
  bucket: R2Bucket,
  ctx: ExecutionContext,
  token: string,
  cors: Record<string, string>,
): Promise<Response> {
  const head = req.method === 'HEAD';
  const notFound = (ttl = NEGATIVE_TTL) =>
    new Response(head ? null : 'Not found', {
      status: 404,
      headers: { ...cors, 'Cache-Control': `public, max-age=${ttl}` },
    });

  const source = decodeSource(token);
  if (!source) return notFound(CACHE_TTL);
  const key = PREFIX + (await sha256Hex(source.href));

  const stored = head ? await bucket.head(key) : await bucket.get(key);
  if (stored) {
    const ct = stored.httpMetadata?.contentType || 'image/jpeg';
    const body = head ? null : (stored as R2ObjectBody).body;
    return new Response(body, { headers: { ...okHeaders(cors, ct, stored.size, stored.httpEtag), 'X-Mirror': 'hit' } });
  }

  // Negative cache in the colo's Cache API so a dead source is not re-fetched
  // on every page view.
  const missKey = new Request(`https://img.queer.guide/__miss/${key}`);
  const cache = (caches as unknown as { default: Cache }).default;
  if (await cache.match(missKey)) return notFound();

  let res: Response;
  try {
    res = await fetch(source.href, {
      headers: {
        'User-Agent': UA,
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        // Merchant/Shopify-own-domain stores hotlink-protect on Referer; their
        // own origin always passes.
        Referer: `${source.origin}/`,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cf: { cacheTtl: 3600 },
    });
  } catch {
    ctx.waitUntil(cache.put(missKey, new Response('miss', { headers: { 'Cache-Control': `max-age=${NEGATIVE_TTL}` } })));
    return notFound();
  }

  const ct = (res.headers.get('Content-Type') || '').split(';')[0].trim();
  const declared = Number(res.headers.get('Content-Length') || 0);
  if (!res.ok || declared > MAX_BYTES) {
    await res.body?.cancel();
    ctx.waitUntil(cache.put(missKey, new Response('miss', { headers: { 'Cache-Control': `max-age=${NEGATIVE_TTL}` } })));
    return notFound();
  }
  const body = await res.arrayBuffer();
  const storedType = acceptableImage(ct, body);
  if (!storedType) {
    ctx.waitUntil(cache.put(missKey, new Response('miss', { headers: { 'Cache-Control': `max-age=${NEGATIVE_TTL}` } })));
    return notFound();
  }

  ctx.waitUntil(
    bucket.put(key, body, {
      httpMetadata: { contentType: storedType },
      customMetadata: { source: source.href.slice(0, 1024) },
    }),
  );
  return new Response(head ? null : body, {
    headers: { ...okHeaders(cors, storedType, body.byteLength), 'X-Mirror': 'miss' },
  });
}
