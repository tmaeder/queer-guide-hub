/**
 * Marketplace (shopping) affiliate links — the /go?l= form.
 *
 * Unlike travel links (goHref), the destination is resolved server-side by
 * the worker from the listing row, so the client only ever sends the listing
 * id + surface. Falls back to the direct URL when the proxy origin isn't
 * configured (unit tests / SSR).
 */

const SEARCH_PROXY_URL =
  (import.meta as { env?: Record<string, string> }).env?.VITE_SEARCH_PROXY_URL || '';

export const MARKETPLACE_SURFACES = [
  'marketplace_grid',
  'marketplace_detail',
  'brand_page',
  'city_rail',
  'trip_packing',
  'event_rail',
  'for_you',
  'wishlist',
] as const;

export type MarketplaceSurface = (typeof MARKETPLACE_SURFACES)[number];

/** First-party /go redirect for a marketplace listing. Null when the proxy origin is unset. */
export function marketplaceGoHref(listingId: string, surface: MarketplaceSurface): string | null {
  if (!SEARCH_PROXY_URL) return null;
  const qs = new URLSearchParams({ l: listingId, s: surface });
  return `${SEARCH_PROXY_URL.replace(/\/$/, '')}/go?${qs.toString()}`;
}

/** Viewport-impression beacon for a listing CTA (kind=impression). */
export function marketplaceBeacon(listingId: string, surface: MarketplaceSurface): void {
  if (!SEARCH_PROXY_URL || typeof navigator === 'undefined') return;
  try {
    const qs = new URLSearchParams({ l: listingId, s: surface, beacon: '1' });
    const href = `${SEARCH_PROXY_URL.replace(/\/$/, '')}/go?${qs.toString()}`;
    if (navigator.sendBeacon) navigator.sendBeacon(href);
    else void fetch(href, { method: 'GET', keepalive: true, mode: 'no-cors' });
  } catch {
    // analytics must never break UX
  }
}
