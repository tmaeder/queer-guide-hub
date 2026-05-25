// Cloudflare-specific optimizations and utilities

const IMG_CDN_HOST = 'img.queer.guide';

const isHostOrSubdomain = (hostname: string, baseDomain: string): boolean =>
  hostname === baseDomain || hostname.endsWith(`.${baseDomain}`);

/**
 * Build a Cloudflare Image Resizing URL for img.queer.guide assets.
 * Uses the /cdn-cgi/image/ zone-level endpoint (requires paid Images plan).
 * Falls back to the original URL for external images.
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

  const hostname = parsed.hostname.toLowerCase();
  if (!isHostOrSubdomain(hostname, IMG_CDN_HOST) || parsed.pathname.includes('/cdn-cgi/image/')) return url;
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
 * Returns undefined if the URL is not on img.queer.guide.
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

  const hostname = parsed.hostname.toLowerCase();
  if (!isHostOrSubdomain(hostname, IMG_CDN_HOST) || parsed.pathname.includes('/cdn-cgi/image/')) return undefined;
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
  let host: string | undefined;
  try {
    host = new URL(src).hostname.toLowerCase();
  } catch {
    return src;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isHostOrSubdomain(hostname, IMG_CDN_HOST)) {
    return buildCfImageUrl(src, { width, height, quality, format });
  }
  if (isHostOrSubdomain(hostname, 'imagedelivery.net') || isHostOrSubdomain(hostname, 'cf-images.com')) {
  if (host === IMG_CDN_HOST) {
    return buildCfImageUrl(src, { width, height, quality, format });
  }
  if (
    host === 'imagedelivery.net' ||
    host.endsWith('.imagedelivery.net') ||
    host === 'cf-images.com' ||
    host.endsWith('.cf-images.com')
  ) {
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
