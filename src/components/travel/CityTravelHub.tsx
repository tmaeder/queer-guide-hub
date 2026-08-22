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
    <div className="flex justify-between items-center mb-4">
      <div className="flex items-center gap-2">
        <Icon style={{ height: 18, width: 18 }} className="text-primary" />
        <span className="font-semibold" style={{ fontSize: '0.95rem' }}>
          {title}
        </span>
      </div>
      {/* asChild, not a Link wrapping a Button — that nests a <button>
          inside an <a>, which is invalid HTML. */}
      <Button asChild variant="ghost" size="sm">
        <LocalizedLink to={moreLink} className="no-underline">
          See all <ArrowRight size={14} className="ml-1" />
        </LocalizedLink>
      </Button>
    </div>
  );
}

function ResultsRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">{children}</div>;
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

export function CityTravelHub({
  destinationIata,
  destinationCity,
  equalityScore,
}: CityTravelHubProps) {
  const { originIata, originCity, loading: originLoading } = useVisitorOrigin();

  const { data: flightDeals, isLoading: flightsLoading } = useTravelDeals({
    origin: originIata || undefined,
    destination: destinationIata || undefined,
    type: 'flights',
    limit: 3,
    // Without a destination IATA there is nothing truthful to show — a
    // popular_routes fallback gets mislabeled with this city's name.
    enabled: !!originIata && !!destinationIata,
  });

  // Only deals that actually fly to this city, with a real price.
  const matchedDeals = (flightDeals ?? []).filter(
    (deal) => deal.destination === destinationIata && Number.isFinite(deal.price) && deal.price > 0,
  );

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
    <div className="flex flex-col gap-6">
      {/* Flights */}
      <div>
        <SectionHeader
          icon={Plane}
          title={originCity ? `Flights from ${originCity}` : 'Flights'}
          moreLink={`/travel?tab=flights${destinationIata ? `&to=${destinationIata}` : ''}`}
        />
        {originLoading || flightsLoading ? (
          <LoadingRow />
        ) : matchedDeals.length > 0 ? (
          <ResultsRow>
            {matchedDeals.slice(0, 3).map((deal, i) => (
              <TravelDealCard
                key={`${deal.origin}-${deal.destination}-${i}`}
                deal={deal}
                originCity={originCity || undefined}
                destinationCity={destinationCity}
              />
            ))}
          </ResultsRow>
        ) : (
          <div className="text-center py-4 bg-accent rounded-element">
            <p className="text-muted-foreground text-sm">
              {originIata ? 'No flight deals available' : 'Enable location to see flight deals'}
            </p>
          </div>
        )}
      </div>

      {/* Best Time to Fly */}
      {destinationIata && (
        <FlightCalendarWidget
          destinationIata={destinationIata}
          destinationCity={destinationCity}
          type="monthly"
        />
      )}

      {/* Hotels — rule 2: no results, no module. The old fallback printed
          "No hotels found in Berlin" under a full section header, which is
          112px spent telling the reader nothing they can act on. The same
          cleanup already removed this shape from the news and districts
          sections of this page. */}
      {(hotelsLoading || (hotelResults && hotelResults.length > 0)) && (
        <div>
          <SectionHeader
            icon={Hotel}
            title={`Hotels in ${destinationCity}`}
            moreLink={`/travel?tab=hotels&city=${encodeURIComponent(destinationCity)}`}
          />
          {hotelsLoading ? (
            <LoadingRow />
          ) : (
            <ResultsRow>
              {hotelResults!.slice(0, 3).map((hotel) => (
                <UnifiedBookingCard key={hotel.id} result={hotel} />
              ))}
            </ResultsRow>
          )}
        </div>
      )}

      {/* Activities — same rule. Its empty state pointed at /events, which on
          this page is the "Next departures" section a few hundred pixels up:
          a 170px signpost to something already on screen. */}
      {(activitiesLoading || (activityResults && activityResults.length > 0)) && (
        <div>
          <SectionHeader
            icon={Ticket}
            title={`Things to do in ${destinationCity}`}
            moreLink={`/travel?tab=activities&city=${encodeURIComponent(destinationCity)}`}
          />
          {activitiesLoading ? (
            <LoadingRow />
          ) : (
            <ResultsRow>
              {activityResults!.slice(0, 3).map((a) => (
                <UnifiedBookingCard key={a.id} result={a} />
              ))}
            </ResultsRow>
          )}
        </div>
      )}

      {/* Car rental, airport transfer and insurance are one row, not three.
          Each is a single affiliate link behind a heading, and stacked they
          cost ~230px of full-width bands to say three short things. Side by
          side from `sm` they read as what they are — the book-the-rest-of-it
          shelf — and stack back on a phone. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CarRentalSection city={destinationCity} compact />
        <TransferSection
          city={destinationCity}
          equalityScore={equalityScore}
          airportCode={destinationIata}
          compact
        />
        <InsuranceSection compact />
      </div>

      {/* CTA */}
      <div className="text-center">
        <Button asChild>
          <LocalizedLink to="/trips" className="no-underline">
            Plan a trip to {destinationCity}
          </LocalizedLink>
        </Button>
      </div>
    </div>
  );
}
