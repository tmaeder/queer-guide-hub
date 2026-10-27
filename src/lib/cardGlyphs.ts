import type { TransitIconName } from '@/components/transit/transitIconPaths';
import { iconSlug } from '@/components/icons';
import { VENUE_CATEGORY_ICONS } from '@/components/venues/venueCategoryIcon';
import { EVENT_TYPE_ICONS } from '@/components/events/eventTypeIcon';

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

/**
 * A guide's `category` is free text drawn from whichever family it covers —
 * a venue category (`bar`, `sauna`), an event type (`pride`) or a shopping
 * label — so it is resolved against those vocabularies first, then a few
 * guide-only labels, then the format's own mark.
 */
const GUIDE_CATEGORY_GLYPHS: Record<string, TransitIconName> = {
  shopping: 'shop',
  products: 'shop',
  services: 'briefcase',
};
/** Shopping lists all share one category, so their title names the department. */
const SHOPPING_TITLE_GLYPHS: Array<[RegExp, TransitIconName]> = [
  [/jewel|ring|earring|necklace/i, 'jewelry'],
  [/underwear|brief|jock|boxer|bra\b/i, 'underwear'],
  [/swim/i, 'swimwear'],
  [/apparel|tee|shirt|sock|clothing|wear/i, 'apparel'],
  [/book|art|print|zine|tarot/i, 'library'],
  [/home|candle|decor|kitchen/i, 'homeware'],
  [/groom|skin|care|beauty|fragrance/i, 'selfcare'],
  [/toy|intima|kink|fetish/i, 'intimacy'],
];

const GUIDE_FORMAT_GLYPHS: Record<string, TransitIconName> = {
  guide: 'library',
  list: 'list',
  quest: 'flag',
};

export function guideGlyph(
  category: string | null | undefined,
  format: string | null | undefined,
  title?: string | null,
): TransitIconName {
  const c = (category ?? '').toLowerCase();
  if ((c === 'shopping' || c === 'products') && title) {
    for (const [re, glyph] of SHOPPING_TITLE_GLYPHS) if (re.test(title)) return glyph;
  }
  const fromVocab =
    iconSlug(VENUE_CATEGORY_ICONS[c as keyof typeof VENUE_CATEGORY_ICONS]) ??
    iconSlug(EVENT_TYPE_ICONS[c as keyof typeof EVENT_TYPE_ICONS]);
  return (
    fromVocab ??
    GUIDE_CATEGORY_GLYPHS[c] ??
    (format ? GUIDE_FORMAT_GLYPHS[format] : undefined) ??
    'library'
  );
}

/**
 * An organization holds several roles; the card shows the one a reader most
 * needs to know first, so support and advocacy outrank trading roles.
 */
const ORG_ROLE_GLYPHS: Array<[string, TransitIconName]> = [
  ['support', 'lifebuoy'],
  ['advocacy', 'megaphone'],
  ['publisher', 'news'],
  ['organizer', 'events'],
  ['community', 'community'],
  ['venue', 'pin'],
  ['hotel', 'housing'],
  ['seller', 'shop'],
  ['brand', 'tag'],
  ['affiliate_partner', 'link'],
];

export function orgGlyph(roles: readonly string[] | null | undefined): TransitIconName {
  for (const [role, glyph] of ORG_ROLE_GLYPHS) if (roles?.includes(role)) return glyph;
  return 'building';
}

export const ORG_ROLE_GLYPH_LIST = ORG_ROLE_GLYPHS;

/**
 * A city's mark says what KIND of city it is, which is the one thing the
 * picture above it cannot: a capital and a market town draw the same plate.
 * National outranks regional, mirroring the Status line on the city page.
 */
export function cityGlyph(
  city: { is_capital?: boolean | null; is_regional_capital?: boolean | null } | null | undefined,
): TransitIconName {
  if (city?.is_capital) return 'crown';
  if (city?.is_regional_capital) return 'landmark';
  return 'building';
}

/**
 * The mark for a mixed-type card, such as a "More like this" neighbour, where
 * the only facts at hand are the content type and maybe a category. A venue
 * keeps its own category mark; every other type takes its family's mark, which
 * is the same disc that type's own card draws when it has no finer signal.
 */
const CONTENT_TYPE_GLYPHS: Record<string, TransitIconName> = {
  venue: 'pin',
  event: 'events',
  hotel: 'housing',
  news: 'news',
  marketplace: 'shop',
  personality: 'profile',
  person: 'profile',
  city: 'building',
  country: 'globe',
  queer_village: 'pin',
  village: 'pin',
  landmark: 'landmark',
  guide: 'library',
  organization: 'building',
  group: 'community',
  milestone: 'flag',
  tag: 'tag',
};

export function contentTypeGlyph(type: string, category?: string | null): TransitIconName {
  if (type === 'venue' && category) {
    const fromVocab = iconSlug(
      VENUE_CATEGORY_ICONS[category.toLowerCase() as keyof typeof VENUE_CATEGORY_ICONS],
    );
    if (fromVocab) return fromVocab;
  }
  return CONTENT_TYPE_GLYPHS[type] ?? 'pin';
}
