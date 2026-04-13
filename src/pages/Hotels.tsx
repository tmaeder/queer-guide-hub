import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Hotel as HotelIcon, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HotelCard } from '@/components/hotels/HotelCard';
import { HotelFilters } from '@/components/hotels/HotelFilters';
import { useHotels, type HotelFilters as HotelFilterType } from '@/hooks/useHotels';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

export default function Hotels() {
  const navigate = useNavigate();
  const { hotels, loading, hasMore, fetchHotels } = useHotels(false);
  const [search, setSearch] = useState('');
  const [hotelType, setHotelType] = useState('all');
  const [priceRange, setPriceRange] = useState('all');
  const [page, setPage] = useState(1);

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
            Hotels & BnBs
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            LGBTQ+ friendly accommodations worldwide
          </Typography>
        </Box>
        <Button onClick={() => navigate('/submit/hotel')} variant="outline" size="sm">
          <Plus style={{ width: 16, height: 16, marginRight: 6 }} />
          Submit Hotel
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
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <HotelIcon style={{ width: 48, height: 48, opacity: 0.3, margin: '0 auto 16px' }} />
          <Typography variant="h6" color="text.secondary">
            No hotels found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Try adjusting your filters or check back later.
          </Typography>
        </Box>
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
                {loading ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
                Load More
              </Button>
            </Box>
          )}
        </>
      )}
    </Container>
  );
}
