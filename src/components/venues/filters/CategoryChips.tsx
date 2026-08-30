import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { AUTH_ONLY_CATEGORIES, categories, categoryLabels } from './constants';

interface CategoryChipsProps {
  category: string;
  onCategoryClick: (cat: string) => void;
}

/**
 * Horizontally scroll on narrow screens (Airbnb-style), wrap on wider screens.
 * -mx + px keeps the scroll edge flush with card.
 */
export function CategoryChips({ category, onCategoryClick }: CategoryChipsProps) {
  const { user } = useAuth();

  // Signed out, every row in an AUTH_ONLY category is safety_gated and RLS
  // returns nothing — so the chip would be a filter that always yields an empty
  // list. Keep it visible when it is the ACTIVE filter (a shared or bookmarked
  // ?category=cruising URL), or the selected chip vanishes while the results
  // stay filtered and the page looks broken instead of empty.
  const visible = useMemo(
    () =>
      user
        ? categories
        : categories.filter((c) => !AUTH_ONLY_CATEGORIES.includes(c) || c === category),
    [user, category],
  );

  return (
    <div className="flex gap-1.5 overflow-x-auto sm:flex-wrap max-w-full -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-thin">
      {visible.map((cat) => (
        <Button
          key={cat}
          variant={category === cat ? 'default' : 'outline'}
          size="sm"
          onClick={() => onCategoryClick(cat)}
          className="rounded-badge h-8 px-4 text-xs font-bold uppercase transition-all whitespace-nowrap flex-shrink-0"
        >
          {categoryLabels[cat] ?? cat}
        </Button>
      ))}
    </div>
  );
}
