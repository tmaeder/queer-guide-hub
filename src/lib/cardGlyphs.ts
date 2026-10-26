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

const HOTEL_GLYPHS: Record<string, TransitIconName> = {
  hotel: 'housing',
  bnb: 'home-base',
  hostel: 'community',
  guesthouse: 'home-base',
  apartment: 'home-base',
  resort: 'waves',
  other: 'housing',
};

export function hotelGlyph(type: string | null | undefined): TransitIconName {
  return (type && HOTEL_GLYPHS[type]) || 'housing';
}

/**
 * Professions are an open vocabulary, so this matches by keyword, in order —
 * `singer-songwriter` hits `singer`, `drag king` hits `drag`. The list covers
 * the professions that make up ~90% of public profiles (measured 2026-10-26);
 * anything else gets the neutral person mark rather than a guess.
 */
const PERSON_GLYPHS: Array<[RegExp, TransitIconName]> = [
  [/\bdrag\b/, 'wig'],
  [/activist/, 'march'],
  [/politician|military/, 'megaphone'],
  [/\bactor|actress|tv presenter|entertainer/, 'theater'],
  [/singer|rapper/, 'mic'],
  [/musician|composer|producer|dj\b/, 'music'],
  [/writer|poet|author|journalist/, 'library'],
  [/artist|designer|architect/, 'palette'],
  [/photograph/, 'image'],
  [/director|filmmaker|youtuber/, 'film'],
  [/research|scientist|physician|teacher/, 'chart'],
  [/athlete/, 'gym'],
  [/comedian/, 'smile'],
  [/collective/, 'community'],
  [/dancer/, 'disco'],
  [/chef/, 'restaurant'],
];

export function personGlyph(profession: string | null | undefined): TransitIconName {
  const p = (profession ?? '').toLowerCase();
  for (const [re, glyph] of PERSON_GLYPHS) if (re.test(p)) return glyph;
  return 'profile';
}

export function venueGlyph(category: string | null | undefined): TransitIconName {
  return (category && VENUE_GLYPHS[category]) || 'pin';
}

export function eventGlyph(type: string | null | undefined): TransitIconName {
  return (type && EVENT_GLYPHS[type]) || 'events';
}

export const HOTEL_GLYPH_MAP = HOTEL_GLYPHS;
export const VENUE_GLYPH_MAP = VENUE_GLYPHS;
export const EVENT_GLYPH_MAP = EVENT_GLYPHS;
