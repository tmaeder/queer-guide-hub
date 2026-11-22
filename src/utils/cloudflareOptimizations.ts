// Cloudflare-specific optimizations and utilities

// Relative, not '@/': functions/_lib/heroPreload.ts imports this module and the
// Pages Functions bundler does not resolve the app's path alias.
import { toR2ImageUrl, R2_IMAGE_HOST } from './imageHost';

const IMG_CDN_HOST = R2_IMAGE_HOST;

/**
 * CF Image Resizing (`img.queer.guide/cdn-cgi/image/<opts>/<source>`) only
 * ever resizes an R2 source: external URLs are first rewritten to the
 * image-cdn pull-through (`toR2ImageUrl`), so CF's fetcher reads our worker,
 * never a publisher/merchant CDN. That is also why no per-host denylist is
 * needed any more — merchant CDNs that 403 CF's fetcher are fetched by the
 * worker with their own origin as Referer.
 */
const isCfResizableSource = (u: URL): boolean =>
  u.protocol === 'https:' &&
  (u.hostname === IMG_CDN_HOST || u.hostname === 'queer.guide' || u.hostname === 'www.queer.guide');

/**
 * Build a Cloudflare Image Resizing URL over the R2 copy of `rawUrl` (external
 * sources go through the pull-through first). Uses the /cdn-cgi/image/
 * zone-level endpoint (requires paid Images plan).
 */
export function buildCfImageUrl(
  rawUrl: string,
  opts: { width?: number; height?: number; quality?: number; format?: string } = {},
): string {
  const url = toR2ImageUrl(rawUrl);
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
  rawUrl: string,
  widths: number[] = [400, 800, 1200],
  quality = 80,
): string | undefined {
  const url = toR2ImageUrl(rawUrl);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }

  if (!isCfResizableSource(parsed) || parsed.pathname.includes('/cdn-cgi/image/')) return undefined;
  return widths.map((w) => `${buildCfImageUrl(url, { width: w, quality })} ${w}w`).join(', ');
}

/**
 * Initialize Cloudflare-specific performance optimizations
 */
export const initCloudflareOptimizations = () => {
  // Add dns-prefetch for external domains used by the app
  const domains = ['supabase.co'];
  domains.forEach((domain) => {
    if (!document.querySelector(`link[rel="dns-prefetch"][href="https://${domain}"]`)) {
      const link = document.createElement('link');
      link.rel = 'dns-prefetch';
      link.href = `https://${domain}`;
      document.head.appendChild(link);
    }
  });

  // Service worker registration is handled by PWAProvider
};
