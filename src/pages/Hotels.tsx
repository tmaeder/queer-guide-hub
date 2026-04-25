import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Hotel as HotelIcon, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HotelCard } from '@/components/hotels/HotelCard';
import { HotelFilters } from '@/components/hotels/HotelFilters';
import { useHotels, type HotelFilters as HotelFilterType } from '@/hooks/useHotels';
import { EmptyState, type EmptyStateFilterChip } from '@/components/ui/EmptyState';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
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
    <Container sx={{ py: { xs: 6, md: 10 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            {t('pages.hotels.title', 'Hotels & BnBs')}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {t('pages.hotels.subtitle', 'LGBTQ+ friendly accommodations worldwide')}
          </Typography>
        </Box>
        <Button onClick={() => navigate('/submit/hotel')} variant="outline" size="sm">
          <Plus style={{ width: 16, height: 16, marginRight: 6 }} />
          {t('pages.hotels.submitHotel', 'Submit Hotel')}
        </Button>
      </Box>

      <HotelFilters
        search={search}
        onSearchChange={setSearch}
        hotelType={hotelType}
        onTypeChange={setHotelType}
        priceRange={priceRange}
        onPriceChange={setPriceRange}
      />

      {loading && hotels.length === 0 ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 2 }}>
          {Array.from({ length: 8 }).map((_, i) => (<HotelCard key={i} loading />))}
        </Box>
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
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(3, 1fr)',
                lg: 'repeat(4, 1fr)',
              },
              gap: 2,
            }}
          >
            {hotels.map((hotel) => (
              <HotelCard key={hotel.id} hotel={hotel} />
            ))}
          </Box>

          {hasMore && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
              <Button variant="outline" onClick={handleLoadMore} disabled={loading}>
                {loading ? <CircularProgress size={16} sx={{ mr: 1 }} aria-label="Loading" /> : null}
                {t('common.loadMore', 'Load More')}
              </Button>
            </Box>
          )}
        </>
      )}
    </Container>
  );
}
