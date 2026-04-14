import type { BookingProvider, BookingSearchParams, BookingResult } from '../types';

const MARKER = '452012';

/**
 * Viator Activity Provider (TripAdvisor owned)
 *
 * Uses affiliate search links via Travelpayouts.
 * Viator doesn't expose a public search API for small affiliates,
 * so we generate deep-linked search URLs with affiliate tracking.
 *
 * Supplements GetYourGuide with different inventory (especially US/UK).
 */
export const viatorProvider: BookingProvider = {
  name: 'viator',
  vertical: 'activity',
  supportsInApp: false,

  async search(params: BookingSearchParams): Promise<BookingResult[]> {
    const { cityName, checkIn, limit = 6 } = params;
    if (!cityName) return [];

    // Viator doesn't have a free search API — return curated search link cards
    // categorized by popular activity types for the city
    const categories = [
      { name: 'Tours & Sightseeing', slug: 'tours', icon: 'map' },
      { name: 'Food & Drink', slug: 'food-tours', icon: 'utensils' },
      { name: 'Day Trips', slug: 'day-trips', icon: 'compass' },
      { name: 'Nightlife', slug: 'nightlife', icon: 'moon' },
      { name: 'Museums & Culture', slug: 'museums', icon: 'landmark' },
      { name: 'Outdoor Activities', slug: 'outdoor', icon: 'mountain' },
    ];

    return categories.slice(0, limit).map((cat, i) => ({
      id: `viator-${cityName}-${cat.slug}-${i}`,
      provider: 'viator',
      vertical: 'activity' as const,
      title: `${cat.name} in ${cityName}`,
      subtitle: `Browse ${cat.name.toLowerCase()} on Viator`,
      price: 0,
      currency: 'EUR',
      category: cat.slug,
      bookingUrl: buildViatorUrl(cityName, cat.slug, checkIn),
      supportsInApp: false,
    }));
  },

  getBookingUrl(result: BookingResult): string {
    return result.bookingUrl || `https://www.viator.com/?pid=P00089289&mcid=42383&medium=link`;
  },
};

function buildViatorUrl(city: string, category: string, date?: string): string {
  const citySlug = city.toLowerCase().replace(/\s+/g, '-');
  const params = new URLSearchParams();
  params.set('pid', 'P00089289');
  params.set('mcid', '42383');
  params.set('medium', 'link');
  if (date) params.set('startDate', date);
  return `https://www.viator.com/${citySlug}/d${category}?${params.toString()}`;
}
