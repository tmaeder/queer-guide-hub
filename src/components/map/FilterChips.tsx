import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';
import { cn } from '@/lib/utils';
import { tweens } from '@/lib/motion';
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

// i18next isn't initialized in unit tests (and buildChips is a plain function,
// not a hook) — fall back to the pre-interpolated English label there.
function tOr(key: string, fallback: string, opts?: Record<string, unknown>): string {
  return i18next.isInitialized ? i18next.t(key, { defaultValue: fallback, ...opts }) : fallback;
}

function buildChips(filters: MapShellFilters): Chip[] {
  const chips: Chip[] = [];
  if (filters.search) chips.push({ key: 'search', label: `"${filters.search}"` });
  if (filters.category) chips.push({ key: 'category', label: filters.category });
  if (filters.tags?.length) {
    chips.push({
      key: 'tags',
      label:
        filters.tags.length === 1
          ? filters.tags[0]
          : tOr('map.filterChips.tags', `${filters.tags.length} tags`, {
              count: filters.tags.length,
            }),
    });
  }
  if (filters.nearMe)
    chips.push({
      key: 'nearMe',
      label: tOr('map.filterChips.within', `Within ${filters.nearMe.radiusKm} km`, {
        km: filters.nearMe.radiusKm,
      }),
    });
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
  if (filters.accessible)
    chips.push({
      key: 'accessible',
      label: tOr('map.filterChips.accessible', 'Accessible'),
    });
  if (filters.queerOwned)
    chips.push({
      key: 'queerOwned',
      label: tOr('map.filterChips.queerOwned', 'Queer-owned'),
    });
  if (filters.era) chips.push({ key: 'era', label: `${filters.era.decadeStart}s–${filters.era.decadeEnd}s` });
  return chips;
}

/**
 * Filter chip row. Renders one chip per active filter; `X` removes that key.
 * Returns `null` when no chips so callers can avoid rendering an empty bar.
 */
export const FilterChips = ({ filters, onRemove, onClearAll, className }: FilterChipsProps) => {
  const { t } = useTranslation();
  const reduced = useReducedMotion() ?? false;
  const chips = buildChips(filters);
  if (chips.length === 0) return null;
  return (
    <div
      className={cn('flex flex-wrap items-center gap-1.5', className)}
      aria-label={t('map.filterChips.groupLabel', { defaultValue: 'Active filters' })}
    >
      <AnimatePresence initial={false}>
      {chips.map((c) => (
        <motion.button
          key={c.key}
          type="button"
          onClick={() => onRemove(c.key)}
          initial={reduced ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
          transition={reduced ? { duration: 0 } : tweens.fast}
          className="h-8 inline-flex items-center gap-1 rounded-element border border-border bg-background px-4 text-xs text-foreground hover:bg-muted focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          aria-label={t('map.filterChips.remove', {
            defaultValue: 'Remove filter: {{label}}',
            label: c.label,
          })}
        >
          <span>{c.label}</span>
          <X size={12} aria-hidden="true" />
        </motion.button>
      ))}
      </AnimatePresence>
      {onClearAll && chips.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="h-8 inline-flex items-center px-2 text-xs text-muted-foreground underline hover:text-foreground focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t('map.filterChips.clearAll', { defaultValue: 'Clear all' })}
        </button>
      )}
    </div>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export { buildChips as buildFilterChips };
export default FilterChips;
