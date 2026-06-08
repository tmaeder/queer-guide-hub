import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MapShellFilters } from './MapShell.types';

interface FilterChipsProps {
  filters: MapShellFilters;
  onRemove: (key: keyof MapShellFilters) => void;
  /** When provided, renders a trailing "Clear all" button. */
  onClearAll?: () => void;
  className?: string;
}

interface Chip {
  key: keyof MapShellFilters;
  label: string;
}

function buildChips(filters: MapShellFilters): Chip[] {
  const chips: Chip[] = [];
  if (filters.search) chips.push({ key: 'search', label: `"${filters.search}"` });
  if (filters.category) chips.push({ key: 'category', label: filters.category });
  if (filters.tags?.length) {
    chips.push({
      key: 'tags',
      label: filters.tags.length === 1 ? filters.tags[0] : `${filters.tags.length} tags`,
    });
  }
  if (filters.nearMe) chips.push({ key: 'nearMe', label: `Within ${filters.nearMe.radiusKm} km` });
  if (filters.dateRange) {
    const fmt = (s: string) => {
      const d = new Date(s);
      return Number.isNaN(d.getTime())
        ? s
        : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };
    chips.push({
      key: 'dateRange',
      label: `${fmt(filters.dateRange.start)} – ${fmt(filters.dateRange.end)}`,
    });
  }
  if (filters.accessible) chips.push({ key: 'accessible', label: 'Accessible' });
  if (filters.queerOwned) chips.push({ key: 'queerOwned', label: 'Queer-owned' });
  if (filters.era) chips.push({ key: 'era', label: `${filters.era.decadeStart}s–${filters.era.decadeEnd}s` });
  return chips;
}

/**
 * Filter chip row. Renders one chip per active filter; `X` removes that key.
 * Returns `null` when no chips so callers can avoid rendering an empty bar.
 */
export const FilterChips = ({ filters, onRemove, onClearAll, className }: FilterChipsProps) => {
  const chips = buildChips(filters);
  if (chips.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)} aria-label="Active filters">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onRemove(c.key)}
          className="h-8 inline-flex items-center gap-1 border border-border bg-background px-4 text-xs text-foreground hover:bg-muted focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          aria-label={`Remove filter: ${c.label}`}
        >
          <span>{c.label}</span>
          <X size={12} aria-hidden="true" />
        </button>
      ))}
      {onClearAll && chips.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="h-8 inline-flex items-center px-2 text-xs text-muted-foreground underline hover:text-foreground focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Clear all
        </button>
      )}
    </div>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export { buildChips as buildFilterChips };
export default FilterChips;
