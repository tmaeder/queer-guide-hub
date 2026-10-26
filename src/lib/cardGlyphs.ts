import type { TransitIconName } from '@/components/transit/transitIconPaths';
import type { VenueCategory } from '@/lib/venueCategories';
import type { EventType } from '@/lib/eventTypes';

/**
 * The one mark a venue or event card stands behind: drawn in the station disc
 * of an image-less plate, on the station badge of a photo card, and beside the
 * category label. One map per entity so those three can never disagree.
 */
const VENUE_GLYPHS: Record<string, TransitIconName> = {
  bar: 'nightlife',
  club: 'disco',
  cafe: 'cafe',
  restaurant: 'restaurant',
  hotel: 'housing',
  sauna: 'sauna',
  cruising: 'walk',
  outdoor: 'outdoor',
  shop: 'shop',
  community_center: 'community',
  'event-venue': 'events',
  theater: 'theater',
  gallery: 'gallery',
  salon: 'salon',
  gym: 'gym',
  toilet: 'restroom',
  other: 'pin',
} satisfies Record<Exclude<VenueCategory, string & {}> | string, TransitIconName>;

const EVENT_GLYPHS: Record<string, TransitIconName> = {
  party: 'disco',
  festival: 'sparkle',
  cruise: 'boat',
  pride: 'pride',
  meetup: 'meetups',
  workshop: 'library',
  concert: 'mic',
  comedy: 'smile',
  conference: 'chart',
  film: 'film',
  drag: 'sparkle',
  sports: 'gym',
  art: 'palette',
  exhibition: 'gallery',
  theater: 'theater',
  fundraiser: 'care',
  protest: 'march',
  social: 'cafe',
  community: 'community',
  fair: 'shop',
  fetish: 'gear-fetish',
  other: 'events',
} satisfies Record<Exclude<EventType, string & {}> | string, TransitIconName>;

export function venueGlyph(category: string | null | undefined): TransitIconName {
  return (category && VENUE_GLYPHS[category]) || 'pin';
}

export function eventGlyph(type: string | null | undefined): TransitIconName {
  return (type && EVENT_GLYPHS[type]) || 'events';
}

export const VENUE_GLYPH_MAP = VENUE_GLYPHS;
export const EVENT_GLYPH_MAP = EVENT_GLYPHS;
