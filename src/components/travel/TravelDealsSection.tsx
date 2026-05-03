import { Plane, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
    type: destinationIata ? 'flights' : 'popular_routes',
    limit: 6,
    enabled: !!originIata,
  });

  const loading = originLoading || dealsLoading;

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

  if (!originIata) {
    return (
      <div className="text-center py-6">
        <p className="text-muted-foreground mb-2">
          Enable location to see personalized flight deals to {destinationCity}
        </p>
        <LocalizedLink to="/travel">
          <Button variant="outline" size="sm">
            <Plane style={{ height: 14, width: 14, marginRight: 6 }} />
            Search Flights Manually
          </Button>
        </LocalizedLink>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-row justify-between items-center">
        <div>
          <h6 className="text-base font-semibold">
            Flights from {originCity || originIata}
            {destinationIata ? ` to ${destinationCity}` : ''}
          </h6>
          <p className="text-xs text-muted-foreground">
            Best deals based on your location
          </p>
        </div>
        <LocalizedLink to={`/travel${destinationIata ? `?to=${destinationIata}` : ''}`}>
          <Button variant="ghost" size="sm">
            More <ArrowRight style={{ height: 14, width: 14, marginLeft: 4 }} />
          </Button>
        </LocalizedLink>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[140px] rounded" />
          ))}
        </div>
      ) : deals && deals.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {deals.map((deal, i) => (
            <TravelDealCard
              key={`${deal.origin}-${deal.destination}-${deal.departure_date}-${i}`}
              deal={deal}
              originCity={originCity || undefined}
              destinationCity={destinationCity}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-6 bg-muted rounded-lg">
          <Plane
            style={{
              height: 24,
              width: 24,
              margin: '0 auto 8px',
              color: 'var(--muted-foreground)',
            }}
          />
          <p className="text-muted-foreground mb-2">
            No deals available right now
          </p>
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
