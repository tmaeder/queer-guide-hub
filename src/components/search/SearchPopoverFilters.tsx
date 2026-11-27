import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  ChevronDown,
  MapPin,
  SlidersHorizontal,
  Ticket,
  Wallet,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { SearchFiltersPanel } from '@/components/search/SearchFiltersPanel';
import { useSearch, type SearchFilters } from '@/hooks/useSearch';
import { getTypeConfig, type SearchFilterKey } from '@/config/searchTypeConfig';
import { cn } from '@/lib/utils';
import { countActiveFilters } from '@/lib/searchFilterCount';
import {
  BUDGET_MAX,
  NEAR_ME_KM,
  isRange,
  todayRange,
  weekendRange,
} from '@/lib/searchQuickFilters';

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
  // Facets and the live count: while the panel is open or any filter is set.
  const live = open || active > 0;
  const { facets, totalHits, loading } = useSearch(live ? query : '', live ? scoped : {});
  const canApply = query.trim().length > 0 || active > 0 || Boolean(scope);
  const [locating, setLocating] = useState(false);
  const [locateFailed, setLocateFailed] = useState(false);

  // One-tap filters for the common cases; tapping an active one clears it.
  const today = todayRange();
  const weekend = weekendRange();
  const nearMe = filters.lat != null && filters.lng != null;
  const set = (patch: Partial<SearchFilters>) => onFiltersChange({ ...filters, ...patch });
  const locate = () => {
    if (nearMe) return set({ lat: undefined, lng: undefined, radius: undefined });
    if (!navigator.geolocation) return setLocateFailed(true);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setLocateFailed(false);
        set({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          radius: NEAR_ME_KM,
          location: undefined,
        });
      },
      () => {
        setLocating(false);
        setLocateFailed(true);
      },
      { timeout: 10_000, maximumAge: 300_000 },
    );
  };
  const quick = [
    filterKeys.includes('date') && {
      id: 'today',
      icon: Calendar,
      label: t('search.quick.today', 'Today'),
      active: isRange(filters, today),
      onClick: () => set({ dateRange: isRange(filters, today) ? undefined : today }),
    },
    filterKeys.includes('date') && {
      id: 'weekend',
      icon: Calendar,
      label: t('search.quick.weekend', 'This weekend'),
      active: isRange(filters, weekend),
      onClick: () => set({ dateRange: isRange(filters, weekend) ? undefined : weekend }),
    },
    filterKeys.includes('geo') && {
      id: 'near',
      icon: MapPin,
      label: locateFailed
        ? t('search.quick.nearFailed', 'Location off')
        : t('search.quick.near', 'Near me'),
      active: nearMe,
      busy: locating,
      onClick: locate,
    },
    filterKeys.includes('price') && {
      id: 'budget',
      icon: Wallet,
      label: t('search.quick.budget', 'Under ${{max}}', { max: BUDGET_MAX }),
      active: filters.priceRange?.[0] === 0 && filters.priceRange?.[1] === BUDGET_MAX,
      onClick: () =>
        set({
          priceRange:
            filters.priceRange?.[1] === BUDGET_MAX && filters.priceRange?.[0] === 0
              ? undefined
              : [0, BUDGET_MAX],
        }),
    },
    filterKeys.includes('free') && {
      id: 'free',
      icon: Ticket,
      label: t('search.quick.free', 'Free'),
      active: Boolean(filters.free),
      onClick: () => set({ free: filters.free ? undefined : true }),
    },
  ].filter(Boolean) as {
    id: string;
    icon: typeof Calendar;
    label: string;
    active: boolean;
    busy?: boolean;
    onClick: () => void;
  }[];

  const showButton = (
    <Button onClick={onApply} disabled={!canApply} className="w-full">
      {loading || !canApply
        ? t('search.filters.show', 'Show results')
        : totalHits === 1
          ? t('search.filters.showOne', 'Show 1 result')
          : t('search.filters.showCount', 'Show {{formatted}} results', {
              formatted: totalHits.toLocaleString(),
            })}
    </Button>
  );

  return (
    <div className="px-4 pb-2">
      {/* One row that scrolls sideways: the panel toggle, then the quick filters. */}
      <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cn(
            'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-badge px-2.5 text-13 font-bold transition-colors',
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
        {quick.map((q) => (
          <button
            key={q.id}
            type="button"
            aria-pressed={q.active}
            aria-busy={q.busy || undefined}
            onClick={q.onClick}
            className={cn(
              'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-badge px-2.5 text-13 font-bold transition-colors',
              q.active
                ? 'bg-foreground text-background'
                : 'bg-muted hover:bg-surface-container-high',
            )}
          >
            <q.icon size={14} aria-hidden />
            {q.label}
          </button>
        ))}
        {active > 0 && !open && (
          <button
            type="button"
            onClick={() => onFiltersChange({})}
            className="inline-flex min-h-9 shrink-0 items-center rounded-badge px-2.5 text-13 font-bold text-muted-foreground hover:text-foreground"
          >
            {t('search.filters.clear', 'Clear')}
          </button>
        )}
      </div>
      {!open && active > 0 && <div className="mt-2">{showButton}</div>}
      {open && (
        <div className="mt-2 flex flex-col gap-4 rounded-container bg-muted p-4">
          <SearchFiltersPanel
            filters={filters}
            onFiltersChange={onFiltersChange}
            facets={facets}
            filterKeys={filterKeys}
          />
          {showButton}
        </div>
      )}
    </div>
  );
}
