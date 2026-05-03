import { useMemo, useState } from 'react';
import { Plus, Map, Compass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useTrips } from '@/hooks/useTrips';
import { useAuth } from '@/hooks/useAuth';
import { TripCard } from '@/components/trips/TripCard';
import { CreateTripDialog } from '@/components/trips/CreateTripDialog';
import { TripsSignedOutHero } from '@/components/trips/TripsSignedOutHero';
import { TripTemplates } from '@/components/trips/TripTemplates';
import { TripsInboxSection } from '@/components/trips/TripsInboxSection';
import {
  TripsToolbar,
  type TripSortKey,
  type TripStatusFilter,
} from '@/components/trips/TripsToolbar';
import {
  countTripsByStatus,
  filterAndSortTrips,
} from '@/components/trips/tripsFilters';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function TripsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();
  const { data: trips, isLoading, error, refetch } = useTrips();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TripStatusFilter>('all');
  const [sortKey, setSortKey] = useState<TripSortKey>('recent');

  const counts = useMemo(() => countTripsByStatus(trips ?? []), [trips]);

  const visibleTrips = useMemo(
    () => filterAndSortTrips(trips ?? [], search, statusFilter, sortKey),
    [trips, search, statusFilter, sortKey],
  );

  if (!user) {
    return <TripsSignedOutHero />;
  }

  const hasAnyTrips = (trips?.length ?? 0) > 0;
  const isFiltered = search.trim() !== '' || statusFilter !== 'all';

  return (
    <div className="container mx-auto py-8 md:py-12 px-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h3 className="text-3xl md:text-4xl mb-1">
            {t('trips.title')}
            {hasAnyTrips && (
              <span
                className="ml-3 text-muted-foreground font-medium tabular-nums"
                style={{ fontSize: '0.65em' }}
              >
                · {trips?.length}
              </span>
            )}
          </h3>
          <p className="text-muted-foreground">{t('trips.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="lg"
            onClick={() => navigate('/trips/discover')}
            style={{ paddingLeft: 16, paddingRight: 16 }}
            aria-label={t('trips.discover.aria', 'Discover public trips')}
          >
            <Compass style={{ width: 18, height: 18, marginRight: 6 }} />
            {t('trips.discover.button', 'Discover')}
          </Button>
          <Button
            variant="brand"
            size="lg"
            onClick={() => setCreateOpen(true)}
            style={{ paddingLeft: 20, paddingRight: 20 }}
          >
            <Plus style={{ width: 18, height: 18, marginRight: 6 }} />
            {t('trips.create')}
          </Button>
        </div>
      </div>

      {/* Travel inbox */}
      <TripsInboxSection />

      {hasAnyTrips && (
        <TripsToolbar
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          sortKey={sortKey}
          onSortChange={setSortKey}
          counts={counts}
        />
      )}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-60 rounded-md" />
          ))}
        </div>
      )}

      {error && !isLoading && (
        <ErrorState
          message={t('trips.error')}
          onRetry={() => {
            void refetch();
          }}
        />
      )}

      {!isLoading && !error && !hasAnyTrips && (
        <div className="mt-4">
          <EmptyState
            icon={Map}
            title={t('trips.empty.title')}
            description={t('trips.empty.description')}
            mood="encouraging"
            primaryAction={{
              label: t('trips.empty.cta'),
              onClick: () => setCreateOpen(true),
              variant: 'brand',
            }}
          />
          <TripTemplates />
        </div>
      )}

      {!isLoading &&
        !error &&
        hasAnyTrips &&
        visibleTrips.length === 0 && (
          <EmptyState
            icon={Map}
            title={t('trips.filteredEmpty.title')}
            description={t('trips.filteredEmpty.description')}
            primaryAction={{
              label: t('trips.filteredEmpty.cta'),
              onClick: () => {
                setSearch('');
                setStatusFilter('all');
              },
              variant: 'outline',
            }}
          />
        )}

      {!isLoading && !error && visibleTrips.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleTrips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}

      {!isLoading && !error && hasAnyTrips && !isFiltered && (
        <div className="mt-12 pt-10 border-t border-border">
          <TripTemplates />
        </div>
      )}

      <CreateTripDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
