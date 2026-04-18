/**
 * Trip-planner analytics hooks.
 *
 * Fires Umami events for every user action in the trip V2 surfaces
 * (geo selection, reservation suggestions, packing suggestions,
 * affiliate clicks). Also persists impressions + clicks server-side
 * via trip_suggestion_impressions and trip_booking_clicks so we can
 * build conversion funnels that don't rely on Umami.
 *
 * Safe to call anywhere — never throws.
 */

import { supabase } from '@/integrations/supabase/client';

type TripEventName =
  // Trip lifecycle
  | 'trip_created'
  | 'trip_geo_set'
  | 'trip_geo_fallback_used'
  // Reservation suggestions
  | 'reservation_suggestion_impression'
  | 'reservation_suggestion_click'
  // Packing suggestions
  | 'packing_suggestion_impression'
  | 'packing_suggestion_add_to_checklist'
  | 'packing_suggestion_buy_click'
  | 'packing_llm_requested'
  // Union event for monitoring
  | 'affiliate_click';

type EventData = Record<string, string | number | boolean | null | undefined>;

type UmamiTracker = { track?: (event: string, data: Record<string, string>) => void };

function trackUmami(event: string, data?: EventData): void {
  try {
    if (import.meta.env.DEV) {
      console.debug(`[trip:${event}]`, data ?? '');
    }
    const umami = (window as unknown as Record<string, unknown>).umami as UmamiTracker | undefined;
    if (!umami?.track) return;

    const safe: Record<string, string> = {};
    if (data) {
      for (const [k, v] of Object.entries(data)) {
        if (v !== undefined && v !== null) safe[k] = String(v);
      }
    }
    umami.track(event, safe);
  } catch {
    // Never let analytics break the app
  }
}

export function trackTripEvent(event: TripEventName, data?: EventData): void {
  trackUmami(event, data);
}

// ── Suggestion impressions (server-side) ───────────────────────
export type SuggestionType = 'accommodation' | 'flight' | 'rail' | 'bus' | 'packing_product';

interface ImpressionInput {
  tripId: string;
  type: SuggestionType;
  partnerId?: string | null;
  listingId?: string | null;
  externalUrl?: string | null;
  rankPosition?: number | null;
}

/**
 * Record a suggestion impression. Fire-and-forget —
 * batched on the client side by IntersectionObserver debounce
 * before calling this helper.
 */
export async function recordSuggestionImpression(input: ImpressionInput): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return;

    trackTripEvent(`${input.type === 'packing_product' ? 'packing' : 'reservation'}_suggestion_impression`, {
      trip_id: input.tripId,
      type: input.type,
      partner_id: input.partnerId ?? null,
      listing_id: input.listingId ?? null,
      rank: input.rankPosition ?? null,
    });

    await supabase.from('trip_suggestion_impressions').insert({
      trip_id: input.tripId,
      user_id: auth.user.id,
      suggestion_type: input.type,
      partner_id: input.partnerId ?? null,
      listing_id: input.listingId ?? null,
      external_url: input.externalUrl ?? null,
      rank_position: input.rankPosition ?? null,
    });
  } catch {
    // Silently swallow — analytics must never break UX
  }
}

// ── Affiliate click (server-side) ──────────────────────────────
interface ClickInput {
  tripId: string;
  /** Partner display name (e.g. "Aviasales", "Booking.com") — stored in trip_booking_clicks.provider */
  provider: string;
  type: SuggestionType;
  externalUrl: string;
  listingId?: string | null;
  rankPosition?: number | null;
}

/**
 * Record a click on a suggestion card before redirecting.
 * Uses the existing trip_booking_clicks table pattern.
 */
export async function recordSuggestionClick(input: ClickInput): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();

    trackTripEvent(
      input.type === 'packing_product' ? 'packing_suggestion_buy_click' : 'reservation_suggestion_click',
      {
        trip_id: input.tripId,
        type: input.type,
        provider: input.provider,
        listing_id: input.listingId ?? null,
        rank: input.rankPosition ?? null,
      },
    );
    trackTripEvent('affiliate_click', {
      trip_id: input.tripId,
      provider: input.provider,
      vertical: input.type,
    });

    await supabase.from('trip_booking_clicks').insert({
      trip_id: input.tripId,
      user_id: auth?.user?.id ?? null,
      provider: input.provider,
      vertical: input.type,
      destination_url: input.externalUrl,
    });
  } catch {
    // Silently swallow
  }
}
