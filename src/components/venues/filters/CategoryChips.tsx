import { useTranslation } from 'react-i18next';
import { FilterChip } from '@/components/transit/FilterChip';
import { useAuth } from '@/hooks/useAuth';
import { AUTH_ONLY_CATEGORIES } from './constants';
import { useVenueCategoryOptions } from '@/lib/venueCategories';
import { venueCategoryIcon } from '../venueCategoryIcon';

interface CategoryChipsProps {
  category: string;
  onCategoryClick: (cat: string) => void;
}

/**
 * Venue categories as the shared FilterChip (same chip as the events
 * presets): icon + sentence-case label, an "All" chip first. One scrolling
 * row on phones; wraps from md up. -mx + px keeps the scroll edge flush with
 * the filter card.
 */
export function CategoryChips({ category, onCategoryClick }: CategoryChipsProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  // Signed out, every row in an AUTH_ONLY category is safety_gated and RLS
  // returns nothing — so the chip would be a filter that always yields an empty
  // list. Keep it visible when it is the ACTIVE filter (a shared or bookmarked
  // ?category=cruising URL), or the selected chip vanishes while the results
  // stay filtered and the page looks broken instead of empty.
  const options = useVenueCategoryOptions(category);
  const visible = options.filter(
    (o) => user || !AUTH_ONLY_CATEGORIES.includes(o.value) || o.value === category,
  );

  return (
    <div
      role="group"
      aria-label={t('venues.filters.categoryGroup', 'Venue type')}
      className="-mx-4 flex max-w-[calc(100%+2rem)] gap-2 no-scrollbar overflow-x-auto px-4 md:mx-0 md:max-w-full md:flex-wrap md:px-0"
    >
      <FilterChip
        active={!category}
        // The hook toggles: clicking the active category clears it.
        onClick={() => category && onCategoryClick(category)}
        label={t('venues.filters.allTypes', 'All')}
      />
      {visible.map(({ value: cat, label }) => {
        const Icon = venueCategoryIcon(cat);
        return (
          <FilterChip
            key={cat}
            active={category === cat}
            onClick={() => onCategoryClick(cat)}
            label={
              <>
                <Icon size={16} aria-hidden />
                <span className="whitespace-nowrap">{label}</span>
              </>
            }
          />
        );
      })}
    </div>
  );
}
