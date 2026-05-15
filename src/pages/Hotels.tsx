import { useEffect, useCallback, useMemo, useState, useRef, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Hotel as HotelIcon, Plus, Loader2, Map as MapIcon, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HotelCard } from '@/components/hotels/HotelCard';
import { HotelFilters } from '@/components/hotels/HotelFilters';
import { HOTEL_TYPE_LABEL, HOTEL_PRICE_LABEL } from '@/components/hotels/hotelFilterOptions';
import { HOTEL_VIBE_LABEL } from '@/components/hotels/hotelVibes';
import { HotelHero } from '@/components/hotels/HotelHero';
import { VibeChipsRow } from '@/components/hotels/VibeChipsRow';
import { DestinationTiles } from '@/components/hotels/DestinationTiles';
import { HotelScrollerRow } from '@/components/hotels/HotelScrollerRow';
import { useHotels, type HotelFilters as HotelFilterType } from '@/hooks/useHotels';
import { useHotelFilterMeta } from '@/hooks/useHotelFilterMeta';
import {
  useFeaturedHotel,
  useEditorialHotels,
  useTopHotelCities,
} from '@/hooks/useHotelDiscovery';
import { useDebounce } from '@/hooks/useDebounce';
import { useMeta } from '@/hooks/useMeta';
import { EmptyState, type EmptyStateFilterChip } from '@/components/ui/EmptyState';
import { useTranslation } from 'react-i18next';
import { ColourfulText } from '@/components/effects/ColourfulText';
import { SpotlightV2 } from '@/components/effects/SpotlightV2';

// Map view is heavy (maplibre-gl ~200kb). Only load when toggled.
const HotelsMap = lazy(() =>
  import('@/components/hotels/HotelsMap').then((m) => ({ default: m.HotelsMap })),
);

type ViewMode = 'grid' | 'map';

export default function Hotels() {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { hotels, loading, hasMore, datasetTotal, fetchHotels } = useHotels(false);
  const { data: filterMeta } = useHotelFilterMeta();

  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [hotelType, setHotelType] = useState(() => searchParams.get('type') ?? 'all');
  const [priceRange, setPriceRange] = useState(() => searchParams.get('price') ?? 'all');
  const [vibe, setVibe] = useState<string | null>(() => searchParams.get('vibe'));
  const [city, setCity] = useState<string | null>(() => searchParams.get('city'));
  const [view, setView] = useState<ViewMode>(
    () => (searchParams.get('view') === 'map' ? 'map' : 'grid'),
  );
  const [page, setPage] = useState(1);

  useMeta({
    title: 'LGBTQ+ Hotels & Stays | Queer Guide',
    description:
      'Browse queer-friendly hotels, B&Bs, hostels and resorts in cities and queer villages worldwide. Safety notes, vibes, and editor picks.',
    canonicalPath: '/hotels',
  });

  // Hydrate state from URL when the URL changes externally (back button, paste).
  const lastSyncedRef = useRef('');
  useEffect(() => {
    const key = [
      searchParams.get('q') ?? '',
      searchParams.get('type') ?? 'all',
      searchParams.get('price') ?? 'all',
      searchParams.get('vibe') ?? '',
      searchParams.get('city') ?? '',
      searchParams.get('view') ?? 'grid',
    ].join('|');
    if (key === lastSyncedRef.current) return;
    setSearch(searchParams.get('q') ?? '');
    setHotelType(searchParams.get('type') ?? 'all');
    setPriceRange(searchParams.get('price') ?? 'all');
    setVibe(searchParams.get('vibe'));
    setCity(searchParams.get('city'));
    setView(searchParams.get('view') === 'map' ? 'map' : 'grid');
  }, [searchParams]);

  const debouncedSearch = useDebounce(search, 300);

  // Reflect state into the URL.
  useEffect(() => {
    const next = new URLSearchParams();
    if (debouncedSearch) next.set('q', debouncedSearch);
    if (hotelType !== 'all') next.set('type', hotelType);
    if (priceRange !== 'all' && filterMeta?.priceAvailable) next.set('price', priceRange);
    if (vibe) next.set('vibe', vibe);
    if (city) next.set('city', city);
    if (view === 'map') next.set('view', 'map');
    const nextStr = next.toString();
    const currentStr = searchParams.toString();
    const key = [
      debouncedSearch,
      hotelType,
      filterMeta?.priceAvailable ? priceRange : 'all',
      vibe ?? '',
      city ?? '',
      view,
    ].join('|');
    lastSyncedRef.current = key;
    if (nextStr !== currentStr) {
      setSearchParams(next, { replace: true });
    }
  }, [
    debouncedSearch,
    hotelType,
    priceRange,
    vibe,
    city,
    view,
    filterMeta?.priceAvailable,
    searchParams,
    setSearchParams,
  ]);

  const effectivePriceRange = filterMeta?.priceAvailable ? priceRange : 'all';
  const hasActiveFilters =
    Boolean(search) ||
    hotelType !== 'all' ||
    effectivePriceRange !== 'all' ||
    Boolean(vibe) ||
    Boolean(city);

  const resetFilters = useCallback(() => {
    setSearch('');
    setHotelType('all');
    setPriceRange('all');
    setVibe(null);
    setCity(null);
  }, []);

  const activeFilterChips = useMemo<EmptyStateFilterChip[]>(() => {
    const chips: EmptyStateFilterChip[] = [];
    if (search) chips.push({ label: `“${search}”`, onRemove: () => setSearch('') });
    if (hotelType !== 'all') {
      chips.push({
        label: HOTEL_TYPE_LABEL[hotelType] ?? hotelType,
        onRemove: () => setHotelType('all'),
      });
    }
    if (effectivePriceRange !== 'all') {
      chips.push({
        label:
          HOTEL_PRICE_LABEL[effectivePriceRange] ??
          '$'.repeat(Number(effectivePriceRange) || 0),
        onRemove: () => setPriceRange('all'),
      });
    }
    if (vibe) {
      chips.push({
        label: HOTEL_VIBE_LABEL[vibe] ?? vibe,
        onRemove: () => setVibe(null),
      });
    }
    if (city) {
      chips.push({ label: city, onRemove: () => setCity(null) });
    }
    return chips;
  }, [search, hotelType, effectivePriceRange, vibe, city]);

  const isModuleEmpty = datasetTotal === 0 || (datasetTotal === null && !hasActiveFilters);

  const buildFilters = useCallback((): HotelFilterType => {
    const filters: HotelFilterType = {};
    if (debouncedSearch) filters.search = debouncedSearch;
    if (hotelType !== 'all') filters.hotel_type = hotelType;
    if (effectivePriceRange !== 'all') filters.price_range = Number(effectivePriceRange);
    if (vibe) filters.tagSlug = vibe;
    if (city) filters.city = city;
    return filters;
  }, [debouncedSearch, hotelType, effectivePriceRange, vibe, city]);

  useEffect(() => {
    setPage(1);
    fetchHotels(buildFilters(), { page: 1, mapMode: view === 'map' });
  }, [debouncedSearch, hotelType, effectivePriceRange, vibe, city, view, buildFilters, fetchHotels]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchHotels(buildFilters(), { page: nextPage, append: true });
  };

  // Discovery data — only fetch / render on the bare landing state.
  const showDiscovery = !hasActiveFilters && view === 'grid';
  const { hotel: featuredHotel } = useFeaturedHotel();
  const { inVillages, picks } = useEditorialHotels(featuredHotel?.id);
  const { cities: topCities } = useTopHotelCities(8);

  return (
    <div className="relative">
      <SpotlightV2 anchor="top-center" intensity={0.12} />
      <div className="container mx-auto py-12 md:py-16 px-4 space-y-10 relative">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            <ColourfulText text={t('pages.hotels.title', 'Stays')} />
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('pages.hotels.subtitle', 'LGBTQ+ friendly accommodations worldwide')}
          </p>
        </div>
        <Button onClick={() => navigate('/submit/hotel')} variant="outline" size="sm">
          <Plus size={16} />
          {t('pages.hotels.submitHotel', 'Submit Hotel')}
        </Button>
      </div>

      {showDiscovery && featuredHotel && (
        <HotelHero hotel={featuredHotel} />
      )}

      <VibeChipsRow active={vibe} onChange={setVibe} />

      {showDiscovery && topCities.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Top cities for queer stays</h3>
          <DestinationTiles cities={topCities} />
        </section>
      )}

      {showDiscovery && inVillages.length > 0 && (
        <HotelScrollerRow
          title="In queer villages"
          subtitle="Hotels in historic LGBTQ+ neighborhoods"
          hotels={inVillages}
        />
      )}

      {showDiscovery && picks.length > 0 && (
        <HotelScrollerRow
          title="Editor's picks"
          hotels={picks}
        />
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-lg font-semibold">
            {hasActiveFilters ? 'Matching hotels' : 'All hotels'}
          </h3>
          <div className="inline-flex border border-foreground/20">
            <button
              type="button"
              onClick={() => setView('grid')}
              aria-pressed={view === 'grid'}
              className={
                'px-3 py-2 text-sm inline-flex items-center gap-1.5 ' +
                (view === 'grid'
                  ? 'bg-foreground text-background'
                  : 'bg-background hover:bg-muted')
              }
            >
              <LayoutGrid className="w-4 h-4" /> Grid
            </button>
            <button
              type="button"
              onClick={() => setView('map')}
              aria-pressed={view === 'map'}
              className={
                'px-3 py-2 text-sm inline-flex items-center gap-1.5 border-l border-foreground/20 ' +
                (view === 'map'
                  ? 'bg-foreground text-background'
                  : 'bg-background hover:bg-muted')
              }
            >
              <MapIcon className="w-4 h-4" /> Map
            </button>
          </div>
        </div>

        <HotelFilters
          search={search}
          onSearchChange={setSearch}
          hotelType={hotelType}
          onTypeChange={setHotelType}
          priceRange={priceRange}
          onPriceChange={setPriceRange}
        />

        {view === 'map' ? (
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-[560px] border border-foreground/10">
                <Loader2 className="animate-spin" />
              </div>
            }
          >
            <HotelsMap hotels={hotels} />
          </Suspense>
        ) : loading && hotels.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (<HotelCard key={i} loading />))}
          </div>
        ) : hotels.length === 0 ? (
          isModuleEmpty ? (
            <EmptyState
              icon={HotelIcon}
              variant="empty"
              title={t('pages.hotels.emptyDataset.title', 'No hotels yet')}
              description={t(
                'pages.hotels.emptyDataset.body',
                "We haven't added any hotels here yet. Help us grow the guide by submitting one.",
              )}
              primaryAction={{
                label: t('pages.hotels.submitHotel', 'Submit Hotel'),
                onClick: () => navigate('/submit/hotel'),
              }}
            />
          ) : (
            <EmptyState
              icon={HotelIcon}
              variant="filtered"
              title={t('pages.hotels.filteredEmpty.title', 'No hotels match your filters')}
              description={t(
                'pages.hotels.filteredEmpty.body',
                'Try adjusting your filters or search to see more results.',
              )}
              activeFilters={activeFilterChips}
              primaryAction={{
                label: t('pages.hotels.submitHotel', 'Submit Hotel'),
                onClick: () => navigate('/submit/hotel'),
              }}
              secondaryAction={
                hasActiveFilters
                  ? {
                      label: t('pages.hotels.resetFilters', 'Reset filters'),
                      onClick: resetFilters,
                      variant: 'outline',
                    }
                  : undefined
              }
            />
          )
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {hotels.map((hotel) => (
                <HotelCard key={hotel.id} hotel={hotel} />
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center mt-8">
                <Button variant="outline" onClick={handleLoadMore} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-label="Loading" /> : null}
                  {t('common.loadMore', 'Load More')}
                </Button>
              </div>
            )}
          </>
        )}
      </section>
      </div>
    </div>
  );
}
