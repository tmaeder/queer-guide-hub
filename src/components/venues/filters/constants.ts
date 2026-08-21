// Shared constants + types for the venue filter surface.
// Extracted from VenueFilters.tsx (behavior-preserving decomposition).
import { VENUE_CATEGORIES, VENUE_CATEGORY_OPTIONS } from '@/lib/venueCategories';

// Re-exported from the single source of truth so the filter chips can never drift from
// venues_category_check. The previous hand-maintained list omitted cafe, outdoor, shop
// and cruising — four categories with real rows behind them (outdoor alone has 1,203).
export const categories = VENUE_CATEGORIES;

export const categoryLabels: Record<string, string> = Object.fromEntries(
  VENUE_CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
);

export const commonAmenities = [
  'wifi',
  'parking',
  'wheelchair-accessible',
  'outdoor-seating',
  'pet-friendly',
  'live-music',
  'happy-hour',
  'food-service',
  'full-bar',
  'cocktails',
  'beer-garden',
  'private-rooms',
  'dance-floor',
  'pool-table',
  'trivia-nights',
];

export const commonServices = [
  'event-hosting',
  'private-parties',
  'catering',
  'drag-shows',
  'karaoke-nights',
  'live-entertainment',
  'dj-services',
  'theme-nights',
  'workshops',
  'community-events',
  'support-groups',
  'dating-events',
  'trivia-hosting',
  'comedy-shows',
  'art-exhibitions',
];

// `xStyle` lived here: a negative-margin hit-area shim that existed only to give
// an unfocusable `<X role="button">` a tap target. Both remove controls are real
// <button>s now and carry their own padding, so it has no callers.

/** A selectable facet option. */
export interface FilterOption {
  key: string;
  label: string;
  color?: string;
}

/** Shape emitted by VenueFilters' onFiltersChange callback. */
export interface VenueFilterValues {
  search?: string;
  city?: string;
  category?: string;
  tags?: string[];
  amenities?: string[];
  services?: string[];
  accessibilityAttributes?: string[];
  targetGroups?: string[];
  userLocation?: { latitude: number; longitude: number };
  nearMe?: boolean;
}
