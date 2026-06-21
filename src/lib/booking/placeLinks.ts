/**
 * Per-place affiliate deep links.
 *
 * Builds direct affiliate search URLs for a single trip place — no
 * extra API calls, no inline catalog. The aim is the lowest-friction
 * "find tours / book hotel" exit ramp from the itinerary.
 *
 * Partner IDs match the ones used elsewhere:
 *   - GetYourGuide  → partner_id 2PBDXWH
 *   - Booking.com   → aid 2381426 + label queerguide-452012
 *   - Aviasales     → marker 452012 (handled in utils/aviasalesUrl)
 */

export type BookableVertical = 'hotel' | 'activity' | 'flight' | 'restaurant' | 'other';

export interface BookableLink {
  provider: string;
  vertical: BookableVertical;
  label: string;
  url: string;
}

import { GYG_PARTNER, BOOKING_AID, BOOKING_LABEL_BASE, type AffiliateSurface } from '@/lib/affiliate/config';
import { applySubId } from '@/lib/affiliate/links';

function gygCitySearch(query: string, date: string | null | undefined, surface: AffiliateSurface): string {
  const params = new URLSearchParams({ q: query, partner_id: GYG_PARTNER });
  if (date) params.set('date_from', date);
  return applySubId(`https://www.getyourguide.com/s/?${params.toString()}`, 'getyourguide', surface);
}

function bookingHotelSearch(
  query: string,
  checkIn: string | null | undefined,
  checkOut: string | null | undefined,
  surface: AffiliateSurface,
): string {
  const params = new URLSearchParams({ ss: query, aid: BOOKING_AID, label: BOOKING_LABEL_BASE });
  if (checkIn) params.set('checkin', checkIn);
  if (checkOut) params.set('checkout', checkOut);
  return applySubId(`https://www.booking.com/searchresults.html?${params.toString()}`, 'booking', surface);
}

interface BuildArgs {
  category: 'venue' | 'event' | 'hotel' | 'custom';
  name: string;
  cityName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  /** Originating surface for sub-id attribution. Defaults from category. */
  surface?: AffiliateSurface;
}

/**
 * Returns 0–2 affiliate links suitable for the place.
 * Returns empty array when there's nothing useful to link (e.g. no
 * city + no name → no meaningful query).
 */
export function buildPlaceBookableLinks({
  category,
  name,
  cityName,
  startDate,
  endDate,
  surface,
}: BuildArgs): BookableLink[] {
  const links: BookableLink[] = [];
  const query = cityName ?? name;
  if (!query) return links;

  const sub: AffiliateSurface = surface ?? (category === 'hotel' ? 'hotel' : category === 'event' ? 'event' : 'venue');

  if (category === 'hotel') {
    links.push({
      provider: 'booking',
      vertical: 'hotel',
      label: 'Book on Booking.com',
      url: bookingHotelSearch(name, startDate, endDate, sub),
    });
    if (cityName) {
      links.push({
        provider: 'getyourguide',
        vertical: 'activity',
        label: 'Tours nearby',
        url: gygCitySearch(cityName, startDate, sub),
      });
    }
    return links;
  }

  // Venues + events + custom: tours/tickets in the surrounding city.
  if (cityName) {
    links.push({
      provider: 'getyourguide',
      vertical: 'activity',
      label: 'Tours & tickets',
      url: gygCitySearch(`${name} ${cityName}`.trim(), startDate, sub),
    });
  }

  return links;
}
