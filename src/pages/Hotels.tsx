import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Hotel as HotelIcon, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HotelCard } from '@/components/hotels/HotelCard';
import { HotelFilters } from '@/components/hotels/HotelFilters';
import { HOTEL_TYPE_LABEL, HOTEL_PRICE_LABEL } from '@/components/hotels/hotelFilterOptions';
import { useHotels, type HotelFilters as HotelFilterType } from '@/hooks/useHotels';
import { useHotelFilterMeta } from '@/hooks/useHotelFilterMeta';
import { useDebounce } from '@/hooks/useDebounce';
import { EmptyState, type EmptyStateFilterChip } from '@/components/ui/EmptyState';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/layout/PageHeader';

export default function Hotels() {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { hotels, loading, hasMore, datasetTotal, fetchHotels } = useHotels(false);
  const { data: filterMeta } = useHotelFilterMeta();

  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [hotelType, setHotelType] = useState(() => searchParams.get('type') ?? 'all');
  const [priceRange, setPriceRange] = useState(() => searchParams.get('price') ?? 'all');
  const [page, setPage] = useState(1);

  // Hydrate state from URL when the URL changes externally (back button, paste).
  const lastSyncedRef = useRef('');
  useEffect(() => {
    const key = `${searchParams.get('q') ?? ''}|${searchParams.get('type') ?? 'all'}|${
      searchParams.get('price') ?? 'all'
    }`;
    if (key === lastSyncedRef.current) return;
    setSearch(searchParams.get('q') ?? '');
    setHotelType(searchParams.get('type') ?? 'all');
    setPriceRange(searchParams.get('price') ?? 'all');
  }, [searchParams]);

  const debouncedSearch = useDebounce(search, 300);

  // Reflect debounced state into the URL.
  useEffect(() => {
    const next = new URLSearchParams();
    if (debouncedSearch) next.set('q', debouncedSearch);
    if (hotelType !== 'all') next.set('type', hotelType);
    if (priceRange !== 'all' && filterMeta?.priceAvailable) next.set('price', priceRange);
    const nextStr = next.toString();
    const currentStr = searchParams.toString();
    const key = `${debouncedSearch}|${hotelType}|${
      filterMeta?.priceAvailable ? priceRange : 'all'
    }`;
    lastSyncedRef.current = key;
    if (nextStr !== currentStr) {
      setSearchParams(next, { replace: true });
    }
  }, [debouncedSearch, hotelType, priceRange, filterMeta?.priceAvailable, searchParams, setSearchParams]);

  const effectivePriceRange = filterMeta?.priceAvailable ? priceRange : 'all';
  const hasActiveFilters =
    Boolean(search) || hotelType !== 'all' || effectivePriceRange !== 'all';

  const resetFilters = useCallback(() => {
    setSearch('');
    setHotelType('all');
    setPriceRange('all');
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
    return chips;
  }, [search, hotelType, effectivePriceRange]);

  const isModuleEmpty = datasetTotal === 0 || (datasetTotal === null && !hasActiveFilters);

  const buildFilters = useCallback((): HotelFilterType => {
    const filters: HotelFilterType = {};
    if (debouncedSearch) filters.search = debouncedSearch;
    if (hotelType !== 'all') filters.hotel_type = hotelType;
    if (effectivePriceRange !== 'all') filters.price_range = Number(effectivePriceRange);
    return filters;
  }, [debouncedSearch, hotelType, effectivePriceRange]);

  useEffect(() => {
    setPage(1);
    fetchHotels(buildFilters(), { page: 1 });
  }, [debouncedSearch, hotelType, effectivePriceRange, buildFilters, fetchHotels]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchHotels(buildFilters(), { page: nextPage, append: true });
  };

  return (
    <div className="container mx-auto py-8 md:py-12 px-4">
      <PageHeader
        eyebrow={t('pages.hotels.eyebrow', 'Where to stay')}
        title={t('pages.hotels.title', 'Stays')}
        subtitle={t('pages.hotels.subtitle', 'LGBTQ+ friendly accommodations worldwide')}
        actions={
          <Button onClick={() => navigate('/submit/hotel')} variant="outline" size="sm">
            <Plus size={16} />
            {t('pages.hotels.submitHotel', 'Submit Hotel')}
          </Button>
        }
      />

      <HotelFilters
        search={search}
        onSearchChange={setSearch}
        hotelType={hotelType}
        onTypeChange={setHotelType}
        priceRange={priceRange}
        onPriceChange={setPriceRange}
      />

      {loading && hotels.length === 0 ? (
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
    </div>
  );
}
