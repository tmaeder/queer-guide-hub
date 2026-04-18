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

const GYG_PARTNER = '2PBDXWH';
const BOOKING_AID = '2381426';
const BOOKING_LABEL = 'queerguide-452012';

function gygCitySearch(query: string, date?: string | null): string {
  const params = new URLSearchParams({ q: query, partner_id: GYG_PARTNER });
  if (date) params.set('date_from', date);
  return `https://www.getyourguide.com/s/?${params.toString()}`;
}

function bookingHotelSearch(query: string, checkIn?: string | null, checkOut?: string | null): string {
  const params = new URLSearchParams({
    ss: query,
    aid: BOOKING_AID,
    label: BOOKING_LABEL,
  });
  if (checkIn) params.set('checkin', checkIn);
  if (checkOut) params.set('checkout', checkOut);
  return `https://www.booking.com/searchresults.html?${params.toString()}`;
}

interface BuildArgs {
  category: 'venue' | 'event' | 'hotel' | 'custom';
  name: string;
  cityName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
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
}: BuildArgs): BookableLink[] {
  const links: BookableLink[] = [];
  const query = cityName ?? name;
  if (!query) return links;

  if (category === 'hotel') {
    links.push({
      provider: 'booking',
      vertical: 'hotel',
      label: 'Book on Booking.com',
      url: bookingHotelSearch(name, startDate, endDate),
    });
    if (cityName) {
      links.push({
        provider: 'getyourguide',
        vertical: 'activity',
        label: 'Tours nearby',
        url: gygCitySearch(cityName, startDate),
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
      url: gygCitySearch(`${name} ${cityName}`.trim(), startDate),
    });
  }

  return links;
}
