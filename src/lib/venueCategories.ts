import { useTranslation } from 'react-i18next';

/**
 * Single source of truth for `venues.category`.
 *
 * Must stay in sync with the DB CHECK constraint `venues_category_check`. A drift test
 * (`src/lib/__tests__/venueCategories.test.ts`) asserts this list matches the constraint
 * values recorded there.
 *
 * Before this existed there were five divergent copies. The costly one was the admin CMS
 * select (`src/config/contentTypes/venue.ts`), which offered `beach`, `cruise_club` and
 * `bookstore` — none of them legal — so choosing them produced a hard constraint
 * violation on save; it also omitted `organization` and `event-venue`, which are legal
 * and in use. Other copies offered `gym`/`salon` combinations matching ~2 rows total.
 *
 * Mirrors the shape of `src/lib/eventTypes.ts` deliberately: same exports, same i18n
 * hook, so both taxonomies are consumed identically.
 */
export const VENUE_CATEGORIES = [
  'bar',
  'club',
  'cafe',
  'restaurant',
  'hotel',
  'sauna',
  'cruising',
  'outdoor',
  'shop',
  'community_center',
  'organization',
  'event-venue',
  'theater',
  'gallery',
  'salon',
  'gym',
  'toilet',
  'other',
] as const;

export type VenueCategory = (typeof VENUE_CATEGORIES)[number];

const FALLBACK_LABELS: Record<VenueCategory, string> = {
  bar: 'Bar',
  club: 'Club',
  cafe: 'Café',
  restaurant: 'Restaurant',
  hotel: 'Hotel',
  sauna: 'Sauna',
  cruising: 'Cruising',
  outdoor: 'Outdoor',
  shop: 'Shop',
  community_center: 'Community',
  organization: 'Organization',
  'event-venue': 'Event Venue',
  theater: 'Theater',
  gallery: 'Gallery',
  salon: 'Salon',
  gym: 'Gym',
  toilet: 'Restroom',
  other: 'Other',
};

export interface VenueCategoryOption {
  value: VenueCategory;
  label: string;
}

/** English-label options — safe to use outside React/i18n context. */
export const VENUE_CATEGORY_OPTIONS: VenueCategoryOption[] = VENUE_CATEGORIES.map((value) => ({
  value,
  label: FALLBACK_LABELS[value],
}));

/** Translated options keyed by `venueCategories.<value>` in the current locale. */
export function useVenueCategoryOptions(): VenueCategoryOption[] {
  const { t } = useTranslation();
  return VENUE_CATEGORIES.map((value) => ({
    value,
    label: t(`venueCategories.${value}`, { defaultValue: FALLBACK_LABELS[value] }),
  }));
}
