import { useState } from 'react';
import { AirportAutocomplete } from '@/components/travel/AirportAutocomplete';
import { TravelDealCard } from '@/components/travel/TravelDealCard';
import { useCityAirport } from '@/hooks/useCityAirport';
import { useTravelDeals } from '@/hooks/useTravelDeals';
import { useVisitorOrigin } from '@/hooks/useVisitorOrigin';

/**
 * Live fares to the package city, inline. The departure airport starts at the
 * visitor's nearest one (when location is shared) and can be changed in place;
 * fares update on pick, with no separate search step.
 */
export function InlineFlightDeals({ cityId, city }: { cityId: string; city: string }) {
  const { originIata, originCity, loading: originLoading } = useVisitorOrigin();
  const [picked, setPicked] = useState<{ iata: string; label: string } | null>(null);
  const origin = picked?.iata || originIata || '';
  const originLabel =
    picked?.label || (originIata && originCity ? `${originCity} (${originIata})` : '');
  const originName = picked ? picked.label.split(' (')[0] : originCity || undefined;

  const { data: destIata, isLoading: destLoading } = useCityAirport(cityId);
  const {
    data: deals,
    isLoading,
    isError,
  } = useTravelDeals({
    origin: origin || undefined,
    destination: destIata || undefined,
    limit: 3,
    enabled: !!origin && !!destIata && origin !== destIata,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-sm">
        <AirportAutocomplete
          value={origin}
          displayLabel={originLabel}
          onChange={(iata, label) => setPicked({ iata, label })}
          placeholder={originLoading ? 'Detecting location…' : 'Your airport'}
          label="Flying from"
        />
      </div>
      {!origin ? null : destLoading || isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <TravelDealCard key={i} loading />
          ))}
        </div>
      ) : !destIata ? (
        <p className="text-13 text-muted-foreground">No airport listed for {city} yet.</p>
      ) : isError ? (
        <p className="text-13 text-muted-foreground">
          Fares are unavailable right now. Try again later.
        </p>
      ) : !deals || deals.length === 0 ? (
        <p className="text-13 text-muted-foreground">
          No recent fares from {originName || origin} to {city}. Try another airport.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {deals.map((deal, i) => (
            <TravelDealCard
              key={`${deal.origin}-${deal.destination}-${i}`}
              deal={deal}
              originCity={originName}
              destinationCity={city}
            />
          ))}
        </div>
      )}
    </div>
  );
}
