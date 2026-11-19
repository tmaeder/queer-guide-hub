import { TravelDealCard } from '@/components/travel/TravelDealCard';
import { useCityAirport } from '@/hooks/useCityAirport';
import { useTravelDeals } from '@/hooks/useTravelDeals';
import { useVisitorOrigin } from '@/hooks/useVisitorOrigin';

/** Live fares from the visitor's nearest airport to the package city. */
export function InlineFlightDeals({ cityId, city }: { cityId: string; city: string }) {
  const { originIata, originCity, loading: originLoading } = useVisitorOrigin();
  const { data: destIata, isLoading: destLoading } = useCityAirport(cityId);
  const { data: deals, isLoading } = useTravelDeals({
    origin: originIata || undefined,
    destination: destIata || undefined,
    limit: 3,
    enabled: !!originIata && !!destIata,
  });

  if (originLoading || destLoading || isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <TravelDealCard key={i} loading />
        ))}
      </div>
    );
  }
  if (!deals || deals.length === 0) {
    return (
      <p className="text-13 text-muted-foreground">
        {originIata
          ? `No live fares to ${city} right now — compare all flights below.`
          : `Allow location to see fares to ${city} from your nearest airport.`}
      </p>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {deals.map((deal, i) => (
        <TravelDealCard
          key={`${deal.origin}-${deal.destination}-${i}`}
          deal={deal}
          originCity={originCity || undefined}
          destinationCity={city}
        />
      ))}
    </div>
  );
}
