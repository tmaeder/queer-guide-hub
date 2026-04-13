import { useSearchParams } from 'react-router';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Plane, TrendingUp } from 'lucide-react';
import { FlightSearchForm } from '@/components/travel/FlightSearchForm';
import { TravelDealCard } from '@/components/travel/TravelDealCard';
import { useTravelDeals } from '@/hooks/useTravelDeals';
import { useVisitorOrigin } from '@/hooks/useVisitorOrigin';
import Skeleton from '@mui/material/Skeleton';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

export default function Travel() {
  const theme = useTheme();
  const [searchParams] = useSearchParams();
  const initialTo = searchParams.get('to') || undefined;

  const { originIata, originCity, loading: originLoading } = useVisitorOrigin();

  const { data: popularDeals, isLoading: popularLoading } = useTravelDeals({
    origin: originIata || undefined,
    type: 'popular_routes',
    limit: 9,
    enabled: !!originIata,
  });

  return (
    <Container sx={{ py: { xs: 6, md: 10 } }}>
      {/* Hero */}
      <Paper
        variant="outlined"
        sx={{ p: { xs: 3, sm: 4 }, mb: 4, bgcolor: 'background.paper', textAlign: 'center' }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              bgcolor: 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Plane style={{ height: 28, width: 28, color: 'white' }} />
          </Box>
        </Box>
        <Typography variant="h3" sx={{ fontWeight: 800, letterSpacing: '-0.02em', mb: 1 }}>
          Find Flights
        </Typography>
        <Typography sx={{ color: 'text.secondary', maxWidth: 480, mx: 'auto' }}>
          Discover the best flight deals to LGBTQ+ friendly destinations worldwide
        </Typography>
      </Paper>

      {/* Search Form */}
      <Box sx={{ mb: 5 }}>
        <FlightSearchForm initialDestination={initialTo} />
      </Box>

      {/* Popular Deals */}
      <Paper variant="outlined" sx={{ p: 3, mb: 4, bgcolor: 'background.paper' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <TrendingUp style={{ height: 20, width: 20, color: theme.palette.brand.main }} />
          <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.01em' }}>
            {originCity ? `Popular Deals from ${originCity}` : 'Popular Flight Deals'}
          </Typography>
        </Box>

        {originLoading || popularLoading ? (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
              gap: 2,
            }}
          >
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} variant="rounded" height={140} />
            ))}
          </Box>
        ) : popularDeals && popularDeals.length > 0 ? (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
              gap: 2,
            }}
          >
            {popularDeals.map((deal, i) => (
              <TravelDealCard
                key={`${deal.origin}-${deal.destination}-${i}`}
                deal={deal}
                originCity={originCity || undefined}
              />
            ))}
          </Box>
        ) : (
          <Box sx={{ textAlign: 'center', py: 4, bgcolor: 'action.hover', borderRadius: 2 }}>
            <Typography sx={{ color: 'text.secondary' }}>
              {originIata
                ? 'No popular deals available right now. Try searching for a specific route above.'
                : 'Enable location services to see personalized deals, or search for a route above.'}
            </Typography>
          </Box>
        )}
      </Paper>

      {/* CTA */}
      <Paper
        variant="outlined"
        sx={{ textAlign: 'center', py: 3, px: 3, bgcolor: 'background.paper' }}
      >
        <Typography sx={{ fontWeight: 600, mb: 1 }}>
          Explore LGBTQ+ Friendly Destinations
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', mb: 2 }}>
          Discover cities and countries with detailed safety information and travel guides
        </Typography>
        <Link to="/places">
          <Button variant="outline">Browse Destinations</Button>
        </Link>
      </Paper>
    </Container>
  );
}
