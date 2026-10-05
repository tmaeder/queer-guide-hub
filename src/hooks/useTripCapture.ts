import { useCallback, useState } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useActiveTrip } from '@/hooks/useActiveTrip';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useTripMutations } from '@/hooks/useTrips';
import { useToast } from '@/hooks/use-toast';
import { resolveEntityGeo } from '@/lib/trips/resolveEntityGeo';
import { storeTripCapture, type TripCaptureIntent } from '@/lib/trips/tripCaptureIntent';
import { trackTripEvent } from '@/utils/tripTracking';
import { getTripPhase } from '@/components/trips/tripPhase';

interface CaptureOptions {
  source: string;
  alreadyInActiveTrip?: boolean;
}

export function useTripCapture() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeTrip, setActiveTripId, openDock } = useActiveTrip();
  const navigate = useLocalizedNavigate();
  const location = useLocation();
  const { addPlace, removePlace } = useTripMutations();
  const { toast } = useToast();
  const [dialogIntent, setDialogIntent] = useState<TripCaptureIntent | null>(null);

  const capture = useCallback(
    async (intent: TripCaptureIntent, options: CaptureOptions) => {
      const returnTo = `${location.pathname}${location.search}${location.hash}`;
      trackTripEvent('trip_intent_started', {
        kind: intent.kind,
        source: options.source,
        auth_state: user ? 'signed_in' : 'signed_out',
      });

      if (intent.kind === 'open_active_trip') {
        openDock();
        trackTripEvent('trip_dock_open', { source: options.source });
        return;
      }

      if (!user) {
        storeTripCapture(intent, { source: options.source, returnTo });
        navigate(`/auth?redirect=${encodeURIComponent(returnTo)}`);
        return;
      }

      if (intent.kind !== 'add_entity') {
        setDialogIntent(intent);
        return;
      }

      if (!activeTrip) {
        setDialogIntent(intent);
        return;
      }

      const canWriteActiveTrip =
        activeTrip.owner_id === user.id ||
        activeTrip.membership_role === 'owner' ||
        activeTrip.membership_role === 'editor';
      if (!canWriteActiveTrip) {
        setDialogIntent(intent);
        return;
      }

      if (options.alreadyInActiveTrip) {
        openDock();
        trackTripEvent('trip_dock_open', { source: `${options.source}:already-added` });
        return;
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        toast({
          title: t('trips.capture.offlineTitle', 'Connect to add this'),
          description: t(
            'trips.capture.offlineDescription',
            'Your trip is still available offline, but new places need a connection.',
          ),
          variant: 'destructive',
        });
        return;
      }

      const { entity } = intent;
      const phase = getTripPhase(activeTrip);
      trackTripEvent('trip_item_add_attempt', {
        trip_id: activeTrip.id,
        entity_type: entity.type,
        source: options.source,
        phase,
      });

      try {
        const resolved =
          entity.city_id && entity.country_id
            ? {
                city_id: entity.city_id,
                country_id: entity.country_id,
                latitude: entity.latitude ?? null,
                longitude: entity.longitude ?? null,
                address: entity.address ?? null,
              }
            : entity.type === 'venue' || entity.type === 'event'
              ? (await resolveEntityGeo([{ type: entity.type, id: entity.id }])).get(entity.id)
              : null;

        const added = await addPlace.mutateAsync({
          trip_id: activeTrip.id,
          day_id: null,
          venue_id: entity.type === 'venue' ? entity.id : null,
          event_id: entity.type === 'event' ? entity.id : null,
          hotel_id: entity.type === 'hotel' ? entity.id : null,
          custom_name: null,
          custom_address: resolved?.address ?? entity.address ?? null,
          latitude: resolved?.latitude ?? entity.latitude ?? null,
          longitude: resolved?.longitude ?? entity.longitude ?? null,
          city_id: resolved?.city_id ?? entity.city_id ?? null,
          country_id: resolved?.country_id ?? entity.country_id ?? null,
          start_time: null,
          end_time: null,
          duration_minutes: null,
          notes: null,
          category: entity.category || entity.type,
          sort_order: 0,
          created_by: null,
          booking_status: 'intent',
          reservation_id: null,
        });

        setActiveTripId(activeTrip.id);
        trackTripEvent('trip_item_add_success', {
          trip_id: activeTrip.id,
          entity_type: entity.type,
          source: options.source,
          phase,
        });
        toast({
          title: t('trips.capture.addedTitle', 'Added to {{trip}}', { trip: activeTrip.title }),
          description: t('trips.capture.addedDescription', '{{name}} is waiting in Unscheduled.', {
            name: entity.name,
          }),
          action: {
            label: t('common.undo', 'Undo'),
            onClick: async () => {
              try {
                await removePlace.mutateAsync({ id: added.id, tripId: activeTrip.id });
                trackTripEvent('trip_item_add_undo', {
                  trip_id: activeTrip.id,
                  entity_type: entity.type,
                  source: options.source,
                  phase,
                });
              } catch (error) {
                trackTripEvent('trip_item_add_undo_failed', {
                  trip_id: activeTrip.id,
                  entity_type: entity.type,
                  source: options.source,
                  phase,
                });
                toast({
                  title: t('trips.capture.undoFailed', 'Could not undo the addition'),
                  description:
                    error instanceof Error
                      ? error.message
                      : t('common.somethingWentWrong', 'Something went wrong.'),
                  variant: 'destructive',
                });
              }
            },
          },
        });
      } catch (error) {
        trackTripEvent('trip_item_add_failure', {
          trip_id: activeTrip.id,
          entity_type: entity.type,
          source: options.source,
          phase,
        });
        toast({
          title: t('trips.addTo.failedToAdd', 'Failed to add'),
          description: error instanceof Error ? error.message : t('common.somethingWentWrong'),
          variant: 'destructive',
        });
      }
    },
    [
      activeTrip,
      addPlace,
      location.hash,
      location.pathname,
      location.search,
      navigate,
      openDock,
      removePlace,
      setActiveTripId,
      t,
      toast,
      user,
    ],
  );

  return {
    capture,
    dialogIntent,
    closeDialog: () => setDialogIntent(null),
    isPending: addPlace.isPending || removePlace.isPending,
  };
}
