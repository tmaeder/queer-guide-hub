import { useVenueCategoryLabel } from '@/lib/venueCategories';
import { MapPin } from '@/components/icons';
import { VENUE_CATEGORY_ICONS } from './venueCategoryIcon';

export function VenueCategoryMark({ category }: { category: string | null }) {
  const label = useVenueCategoryLabel(category);
  if (!category) return null;
  const Icon = VENUE_CATEGORY_ICONS[category as keyof typeof VENUE_CATEGORY_ICONS] ?? MapPin;
  return (
    <span className="mt-2 inline-flex items-center gap-1.5 text-13 text-muted-foreground">
      <Icon size={16} className="shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
