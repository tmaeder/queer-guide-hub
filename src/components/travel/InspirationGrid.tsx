import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Skeleton } from '@/components/ui/skeleton';
import { useQueerVillages } from '@/hooks/useQueerVillages';
import { useDiscoverableTrips } from '@/hooks/useDiscoverableTrips';
import { VillageCard } from '@/components/villages/VillageCard';
import { PublicTripCard } from '@/components/trips/PublicTripCard';
import { useVisitedPlaceLookup } from '@/hooks/useVisitedPlaceLookup';
import type { VisitedFilter } from './BrowseVisitedToolbar';

interface Props {
  visitedFilter?: VisitedFilter;
}

export function InspirationGrid({ visitedFilter = 'all' }: Props) {
  const { t } = useTranslation();
  const { villages, loading: villagesLoading } = useQueerVillages();
  const { data: trips, isLoading: tripsLoading } = useDiscoverableTrips();
  const visitedLookup = useVisitedPlaceLookup();

  const filteredVillages = useMemo(() => {
    if (visitedFilter === 'all') return villages;
    return villages.filter((v) => {
      const isVisited = !!v.id && visitedLookup.has('village', v.id);
      return visitedFilter === 'only_visited' ? isVisited : !isVisited;
    });
  }, [villages, visitedFilter, visitedLookup]);

  const hasPublicTrips = !tripsLoading && (trips?.length ?? 0) > 0;

  // Collapse to single full-width column with more villages when there are no
  // public trips. Two-column grid only when both sides have content to show.
  const villageLimit = hasPublicTrips ? 3 : 6;
  const featuredVillages = useMemo(
    () => filteredVillages.slice(0, villageLimit),
    [filteredVillages, villageLimit],
  );
  const featuredTrips = useMemo(() => (trips ?? []).slice(0, 3), [trips]);

  const villagesPanel = (
    <div className="border border-border bg-background p-6 rounded">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-lg font-bold tracking-tight">
          {t('pages.travel.inspiration.villages', 'Queer villages')}
        </h3>
        <LocalizedLink to="/places" className="text-xs">
          {t('pages.travel.inspiration.viewAll', 'View all')}
        </LocalizedLink>
      </div>
      {villagesLoading ? (
        <div className={hasPublicTrips ? 'grid gap-3' : 'grid sm:grid-cols-2 gap-3'}>
          {Array.from({ length: villageLimit }).map((_, i) => (
            <Skeleton key={i} className="h-[80px] rounded" />
          ))}
        </div>
      ) : featuredVillages.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('pages.travel.inspiration.noVillages', 'No villages yet.')}
        </p>
      ) : (
        <div className={hasPublicTrips ? 'grid gap-3' : 'grid sm:grid-cols-2 gap-3'}>
          {featuredVillages.map((village) => (
            <VillageCard key={village.id} village={village} />
          ))}
        </div>
      )}
    </div>
  );

  if (!tripsLoading && !hasPublicTrips) {
    return <section className="mb-8">{villagesPanel}</section>;
  }

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
      {villagesPanel}
      <div className="border border-border bg-background p-6 rounded">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-lg font-bold tracking-tight">
            {t('pages.travel.inspiration.publicTrips', 'Public trips')}
          </h3>
          <LocalizedLink to="/trips/discover" className="text-xs">
            {t('pages.travel.inspiration.viewAll', 'View all')}
          </LocalizedLink>
        </div>
        {tripsLoading ? (
          <div className="grid gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[80px] rounded" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3">
            {featuredTrips.map((trip) => (
              <PublicTripCard key={trip.id} trip={trip} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
