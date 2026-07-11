import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Plus, Compass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useTrips } from '@/hooks/useTrips';
import { useAuth } from '@/hooks/useAuth';
import { TripCard } from '@/components/trips/TripCard';
import { CreateTripDialog } from '@/components/trips/CreateTripDialog';
import type { GeoSelection } from '@/components/trips/create/CityCountryAutocomplete';
import { EmptyTripsHero } from '@/components/trips/EmptyTripsHero';
import { TravelPrefsPrompt } from '@/components/personalization/TravelPrefsPrompt';
import { ErrorState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Compact trip manager for /hub/plans (2026-07 declutter). Replaces the full
 * TripsTab: just the trip-card grid, creation (incl. the ?cityId deep-link
 * seed carried over from /travel) and a Browse link. The heavy tooling
 * (itinerary, bookings, travel inbox) lives in the /trips/:id workspace;
 * trip email is single-homed in Messages' Trips filter.
 */
export function TripsStrip() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();
  const { data: trips, isLoading, error, refetch } = useTrips();
  const [createOpen, setCreateOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

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

  if (!user) return null;

  const hasAnyTrips = (trips?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-title font-display">
          {t('hub.plans.trips', { defaultValue: 'Your trips' })}
          {hasAnyTrips && (
            <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
              {trips?.length}
            </span>
          )}
        </h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/trips/discover')}
            aria-label={t('trips.discover.aria', 'Browse public trips')}
          >
            <Compass size={16} className="mr-1.5" />
            {t('trips.discover.button', 'Browse trips')}
          </Button>
          <Button variant="default" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={16} className="mr-1.5" />
            {t('trips.create')}
          </Button>
        </div>
      </div>

      {/* Contextual capture: nudge travel prefs (feeds packing, safety, recs). */}
      <TravelPrefsPrompt />

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

      {!isLoading && !error && hasAnyTrips && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(trips ?? []).map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
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
