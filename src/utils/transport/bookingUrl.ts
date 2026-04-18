/**
 * Booking.com affiliate deep-link builder.
 *
 * Uses Travelpayouts (aid=) for affiliate tracking.
 *
 *   https://www.booking.com/searchresults.html?ss=Berlin&checkin=2026-04-20&checkout=2026-04-25&group_adults=2&aid={AID}&no_rooms=1
 */

const BOOKING_AID = (import.meta as { env?: Record<string, string> }).env?.VITE_BOOKING_AID || '';

export interface BookingUrlParams {
  /** City name — Booking.com resolves via its own geocoder */
  destination: string;
  checkIn?: string | null;
  checkOut?: string | null;
  adults?: number;
  rooms?: number;
}

export function buildBookingUrl(params: BookingUrlParams): string {
  const { destination, checkIn, checkOut } = params;
  const adults = Math.max(1, Math.min(30, Math.round(params.adults ?? 2)));
  const rooms = Math.max(1, Math.min(10, Math.round(params.rooms ?? 1)));

  const qs = new URLSearchParams({
    ss: destination,
    group_adults: String(adults),
    no_rooms: String(rooms),
  });
  if (checkIn) qs.set('checkin', checkIn);
  if (checkOut) qs.set('checkout', checkOut);
  if (BOOKING_AID) qs.set('aid', BOOKING_AID);

  return `https://www.booking.com/searchresults.html?${qs.toString()}`;
}
