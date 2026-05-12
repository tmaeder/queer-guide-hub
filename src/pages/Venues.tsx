import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useSearchParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useVenues } from '@/hooks/useVenues';
import { useEvents } from '@/hooks/useEvents';
import { useMeta } from '@/hooks/useMeta';
import { VenueCard } from '@/components/venues/VenueCard';
import { VenueFilters } from '@/components/venues/VenueFilters';
import { ExploreMap } from '@/components/map/ExploreMap';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState, LoadingTimeout, ErrorState } from '@/components/ui/EmptyState';
import { MapPin, Grid, Map } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

type Venue = Database['public']['Tables']['venues']['Row'];

const VALID_SORTS = new Set(['featured', 'name', 'category', 'city', 'created_at']);
const VALID_VIEWS = new Set(['grid', 'map']);

const Venues = () => {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const {
    venues,
    loading,
    error,
    hasMore,
    datasetTotal,
    filteredTotal,
    fetchVenues,
    loadingTimedOut,
  } = useVenues(false);

  useMeta({
    title: 'Venues',
    description:
      'Discover queer-friendly venues, businesses, and organizations worldwide. Find safe spaces near you.',
    canonicalPath: '/venues',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Queer-Friendly Venues',
      description: 'Discover queer-friendly venues, businesses, and organizations worldwide.',
      url: 'https://queer.guide/venues',
      isPartOf: { '@type': 'WebSite', name: 'Queer Guide', url: 'https://queer.guide' },
    },
  });
  const { events } = useEvents();
  const [_selectedVenue, setSelectedVenue] = useState<Venue | null>(null);

  // URL is the source of truth for filter / sort / view state.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSearch = searchParams.get('q') ?? '';
  const urlCategory = searchParams.get('category') ?? '';
  const rawSort = searchParams.get('sort') ?? 'featured';
  const sortBy = VALID_SORTS.has(rawSort) ? rawSort : 'featured';
  const rawView = searchParams.get('view') ?? 'grid';
  const viewMode: 'grid' | 'map' = VALID_VIEWS.has(rawView) ? (rawView as 'grid' | 'map') : 'grid';

  const mapFilters = useMemo(() => {
    const f: Record<string, string> = {};
    if (urlSearch) f.search = urlSearch;
    if (urlCategory) f.category = urlCategory;
    return f;
  }, [urlSearch, urlCategory]);

  // Filters (full record) live in component state — facets like tags /
  // amenities aren't (yet) URL-encoded. URL drives `search` + `category`.
  const [currentFilters, setCurrentFilters] = useState<Record<string, unknown>>(() => {
    const f: Record<string, unknown> = {};
    if (urlSearch) f.search = urlSearch;
    if (urlCategory) f.category = urlCategory;
    return f;
  });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [autoLoadedCount, setAutoLoadedCount] = useState(0);

  // Mutate URL params, preserving keys we don't own.
  const updateParams = useCallback(
    (updates: Record<string, string | undefined>, opts?: { replace?: boolean }) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(updates)) {
            if (v === undefined || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: opts?.replace ?? false },
      );
    },
    [setSearchParams],
  );

  const setSortBy = useCallback(
    (next: string) => updateParams({ sort: next === 'featured' ? undefined : next }),
    [updateParams],
  );
  const setViewMode = useCallback(
    (next: 'grid' | 'map') => updateParams({ view: next === 'grid' ? undefined : next }),
    [updateParams],
  );

  const handleFiltersChange = async (filters: Record<string, unknown>) => {
    setCurrentFilters(filters);
    setPage(1);
    setAutoLoadedCount(0);
    updateParams(
      {
        q: typeof filters.search === 'string' ? filters.search : undefined,
        category: typeof filters.category === 'string' ? filters.category : undefined,
      },
      { replace: true },
    );
    await fetchVenues(filters, { page: 1, pageSize: PAGE_SIZE, append: false, sort: sortBy });
  };

  const handleViewDetails = (venue: Venue) => {
    setSelectedVenue(venue);
  };

  // Refetch when URL-driven filters change (initial mount, back/forward,
  // shared link). Reseeds page + currentFilters so internal state matches.
  useEffect(() => {
    const next: Record<string, unknown> = { ...currentFilters };
    if (urlSearch) next.search = urlSearch;
    else delete next.search;
    if (urlCategory) next.category = urlCategory;
    else delete next.category;
    setCurrentFilters(next);
    setPage(1);
    setAutoLoadedCount(0);
    fetchVenues(next, { page: 1, pageSize: PAGE_SIZE, append: false, sort: sortBy });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearch, urlCategory, sortBy]);

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const observer = new IntersectionObserver(
      async (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !loading && hasMore && autoLoadedCount < 50) {
          const nextPage = page + 1;
          setPage(nextPage);
          const result = await fetchVenues(currentFilters, {
            page: nextPage,
            pageSize: PAGE_SIZE,
            append: true,
            sort: sortBy,
          });
          const fetched = result?.fetched ?? PAGE_SIZE;
          setAutoLoadedCount((c) => Math.min(50, c + fetched));
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.unobserve(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, loading, hasMore, currentFilters, autoLoadedCount]);

  const gridClass =
    'grid gap-5 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';

  return (
    <div className="min-h-screen overflow-x-hidden">
      <div className="mx-auto w-full max-w-screen-xl px-4 py-6 md:py-10 min-w-0">
        <VenueFilters
          // Re-mount on URL-driven filter changes (e.g. back button) so the
          // search input and chip selection re-hydrate from URL.
          key={`${urlSearch}|${urlCategory}`}
          initialSearch={urlSearch}
          initialCategory={urlCategory}
          onFiltersChange={handleFiltersChange}
        />

        {/* Toolbar */}
        <div className="mb-4 mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {!loading && venues.length > 0 && (() => {
              const hasActiveFilters = Object.keys(currentFilters).length > 0;
              const shown = filteredTotal ?? venues.length;
              return (
                <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
                  {shown.toLocaleString()} venue{shown !== 1 ? 's' : ''}
                  {!hasActiveFilters && datasetTotal !== null && datasetTotal !== shown && (
                    <span className="ml-1 text-xs">
                      of {datasetTotal.toLocaleString()}
                    </span>
                  )}
                </p>
              );
            })()}
          </div>

          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger
                aria-label={t('pages.venues.sortBy', 'Sort venues')}
                className="w-32 h-9 text-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="featured">
                  {t('pages.venues.sortFeatured', 'Featured')}
                </SelectItem>
                <SelectItem value="name">{t('pages.venues.sortName', 'Name')}</SelectItem>
                <SelectItem value="category">
                  {t('pages.venues.sortCategory', 'Category')}
                </SelectItem>
                <SelectItem value="city">{t('pages.venues.sortCity', 'City')}</SelectItem>
                <SelectItem value="created_at">
                  {t('pages.venues.sortNewest', 'Newest')}
                </SelectItem>
              </SelectContent>
            </Select>

            <div className="flex overflow-hidden rounded-md">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setViewMode('grid')}
                className={cn(
                  'h-9 w-9 rounded-none px-2',
                  viewMode === 'grid' && 'bg-accent',
                )}
                aria-label={t('pages.venues.gridView', 'Grid view')}
              >
                <Grid size={16} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setViewMode('map')}
                className={cn(
                  'h-9 w-9 rounded-none px-2',
                  viewMode === 'map' && 'bg-accent',
                )}
                aria-label={t('pages.venues.mapView', 'Map view')}
              >
                <Map size={16} />
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait" initial={false}>
        {viewMode === 'grid' ? (
          <motion.div
            key="grid"
            className="flex flex-col gap-6"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            {error && !loading && <ErrorState message={error} onRetry={() => fetchVenues()} />}

            {loading && (
              <div className={gridClass}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <VenueCard key={i} loading />
                ))}
              </div>
            )}
            {loading && loadingTimedOut && <LoadingTimeout onRetry={() => fetchVenues()} />}

            {!loading && !error && venues.length === 0 && (
              datasetTotal === 0 || (datasetTotal === null && Object.keys(currentFilters).length === 0) ? (
                <EmptyState
                  icon={MapPin}
                  variant="empty"
                  title={t('pages.venues.emptyDataset.title', 'No venues yet')}
                  description={t(
                    'pages.venues.emptyDataset.body',
                    "We haven't added any venues here yet. Help us grow the guide by submitting one.",
                  )}
                  primaryAction={{
                    label: t('pages.venues.submitVenue', 'Submit a Venue'),
                    onClick: () => navigate('/submit/venue'),
                  }}
                />
              ) : (
                <EmptyState
                  icon={MapPin}
                  variant="filtered"
                  title={t('pages.venues.filteredEmpty.title', 'No venues match your filters')}
                  description={t(
                    'pages.venues.filteredEmpty.body',
                    'Try adjusting your filters or search to see more results.',
                  )}
                  primaryAction={{
                    label: t('pages.venues.submitVenue', 'Submit a Venue'),
                    onClick: () => navigate('/submit/venue'),
                  }}
                  secondaryAction={
                    Object.keys(currentFilters).length > 0
                      ? {
                          label: t('pages.venues.clearFilters', 'Clear Filters'),
                          onClick: () => handleFiltersChange({}),
                          variant: 'outline',
                        }
                      : undefined
                  }
                />
              )
            )}

            {!loading && venues.length > 0 && (
              <StaggerGrid className={gridClass}>
                {venues.map((venue, index) => (
                  <div
                    key={venue.id}
                    className={index >= PAGE_SIZE ? 'content-enter' : undefined}
                  >
                    <VenueCard venue={venue} events={events} onViewDetails={handleViewDetails} />
                  </div>
                ))}
              </StaggerGrid>
            )}

            {!loading && venues.length > 0 && (
              <div className="mt-12 text-center">
                {hasMore && autoLoadedCount >= 50 && (
                  <Button
                    variant="outline"
                    size="lg"
                    className="px-8"
                    onClick={async () => {
                      setAutoLoadedCount(0);
                      const nextPage = page + 1;
                      setPage(nextPage);
                      await fetchVenues(currentFilters, {
                        page: nextPage,
                        pageSize: PAGE_SIZE,
                        append: true,
                        sort: sortBy,
                      });
                    }}
                  >
                    {t('common.loadMore', 'Load more')}
                  </Button>
                )}
                <div ref={sentinelRef} className="h-px" />
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="map"
            className="relative h-[700px] w-full overflow-hidden rounded-lg"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            <ExploreMap
              key={`map-${urlSearch}|${urlCategory}`}
              height={700}
              defaultLayers={['venues']}
              defaultFilters={mapFilters}
              showLayerToggles
              showFilters
            />
            {!loading && filteredTotal === 0 && Object.keys(currentFilters).length > 0 && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 pointer-events-none">
                <div className="pointer-events-auto rounded-lg bg-background p-6 text-center shadow-lg">
                  <MapPin className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">{t('pages.venues.filteredEmpty.title', 'No venues match your filters')}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => handleFiltersChange({})}
                  >
                    {t('pages.venues.clearFilters', 'Clear Filters')}
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Venues;
