/**
 * Right-size a remote image for the phone, the native twin of the web's
 * `buildCfImageUrl` (src/utils/cloudflareOptimizations.ts).
 *
 * Venue photos are stored as the publisher's original. The biggest source host
 * (agwpullzone.b-cdn.net, ~3k venues) serves cover photos around 490 KB; through
 * Cloudflare Image Resizing at 828px the same photo is ~69 KB (measured
 * 2026-11-20). The resizer answers requests without a Referer, which is what a
 * native client sends, so it works from the app as well as the site.
 *
 * Callers must keep the raw URL as a fallback: a host that refuses CF's fetcher
 * would otherwise turn into a blank hero instead of the original photo.
 */

export const IMG_CDN_HOST = 'img.queer.guide';

/** Hosts that refuse Cloudflare's image fetcher. The web dropped its copy (it resizes via the R2 pull-through); the app resizes external URLs directly, so it still needs one. */
export const CF_FETCH_DENY_HOSTS = ['cdn.shopify.com', 'cms.terminuscash.com', 'imagedelivery.net', 'cf-images.com'];

/** Kept equal to MERCHANT_HOSTS on the web (src/utils/imageHost.ts). */
export const MERCHANT_HOSTS = ['misterb.com', 'supergayunderwear.com', 'ohmyfantasy.com'];

const isHostOrSubdomain = (host: string, base: string) => host === base || host.endsWith(`.${base}`);

function resizable(u: URL): boolean {
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (CF_FETCH_DENY_HOSTS.some((d) => isHostOrSubdomain(host, d))) return false;
  if (MERCHANT_HOSTS.some((m) => isHostOrSubdomain(host, m))) return false;
  if (host.endsWith('.supabase.co') && u.pathname.includes('/render/image/')) return false;
  if (u.pathname.includes('/cdn-cgi/image/')) return false;
  return true;
}

/**
 * Resized URL for `url` at `width` CSS pixels times `scale` (the device pixel
 * ratio), capped so a 3x phone does not request a desktop-sized original.
 * Returns the input unchanged when it cannot be resized.
 */
export function resizedImageUrl(url: string, width: number, scale = 2): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!resizable(parsed)) return url;
  const px = Math.min(1600, Math.max(64, Math.round((width * Math.min(scale, 3)) / 50) * 50));
  return `https://${IMG_CDN_HOST}/cdn-cgi/image/width=${px},quality=80,format=webp/${url}`;
}
