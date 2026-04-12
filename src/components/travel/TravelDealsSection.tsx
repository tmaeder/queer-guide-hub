import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import { Plane, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TravelDealCard } from './TravelDealCard';
import { useTravelDeals } from '@/hooks/useTravelDeals';
import { useVisitorOrigin } from '@/hooks/useVisitorOrigin';
import { Link } from 'react-router';

interface TravelDealsSectionProps {
  destinationIata?: string | null;
  destinationCity: string;
  destinationCountryCode?: string;
}

export function TravelDealsSection({
  destinationIata,
  destinationCity,
  _destinationCountryCode,
}: TravelDealsSectionProps) {
  const { originIata, originCity, loading: originLoading } = useVisitorOrigin();

  const { data: deals, isLoading: dealsLoading } = useTravelDeals({
    origin: originIata || undefined,
    destination: destinationIata || undefined,
    type: destinationIata ? 'flights' : 'popular_routes',
    limit: 6,
    enabled: !!originIata,
  });

  const loading = originLoading || dealsLoading;

  if (originLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Skeleton variant="text" width={200} height={28} />
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
            gap: 2,
          }}
        >
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={140} />
          ))}
        </Box>
      </Box>
    );
  }

  if (!originIata) {
    return (
      <Box sx={{ textAlign: 'center', py: 3 }}>
        <Typography sx={{ color: 'text.secondary', mb: 1 }}>
          Enable location to see personalized flight deals to {destinationCity}
        </Typography>
        <Link to="/travel">
          <Button variant="outline" size="sm">
            <Plane style={{ height: 14, width: 14, marginRight: 6 }} />
            Search Flights Manually
          </Button>
        </Link>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>
            Flights from {originCity || originIata}
            {destinationIata ? ` to ${destinationCity}` : ''}
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
            Best deals based on your location
          </Typography>
        </Box>
        <Link to={`/travel${destinationIata ? `?to=${destinationIata}` : ''}`}>
          <Button variant="ghost" size="sm">
            More <ArrowRight style={{ height: 14, width: 14, marginLeft: 4 }} />
          </Button>
        </Link>
      </Box>

      {loading ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
            gap: 2,
          }}
        >
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={140} />
          ))}
        </Box>
      ) : deals && deals.length > 0 ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
            gap: 2,
          }}
        >
          {deals.map((deal, i) => (
            <TravelDealCard
              key={`${deal.origin}-${deal.destination}-${deal.departure_date}-${i}`}
              deal={deal}
              originCity={originCity || undefined}
              destinationCity={destinationCity}
            />
          ))}
        </Box>
      ) : (
        <Box sx={{ textAlign: 'center', py: 3, bgcolor: 'action.hover', borderRadius: 2 }}>
          <Plane
            style={{
              height: 24,
              width: 24,
              margin: '0 auto 8px',
              color: 'var(--muted-foreground)',
            }}
          />
          <Typography sx={{ color: 'text.secondary', mb: 1 }}>
            No deals available right now
          </Typography>
          <Link to={`/travel${destinationIata ? `?to=${destinationIata}` : ''}`}>
            <Button variant="outline" size="sm">
              Search Flights to {destinationCity}
            </Button>
          </Link>
        </Box>
      )}
    </Box>
  );
}
