import { Button } from '@/components/ui/button';
import { categories, categoryLabels } from './constants';

interface CategoryChipsProps {
  category: string;
  onCategoryClick: (cat: string) => void;
}

/**
 * Horizontally scroll on narrow screens (Airbnb-style), wrap on wider screens.
 * -mx + px keeps the scroll edge flush with card.
 */
export function CategoryChips({ category, onCategoryClick }: CategoryChipsProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto sm:flex-wrap max-w-full -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-thin">
      {categories.map((cat) => (
        <Button
          key={cat}
          variant={category === cat ? 'default' : 'outline'}
          size="sm"
          onClick={() => onCategoryClick(cat)}
          className="rounded-full h-8 px-4.5 text-xs font-medium transition-all whitespace-nowrap flex-shrink-0"
        >
          {categoryLabels[cat] ?? cat}
        </Button>
      ))}
    </div>
  );
}
