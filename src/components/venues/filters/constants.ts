// Shared constants + types for the venue filter surface.
// Extracted from VenueFilters.tsx (behavior-preserving decomposition).

export const categories = [
  'bar',
  'restaurant',
  'club',
  'hotel',
  'sauna',
  'community_center',
  'theater',
  'gallery',
  'gym',
  'salon',
  'organization',
  'event-venue',
  'other',
] as const;

export const categoryLabels: Record<string, string> = {
  bar: 'Bar',
  restaurant: 'Restaurant',
  club: 'Club',
  hotel: 'Hotel',
  sauna: 'Sauna',
  community_center: 'Community',
  theater: 'Theater',
  gallery: 'Gallery',
  gym: 'Gym',
  salon: 'Salon',
  organization: 'Organization',
  'event-venue': 'Event Venue',
  other: 'Other',
};

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

/** Shared remove-badge X hit-area style (12px glyph, 8px padding for tap target). */
export const xStyle = {
  width: 12,
  height: 12,
  cursor: 'pointer',
  padding: 8,
  margin: -8,
  boxSizing: 'content-box' as const,
};

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
