import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useSearchParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useVenues } from '@/hooks/useVenues';
import { useRecentVenues } from '@/hooks/useRecentVenues';
import { useEvents } from '@/hooks/useEvents';
import { useMeta } from '@/hooks/useMeta';
import { useAuth } from '@/hooks/useAuth';
import { useDiscoveryProfile } from '@/hooks/useVenuesV2Data';
import { VenueCard } from '@/components/venues/VenueCard';
import { VenueFilters } from '@/components/venues/VenueFilters';
import { PreferenceChips } from '@/components/preferences/PreferenceChips';
import {
  usePreferenceChips,
  accessibilitySlugsFromChips,
  tagsFromChips,
} from '@/hooks/usePreferenceChips';
import { VenuesHero } from '@/components/venues/VenuesHero';
import { QuickFilters, type QuickFiltersValue } from '@/components/venues/QuickFilters';
import { VenuesPersonalStrip } from '@/components/venues/VenuesPersonalStrip';
import { VenuesRails } from '@/components/venues/VenuesRails';
import { VenueGuidesStream } from '@/components/venues/VenueGuidesStream';
import { LeaderboardWidget } from '@/components/venues/LeaderboardWidget';
import { AchievementToast } from '@/components/venues/AchievementToast';
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
import { getVenueVisual } from '@/lib/venueVisual';
import { useTranslation } from 'react-i18next';
import { VENUES_V2_ENABLED } from '@/lib/featureFlags';

type Venue = Database['public']['Tables']['venues']['Row'];

const VALID_SORTS = new Set([
  'relevance',
  'featured',
  'nearest',
  'name',
  'category',
  'city',
  'created_at',
]);
const VALID_VIEWS = new Set(['grid', 'map']);

const Venues = () => {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { user } = useAuth();
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
      'Find queer-friendly venues, businesses, and organizations worldwide, and safe spaces near you.',
    canonicalPath: '/venues',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Queer-Friendly Venues',
      description: 'Queer-friendly venues, businesses, and organizations worldwide.',
      url: 'https://queer.guide/venues',
      isPartOf: { '@type': 'WebSite', name: 'Queer Guide', url: 'https://queer.guide' },
    },
  });
  const { events } = useEvents();
  const [_selectedVenue, setSelectedVenue] = useState<Venue | null>(null);

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
  const urlOpenNow = searchParams.get('openNow') === '1';
  const urlPrice = searchParams.get('price') ? Number(searchParams.get('price')) : null;
  const urlRadius = searchParams.get('radius') ? Number(searchParams.get('radius')) : null;
  const urlTagsKey = urlTags.join(',');
  const urlAmenitiesKey = urlAmenities.join(',');
  const urlServicesKey = urlServices.join(',');
  const urlAccessibilityKey = urlAccessibility.join(',');
  const urlTargetGroupsKey = urlTargetGroups.join(',');
  const rawSort = searchParams.get('sort') ?? (VENUES_V2_ENABLED ? 'relevance' : 'featured');
  const sortBy = VALID_SORTS.has(rawSort) ? rawSort : 'featured';
  const rawView = searchParams.get('view') ?? 'grid';
  const viewMode: 'grid' | 'map' = VALID_VIEWS.has(rawView) ? (rawView as 'grid' | 'map') : 'grid';

  // Geolocation captured once for ranking + rails. Silent failure if denied.
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );
  useEffect(() => {
    if (!VENUES_V2_ENABLED) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600_000 },
    );
  }, []);

  // Primary city from discovery_profile (used for leaderboard widget + Top-in-city rail).
  const { data: discoveryProfile } = useDiscoveryProfile();
  const primaryCity = {
    id: discoveryProfile?.primary_city_id ?? null,
    name: discoveryProfile?.primary_city_name ?? null,
  };

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
    if (urlOpenNow) f.openNow = true;
    if (urlPrice) f.priceLevel = urlPrice;
    if (urlRadius) f.radiusKm = urlRadius;
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    urlSearch,
    urlCategory,
    urlCity,
    urlTagsKey,
    urlAmenitiesKey,
    urlServicesKey,
    urlAccessibilityKey,
    urlTargetGroupsKey,
    urlOpenNow,
    urlPrice,
    urlRadius,
  ]);

  const mapFilters = useMemo(() => {
    const f: Record<string, string> = {};
    if (urlSearch) f.search = urlSearch;
    if (urlCategory) f.category = urlCategory;
    return f;
  }, [urlSearch, urlCategory]);

  const [currentFilters, setCurrentFilters] = useState<Record<string, unknown>>(buildFiltersFromUrl);

  // Traveling preference chips — saved accessibility needs apply by default,
  // interest vibes are opt-in per session. Contributions merge into every
  // fetch but stay OUT of currentFilters and the URL (accessibility needs are
  // private; a shared link must not carry them).
  const { chips: prefChips, toggle: togglePrefChip, forget: forgetPrefChip } = usePreferenceChips([
    'accessibility',
    'interest',
  ]);
  const chipAccessibility = useMemo(() => accessibilitySlugsFromChips(prefChips), [prefChips]);
  const chipTags = useMemo(() => tagsFromChips(prefChips), [prefChips]);
  const chipKey = [...chipAccessibility, ...chipTags].join(',');
  const mergeChipFilters = useCallback(
    (f: Record<string, unknown>): Record<string, unknown> => {
      const out = { ...f };
      if (chipAccessibility.length) {
        const manual = Array.isArray(out.accessibilityAttributes)
          ? (out.accessibilityAttributes as string[])
          : [];
        out.accessibilityAttributes = [...new Set([...manual, ...chipAccessibility])];
      }
      if (chipTags.length) {
        const manual = Array.isArray(out.tags) ? (out.tags as string[]) : [];
        out.tags = [...new Set([...manual, ...chipTags])];
      }
      return out;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chipKey],
  );
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [autoLoadedCount, setAutoLoadedCount] = useState(0);

  // `userLocation` / `nearMe` are passed through currentFilters for ranking
  // but they don't count as user-applied filters — keep rails visible while
  // we know where the user is.
  const hasAnyFilters = Object.keys(currentFilters).some(
    (k) => k !== 'userLocation' && k !== 'nearMe',
  );
  const showRails = VENUES_V2_ENABLED && !hasAnyFilters && viewMode === 'grid';
  const { venues: recentVenues } = useRecentVenues(8, !hasAnyFilters && !VENUES_V2_ENABLED);

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
    (next: string) =>
      updateParams({ sort: next === (VENUES_V2_ENABLED ? 'relevance' : 'featured') ? undefined : next }),
    [updateParams],
  );
  const setViewMode = useCallback(
    (next: 'grid' | 'map') => updateParams({ view: next === 'grid' ? undefined : next }),
    [updateParams],
  );

  const baseFetchOptions = useCallback(
    (extra?: { page?: number; pageSize?: number; append?: boolean; sort?: string }) => ({
      ...extra,
      useRanking: VENUES_V2_ENABLED,
      userId: user?.id ?? null,
    }),
    [user],
  );

  const handleFiltersChange = async (filters: Record<string, unknown>) => {
    setCurrentFilters(filters);
    setPage(1);
    setAutoLoadedCount(0);
    const list = (v: unknown) =>
      Array.isArray(v) && v.length > 0 ? (v as string[]).join(',') : undefined;
    const nextParams = {
      q: typeof filters.search === 'string' ? filters.search : undefined,
      category: typeof filters.category === 'string' ? filters.category : undefined,
      city: typeof filters.city === 'string' && filters.city ? filters.city : undefined,
      tags: list(filters.tags),
      amenities: list(filters.amenities),
      services: list(filters.services),
      accessibility: list(filters.accessibilityAttributes),
      groups: list(filters.targetGroups),
      openNow: filters.openNow ? '1' : undefined,
      price: typeof filters.priceLevel === 'number' ? String(filters.priceLevel) : undefined,
      radius: typeof filters.radiusKm === 'number' ? String(filters.radiusKm) : undefined,
    };
    // Discrete filter toggles (category/city/tags/…) PUSH a history entry so
    // Back reverts the last change; debounced search-as-you-type REPLACES to
    // avoid flooding history with a keystroke per entry. Decide by whether any
    // non-`q` param actually changed vs the current URL.
    const nonSearchChanged = Object.entries(nextParams).some(([k, v]) => {
      if (k === 'q') return false;
      return (searchParams.get(k) ?? undefined) !== (v ?? undefined);
    });
    updateParams(nextParams, { replace: !nonSearchChanged });
    await fetchVenues(
      mergeChipFilters({ ...filters, userLocation: userLocation ?? undefined }) as Parameters<
        typeof fetchVenues
      >[0],
      baseFetchOptions({ page: 1, pageSize: PAGE_SIZE, append: false, sort: sortBy }),
    );
  };

  const handleViewDetails = (venue: Venue) => {
    setSelectedVenue(venue);
  };

  // Refetch when URL-driven filters or sort change.
  useEffect(() => {
    const baseNext = { ...buildFiltersFromUrl() };
    if (userLocation) (baseNext as Record<string, unknown>).userLocation = userLocation;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setCurrentFilters(baseNext);
    setPage(1);
    setAutoLoadedCount(0);
    fetchVenues(
      mergeChipFilters(baseNext) as Parameters<typeof fetchVenues>[0],
      baseFetchOptions({ page: 1, pageSize: PAGE_SIZE, append: false, sort: sortBy }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    urlSearch,
    urlCategory,
    urlCity,
    urlTagsKey,
    urlAmenitiesKey,
    urlServicesKey,
    urlAccessibilityKey,
    urlTargetGroupsKey,
    urlOpenNow,
    urlPrice,
    urlRadius,
    sortBy,
    chipKey,
    userLocation?.latitude,
    userLocation?.longitude,
  ]);

  useEffect(() => {
    if (loading || venues.length === 0 || viewMode !== 'grid') return;
    const links: HTMLLinkElement[] = [];
    for (const v of venues.slice(0, 4)) {
      const src = getVenueVisual(v).src;
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

  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const observer = new IntersectionObserver(
      async (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !loading && hasMore && autoLoadedCount < 50) {
          const nextPage = page + 1;
          setPage(nextPage);
          const result = await fetchVenues(
            mergeChipFilters({ ...currentFilters, userLocation: userLocation ?? undefined }) as Parameters<typeof fetchVenues>[0],
            baseFetchOptions({
              page: nextPage,
              pageSize: PAGE_SIZE,
              append: true,
              sort: sortBy,
            }),
          );
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

  const gridClass = 'grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';

  return (
    <div className="min-h-screen overflow-x-hidden">
      <AchievementToast />
      <div className="mx-auto w-full max-w-screen-xl px-4 py-6 md:py-10 min-w-0 space-y-8">
        {/* Editorial top: hero + personal strip when v2 + grid view */}
        {showRails && (
          <div className="space-y-6">
            <VenuesHero />
            {user && <VenuesPersonalStrip />}
          </div>
        )}

        {VENUES_V2_ENABLED && (
          <QuickFilters
            value={{
              openNow: urlOpenNow || undefined,
              radiusKm: urlRadius ?? undefined,
              priceLevel: urlPrice ?? undefined,
            } as QuickFiltersValue}
            hasLocation={!!userLocation}
            onChange={(v) =>
              updateParams({
                openNow: v.openNow ? '1' : undefined,
                radius: v.radiusKm != null ? String(v.radiusKm) : undefined,
                price: v.priceLevel != null ? String(v.priceLevel) : undefined,
              })
            }
          />
        )}

        <VenueFilters
          key={`${urlSearch}|${urlCategory}`}
          initialSearch={urlSearch}
          initialCategory={urlCategory}
          initialCity={urlCity}
          initialTags={urlTags}
          initialAmenities={urlAmenities}
          initialServices={urlServices}
          initialAccessibilityAttributes={urlAccessibility}
          initialTargetGroups={urlTargetGroups}
          preferenceChips={
            <PreferenceChips
              chips={prefChips}
              onToggle={togglePrefChip}
              onForget={forgetPrefChip}
            />
          }
          onFiltersChange={handleFiltersChange}
        />

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {!loading && venues.length > 0 && (() => {
              const hasActiveFilters = Object.keys(currentFilters).length > 0;
              const shown = filteredTotal ?? venues.length;
              const parts: string[] = [];
              if (typeof currentFilters.city === 'string' && currentFilters.city)
                parts.push(currentFilters.city);
              if (typeof currentFilters.category === 'string' && currentFilters.category)
                parts.push(currentFilters.category.replace(/[_-]/g, ' '));
              return (
                <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
                  {shown.toLocaleString()} venue{shown !== 1 ? 's' : ''}
                  {parts.length > 0 && <span className="ml-1 text-xs">· {parts.join(' · ')}</span>}
                  {!hasActiveFilters && datasetTotal !== null && datasetTotal !== shown && (
                    <span className="ml-1 text-xs">of {datasetTotal.toLocaleString()}</span>
                  )}
                </p>
              );
            })()}
          </div>

          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger
                aria-label={t('pages.venues.sortBy', 'Sort venues')}
                className="w-36 h-9 text-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VENUES_V2_ENABLED && (
                  <SelectItem value="relevance">
                    {t('pages.venues.sortRelevance', 'For you')}
                  </SelectItem>
                )}
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

        <AnimatePresence mode="wait" initial={false}>
          {viewMode === 'grid' ? (
            <motion.div
              key="grid"
              className="flex flex-col gap-12"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              {error && !loading && <ErrorState message={error} onRetry={() => fetchVenues()} />}

              {showRails && <VenueGuidesStream limit={6} />}

              {showRails && (
                <VenuesRails
                  userLocation={userLocation}
                  primaryCityId={primaryCity.id}
                  primaryCityName={primaryCity.name}
                />
              )}

              {showRails && (
                <LeaderboardWidget cityId={primaryCity.id} cityName={primaryCity.name} />
              )}

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

              {/* Legacy "Recently added" rail only when V2 flag is OFF */}
              {!VENUES_V2_ENABLED && !loading && !hasAnyFilters && recentVenues.length >= 4 && (() => {
                const mainIds = new Set(venues.slice(0, 24).map((v) => v.id));
                const rail = recentVenues.filter((v) => !mainIds.has(v.id)).slice(0, 8);
                if (rail.length < 4) return null;
                return (
                  <section aria-label="Recently added venues" className="-mt-1">
                    <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
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

              {/* Section header for canonical grid when V2 + filters active */}
              {VENUES_V2_ENABLED && hasAnyFilters && !loading && venues.length > 0 && (
                <h2 className="text-2xl md:text-3xl font-semibold tracking-tight -mb-6">
                  {t('venues.results.title', 'Matching venues')}
                </h2>
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
                        await fetchVenues(
                          mergeChipFilters({ ...currentFilters, userLocation: userLocation ?? undefined }) as Parameters<typeof fetchVenues>[0],
                          baseFetchOptions({
                            page: nextPage,
                            pageSize: PAGE_SIZE,
                            append: true,
                            sort: sortBy,
                          }),
                        );
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
                  <div className="pointer-events-auto rounded-element bg-background p-6 text-center">
                    <MapPin className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium">
                      {t('pages.venues.filteredEmpty.title', 'No venues match your filters')}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
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
