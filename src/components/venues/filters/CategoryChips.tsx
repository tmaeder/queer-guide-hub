import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from '@/components/icons';
import { FilterChip } from '@/components/transit/FilterChip';
import { useAuth } from '@/hooks/useAuth';
import { AUTH_ONLY_CATEGORIES } from './constants';
import { useVenueCategoryOptions } from '@/lib/venueCategories';
import { venueCategoryIcon } from '../venueCategoryIcon';

const PRIMARY_COUNT = 8;

interface CategoryChipsProps {
  category: string;
  onCategoryClick: (cat: string) => void;
}

/**
 * Venue categories as the shared FilterChip (same chip as the events
 * presets): icon + sentence-case label, an "All" chip first. Wraps at every
 * width: a scrolling row clipped chips mid-label at the card edges.
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

  const [expanded, setExpanded] = useState(false);
  // One line by default: the first types plus whatever is active; the rest
  // behind "More" so 17 chips do not cost two rows above every result.
  const shown = expanded
    ? visible
    : visible.filter((o, i) => i < PRIMARY_COUNT || o.value === category);
  const hidden = visible.length - shown.length;

  return (
    <div
      role="group"
      aria-label={t('venues.filters.categoryGroup', 'Venue type')}
      className="flex flex-wrap gap-2"
    >
      <FilterChip
        active={!category}
        // The hook toggles: clicking the active category clears it.
        onClick={() => category && onCategoryClick(category)}
        label={t('venues.filters.allTypes', 'All')}
      />
      {shown.map(({ value: cat, label }) => {
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
      {(hidden > 0 || expanded) && (
        <FilterChip
          active={false}
          aria-pressed={undefined}
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
          className="bg-transparent shadow-none text-muted-foreground"
          label={
            <>
              {expanded
                ? t('venues.filters.fewerTypes', 'Fewer')
                : t('venues.filters.moreTypes', '+{{count}} more', { count: hidden })}
              <ChevronDown
                size={14}
                aria-hidden
                className={expanded ? 'rotate-180 transition-transform' : 'transition-transform'}
              />
            </>
          }
        />
      )}
    </div>
  );
}
