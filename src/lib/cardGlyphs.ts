import type { TransitIconName } from '@/components/transit/transitIconPaths';

/**
 * The mark a hotel or personality card stands behind: drawn in the station
 * disc of an image-less plate and on the station badge of a photo card.
 * Venues and events take theirs from `venueCategoryIcon` / `eventTypeIcon`.
 */
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

export const HOTEL_GLYPH_MAP = HOTEL_GLYPHS;

/** News `category_canonical` (closed list); anything else gets the news mark. */
const NEWS_GLYPHS: Record<string, TransitIconName> = {
  'culture-arts': 'palette',
  'rights-legal': 'landmark',
  community: 'community',
  politics: 'megaphone',
  'health-wellness': 'health',
  technology: 'screen',
  sports: 'gym',
  education: 'education',
  'business-economy': 'briefcase',
  international: 'globe',
};

export function newsGlyph(category: string | null | undefined): TransitIconName {
  return (category && NEWS_GLYPHS[category]) || 'news';
}

export const NEWS_GLYPH_MAP = NEWS_GLYPHS;
