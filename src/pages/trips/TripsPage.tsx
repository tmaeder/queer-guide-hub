import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Plus, Map, Compass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useTrips } from '@/hooks/useTrips';
import { useMyTripSaves } from '@/hooks/useTripSaves';
import { useAuth } from '@/hooks/useAuth';
import { TripCard } from '@/components/trips/TripCard';
import { CreateTripDialog } from '@/components/trips/CreateTripDialog';
import type { GeoSelection } from '@/components/trips/create/CityCountryAutocomplete';
import { TripsSignedOutHero } from '@/components/trips/TripsSignedOutHero';
import { TripTemplates } from '@/components/trips/TripTemplates';
import { TripsInboxSection } from '@/components/trips/TripsInboxSection';
import { EmptyTripsHero } from '@/components/trips/EmptyTripsHero';
import { ColourfulText } from '@/components/effects/ColourfulText';
import { SpotlightV2 } from '@/components/effects/SpotlightV2';
import { NextTripStrip } from '@/components/trips/NextTripStrip';
import { InspiredByYourTrips } from '@/components/trips/InspiredByYourTrips';
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
  const { data: savedIds } = useMyTripSaves();
  const [createOpen, setCreateOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');

  // Seed from /travel deep-link: ?cityId=&cityName=&countryId=&countryName=&countryCode=&timezone=&start=&end=
  const seedGeo = useMemo<GeoSelection | null>(() => {
    const cityId = searchParams.get('cityId');
    const cityName = searchParams.get('cityName');
    const countryId = searchParams.get('countryId');
    const countryName = searchParams.get('countryName');
    if (!cityId || !cityName || !countryId || !countryName) return null;
    return {
      cityId,
      cityName,
      countryId,
      countryName,
      countryCode: searchParams.get('countryCode'),
      timezone: searchParams.get('timezone'),
    };
  }, [searchParams]);
  const seedStart = searchParams.get('start') ?? undefined;
  const seedEnd = searchParams.get('end') ?? undefined;

  // Auto-open the create dialog when arriving from /travel with a city seed.
  useEffect(() => {
    if (seedGeo && !createOpen) {
      setCreateOpen(true);
    }
  }, [seedGeo, createOpen]);
  const [statusFilter, setStatusFilter] = useState<TripStatusFilter>('all');
  const [sortKey, setSortKey] = useState<TripSortKey>('recent');

  const counts = useMemo(
    () => countTripsByStatus(trips ?? [], savedIds),
    [trips, savedIds],
  );

  const visibleTrips = useMemo(
    () => filterAndSortTrips(trips ?? [], search, statusFilter, sortKey, savedIds),
    [trips, search, statusFilter, sortKey, savedIds],
  );

  if (!user) {
    return <TripsSignedOutHero />;
  }

  const hasAnyTrips = (trips?.length ?? 0) > 0;
  const isFiltered = search.trim() !== '' || statusFilter !== 'all';

  return (
    <div className="relative">
      <SpotlightV2 anchor="top-center" intensity={0.10} />
      <div className="container mx-auto py-8 md:py-12 px-4 relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h3 className="text-3xl md:text-4xl mb-1">
            <ColourfulText text={t('trips.title')} />
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

      {hasAnyTrips && !isFiltered && <NextTripStrip trips={trips ?? []} />}

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
            <Skeleton key={i} className="h-60 rounded-element" />
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
        <EmptyTripsHero onCreate={() => setCreateOpen(true)} />
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
        <>
          <InspiredByYourTrips ownTrips={trips ?? []} />
          <div className="mt-12 pt-10 border-t border-border">
            <TripTemplates />
          </div>
        </>
      )}

      <CreateTripDialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          if (seedGeo) {
            // Clear deep-link seed so reopening doesn't re-trigger auto-open.
            setSearchParams(
              (prev) => {
                ['cityId', 'cityName', 'countryId', 'countryName', 'countryCode', 'timezone', 'start', 'end'].forEach(
                  (k) => prev.delete(k),
                );
                return prev;
              },
              { replace: true },
            );
          }
        }}
        initialGeo={seedGeo}
        initialStart={seedStart}
        initialEnd={seedEnd}
      />
      </div>
    </div>
  );
}
