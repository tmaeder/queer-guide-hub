import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Hotel as HotelIcon, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HotelCard } from '@/components/hotels/HotelCard';
import { HotelFilters } from '@/components/hotels/HotelFilters';
import { useHotels, type HotelFilters as HotelFilterType } from '@/hooks/useHotels';
import { EmptyState, type EmptyStateFilterChip } from '@/components/ui/EmptyState';
import { useTranslation } from 'react-i18next';

export default function Hotels() {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { hotels, loading, hasMore, datasetTotal, fetchHotels } = useHotels(false);
  const [search, setSearch] = useState('');
  const [hotelType, setHotelType] = useState('all');
  const [priceRange, setPriceRange] = useState('all');
  const [page, setPage] = useState(1);

  const hasActiveFilters = Boolean(search) || hotelType !== 'all' || priceRange !== 'all';

  const resetFilters = useCallback(() => {
    setSearch('');
    setHotelType('all');
    setPriceRange('all');
  }, []);

  const activeFilterChips = useMemo<EmptyStateFilterChip[]>(() => {
    const chips: EmptyStateFilterChip[] = [];
    if (search) chips.push({ label: `“${search}”`, onRemove: () => setSearch('') });
    if (hotelType !== 'all') chips.push({ label: hotelType, onRemove: () => setHotelType('all') });
    if (priceRange !== 'all') {
      chips.push({ label: '$'.repeat(Number(priceRange)), onRemove: () => setPriceRange('all') });
    }
    return chips;
  }, [search, hotelType, priceRange]);

  const isModuleEmpty = datasetTotal === 0 || (datasetTotal === null && !hasActiveFilters);

  const buildFilters = useCallback((): HotelFilterType => {
    const filters: HotelFilterType = {};
    if (search) filters.search = search;
    if (hotelType !== 'all') filters.hotel_type = hotelType;
    if (priceRange !== 'all') filters.price_range = Number(priceRange);
    return filters;
  }, [search, hotelType, priceRange]);

  useEffect(() => {
    setPage(1);
    fetchHotels(buildFilters(), { page: 1 });
  }, [search, hotelType, priceRange, buildFilters, fetchHotels]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchHotels(buildFilters(), { page: nextPage, append: true });
  };

  return (
    <div className="container mx-auto py-12 md:py-20 px-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h4 className="text-2xl font-bold">
            {t('pages.hotels.title', 'Hotels & BnBs')}
          </h4>
          <p className="text-muted-foreground mt-1">
            {t('pages.hotels.subtitle', 'LGBTQ+ friendly accommodations worldwide')}
          </p>
        </div>
        <Button onClick={() => navigate('/submit/hotel')} variant="outline" size="sm">
          <Plus size={16} />
          {t('pages.hotels.submitHotel', 'Submit Hotel')}
        </Button>
      </div>

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
