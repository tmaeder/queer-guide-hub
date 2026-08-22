/**
 * Pick a brand mark out of a shop's own HTML.
 *
 * The fallback for logo.dev, which only knows domains it has indexed — that is
 * most household brands and almost none of this catalogue's independent makers.
 * Every one of them runs a real storefront, and a storefront declares its mark
 * in four places, in descending order of how much it is *meant* to be a logo:
 *
 *   1. JSON-LD `Organization.logo` — an explicit, editorial "this is our logo".
 *      Measured across 15 of this catalogue's shops it is the single best arm:
 *      where present it returned the actual wordmark every time.
 *   2. The header's own logo `<img>` — the mark a visitor sees. Ranked above
 *      the icons because it is the wordmark, where an icon is usually a
 *      square crop of it.
 *   3. `apple-touch-icon` — 180px+, square, drawn for a light tile.
 *   4. `link rel=icon`, but only when its declared size is ≥96, it is an SVG,
 *      or it is a RESIZABLE CDN url (see below).
 *
 * The resizable-CDN arm is what makes this work on Shopify, which is most of
 * the catalogue. Shopify emits `rel=icon` pointing at the store's real logo
 * asset with `?width=32&height=32` — the 32 is a RESIZE REQUEST, not the
 * asset's size. cherrykitten.com declares a 32px icon whose underlying file is
 * a 256×256 PNG literally named "Logo1"; rejecting it on its declared size
 * throws away the best mark the site has. So those urls are re-requested at
 * `width=512` with the crop dropped, and the ANSWER is measured — `imageSize`
 * on the returned bytes — because Shopify never upscales past the original and
 * a store whose asset really is a 32px favicon (rodeoh.com) must still be
 * rejected. Declared size is a claim; pixel dimensions are the evidence.
 *
 * `og:image` is deliberately NOT a source. It is a share card: on a shop it is
 * usually a hero photo or a single product, and a product photo in a 56px logo
 * plate reads as a broken logo rather than as a photo. A brand with no
 * declared mark keeps its monogram, which is the honest render.
 *
 * A bare `/favicon.ico` is not consulted either — 16×16 upscaled into the plate
 * looks worse than the monogram it replaced, and ICO is not a format the CDN
 * resizer handles.
 */

export interface SiteIconCandidate {
  url: string;
  /** Which rule produced it — stored as provenance on the brand row. */
  kind: 'jsonld' | 'header-img' | 'apple-touch-icon' | 'icon';
  score: number;
}

/** Image types worth storing as a logo. ICO is excluded on purpose. */
const ACCEPTABLE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
  'image/avif',
]);

export function isAcceptableLogoType(contentType: string | null): boolean {
  if (!contentType) return false;
  return ACCEPTABLE_TYPES.has(contentType.split(';')[0].trim().toLowerCase());
}

function absolutize(href: string, base: string): string | null {
  try {
    const u = new URL(href.trim(), base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

function attr(tag: string, name: string): string | null {
  const m =
    tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i')) ??
    tag.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, 'i')) ??
    tag.match(new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`, 'i'));
  return m ? m[1] : null;
}

/** Largest edge in a `sizes` attribute ("180x180 32x32" → 180). 0 when absent. */
function largestSize(sizes: string | null): number {
  if (!sizes) return 0;
  let best = 0;
  for (const m of sizes.matchAll(/(\d+)\s*[x×]\s*(\d+)/gi)) {
    best = Math.max(best, Number(m[1]), Number(m[2]));
  }
  return best;
}

/**
 * Shopify/Shopify-CDN urls carry the render size in the query string. Ask for
 * the asset big and uncropped; `crop=center` with a square box would guillotine
 * a wide wordmark, and `height` alongside `width` reimposes the box.
 */
export function upsizeCdnUrl(url: string, width = 512): string {
  try {
    const u = new URL(url);
    if (!/\/cdn\/shop(ify)?\//.test(u.pathname) && !u.hostname.endsWith('shopifycdn.com')) return url;
    u.searchParams.delete('crop');
    u.searchParams.delete('height');
    u.searchParams.set('width', String(width));
    return u.toString();
  } catch {
    return url;
  }
}

/** True when the render size is a query param, so the declared size proves nothing. */
export function isResizableCdnUrl(url: string): boolean {
  return upsizeCdnUrl(url) !== url;
}

/**
 * Pixel dimensions from the image's own header bytes. SVG returns null and is
 * treated as scalable by the caller. Used to reject a store whose "logo" really
 * is a 32px favicon — the only check the markup cannot lie about.
 */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // PNG: 8-byte signature, then IHDR length+type, then w/h at 16/20.
  if (bytes.byteLength > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  // GIF87a/89a: little-endian w/h at 6/8.
  if (bytes.byteLength > 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
  }
  // WebP: RIFF....WEBP, then a VP8 / VP8L / VP8X chunk, each with its own layout.
  if (
    bytes.byteLength > 30 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45
  ) {
    const fourcc = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (fourcc === 'VP8X') {
      const w = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const h = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return { width: w, height: h };
    }
    if (fourcc === 'VP8 ') {
      return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
    }
    if (fourcc === 'VP8L') {
      const b = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  // JPEG: walk the segment chain to the first SOFn (excluding DHT/DAC/RSTn).
  if (bytes.byteLength > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.byteLength) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: dv.getUint16(i + 7), height: dv.getUint16(i + 5) };
      }
      i += 2 + dv.getUint16(i + 2);
    }
  }
  return null;
}

/**
 * Hosts that serve assets FOR a shop rather than being another shop. A logo on
 * one of these is still this brand's logo.
 */
const ASSET_CDN_HOSTS = [
  'cdn.shopify.com',
  'shopifycdn.com',
  'wsimg.com',
  'squarespace-cdn.com',
  'wixstatic.com',
  'bigcommerce.com',
  'cloudfront.net',
  'akamaized.net',
  'cdn.accentuate.io',
];

function registrable(host: string): string {
  const parts = host.toLowerCase().split('.');
  return parts.slice(-2).join('.');
}

/**
 * The candidate must belong to the shop we asked, not to a neighbour.
 *
 * Not hypothetical: cellblock13.net's JSON-LD `logo` points at
 * timoteo.net/cdn/shop/... — a SIBLING brand sharing the same operator. Taking
 * it would publish Timoteo's mark under CellBlock 13, which is the retailer
 * collision this whole path exists to avoid, arriving by a different door.
 */
export function sameSiteOrCdn(url: string, baseUrl: string): boolean {
  try {
    const a = new URL(url).hostname.toLowerCase();
    const b = new URL(baseUrl).hostname.toLowerCase();
    if (registrable(a) === registrable(b)) return true;
    return ASSET_CDN_HOSTS.some((h) => a === h || a.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/**
 * Logos shipped for a dark header. The plate is paper in both themes (see
 * `--color-logo-plate`), so a white wordmark on it is invisible — demote it
 * behind every other candidate rather than dropping it, because for some shops
 * it is the only mark on the page.
 */
function invertedVariantPenalty(url: string): number {
  const file = url.split('/').pop() ?? '';
  return /(^|[._-])(white|light|inverted?|inverse|reversed|negative|darkmode)([._-]|$)/i.test(file)
    ? 260
    : 0;
}

/** Depth-first hunt for an Organization-ish `logo` in a JSON-LD document. */
function logoFromJsonLd(node: unknown, depth = 0): string | null {
  if (depth > 6 || node == null) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = logoFromJsonLd(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;

  const logo = obj.logo;
  if (typeof logo === 'string' && logo.trim()) return logo.trim();
  if (logo && typeof logo === 'object') {
    const url = (logo as Record<string, unknown>).url;
    if (typeof url === 'string' && url.trim()) return url.trim();
    if (Array.isArray(logo) && typeof logo[0] === 'string') return logo[0];
  }

  for (const key of ['@graph', 'publisher', 'brand', 'provider', 'author']) {
    const hit = logoFromJsonLd(obj[key], depth + 1);
    if (hit) return hit;
  }
  return null;
}

/**
 * `<img>` elements the page itself calls its logo, in document order.
 *
 * Restricted to a logo-ish `class`/`id`/`alt` so a payment badge or a partner
 * mark in the same header cannot be mistaken for the store's own. Sprite sheets
 * and tracking pixels are excluded by the caller's dimension check, not here.
 */
function headerLogoImages(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const hay = `${attr(tag, 'class') ?? ''} ${attr(tag, 'id') ?? ''} ${attr(tag, 'alt') ?? ''}`;
    if (!/logo|wordmark|brand-?mark/i.test(hay)) continue;
    // "logout", "logo-slider" (a partner carousel) and payment-icon strips are
    // the recurring false friends.
    if (/logout|payment|partner|sponsor|slider|carousel/i.test(hay)) continue;
    const href = attr(tag, 'src') ?? attr(tag, 'data-src');
    if (!href || href.startsWith('data:')) continue;
    const url = absolutize(href, baseUrl);
    if (url) out.push(upsizeCdnUrl(url));
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * Best declared brand mark in `html`, resolved against `baseUrl`.
 * Returns null when the page declares nothing that qualifies.
 */
export function pickSiteIcons(
  html: string,
  baseUrl: string,
  /**
   * The url we ASKED for, when redirects moved us. The host guard runs against
   * this, not against where we landed: cellblock13.net 301s to timoteo.net, so
   * judging by the final url would bless a sibling brand's wordmark as
   * CellBlock 13's. A cross-site redirect means the brand's own shop is gone,
   * and the honest answer there is the monogram.
   */
  siteUrl: string = baseUrl,
): SiteIconCandidate[] {
  const candidates: SiteIconCandidate[] = [];
  const head = html.slice(0, 400_000); // marks live in <head>; don't scan a 5 MB body

  for (const m of head.matchAll(
    /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const logo = logoFromJsonLd(JSON.parse(m[1]));
      const url = logo ? absolutize(logo, baseUrl) : null;
      if (url) candidates.push({ url: upsizeCdnUrl(url), kind: 'jsonld', score: 400 });
    } catch {
      // A shop with malformed JSON-LD still has an apple-touch-icon.
    }
  }

  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (attr(tag, 'rel') ?? '').toLowerCase();
    const href = attr(tag, 'href');
    if (!href) continue;
    const url = absolutize(href, baseUrl);
    if (!url) continue;
    const size = largestSize(attr(tag, 'sizes'));
    const type = (attr(tag, 'type') ?? '').toLowerCase();
    const isSvg = type === 'image/svg+xml' || /\.svg(\?|$)/i.test(url);

    if (/\bapple-touch-icon(-precomposed)?\b/.test(rel)) {
      candidates.push({ url, kind: 'apple-touch-icon', score: 200 + Math.min(size, 512) / 100 });
    } else if (/(^|\s)(shortcut\s+)?icon(\s|$)/.test(rel)) {
      if (isSvg) candidates.push({ url, kind: 'icon', score: 150 });
      else if (isResizableCdnUrl(url)) {
        // Declared size is a resize request here, not the asset. Ask big and
        // let the caller measure what comes back.
        candidates.push({ url: upsizeCdnUrl(url), kind: 'icon', score: 150 });
      } else if (size >= 96) candidates.push({ url, kind: 'icon', score: 100 + size / 100 });
    }
  }

  for (const url of headerLogoImages(head, baseUrl)) {
    candidates.push({ url, kind: 'header-img', score: 300 });
  }

  const seen = new Set<string>();
  return candidates
    .filter((c) => sameSiteOrCdn(c.url, siteUrl))
    .map((c) => ({ ...c, score: c.score - invertedVariantPenalty(c.url) }))
    .sort((a, b) => b.score - a.score)
    .filter((c) => !seen.has(c.url) && seen.add(c.url));
}

/**
 * The single best candidate, for callers that cannot retry. Prefer
 * {@link pickSiteIcons}: the top pick can still fail the caller's pixel check
 * (a Shopify icon whose asset really is 32px), and walking down the ranking
 * recovers the shop's wordmark instead of giving up on the whole domain.
 */
export function pickSiteIcon(
  html: string,
  baseUrl: string,
  siteUrl: string = baseUrl,
): SiteIconCandidate | null {
  return pickSiteIcons(html, baseUrl, siteUrl)[0] ?? null;
}
