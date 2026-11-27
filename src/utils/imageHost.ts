/**
 * Per-host referrer policy for cross-origin image hotlinks.
 *
 * Three classes of host:
 *   - Internal (queer.guide, supabase) → default policy, so analytics works.
 *   - Merchant CDNs → `strict-origin-when-cross-origin`. These hosts hotlink-protect
 *     by *requiring* a referer; `no-referrer` returns a non-image block page that the
 *     browser then drops via Opaque Response Blocking (ERR_BLOCKED_BY_ORB). Sending
 *     the origin (no path) passes their check while staying privacy-preserving.
 *   - Everything else (publisher CDNs — Guardian etc.) → `no-referrer`. These 401 when
 *     Referer is set to a non-allowed origin, so stripping it is what makes them load.
 */
const TRUSTED_HOSTS = new Set(['queer.guide', 'www.queer.guide', 'img.queer.guide']);

/**
 * Marketplace merchant image hosts that need the origin sent (hotlink protection).
 * Matched as the host itself or any subdomain. Extend as new merchants are onboarded.
 *
 * These are Shopify-on-own-domain stores (`/cdn/shop/...`): with `no-referrer` the
 * browser drops their response via ORB. Sending the origin loads them. The shared
 * `cdn.shopify.com` CDN and generic CMS hosts (e.g. cms.terminuscash.com) serve
 * cross-origin freely and do NOT belong here — they load under the default policy.
 */
const MERCHANT_HOSTS = ['misterb.com', 'supergayunderwear.com', 'ohmyfantasy.com'];

function hostOf(src: string): string | null {
  try {
    return new URL(src, 'https://queer.guide').hostname;
  } catch {
    return null;
  }
}

export function isTrustedSrc(src: string): boolean {
  const host = hostOf(src);
  if (host === null) return true;
  return TRUSTED_HOSTS.has(host) || host.endsWith('.supabase.co') || host.endsWith('.supabase.in');
}

export function isMerchantSrc(src: string): boolean {
  const host = hostOf(src);
  if (host === null) return false;
  return MERCHANT_HOSTS.some((m) => host === m || host.endsWith(`.${m}`));
}

/**
 * The referrer policy to apply to an image request, or `undefined` for the browser
 * default (internal hosts).
 */
export function imageReferrerPolicy(
  src: string,
): 'no-referrer' | 'strict-origin-when-cross-origin' | undefined {
  if (isTrustedSrc(src)) return undefined;
  if (isMerchantSrc(src)) return 'strict-origin-when-cross-origin';
  return 'no-referrer';
}

/** Wikimedia thumbnails support CORS; omit third-party credentials/cookies. */
export function imageCrossOrigin(src: string): 'anonymous' | undefined {
  return hostOf(src) === 'upload.wikimedia.org' ? 'anonymous' : undefined;
}

/**
 * Every content image is served from R2 via img.queer.guide — never hotlinked
 * from a publisher, merchant or storage CDN. An image that is not on R2 yet is
 * routed through the image-cdn worker's pull-through route
 * (`img.queer.guide/r/<base64url(source)>`), which fetches the source once,
 * stores it in R2 and serves it from there afterwards.
 *
 * Left untouched: relative/same-origin assets, data:/blob:, URLs already on
 * img.queer.guide, and third-party widget infrastructure whose images are not
 * content (map tiles, analytics pixels, payment/booking widgets) — proxying
 * those would break them or cache a tracking pixel.
 */
export const R2_IMAGE_HOST = 'img.queer.guide';
const R2_REMOTE_PREFIX = `https://${R2_IMAGE_HOST}/r/`;

// Exact infrastructure hosts only — never a parent domain that also serves
// content (`googleapis.com` would cover storage.googleapis.com buckets, which
// hold event flyers; caught by e2e/images-r2-only.spec.ts on /venues).
const DIRECT_HOSTS = [
  'queer.guide',
  'maps.googleapis.com',
  'maps.gstatic.com',
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'stripe.com',
  'getyourguide.com',
  'cloudflare.com',
  'cloudflareinsights.com',
  'sentry.io',
];

/**
 * Private storage: signed/authenticated Supabase URLs (user photos, trip
 * journals, chat media). These must NEVER be copied into the public R2 bucket —
 * the copy would outlive the link's expiry and the photo's deletion — so they
 * load directly from our own Supabase host (allowed in CSP img-src).
 * Mirrored by `isPrivateSource` in workers/image-cdn/src/remote.ts.
 */
export const PRIVATE_STORAGE_RE =
  /\.supabase\.(co|in)\/storage\/v1\/(object|render\/image)\/(sign|authenticated)\//i;

function base64UrlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function toR2ImageUrl(src: string): string;
export function toR2ImageUrl(src: string | null | undefined): string | null | undefined;
export function toR2ImageUrl(src: string | null | undefined): string | null | undefined {
  if (!src) return src;
  const trimmed = src.trim();
  if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith('//')) return src;
  let u: URL;
  try {
    u = new URL(trimmed.startsWith('//') ? `https:${trimmed}` : trimmed);
  } catch {
    return src;
  }
  const host = u.hostname.toLowerCase();
  if (host === R2_IMAGE_HOST) {
    // A stored resize wrapper whose SOURCE is external: re-point the source.
    const m = u.href.match(
      /^(https:\/\/img\.queer\.guide\/cdn-cgi\/image\/[^/]+\/)(https?:\/\/.+)$/,
    );
    return m && !m[2].startsWith(`https://${R2_IMAGE_HOST}/`) ? m[1] + toR2ImageUrl(m[2]) : src;
  }
  if (host === 'localhost' || host === '127.0.0.1') return src;
  if (DIRECT_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))) return src;
  if (PRIVATE_STORAGE_RE.test(u.href) || /[?&]X-Amz-Signature=/i.test(u.search)) return src;
  if (typeof location !== 'undefined' && host === location.hostname) return src;
  return R2_REMOTE_PREFIX + base64UrlEncode(u.href);
}

/** Rewrite every candidate of a `srcset` attribute value. */
export function toR2SrcSet(srcset: string): string {
  return srcset
    .split(/,\s+/)
    .map((cand) => {
      const m = cand.trim().match(/^(\S+)(\s+.*)?$/);
      return m ? toR2ImageUrl(m[1]) + (m[2] ?? '') : cand;
    })
    .join(', ');
}
