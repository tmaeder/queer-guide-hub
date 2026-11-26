import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, SlidersHorizontal } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { SearchFiltersPanel } from '@/components/search/SearchFiltersPanel';
import { useSearch, type SearchFilters } from '@/hooks/useSearch';
import { getTypeConfig, type SearchFilterKey } from '@/config/searchTypeConfig';
import { cn } from '@/lib/utils';
import { countActiveFilters } from '@/lib/searchFilterCount';

/** "All" spans every type, so it offers the filters that cut across them. */
const ALL_SCOPE_KEYS: SearchFilterKey[] = ['date', 'geo', 'price', 'free', 'targetGroups'];

/**
 * Advanced filters inside the search popover: date, location, price, free,
 * audience, plus tags and categories from the live facets. "Show results"
 * opens /search with them applied; they also ride along on Enter.
 */
export function SearchPopoverFilters({
  query,
  scope,
  filters,
  onFiltersChange,
  onApply,
}: {
  query: string;
  scope: string | null;
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  onApply: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const active = countActiveFilters(filters);
  const filterKeys = scope ? getTypeConfig(scope).filters : ALL_SCOPE_KEYS;
  const scoped: SearchFilters = { ...filters, types: scope ? [scope] : undefined };
  // Facets (tags, categories) and the result count, only while the panel is open.
  const { facets, totalHits, loading } = useSearch(open ? query : '', open ? scoped : {});
  const canApply = query.trim().length > 0 || active > 0 || Boolean(scope);

  return (
    <div className="px-4 pb-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cn(
            'inline-flex min-h-9 items-center gap-1.5 rounded-badge px-2.5 text-13 font-bold transition-colors',
            active > 0
              ? 'bg-foreground text-background'
              : 'bg-muted hover:bg-surface-container-high',
          )}
        >
          <SlidersHorizontal size={14} aria-hidden />
          {t('search.filters.toggle', 'Filters')}
          {active > 0 && (
            <>
              <span aria-hidden className="tabular-nums">
                · {active}
              </span>
              <span className="sr-only">
                , {t('search.filters.activeCount', '{{count}} active', { count: active })}
              </span>
            </>
          )}
          <ChevronDown
            size={14}
            aria-hidden
            className={cn('transition-transform', open && 'rotate-180')}
          />
        </button>
        {active > 0 && !open && (
          <button
            type="button"
            onClick={() => onFiltersChange({})}
            className="inline-flex min-h-9 items-center rounded-badge px-2.5 text-13 font-bold text-muted-foreground hover:text-foreground"
          >
            {t('search.filters.clear', 'Clear')}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-4 rounded-container bg-muted p-4">
          <SearchFiltersPanel
            filters={filters}
            onFiltersChange={onFiltersChange}
            facets={facets}
            filterKeys={filterKeys}
          />
          <Button onClick={onApply} disabled={!canApply} className="w-full">
            {loading || !canApply
              ? t('search.filters.show', 'Show results')
              : totalHits === 1
                ? t('search.filters.showOne', 'Show 1 result')
                : t('search.filters.showCount', 'Show {{formatted}} results', {
                    formatted: totalHits.toLocaleString(),
                  })}
          </Button>
        </div>
      )}
    </div>
  );
}
