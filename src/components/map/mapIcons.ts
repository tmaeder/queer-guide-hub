import type { TransitIconName } from '@/components/transit/transitIconPaths';
import type { LayerType } from '@/hooks/useExploreMapData';
import type { VenueCategory } from '@/lib/venueCategories';

/**
 * Map glyphs, in the wayfinding icon set.
 *
 * These were lucide until 2026-08-10 — the map was the one surface in the
 * product where two icon systems met, which the design system explicitly
 * forbids ("never mix with off-system sets in the same surface"). It is also
 * the surface where it mattered most: the map IS the wayfinding artefact.
 */

/**
 * Venue category → icon. Keys are EXACTLY the `venues.category` values.
 *
 * Typed against `VenueCategory` (the drift-tested single source of truth for
 * the DB CHECK) rather than `string`, so a key that is not a legal category is
 * a compile error. That removed two: `event_venue`, which existed only because
 * the LOOKUP used to rewrite hyphens to underscores and so could never find
 * the real `'event-venue'`; and `organization`, retired from the vocabulary by
 * migration `20260915140000`.
 *
 * `Partial` on purpose: an absent category falls through to the layer
 * fallback, which is how `other` has always resolved. Making it exhaustive
 * would force an entry for `other` and mint a `cat:other` glyph image for the
 * same icon the fallback already draws.
 */
const VENUE_CATEGORY_ICONS: Partial<Record<VenueCategory, TransitIconName>> = {
  bar: 'nightlife',
  club: 'disco',
  restaurant: 'restaurant',
  hotel: 'home-base',
  sauna: 'sauna',
  community_center: 'community',
  'event-venue': 'events',
  theater: 'theater',
  salon: 'salon',
  gallery: 'gallery',
  gym: 'gym',
  cafe: 'cafe',
  shop: 'shop',
  outdoor: 'outdoor',
  // Cruising grounds get the discreet mark, not a literal one.
  cruising: 'after-dark',
  toilet: 'restroom',
};

const LAYER_FALLBACK_ICONS: Record<LayerType, TransitIconName> = {
  venues: 'near-you',
  events: 'events',
  restrooms: 'restroom',
  hotels: 'home-base',
  // Queer villages are districts, not landmarks.
  neighbourhoods: 'pride',
  cities: 'community',
  countries: 'compass',
};

/** Resolve the best icon for a marker given its layer type + optional category. */
export function iconForMarker(type: LayerType, category?: string | null): TransitIconName {
  if (type === 'venues' && category) {
    const icon = VENUE_CATEGORY_ICONS[canon(category)];
    if (icon) return icon;
  }
  return LAYER_FALLBACK_ICONS[type] ?? 'near-you';
}

/** A short, human label for a category (Title Case, underscores → spaces). */
export function categoryLabel(category?: string | null): string {
  if (!category) return '';
  return category.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Normalise a category to its DB spelling.
 *
 * Case and surrounding whitespace only — deliberately NOT hyphen→underscore,
 * which is what forced a duplicate `event_venue` key: the legal category is
 * `'event-venue'`, so rewriting the separator made the real key unreachable
 * and only the duplicate ever matched.
 */
const canon = (s: string) => s.trim().toLowerCase() as VenueCategory;

/**
 * Stable image-id for a marker's canvas glyph. Venues key off their category
 * (when known), everything else keys off its layer type. Matches the keys in
 * GLYPH_DEFS below so the rasterized image exists.
 */
export function glyphKeyFor(type: LayerType, category?: string | null): string {
  if (type === 'venues' && category && VENUE_CATEGORY_ICONS[canon(category)]) {
    return `cat:${canon(category)}`;
  }
  return `type:${type}`;
}

/**
 * Station-state badges, drawn on a pin's upper-right by `STATE_BADGE_LAYER`.
 *
 * Preloaded through `GLYPH_DEFS` like every other map image, so no
 * missing-image resolver change is needed.
 *
 * SAVED ONLY, deliberately. There is no visited/check mark among the 74
 * transit icons, and inventing one is a design-system change with its own
 * grammar (one stroke weight, bends not corners, one station ring, round
 * terminals) rather than something to improvise here. The established
 * treatment for visited elsewhere in the app is DIMMING, not a badge —
 * `TripMap` drops visited markers to 0.3 opacity and `EntityMap` offers an
 * all / only-visited / hide-visited cycle — and choosing whether a discovery
 * map should dim a place you have been to is a product decision, not a
 * rendering detail. `visited` is carried on the feature so it is ready.
 */
export const STATE_BADGE_ICONS = {
  'state:saved': 'saved',
} as const satisfies Record<string, TransitIconName>;

/** Every (glyph-key → icon) pair the map needs to rasterize into map images. */
export const GLYPH_DEFS: { key: string; icon: TransitIconName }[] = [
  ...Object.entries(VENUE_CATEGORY_ICONS).map(([cat, icon]) => ({ key: `cat:${cat}`, icon })),
  ...(Object.entries(LAYER_FALLBACK_ICONS) as [LayerType, TransitIconName][]).map(
    ([type, icon]) => ({ key: `type:${type}`, icon }),
  ),
  ...Object.entries(STATE_BADGE_ICONS).map(([key, icon]) => ({ key, icon })),
];
