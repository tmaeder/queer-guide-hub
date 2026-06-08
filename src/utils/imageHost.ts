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
const TRUSTED_HOSTS = new Set([
  'queer.guide',
  'www.queer.guide',
  'img.queer.guide',
]);

/**
 * Marketplace merchant image hosts that need the origin sent (hotlink protection).
 * Matched as the host itself or any subdomain. Extend as new merchants are onboarded.
 *
 * These are Shopify-on-own-domain stores (`/cdn/shop/...`): with `no-referrer` the
 * browser drops their response via ORB. Sending the origin loads them. The shared
 * `cdn.shopify.com` CDN and generic CMS hosts (e.g. cms.terminuscash.com) serve
 * cross-origin freely and do NOT belong here — they load under the default policy.
 */
const MERCHANT_HOSTS = [
  'misterb.com',
  'supergayunderwear.com',
  'ohmyfantasy.com',
];

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
  return (
    TRUSTED_HOSTS.has(host) ||
    host.endsWith('.supabase.co') ||
    host.endsWith('.supabase.in')
  );
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
