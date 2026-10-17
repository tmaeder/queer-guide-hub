import {
  useClassificationOptions,
  useManagedLabel,
  classificationSource,
} from '@/hooks/useManagedOptions';
import { useTranslation } from 'react-i18next';

/**
 * Seed values and offline labels for place categories.
 * Runtime options come from the backend-managed venue_category vocabulary.
 * Stable values keep existing URLs and records working when labels change.
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
  'event-venue',
  'theater',
  'gallery',
  'salon',
  'gym',
  'toilet',
  'other',
] as const;

export type VenueCategory = (typeof VENUE_CATEGORIES)[number] | (string & {});

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
export function useVenueCategoryOptions(selected?: unknown): VenueCategoryOption[] {
  const { t } = useTranslation();
  const fallback = VENUE_CATEGORIES.map((value) => ({
    value,
    label: t(`venueCategories.${value}`, { defaultValue: FALLBACK_LABELS[value] }),
  }));
  return useClassificationOptions('venue_category', fallback, selected);
}

export function useVenueCategoryLabel(value: string | null | undefined): string {
  const { t } = useTranslation();
  const seed = FALLBACK_LABELS[value ?? ''];
  return useManagedLabel(
    classificationSource('venue_category'),
    value,
    value ? t(`venueCategories.${value}`, { defaultValue: seed ?? value }) : '',
    seed,
  );
}
