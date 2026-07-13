import { Skeleton } from '@/components/ui/skeleton';
import { Plane, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TravelDealCard } from './TravelDealCard';
import { useTravelDeals } from '@/hooks/useTravelDeals';
import { useVisitorOrigin } from '@/hooks/useVisitorOrigin';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

interface TravelDealsSectionProps {
  destinationIata?: string | null;
  destinationCity: string;
  destinationCountryCode?: string;
}

export function TravelDealsSection({ destinationIata, destinationCity }: TravelDealsSectionProps) {
  const { originIata, originCity, loading: originLoading } = useVisitorOrigin();

  const { data: deals, isLoading: dealsLoading } = useTravelDeals({
    origin: originIata || undefined,
    destination: destinationIata || undefined,
    type: 'flights',
    limit: 6,
    // Without a destination IATA there is nothing truthful to show here —
    // popular_routes deals would get mislabeled with this page's city name.
    enabled: !!originIata && !!destinationIata,
  });

  const loading = originLoading || dealsLoading;

  // Only deals that actually fly to this page's destination, with a real price.
  const matchedDeals = (deals ?? []).filter(
    (deal) =>
      deal.destination === destinationIata && Number.isFinite(deal.price) && deal.price > 0,
  );

  if (originLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-[200px]" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[140px] rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!originIata || !destinationIata) {
    return (
      <div className="text-center py-6">
        <p className="text-muted-foreground mb-2">
          {originIata
            ? `Flight deals to ${destinationCity} aren't available yet`
            : `Enable location to see personalized flight deals to ${destinationCity}`}
        </p>
        <LocalizedLink to="/travel">
          <Button variant="outline" size="sm">
            <Plane size={14} className="mr-1.5" />
            Search Flights Manually
          </Button>
        </LocalizedLink>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-base">
            Flights from {originCity || originIata}
            {destinationIata ? ` to ${destinationCity}` : ''}
          </h3>
          <p className="text-xs text-muted-foreground">Best deals based on your location</p>
        </div>
        <LocalizedLink to={`/travel${destinationIata ? `?to=${destinationIata}` : ''}`}>
          <Button variant="ghost" size="sm">
            More <ArrowRight size={14} className="ml-1" />
          </Button>
        </LocalizedLink>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[140px] rounded" />
          ))}
        </div>
      ) : matchedDeals.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {matchedDeals.map((deal, i) => (
            <TravelDealCard
              key={`${deal.origin}-${deal.destination}-${deal.departure_date}-${i}`}
              deal={deal}
              originCity={originCity || undefined}
              destinationCity={destinationCity}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-6 bg-muted rounded-element">
          <Plane size={24} style={{ margin: '0 auto 8px' }} className="text-muted-foreground" />
          <p className="text-muted-foreground mb-2">No deals available right now</p>
          <LocalizedLink to={`/travel${destinationIata ? `?to=${destinationIata}` : ''}`}>
            <Button variant="outline" size="sm">
              Search Flights to {destinationCity}
            </Button>
          </LocalizedLink>
        </div>
      )}
    </div>
  );
}
