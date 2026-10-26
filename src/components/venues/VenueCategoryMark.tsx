/* eslint-disable react-refresh/only-export-components -- the icon lookup is shared with the card plate */
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
import { useVenueCategoryLabel, type VenueCategory } from '@/lib/venueCategories';

const ICONS: Record<VenueCategory, LucideIcon> = {
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
  (category && ICONS[category as VenueCategory]) || MapPin;

export function VenueCategoryMark({ category }: { category: string | null }) {
  const label = useVenueCategoryLabel(category);
  if (!category) return null;
  const Icon = ICONS[category] ?? MapPin;
  return (
    <span className="mt-2 inline-flex items-center gap-1.5 text-13 text-muted-foreground">
      <Icon size={16} className="shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
