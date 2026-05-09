import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Compass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDiscoverableTrips } from '@/hooks/useDiscoverableTrips';
import { PublicTripCard } from '@/components/trips/PublicTripCard';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Public discovery feed for opt-in trips.
 *
 * Shows the most recent 60 public trips, with an optional city
 * substring filter. Trip authors flip `trips.is_public=true` from the
 * sharing dialog (or trip settings) to opt in. Anonymous visitors can
 * browse — RLS already exposes public trips to anon.
 */
export default function TripsDiscoverPage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const { data: trips, isLoading } = useDiscoverableTrips(query);

  return (
    <div className="container mx-auto max-w-screen-lg px-4 py-6 md:py-10">
      <div className="flex items-center gap-3 mb-2">
        <Compass size={26} style={{ color: 'hsl(var(--foreground))' }} />
        <h1 className="text-3xl font-extrabold">
          {t('trips.discover.title', 'Discover trips')}
        </h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        {t(
          'trips.discover.subtitle',
          'Real itineraries from QG travelers — copy ideas, find queer-friendly stops, plan your own.',
        )}
      </p>

      <div className="relative mb-6 max-w-[420px]">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('trips.discover.searchPlaceholder', 'Filter by city…')}
          className="pl-9"
        />
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[260px] w-full rounded" />
          ))}
        </div>
      )}

      {!isLoading && trips && trips.length === 0 && (
        <EmptyState
          icon={Compass}
          title={t('trips.discover.emptyTitle', 'No public trips yet')}
          description={
            query
              ? t(
                  'trips.discover.emptyFiltered',
                  'No public trips match that city. Try a different one.',
                )
              : t(
                  'trips.discover.emptyDescription',
                  'Be the first — make any of your trips public from the Share dialog.',
                )
          }
        />
      )}

      {!isLoading && trips && trips.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {trips.map((trip) => (
            <PublicTripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </div>
  );
}
