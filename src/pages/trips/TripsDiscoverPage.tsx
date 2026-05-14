import { lazy, Suspense, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Compass, ArrowDownUp, Check, List, Map } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useDiscoverableTrips,
  type DiscoverableTrip,
} from '@/hooks/useDiscoverableTrips';
import { PublicTripCard } from '@/components/trips/PublicTripCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TripTemplates } from '@/components/trips/TripTemplates';
import {
  DiscoverFilters,
  DEFAULT_FILTERS,
  applyAdvancedFilters,
  filtersAreEmpty,
  type DiscoverFilterState,
} from '@/components/trips/DiscoverFilters';

const DiscoverMap = lazy(() =>
  import('@/components/trips/DiscoverMap').then((m) => ({ default: m.DiscoverMap })),
);

type SortKey = 'recent' | 'most_places' | 'longest' | 'safest';
type QuickFilter = 'dated' | 'multiday' | 'safe';

const SORT_KEYS: SortKey[] = ['recent', 'most_places', 'longest', 'safest'];
const QUICK_FILTERS: QuickFilter[] = ['dated', 'multiday', 'safe'];

function matchesFilter(trip: DiscoverableTrip, filter: QuickFilter): boolean {
  switch (filter) {
    case 'dated':
      return !!(trip.start_date && trip.end_date);
    case 'multiday':
      return durationDays(trip) >= 3;
    case 'safe':
      return (trip.min_equality_score ?? 0) >= 70;
  }
}

function durationDays(t: DiscoverableTrip): number {
  if (!t.start_date || !t.end_date) return 0;
  const s = new Date(t.start_date).getTime();
  const e = new Date(t.end_date).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.round((e - s) / (24 * 60 * 60 * 1000)) + 1;
}

function sortTrips(trips: DiscoverableTrip[], key: SortKey): DiscoverableTrip[] {
  const copy = [...trips];
  switch (key) {
    case 'most_places':
      return copy.sort((a, b) => b.place_count - a.place_count);
    case 'longest':
      return copy.sort((a, b) => durationDays(b) - durationDays(a));
    case 'safest':
      return copy.sort((a, b) => {
        const av = a.min_equality_score ?? -1;
        const bv = b.min_equality_score ?? -1;
        return bv - av;
      });
    case 'recent':
    default:
      return copy.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
  }
}

/**
 * Public discovery feed for opt-in trips.
 *
 * Shows the most recent 60 public trips, with an optional city
 * substring filter. Trip authors flip `trips.is_public=true` from the
 * sharing dialog (or trip settings) to opt in. Anonymous visitors can
 * browse — RLS already exposes public trips to anon.
 */
export default function TripsDiscoverPage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [activeFilters, setActiveFilters] = useState<Set<QuickFilter>>(new Set());
  const [advancedFilters, setAdvancedFilters] =
    useState<DiscoverFilterState>(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const { data: trips, isLoading } = useDiscoverableTrips(query);

  const toggleFilter = (f: QuickFilter) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  };

  const filtered = useMemo(() => {
    let result = trips ?? [];
    if (activeFilters.size > 0) {
      result = result.filter((t) =>
        [...activeFilters].every((f) => matchesFilter(t, f)),
      );
    }
    if (!filtersAreEmpty(advancedFilters)) {
      result = applyAdvancedFilters(result, advancedFilters);
    }
    return result;
  }, [trips, activeFilters, advancedFilters]);

  const sorted = useMemo(() => sortTrips(filtered, sortKey), [filtered, sortKey]);
  const sparse = !isLoading && sorted.length > 0 && sorted.length < 6;
  const empty = !isLoading && sorted.length === 0;
  const staffPicks = useMemo(
    () => (trips ?? []).filter((tr) => tr.is_staff_pick).slice(0, 3),
    [trips],
  );
  const showStaffPicks =
    staffPicks.length > 0 &&
    activeFilters.size === 0 &&
    !query &&
    filtersAreEmpty(advancedFilters) &&
    viewMode === 'list';

  return (
    <div className="container mx-auto max-w-screen-lg px-4 py-6 md:py-10">
      <PageHeader
        eyebrow={t('trips.discover.eyebrow', 'Real travelers')}
        title={t('trips.discover.title', 'Discover trips')}
        subtitle={t(
          'trips.discover.subtitle',
          'Real itineraries from QG travelers — copy ideas, find queer-friendly stops, plan your own.',
        )}
        actions={
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background shadow-sm">
            <Compass size={20} />
          </div>
        }
      >
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative max-w-[460px] flex-1 min-w-[240px]">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('trips.discover.searchPlaceholder', 'Filter by city…')}
              className="pl-9"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                aria-label={t('trips.discover.sortAria', 'Sort trips')}
                className="h-10"
              >
                <ArrowDownUp style={{ width: 14, height: 14, marginRight: 6 }} />
                {t(`trips.discover.sort.${sortKey}`, sortLabel(sortKey))}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {SORT_KEYS.map((key) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => setSortKey(key)}
                  className="gap-2"
                >
                  <span className="w-4 inline-flex">
                    {key === sortKey && <Check style={{ width: 14, height: 14 }} />}
                  </span>
                  {t(`trips.discover.sort.${key}`, sortLabel(key))}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DiscoverFilters value={advancedFilters} onChange={setAdvancedFilters} />
          <div
            className="inline-flex p-1 border border-border rounded-full bg-muted/50 gap-0.5"
            role="group"
            aria-label={t('trips.discover.viewAria', 'View mode')}
          >
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              aria-label={t('trips.discover.view.list', 'List view')}
              className={`inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors ${
                viewMode === 'list'
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <List style={{ width: 14, height: 14 }} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('map')}
              aria-pressed={viewMode === 'map'}
              aria-label={t('trips.discover.view.map', 'Map view')}
              className={`inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors ${
                viewMode === 'map'
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Map style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
        <div
          className="flex flex-wrap gap-2 mt-3"
          role="group"
          aria-label={t('trips.discover.filterAria', 'Filter trips')}
        >
          {QUICK_FILTERS.map((f) => {
            const selected = activeFilters.has(f);
            return (
              <button
                key={f}
                type="button"
                onClick={() => toggleFilter(f)}
                aria-pressed={selected}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                  selected
                    ? 'bg-foreground text-background border-transparent'
                    : 'bg-background text-foreground border-border hover:border-foreground/40'
                }`}
              >
                {t(`trips.discover.filter.${f}`, filterLabel(f))}
              </button>
            );
          })}
        </div>
      </PageHeader>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[260px] w-full rounded" />
          ))}
        </div>
      )}

      {empty && (
        <>
          <EmptyState
            icon={Compass}
            title={t('trips.discover.emptyTitle', 'No public trips yet')}
            description={
              query
                ? t(
                    'trips.discover.emptyFiltered',
                    'No public trips match that city. Try a different one.',
                  )
                : t(
                    'trips.discover.emptyDescription',
                    'Be the first — make any of your trips public from the Share dialog.',
                  )
            }
          />
          <div className="mt-12 pt-10 border-t border-border">
            <TripTemplates />
          </div>
        </>
      )}

      {!isLoading && sorted.length > 0 && viewMode === 'map' && (
        <Suspense
          fallback={
            <Skeleton className="h-[480px] w-full rounded-lg" />
          }
        >
          <DiscoverMap trips={sorted} />
        </Suspense>
      )}

      {!isLoading && sorted.length > 0 && viewMode === 'list' && (
        <>
          {showStaffPicks && (
            <section className="mb-10">
              <div className="flex items-end justify-between gap-3 mb-4">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('trips.discover.staffPicks.eyebrow', 'Staff picks')}
                  </span>
                  <h2 className="text-lg md:text-xl font-bold tracking-tight">
                    {t(
                      'trips.discover.staffPicks.title',
                      'Trips worth copying',
                    )}
                  </h2>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {staffPicks.map((trip) => (
                  <PublicTripCard key={`staff-${trip.id}`} trip={trip} />
                ))}
              </div>
            </section>
          )}

          {showStaffPicks && (
            <h2 className="text-lg font-bold tracking-tight mb-4">
              {t('trips.discover.all', 'All public trips')}
            </h2>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {sorted.map((trip) => (
              <PublicTripCard key={trip.id} trip={trip} />
            ))}
          </div>
          {sparse && (
            <div className="mt-12 pt-10 border-t border-border">
              <h2 className="text-lg font-bold tracking-tight mb-1">
                {t('trips.discover.moreInspiration', 'More inspiration')}
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                {t(
                  'trips.discover.moreInspirationDescription',
                  'Few public trips match. Start from a template instead.',
                )}
              </p>
              <TripTemplates />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function sortLabel(key: SortKey): string {
  switch (key) {
    case 'recent':
      return 'Most recent';
    case 'most_places':
      return 'Most places';
    case 'longest':
      return 'Longest';
    case 'safest':
      return 'Safest';
  }
}

function filterLabel(f: QuickFilter): string {
  switch (f) {
    case 'dated':
      return 'Has dates';
    case 'multiday':
      return 'Multi-day';
    case 'safe':
      return 'Safe destinations';
  }
}
