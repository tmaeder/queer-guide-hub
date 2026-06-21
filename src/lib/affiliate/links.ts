/**
 * Affiliate link plumbing — apply per-surface sub-id attribution and wrap
 * outbound links through the first-party `/go` redirect.
 *
 * Two responsibilities:
 *   1. applySubId  — fold the surface tag into a partner's native sub field,
 *      so Travelpayouts stats attribute the click to the right surface.
 *   2. goHref      — produce a `/go?...` link to the search-proxy worker,
 *      which logs the click (affiliate_clicks) then 302s to the tagged URL.
 *      First-party data even when client JS tracking is blocked.
 */

import {
  BOOKING_LABEL_BASE,
  getPartner,
  type AffiliateSurface,
  type AffiliateVertical,
} from './config';

const SEARCH_PROXY_URL =
  (import.meta as { env?: Record<string, string> }).env?.VITE_SEARCH_PROXY_URL || '';

/**
 * Fold the surface tag into the partner's native sub field. Idempotent —
 * re-applying the same surface produces the same URL.
 */
export function applySubId(rawUrl: string, partnerKey: string, surface: AffiliateSurface): string {
  const partner = getPartner(partnerKey);
  if (!partner) return rawUrl;
  try {
    const url = new URL(rawUrl);
    switch (partner.subField) {
      case 'sub_id':
        url.searchParams.set('sub_id', surface);
        break;
      case 'gyg_placement':
        url.searchParams.set('placement', surface);
        break;
      case 'booking_label':
        // Booking.com sub-tracking rides the `label` param.
        url.searchParams.set('label', `${BOOKING_LABEL_BASE}-${surface}`);
        break;
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export interface GoLinkParams {
  /** Final destination (already a partner deep link, sub-id optional — /go re-applies). */
  url: string;
  /** Partner key from config.PARTNERS. */
  partner: string;
  surface: AffiliateSurface;
  vertical: AffiliateVertical;
  /** Optional originating entity, e.g. "venue" + uuid — for per-entity revenue. */
  entityType?: string | null;
  entityId?: string | null;
}

function goQuery(params: GoLinkParams): URLSearchParams {
  const { url, partner, surface, vertical, entityType, entityId } = params;
  const qs = new URLSearchParams({ u: url, p: partner, s: surface, v: vertical });
  if (entityType && entityId) qs.set('e', `${entityType}:${entityId}`);
  return qs;
}

/**
 * Build the first-party `/go` redirect href. The worker applies sub-id,
 * logs the click, and 302s out. Falls back to a directly-tagged URL when the
 * search-proxy origin isn't configured (e.g. unit tests / SSR).
 */
export function goHref(params: GoLinkParams): string {
  if (!SEARCH_PROXY_URL) return applySubId(params.url, params.partner, params.surface);
  return `${SEARCH_PROXY_URL.replace(/\/$/, '')}/go?${goQuery(params).toString()}`;
}

/**
 * Fire a viewport-impression beacon for a CTA (kind=impression). No-op when
 * the proxy origin is unset or the browser has no beacon support.
 */
export function beaconImpression(params: GoLinkParams): void {
  if (!SEARCH_PROXY_URL || typeof navigator === 'undefined') return;
  try {
    const qs = goQuery(params);
    qs.set('beacon', '1');
    const href = `${SEARCH_PROXY_URL.replace(/\/$/, '')}/go?${qs.toString()}`;
    if (navigator.sendBeacon) navigator.sendBeacon(href);
    else void fetch(href, { method: 'GET', keepalive: true, mode: 'no-cors' });
  } catch {
    // analytics must never break UX
  }
}

/** Standard rel for any monetised outbound link. */
export const AFFILIATE_REL = 'sponsored nofollow noopener noreferrer';
