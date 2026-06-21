/**
 * Travelpayouts affiliate — single source of truth.
 *
 * One marker, one place. Every affiliate deep-link in the app derives its
 * partner id + sub-id attribution from this registry instead of hardcoding
 * `452012` / `2381426` / `2PBDXWH` across a dozen files.
 *
 * Travelpayouts is a single-account aggregator: the one marker below unlocks
 * Aviasales, Booking.com, GetYourGuide, Hotels.com, DiscoverCars, Airalo,
 * Heymondo, Kiwitaxi, Compensair, … Each partner carries the per-click
 * "which surface earned this" tag in its OWN native field — captured by
 * `subField` here and applied in links.ts.
 */

/** Travelpayouts account marker. Overridable via env for staging. */
export const TRAVELPAYOUTS_MARKER =
  (import.meta as { env?: Record<string, string> }).env?.VITE_TRAVELPAYOUTS_MARKER || '452012';

/** Booking.com affiliate id (Travelpayouts-issued). */
export const BOOKING_AID =
  (import.meta as { env?: Record<string, string> }).env?.VITE_BOOKING_AID || '2381426';

/** Base of the Booking.com `label` — surface gets appended: `${BASE}-${surface}`. */
export const BOOKING_LABEL_BASE = `queerguide-${TRAVELPAYOUTS_MARKER}`;

/** GetYourGuide partner id. */
export const GYG_PARTNER =
  (import.meta as { env?: Record<string, string> }).env?.VITE_GYG_PARTNER || '2PBDXWH';

/**
 * Surface taxonomy — the attribution dimension the app has been missing.
 * Every CTA tags its origin with one of these so Travelpayouts stats (and our
 * own affiliate_clicks table) can report revenue per surface.
 */
export const AFFILIATE_SURFACES = [
  'venue',
  'event',
  'city',
  'country',
  'news',
  'personality',
  'hotel',
  'hotel_list',
  'trip',
  'trip_suggest',
  'map',
  'marketplace',
  'esim',
  'insurance',
  'transfer',
] as const;

export type AffiliateSurface = (typeof AFFILIATE_SURFACES)[number];

export type AffiliateVertical =
  | 'flight'
  | 'hotel'
  | 'activity'
  | 'rail'
  | 'bus'
  | 'car'
  | 'transfer'
  | 'esim'
  | 'insurance'
  | 'other';

/**
 * How a partner carries the surface sub-id in its URL:
 *   - 'sub_id'        → `&sub_id=<surface>` (Travelpayouts-native brands)
 *   - 'booking_label' → fold into the Booking.com `label` param
 *   - 'gyg_placement' → `&placement=<surface>` (GetYourGuide)
 */
export type SubField = 'sub_id' | 'booking_label' | 'gyg_placement';

export interface PartnerConfig {
  /** Stable key used in /go links + affiliate_clicks.partner. */
  key: string;
  /** Display name (matches affiliate_partners.partner_name / trip_booking_clicks.provider). */
  name: string;
  vertical: AffiliateVertical;
  subField: SubField;
  /** Host used to recognise already-built URLs (no scheme). */
  host: string;
}

export const PARTNERS: Record<string, PartnerConfig> = {
  aviasales: { key: 'aviasales', name: 'Aviasales', vertical: 'flight', subField: 'sub_id', host: 'aviasales.com' },
  booking: { key: 'booking', name: 'Booking.com', vertical: 'hotel', subField: 'booking_label', host: 'booking.com' },
  hotellook: { key: 'hotellook', name: 'Hotellook', vertical: 'hotel', subField: 'sub_id', host: 'search.hotellook.com' },
  hotelscom: { key: 'hotelscom', name: 'Hotels.com', vertical: 'hotel', subField: 'sub_id', host: 'hotels.com' },
  getyourguide: { key: 'getyourguide', name: 'GetYourGuide', vertical: 'activity', subField: 'gyg_placement', host: 'getyourguide.com' },
  discovercars: { key: 'discovercars', name: 'DiscoverCars', vertical: 'car', subField: 'sub_id', host: 'discovercars.com' },
  kiwitaxi: { key: 'kiwitaxi', name: 'Kiwitaxi', vertical: 'transfer', subField: 'sub_id', host: 'kiwitaxi.com' },
  airalo: { key: 'airalo', name: 'Airalo', vertical: 'esim', subField: 'sub_id', host: 'airalo.com' },
  heymondo: { key: 'heymondo', name: 'Heymondo', vertical: 'insurance', subField: 'sub_id', host: 'heymondo.com' },
  compensair: { key: 'compensair', name: 'Compensair', vertical: 'other', subField: 'sub_id', host: 'compensair.com' },
};

export function getPartner(key: string): PartnerConfig | null {
  return PARTNERS[key] ?? null;
}

export function isAffiliateSurface(value: string): value is AffiliateSurface {
  return (AFFILIATE_SURFACES as readonly string[]).includes(value);
}
