import {
  MapPin,
  Wine,
  Music,
  UtensilsCrossed,
  Hotel,
  Users,
  Drama,
  Scissors,
  Image as ImageIcon,
  Dumbbell,
  Building2,
  Flame,
  Calendar,
  Accessibility,
  Landmark,
  Globe,
  Coffee,
  ShoppingBag,
  Trees,
  VenetianMask,
  type LucideIcon,
} from 'lucide-react';
import type { LayerType } from '@/hooks/useExploreMapData';

/** Venue category → icon. Keys match the `venues.category` values in the DB. */
const VENUE_CATEGORY_ICONS: Record<string, LucideIcon> = {
  bar: Wine,
  club: Music,
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  hotel: Hotel,
  sauna: Flame,
  shop: ShoppingBag,
  outdoor: Trees,
  cruising: VenetianMask,
  community_center: Users,
  'event-venue': Calendar,
  event_venue: Calendar,
  theater: Drama,
  salon: Scissors,
  gallery: ImageIcon,
  gym: Dumbbell,
  organization: Building2,
};

const LAYER_FALLBACK_ICONS: Record<LayerType, LucideIcon> = {
  venues: MapPin,
  events: Calendar,
  restrooms: Accessibility,
  hotels: Hotel,
  neighbourhoods: Landmark,
  cities: Building2,
  countries: Globe,
};

/** Resolve the best icon for a marker given its layer type + optional category. */
export function iconForMarker(type: LayerType, category?: string | null): LucideIcon {
  if (type === 'venues' && category) {
    const key = category.toLowerCase().replace(/[\s-]+/g, '_');
    if (VENUE_CATEGORY_ICONS[key]) return VENUE_CATEGORY_ICONS[key];
  }
  return LAYER_FALLBACK_ICONS[type] ?? MapPin;
}

/** A short, human label for a category (Title Case, underscores → spaces). */
export function categoryLabel(category?: string | null): string {
  if (!category) return '';
  return category
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
export const GLYPH_DEFS: { key: string; Icon: LucideIcon }[] = [
  ...Object.entries(VENUE_CATEGORY_ICONS).map(([cat, Icon]) => ({ key: `cat:${cat}`, Icon })),
  ...(Object.entries(LAYER_FALLBACK_ICONS) as [LayerType, LucideIcon][]).map(([type, Icon]) => ({
    key: `type:${type}`,
    Icon,
  })),
];
