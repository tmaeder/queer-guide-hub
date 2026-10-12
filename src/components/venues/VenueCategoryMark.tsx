import { useTranslation } from 'react-i18next';
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
} from 'lucide-react';
import { VENUE_CATEGORY_OPTIONS, type VenueCategory } from '@/lib/venueCategories';

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
export function VenueCategoryMark({ category }: { category: string | null }) {
  const { t } = useTranslation();
  const option = VENUE_CATEGORY_OPTIONS.find((item) => item.value === category);
  if (!option) return null;
  const Icon = ICONS[option.value];
  return (
    <span className="mt-2 inline-flex items-center gap-1.5 text-13 text-muted-foreground">
      <Icon size={16} className="shrink-0" aria-hidden="true" />
      {t(`venueCategories.${option.value}`, { defaultValue: option.label })}
    </span>
  );
}
