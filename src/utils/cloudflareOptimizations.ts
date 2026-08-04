// Cloudflare-specific optimizations and utilities

import { isMerchantSrc } from '@/utils/imageHost';

const IMG_CDN_HOST = 'img.queer.guide';

const isHostOrSubdomain = (hostname: string, baseDomain: string): boolean =>
  hostname === baseDomain || hostname.endsWith(`.${baseDomain}`);

/**
 * Hosts CF Image Resizing must NOT fetch: merchant CDNs that hotlink-protect
 * against server-side fetchers (cdn.shopify.com 403s CF's fetcher), and hosts
 * that are already an image-resizing service of their own.
 */
const CF_FETCH_DENY_HOSTS = [
  'cdn.shopify.com',
  'cms.terminuscash.com',
  'imagedelivery.net',
  'cf-images.com',
];

/**
 * Any https image URL can be pulled cross-origin by CF Image Resizing through
 * the img.queer.guide zone (`/cdn-cgi/image/<opts>/<url>`) — turning multi-MB
 * publisher/stock originals into right-sized webp (paid Images plan). Verified
 * against the live hosts on the home rails: pexels, i.guim.co.uk, monocle,
 * jimcdn, starobserver all resize fine. Denylist instead of allowlist:
 *   - CF_FETCH_DENY_HOSTS + merchant stores (they block CF's fetcher or need
 *     a referer the fetcher won't send),
 *   - Supabase `/render/image/` URLs (already transformed; `/object/` is fine),
 *   - non-https (data:, blob:, http dev URLs).
 * Consumers keep a raw-URL retry (Image.tsx ladder / ExternalImg onError), so
 * an unknown host that rejects CF's fetch degrades to the original URL, never
 * straight to the fallback texture.
 */
const isCfResizableSource = (u: URL): boolean => {
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (CF_FETCH_DENY_HOSTS.some((d) => isHostOrSubdomain(host, d))) return false;
  if (isMerchantSrc(u.href)) return false;
  if (host.endsWith('.supabase.co') && u.pathname.includes('/render/image/')) return false;
  return true;
};

/**
 * Build a Cloudflare Image Resizing URL for CF-resizable sources
 * (img.queer.guide assets + Supabase Storage public objects). Uses the
 * /cdn-cgi/image/ zone-level endpoint (requires paid Images plan). Falls back
 * to the original URL for hosts CF can't safely fetch (merchant CDNs, etc.).
 */
export function buildCfImageUrl(
  url: string,
  opts: { width?: number; height?: number; quality?: number; format?: string } = {},
): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (!isCfResizableSource(parsed) || parsed.pathname.includes('/cdn-cgi/image/')) return url;
  const { width, height, quality = 80, format = 'webp' } = opts;
  const params = [
    width ? `width=${width}` : null,
    height ? `height=${height}` : null,
    `quality=${quality}`,
    `format=${format}`,
  ]
    .filter(Boolean)
    .join(',');
  return `https://${IMG_CDN_HOST}/cdn-cgi/image/${params}/${url}`;
}

/**
 * Build a srcset string using CF Image Resizing at multiple widths.
 * Returns undefined for hosts CF can't resize (see isCfResizableSource).
 */
export function buildCfSrcSet(
  url: string,
  widths: number[] = [400, 800, 1200],
  quality = 80,
): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }

  if (!isCfResizableSource(parsed) || parsed.pathname.includes('/cdn-cgi/image/')) return undefined;
  return widths
    .map((w) => `${buildCfImageUrl(url, { width: w, quality })} ${w}w`)
    .join(', ');
}

/**
 * Optimize image URLs for Cloudflare Images (imagedelivery.net / cf-images.com).
 * For img.queer.guide URLs, use buildCfImageUrl instead.
 */
export const optimizeImageForCloudflare = (
  src: string,
  width?: number,
  height?: number,
  format: 'auto' | 'webp' | 'avif' | 'jpg' | 'png' = 'auto',
  quality = 85
) => {
  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    return src;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isHostOrSubdomain(hostname, IMG_CDN_HOST)) {
    return buildCfImageUrl(src, { width, height, quality, format });
  }
  if (isHostOrSubdomain(hostname, 'imagedelivery.net') || isHostOrSubdomain(hostname, 'cf-images.com')) {
    const params = [];
    if (width) params.push(`w=${width}`);
    if (height) params.push(`h=${height}`);
    params.push(`f=${format}`);
    params.push(`q=${quality}`);
    return `${src}${src.includes('?') ? '&' : '?'}${params.join('&')}`;
  }

  return src;
};

/**
 * Optimize fetch requests for Cloudflare edge caching
 */
export const cloudflareOptimizedFetch = async (
  url: string,
  options: RequestInit = {},
  cacheTime = 300 // 5 minutes default
) => {
  const optimizedOptions: RequestInit = {
    ...options,
    headers: {
      ...options.headers,
      'CF-Cache-TTL': cacheTime.toString(),
    },
  };

  return fetch(url, optimizedOptions);
};

/**
 * Get visitor's geolocation from Cloudflare headers (when available)
 */
export const getCloudflareGeoData = () => {
  if (typeof window !== 'undefined') {
    return {
      country: (window as unknown as Record<string, Record<string, string>>).CF?.country || 'US',
      region: (window as unknown as Record<string, Record<string, string>>).CF?.region || 'CA',
      city: (window as unknown as Record<string, Record<string, string>>).CF?.city || 'San Francisco',
      timezone: (window as unknown as Record<string, Record<string, string>>).CF?.timezone || 'America/Los_Angeles',
      latitude: (window as unknown as Record<string, Record<string, string>>).CF?.latitude || '37.7749',
      longitude: (window as unknown as Record<string, Record<string, string>>).CF?.longitude || '-122.4194'
    };
  }

  // Fallback for development
  return {
    country: 'US',
    region: 'CA',
    city: 'San Francisco',
    timezone: 'America/Los_Angeles',
    latitude: '37.7749',
    longitude: '-122.4194'
  };
};

/**
 * Initialize Cloudflare-specific performance optimizations
 */
export const initCloudflareOptimizations = () => {
  // Add dns-prefetch for external domains used by the app
  const domains = ['supabase.co'];
  domains.forEach(domain => {
    if (!document.querySelector(`link[rel="dns-prefetch"][href="https://${domain}"]`)) {
      const link = document.createElement('link');
      link.rel = 'dns-prefetch';
      link.href = `https://${domain}`;
      document.head.appendChild(link);
    }
  });

  // Service worker registration is handled by PWAProvider
};
