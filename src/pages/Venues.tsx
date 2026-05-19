import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useSearchParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useVenues } from '@/hooks/useVenues';
import { useRecentVenues } from '@/hooks/useRecentVenues';
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

const VALID_SORTS = new Set(['featured', 'nearest', 'name', 'category', 'city', 'created_at']);
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
  const urlCity = searchParams.get('city') ?? '';
  const parseList = (key: string): string[] => {
    const raw = searchParams.get(key);
    if (!raw) return [];
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  };
  const urlTags = parseList('tags');
  const urlAmenities = parseList('amenities');
  const urlServices = parseList('services');
  const urlAccessibility = parseList('accessibility');
  const urlTargetGroups = parseList('groups');
  const urlTagsKey = urlTags.join(',');
  const urlAmenitiesKey = urlAmenities.join(',');
  const urlServicesKey = urlServices.join(',');
  const urlAccessibilityKey = urlAccessibility.join(',');
  const urlTargetGroupsKey = urlTargetGroups.join(',');
  const rawSort = searchParams.get('sort') ?? 'featured';
  const sortBy = VALID_SORTS.has(rawSort) ? rawSort : 'featured';
  const rawView = searchParams.get('view') ?? 'grid';
  const viewMode: 'grid' | 'map' = VALID_VIEWS.has(rawView) ? (rawView as 'grid' | 'map') : 'grid';

  const buildFiltersFromUrl = useCallback((): Record<string, unknown> => {
    const f: Record<string, unknown> = {};
    if (urlSearch) f.search = urlSearch;
    if (urlCategory) f.category = urlCategory;
    if (urlCity) f.city = urlCity;
    if (urlTags.length) f.tags = urlTags;
    if (urlAmenities.length) f.amenities = urlAmenities;
    if (urlServices.length) f.services = urlServices;
    if (urlAccessibility.length) f.accessibilityAttributes = urlAccessibility;
    if (urlTargetGroups.length) f.targetGroups = urlTargetGroups;
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearch, urlCategory, urlCity, urlTagsKey, urlAmenitiesKey, urlServicesKey, urlAccessibilityKey, urlTargetGroupsKey]);

  const mapFilters = useMemo(() => {
    const f: Record<string, string> = {};
    if (urlSearch) f.search = urlSearch;
    if (urlCategory) f.category = urlCategory;
    return f;
  }, [urlSearch, urlCategory]);

  // URL is the canonical source for all filters now (search, category, city,
  // tags, amenities, services, accessibility, target groups). nearMe is the
  // only filter still kept in component state — it requires runtime
  // geolocation permission and shouldn't auto-trigger from a shared link.
  const [currentFilters, setCurrentFilters] = useState<Record<string, unknown>>(buildFiltersFromUrl);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [autoLoadedCount, setAutoLoadedCount] = useState(0);

  // "Recently added" rail — only fetched when the user hasn't applied filters.
  const hasAnyFilters = Object.keys(currentFilters).length > 0;
  const { venues: recentVenues } = useRecentVenues(8, !hasAnyFilters);

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
    const list = (v: unknown) =>
      Array.isArray(v) && v.length > 0 ? (v as string[]).join(',') : undefined;
    updateParams(
      {
        q: typeof filters.search === 'string' ? filters.search : undefined,
        category: typeof filters.category === 'string' ? filters.category : undefined,
        city: typeof filters.city === 'string' && filters.city ? filters.city : undefined,
        tags: list(filters.tags),
        amenities: list(filters.amenities),
        services: list(filters.services),
        accessibility: list(filters.accessibilityAttributes),
        groups: list(filters.targetGroups),
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
  // When sort=nearest, request geolocation lazily and pass it through as
  // nearMe + userLocation — useVenues post-sorts by distance.
  useEffect(() => {
    const preserved: Record<string, unknown> = {};
    if (currentFilters.nearMe) preserved.nearMe = currentFilters.nearMe;
    if (currentFilters.userLocation) preserved.userLocation = currentFilters.userLocation;
    const baseNext = { ...buildFiltersFromUrl(), ...preserved };

    if (sortBy === 'nearest' && !baseNext.userLocation && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next = {
            ...baseNext,
            nearMe: true,
            userLocation: { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
          };
          setCurrentFilters(next);
          setPage(1);
          setAutoLoadedCount(0);
          fetchVenues(next, { page: 1, pageSize: PAGE_SIZE, append: false, sort: sortBy });
        },
        () => {
          // Permission denied / unavailable — fall back to featured silently.
          setCurrentFilters(baseNext);
          setPage(1);
          setAutoLoadedCount(0);
          fetchVenues(baseNext, { page: 1, pageSize: PAGE_SIZE, append: false, sort: 'featured' });
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
      );
      return;
    }
    setCurrentFilters(baseNext);
    setPage(1);
    setAutoLoadedCount(0);
    fetchVenues(baseNext, { page: 1, pageSize: PAGE_SIZE, append: false, sort: sortBy });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearch, urlCategory, urlCity, urlTagsKey, urlAmenitiesKey, urlServicesKey, urlAccessibilityKey, urlTargetGroupsKey, sortBy]);

  // LCP-friendly preload of the first 4 venue images on first render so the
  // browser starts fetching before React commits the grid. Cleans up to avoid
  // leaking <link> nodes across navigations.
  useEffect(() => {
    // Skip preload on map view — grid images aren't part of LCP there.
    if (loading || venues.length === 0 || viewMode !== 'grid') return;
    const links: HTMLLinkElement[] = [];
    for (const v of venues.slice(0, 4)) {
      const src = v.images?.[0] ?? v.logo_url;
      if (!src) continue;
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = src;
      document.head.appendChild(link);
      links.push(link);
    }
    return () => {
      for (const l of links) l.remove();
    };
  }, [loading, venues, viewMode]);

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
          // Re-mount on URL-driven changes for search + category so the
          // search input and chip selection re-hydrate. Array filters are not
          // in the key to avoid closing popovers on every toggle — they sync
          // via the effect in VenueFilters when initial* props change.
          key={`${urlSearch}|${urlCategory}`}
          initialSearch={urlSearch}
          initialCategory={urlCategory}
          initialCity={urlCity}
          initialTags={urlTags}
          initialAmenities={urlAmenities}
          initialServices={urlServices}
          initialAccessibilityAttributes={urlAccessibility}
          initialTargetGroups={urlTargetGroups}
          onFiltersChange={handleFiltersChange}
        />

        {/* Toolbar */}
        <div className="mb-4 mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {!loading && venues.length > 0 && (() => {
              const hasActiveFilters = Object.keys(currentFilters).length > 0;
              const shown = filteredTotal ?? venues.length;
              const parts: string[] = [];
              if (typeof currentFilters.city === 'string' && currentFilters.city)
                parts.push(currentFilters.city);
              if (typeof currentFilters.category === 'string' && currentFilters.category)
                parts.push(currentFilters.category.replace(/[_-]/g, ' '));
              const arrCount = (k: string) =>
                Array.isArray(currentFilters[k]) ? (currentFilters[k] as string[]).length : 0;
              const tagCount = arrCount('tags');
              const amenityCount = arrCount('amenities');
              const serviceCount = arrCount('services');
              const accessCount = arrCount('accessibilityAttributes');
              const groupCount = arrCount('targetGroups');
              if (tagCount) parts.push(`${tagCount} tag${tagCount > 1 ? 's' : ''}`);
              if (amenityCount)
                parts.push(`${amenityCount} amenit${amenityCount > 1 ? 'ies' : 'y'}`);
              if (serviceCount) parts.push(`${serviceCount} service${serviceCount > 1 ? 's' : ''}`);
              if (accessCount) parts.push(`accessibility`);
              if (groupCount) parts.push(`${groupCount} group${groupCount > 1 ? 's' : ''}`);
              return (
                <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
                  {shown.toLocaleString()} venue{shown !== 1 ? 's' : ''}
                  {parts.length > 0 && (
                    <span className="ml-1 text-xs">
                      · {parts.join(' · ')}
                    </span>
                  )}
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
                <SelectItem value="nearest">
                  {t('pages.venues.sortNearest', 'Nearest')}
                </SelectItem>
                <SelectItem value="created_at">
                  {t('pages.venues.sortNewest', 'Newest')}
                </SelectItem>
                <SelectItem value="name">{t('pages.venues.sortName', 'Name')}</SelectItem>
                <SelectItem value="category">
                  {t('pages.venues.sortCategory', 'Category')}
                </SelectItem>
                <SelectItem value="city">{t('pages.venues.sortCity', 'City')}</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex overflow-hidden rounded-element">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setViewMode('grid')}
                className={cn(
                  'h-9 w-9 rounded-element px-2',
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
                  'h-9 w-9 rounded-element px-2',
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
              ) : (() => {
                // Suggest dropping the most restrictive single filter. Order
                // walks narrow → broad so the most specific gets named first.
                const narrowest: Array<{ key: string; label: string }> = [
                  { key: 'accessibilityAttributes', label: 'accessibility filters' },
                  { key: 'services', label: 'service filters' },
                  { key: 'amenities', label: 'amenity filters' },
                  { key: 'tags', label: 'tag filters' },
                  { key: 'targetGroups', label: 'target groups' },
                ];
                let suggestion: { key: string; label: string } | null = null;
                for (const f of narrowest) {
                  const v = currentFilters[f.key];
                  if (Array.isArray(v) && v.length > 0) {
                    suggestion = f;
                    break;
                  }
                }
                const dropSuggestion = () => {
                  if (!suggestion) return;
                  const next = { ...currentFilters };
                  delete next[suggestion.key];
                  handleFiltersChange(next);
                };
                return (
                  <EmptyState
                    icon={MapPin}
                    variant="filtered"
                    title={t('pages.venues.filteredEmpty.title', 'No venues match your filters')}
                    description={
                      suggestion
                        ? t(
                            'pages.venues.filteredEmpty.suggest',
                            `Try removing the ${suggestion.label}, or clear all filters to broaden your search.`,
                          )
                        : t(
                            'pages.venues.filteredEmpty.body',
                            'Try adjusting your filters or search to see more results.',
                          )
                    }
                    primaryAction={
                      suggestion
                        ? {
                            label: t(
                              'pages.venues.dropFilter',
                              `Remove ${suggestion.label}`,
                            ),
                            onClick: dropSuggestion,
                          }
                        : {
                            label: t('pages.venues.submitVenue', 'Submit a Venue'),
                            onClick: () => navigate('/submit/venue'),
                          }
                    }
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
                );
              })()
            )}

            {/* Recently added rail — only when no filters and we have at
                least 4 recent venues to show. Horizontal scroll on all
                breakpoints; deduped against the main grid by ID. */}
            {!loading && !hasAnyFilters && recentVenues.length >= 4 && (() => {
              const mainIds = new Set(venues.slice(0, 24).map((v) => v.id));
              const rail = recentVenues.filter((v) => !mainIds.has(v.id)).slice(0, 8);
              if (rail.length < 4) return null;
              return (
                <section aria-label="Recently added venues" className="-mt-1">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('pages.venues.recentlyAdded', 'Recently added')}
                  </h2>
                  <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4">
                    {rail.map((venue) => (
                      <div key={venue.id} className="w-64 flex-shrink-0">
                        <VenueCard
                          venue={venue}
                          events={events}
                          onViewDetails={handleViewDetails}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              );
            })()}

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
            className="relative h-[calc(100dvh-12rem)] sm:h-[700px] w-full overflow-hidden rounded-container"
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
                <div className="pointer-events-auto rounded-element bg-background p-6 text-center shadow-[var(--shadow-aceternity)]">
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
