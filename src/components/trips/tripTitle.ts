import type { TFunction } from 'i18next';
import type { Trip } from '@/hooks/useTrips';

const FALLBACK_KEY = 'trips.dialog.create.defaultTitle';

/**
 * Resolve a trip's display title. Guards against:
 *  - empty/null titles (legacy rows or edge cases)
 *  - the raw i18n key being persisted as the title (bug shipped before)
 *
 * Always returns a localized string — never a raw translation key.
 */
export function resolveTripTitle(
  trip: Pick<Trip, 'title' | 'primary_city_name'>,
  t: TFunction,
): string {
  const raw = trip.title?.trim();
  const city = trip.primary_city_name?.trim();

  if (raw && raw !== FALLBACK_KEY) return raw;

  if (city) return t(FALLBACK_KEY, { city });
  return t('trips.card.untitled', 'Untitled trip');
}
