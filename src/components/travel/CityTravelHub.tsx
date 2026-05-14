import { Plane, Hotel, Ticket, ArrowRight } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TravelDealCard } from './TravelDealCard';
import { UnifiedBookingCard } from '@/components/booking/UnifiedBookingCard';
import { useTravelDeals } from '@/hooks/useTravelDeals';
import { useHotelSearch } from '@/hooks/useHotelSearch';
import { useActivitySearch } from '@/hooks/useActivitySearch';
import { useVisitorOrigin } from '@/hooks/useVisitorOrigin';
import { FlightCalendarWidget } from './FlightCalendarWidget';
import { CarRentalSection } from './CarRentalSection';
import { TransferSection } from './TransferSection';
import { InsuranceSection } from './InsuranceSection';

interface CityTravelHubProps {
  destinationIata?: string | null;
  destinationCity: string;
  destinationCountryCode?: string;
  equalityScore?: number | null;
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
    <div className="flex justify-between items-center mb-3">
      <div className="flex items-center gap-2">
        <Icon style={{ height: 18, width: 18, color: 'var(--primary)' }} />
        <span className="font-semibold" style={{ fontSize: '0.95rem' }}>{title}</span>
      </div>
      <LocalizedLink to={moreLink}>
        <Button variant="ghost" size="sm">
          See all <ArrowRight style={{ height: 14, width: 14, marginLeft: 4 }} />
        </Button>
      </LocalizedLink>
    </div>
  );
}

function ResultsRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {children}
    </div>
  );
}

function LoadingRow() {
  return (
    <ResultsRow>
      {[1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={140} />)}
    </ResultsRow>
  );
}

export function CityTravelHub({ destinationIata, destinationCity, equalityScore }: CityTravelHubProps) {
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

  const { data: activityResults, isLoading: activitiesLoading } = useActivitySearch({
    city: destinationCity,
    limit: 3,
    enabled: !!destinationCity,
  });

  return (
    <div className="flex flex-col gap-8">
      {/* Flights */}
      <div>
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
              <TravelDealCard key={`${deal.origin}-${deal.destination}-${i}`} deal={deal} originCity={originCity || undefined} destinationCity={destinationCity} />
            ))}
          </ResultsRow>
        ) : (
          <div className="text-center py-4 bg-accent rounded">
            <p className="text-muted-foreground text-sm">
              {originIata ? 'No flight deals available' : 'Enable location to see flight deals'}
            </p>
          </div>
        )}
      </div>

      {/* Best Time to Fly */}
      {destinationIata && (
        <FlightCalendarWidget destinationIata={destinationIata} destinationCity={destinationCity} type="monthly" />
      )}

      {/* Hotels */}
      <div>
        <SectionHeader icon={Hotel} title={`Hotels in ${destinationCity}`} moreLink={`/travel?tab=hotels&city=${encodeURIComponent(destinationCity)}`} />
        {hotelsLoading ? <LoadingRow /> : hotelResults && hotelResults.length > 0 ? (
          <ResultsRow>
            {hotelResults.slice(0, 3).map((hotel) => <UnifiedBookingCard key={hotel.id} result={hotel} />)}
          </ResultsRow>
        ) : (
          <div className="text-center py-4 bg-accent rounded">
            <p className="text-muted-foreground text-sm">No hotels found in {destinationCity}</p>
          </div>
        )}
      </div>

      {/* Activities */}
      <div>
        <SectionHeader icon={Ticket} title={`Things to do in ${destinationCity}`} moreLink={`/travel?tab=activities&city=${encodeURIComponent(destinationCity)}`} />
        {activitiesLoading ? <LoadingRow /> : activityResults && activityResults.length > 0 ? (
          <ResultsRow>
            {activityResults.slice(0, 3).map((a) => <UnifiedBookingCard key={a.id} result={a} />)}
          </ResultsRow>
        ) : (
          <div className="text-center py-4 bg-accent rounded">
            <p className="text-muted-foreground text-sm">
              No activities found. Check <LocalizedLink to="/events" style={{ textDecoration: 'underline' }}>events</LocalizedLink> for things happening in {destinationCity}.
            </p>
          </div>
        )}
      </div>

      {/* Car Rental */}
      <CarRentalSection city={destinationCity} compact />

      {/* Airport Transfer (safety-aware) */}
      <TransferSection city={destinationCity} equalityScore={equalityScore} airportCode={destinationIata} compact />

      {/* Travel Insurance */}
      <InsuranceSection compact />

      {/* CTA */}
      <div className="text-center">
        <LocalizedLink to="/trips">
          <Button>Plan a trip to {destinationCity}</Button>
        </LocalizedLink>
      </div>
    </div>
  );
}
