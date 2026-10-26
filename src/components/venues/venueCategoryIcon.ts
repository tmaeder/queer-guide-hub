import {
  Wine,
  Music,
  Coffee,
  Utensils,
  Bed,
  Waves,
  Trees,
  Store,
  Users,
  Calendar,
  Drama,
  Palette,
  Scissors,
  Dumbbell,
  MapPin,
  Accessibility,
  Footprints,
  type LucideIcon,
} from '@/components/icons';
import type { VenueCategory } from '@/lib/venueCategories';

export const VENUE_CATEGORY_ICONS: Record<VenueCategory, LucideIcon> = {
  bar: Wine,
  club: Music,
  cafe: Coffee,
  restaurant: Utensils,
  hotel: Bed,
  sauna: Waves,
  cruising: Footprints,
  outdoor: Trees,
  shop: Store,
  community_center: Users,
  'event-venue': Calendar,
  theater: Drama,
  gallery: Palette,
  salon: Scissors,
  gym: Dumbbell,
  toilet: Accessibility,
  other: MapPin,
};

/** The category's glyph — also drawn large on a photo-less card's plate. */
export const venueCategoryIcon = (category: string | null | undefined): LucideIcon =>
  (category && VENUE_CATEGORY_ICONS[category as VenueCategory]) || MapPin;
