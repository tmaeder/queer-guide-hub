import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useDiscoverableTrips } from '@/hooks/useDiscoverableTrips';
import { PublicTripCard } from '@/components/trips/PublicTripCard';

interface Props {
  limit?: number;
}

/**
 * One of the two rails the legacy InspirationGrid split into for /travel v2.
 * Horizontal scroll of public discoverable trips so users can study how other
 * travelers structured a trip to a place they're considering.
 */
export function DiscoverableTripsRail({ limit = 8 }: Props) {
  const { t } = useTranslation();
  const { data, isLoading } = useDiscoverableTrips();

  if (isLoading) return <RailSkeleton />;
  const trips = (data ?? []).slice(0, limit);
  if (trips.length === 0) return null;

  return (
    <section aria-labelledby="travel-public-trips-rail-heading" className="mb-12">
      <header className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-2xs uppercase tracking-[0.18em] text-muted-foreground">
            {t('travel.publicTripsRail.kicker', 'Real itineraries')}
          </p>
          <h2 id="travel-public-trips-rail-heading" className="text-headline font-bold tracking-tight">
            {t('travel.publicTripsRail.heading', 'See how others planned theirs')}
          </h2>
        </div>
        <LocalizedLink
          to="/trips/discover"
          className="inline-flex items-center gap-2 text-13 font-medium text-muted-foreground no-underline hover:text-foreground"
        >
          {t('travel.publicTripsRail.seeAll', 'Discover trips')}
          <ArrowRight size={14} />
        </LocalizedLink>
      </header>

      <ScrollArea className="-mx-4 px-4">
        <ul className="flex gap-4 pb-4">
          {trips.map((trip) => (
            <li key={trip.id} className="w-80 shrink-0 snap-start">
              <PublicTripCard trip={trip} />
            </li>
          ))}
        </ul>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
  );
}

function RailSkeleton() {
  return (
    <section aria-hidden className="mb-12">
      <div className="mb-4 h-6 w-56 bg-muted" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rectangular" height={200} className="w-80 shrink-0 rounded-container" />
        ))}
      </div>
    </section>
  );
}
