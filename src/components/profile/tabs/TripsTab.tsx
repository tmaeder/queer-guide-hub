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
import { TripTemplates } from '@/components/trips/TripTemplates';
import { TripsInboxSection } from '@/components/trips/TripsInboxSection';
import { EmptyTripsHero } from '@/components/trips/EmptyTripsHero';
import { NextTripStrip } from '@/components/trips/NextTripStrip';
import { InspiredByYourTrips } from '@/components/trips/InspiredByYourTrips';
import { EmptyTripsCleanupBanner } from '@/components/trips/EmptyTripsCleanupBanner';
import { TravelPrefsPrompt } from '@/components/personalization/TravelPrefsPrompt';
import {
  TripsToolbar,
  type TripSortKey,
  type TripStatusFilter,
} from '@/components/trips/TripsToolbar';
import { countTripsByStatus, filterAndSortTrips } from '@/components/trips/tripsFilters';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The user's trips list + creation + travel inbox + templates. Rendered as the
 * "Trips" tab of the /me hub — own-profile only. Folds in what used to be the
 * standalone /trips page (the /trips/:id workspace stays its own route). Reads
 * ?cityId=… deep-link seeds carried over from /travel via the /me/trips redirect.
 */
export function TripsTab() {
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setCreateOpen(true);
    }
  }, [seedGeo, createOpen]);
  const [statusFilter, setStatusFilter] = useState<TripStatusFilter>('all');
  const [sortKey, setSortKey] = useState<TripSortKey>('recent');
  const [scopeEmptyIds, setScopeEmptyIds] = useState<Set<string> | null>(null);

  const counts = useMemo(() => countTripsByStatus(trips ?? [], savedIds), [trips, savedIds]);

  const visibleTrips = useMemo(() => {
    const base = filterAndSortTrips(trips ?? [], search, statusFilter, sortKey, savedIds);
    if (scopeEmptyIds) return base.filter((t) => scopeEmptyIds.has(t.id));
    return base;
  }, [trips, search, statusFilter, sortKey, savedIds, scopeEmptyIds]);

  if (!user) return null;

  const hasAnyTrips = (trips?.length ?? 0) > 0;
  const isFiltered = search.trim() !== '' || statusFilter !== 'all';

  return (
    <div className="pt-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <p className="text-sm text-muted-foreground">
          {t('trips.subtitle')}
          {hasAnyTrips && <span className="ml-2 tabular-nums">· {trips?.length}</span>}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="lg"
            onClick={() => navigate('/trips/discover')}
            style={{ paddingLeft: 16, paddingRight: 16 }}
            aria-label={t('trips.discover.aria', 'Browse public trips')}
          >
            <Compass size={18} className="mr-1.5" />
            {t('trips.discover.button', 'Browse trips')}
          </Button>
          <Button
            variant="brand"
            size="lg"
            onClick={() => setCreateOpen(true)}
            style={{ paddingLeft: 20, paddingRight: 20 }}
          >
            <Plus size={18} className="mr-1.5" />
            {t('trips.create')}
          </Button>
        </div>
      </div>

      {/* Contextual capture: nudge travel prefs (feeds packing, safety, recs). */}
      <TravelPrefsPrompt />

      {hasAnyTrips && !isFiltered && <NextTripStrip trips={trips ?? []} />}

      {hasAnyTrips && !isFiltered && !scopeEmptyIds && (
        <EmptyTripsCleanupBanner
          trips={trips ?? []}
          onCleanup={(ids) => {
            setScopeEmptyIds(new Set(ids));
            setSearch('');
            setStatusFilter('all');
          }}
        />
      )}

      {scopeEmptyIds && (
        <div className="border border-border bg-muted/30 p-4 mb-4 rounded flex items-center justify-between gap-4">
          <p className="text-sm">
            {t(
              'pages.trips.emptyTripsBanner.scopeNote',
              'Showing {{count}} empty drafts. Delete the ones you don’t need.',
              { count: scopeEmptyIds.size },
            )}
          </p>
          <Button size="sm" variant="outline" onClick={() => setScopeEmptyIds(null)}>
            {t('pages.trips.emptyTripsBanner.exitScope', 'Show all trips')}
          </Button>
        </div>
      )}

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

      {!isLoading && !error && hasAnyTrips && visibleTrips.length === 0 && (
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
  );
}
