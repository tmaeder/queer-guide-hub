import type { TransitIconName } from '@/components/transit/transitIconPaths';
import type { LayerType } from '@/hooks/useExploreMapData';

/**
 * Map glyphs, in the wayfinding icon set.
 *
 * These were lucide until 2026-08-10 — the map was the one surface in the
 * product where two icon systems met, which the design system explicitly
 * forbids ("never mix with off-system sets in the same surface"). It is also
 * the surface where it mattered most: the map IS the wayfinding artefact.
 */

/** Venue category → icon. Keys match the `venues.category` values in the DB. */
const VENUE_CATEGORY_ICONS: Record<string, TransitIconName> = {
  bar: 'nightlife',
  club: 'disco',
  restaurant: 'restaurant',
  hotel: 'home-base',
  sauna: 'sauna',
  community_center: 'community',
  'event-venue': 'events',
  event_venue: 'events',
  theater: 'theater',
  salon: 'salon',
  gallery: 'gallery',
  gym: 'gym',
  organization: 'library',
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
    const key = category.toLowerCase().replace(/[\s-]+/g, '_');
    if (VENUE_CATEGORY_ICONS[key]) return VENUE_CATEGORY_ICONS[key];
  }
  return LAYER_FALLBACK_ICONS[type] ?? 'near-you';
}

/** A short, human label for a category (Title Case, underscores → spaces). */
export function categoryLabel(category?: string | null): string {
  if (!category) return '';
  return category.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const normalize = (s: string) => s.toLowerCase().replace(/[\s-]+/g, '_');

/**
 * Stable image-id for a marker's canvas glyph. Venues key off their category
 * (when known), everything else keys off its layer type. Matches the keys in
 * GLYPH_DEFS below so the rasterized image exists.
 */
export function glyphKeyFor(type: LayerType, category?: string | null): string {
  if (type === 'venues' && category && VENUE_CATEGORY_ICONS[normalize(category)]) {
    return `cat:${normalize(category)}`;
  }
  return `type:${type}`;
}

/** Every (glyph-key → icon) pair the map needs to rasterize into map images. */
export const GLYPH_DEFS: { key: string; icon: TransitIconName }[] = [
  ...Object.entries(VENUE_CATEGORY_ICONS).map(([cat, icon]) => ({ key: `cat:${cat}`, icon })),
  ...(Object.entries(LAYER_FALLBACK_ICONS) as [LayerType, TransitIconName][]).map(
    ([type, icon]) => ({ key: `type:${type}`, icon }),
  ),
];
