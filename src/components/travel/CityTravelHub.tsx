import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Skeleton from '@mui/material/Skeleton';
import { Plane, Hotel, Ticket, ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { TravelDealCard } from './TravelDealCard';
import { UnifiedBookingCard } from '@/components/booking/UnifiedBookingCard';
import { useTravelDeals } from '@/hooks/useTravelDeals';
import { useHotelSearch } from '@/hooks/useHotelSearch';
import { useVisitorOrigin } from '@/hooks/useVisitorOrigin';

interface CityTravelHubProps {
  destinationIata?: string | null;
  destinationCity: string;
  destinationCountryCode?: string;
}

function SectionHeader({
  icon: Icon,
  title,
  moreLink,
}: {
  icon: typeof Plane;
  title: string;
  moreLink: string;
}) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Icon style={{ height: 18, width: 18, color: 'var(--primary)' }} />
        <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>{title}</Typography>
      </Box>
      <Link to={moreLink}>
        <Button variant="ghost" size="sm">
          See all <ArrowRight style={{ height: 14, width: 14, marginLeft: 4 }} />
        </Button>
      </Link>
    </Box>
  );
}

function ResultsRow({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
        gap: 2,
      }}
    >
      {children}
    </Box>
  );
}

function LoadingRow() {
  return (
    <ResultsRow>
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} variant="rounded" height={140} />
      ))}
    </ResultsRow>
  );
}

export function CityTravelHub({ destinationIata, destinationCity }: CityTravelHubProps) {
  const { originIata, originCity, loading: originLoading } = useVisitorOrigin();

  const { data: flightDeals, isLoading: flightsLoading } = useTravelDeals({
    origin: originIata || undefined,
    destination: destinationIata || undefined,
    type: destinationIata ? 'flights' : 'popular_routes',
    limit: 3,
    enabled: !!originIata,
  });

  const { data: hotelResults, isLoading: hotelsLoading } = useHotelSearch({
    city: destinationCity,
    limit: 3,
    enabled: !!destinationCity,
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Flights Section */}
      <Box>
        <SectionHeader
          icon={Plane}
          title={originCity ? `Flights from ${originCity}` : 'Flights'}
          moreLink={`/travel?tab=flights${destinationIata ? `&to=${destinationIata}` : ''}`}
        />
        {originLoading || flightsLoading ? (
          <LoadingRow />
        ) : flightDeals && flightDeals.length > 0 ? (
          <ResultsRow>
            {flightDeals.slice(0, 3).map((deal, i) => (
              <TravelDealCard
                key={`${deal.origin}-${deal.destination}-${i}`}
                deal={deal}
                originCity={originCity || undefined}
                destinationCity={destinationCity}
              />
            ))}
          </ResultsRow>
        ) : (
          <Box sx={{ textAlign: 'center', py: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
              {originIata ? 'No flight deals available' : 'Enable location to see flight deals'}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Hotels Section */}
      <Box>
        <SectionHeader
          icon={Hotel}
          title={`Hotels in ${destinationCity}`}
          moreLink={`/travel?tab=hotels&city=${encodeURIComponent(destinationCity)}`}
        />
        {hotelsLoading ? (
          <LoadingRow />
        ) : hotelResults && hotelResults.length > 0 ? (
          <ResultsRow>
            {hotelResults.slice(0, 3).map((hotel) => (
              <UnifiedBookingCard key={hotel.id} result={hotel} />
            ))}
          </ResultsRow>
        ) : (
          <Box sx={{ textAlign: 'center', py: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
              No hotels found in {destinationCity}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Activities Section (placeholder) */}
      <Box>
        <SectionHeader
          icon={Ticket}
          title={`Things to do in ${destinationCity}`}
          moreLink={`/travel?tab=activities`}
        />
        <Box sx={{ textAlign: 'center', py: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
            Activities coming soon. Check{' '}
            <Link to="/events" style={{ textDecoration: 'underline' }}>events</Link>{' '}
            for things happening in {destinationCity}.
          </Typography>
        </Box>
      </Box>

      {/* CTA */}
      <Box sx={{ textAlign: 'center' }}>
        <Link to={`/trips`}>
          <Button>Plan a trip to {destinationCity}</Button>
        </Link>
      </Box>
    </Box>
  );
}
