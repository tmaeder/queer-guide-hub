import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Luggage, Plus, Loader2, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useTrip, useTripMutations } from '@/hooks/useTrips';
import { useActiveTrip } from '@/hooks/useActiveTrip';
import { useSavedItemsByCity, type SavedCityGroup } from '@/hooks/useSavedItemsByCity';
import { tripPlaceRowFromGeo } from '@/lib/trips/resolveEntityGeo';

const MAX_GROUPS = 2;

/**
 * Saves → trips bridge: when a user has saved several places in the same city,
 * offer to spin them into a trip in one tap (a new trip seeded at that city, or
 * appended to the active trip). Renders nothing until there's a qualifying
 * city group, so it's safe to mount unconditionally on the Saved surface.
 */
export function SavedToTripCard() {
  const { data: groups, isLoading } = useSavedItemsByCity();
  if (isLoading || !groups || groups.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {groups.slice(0, MAX_GROUPS).map((group) => (
        <SavedCityRow key={group.cityId} group={group} />
      ))}
    </div>
  );
}

function SavedCityRow({ group }: { group: SavedCityGroup }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useLocalizedNavigate();
  const { createTrip, addPlacesBulk } = useTripMutations();
  const { activeTrip } = useActiveTrip();
  const { data: activeTripDetails } = useTrip(activeTrip?.id);
  const [busy, setBusy] = useState<'new' | 'active' | null>(null);

  // Dedupe against whatever the active trip already holds.
  const existingIds = new Set(
    (activeTripDetails?.trip_places ?? [])
      .map((p) => p.venue_id ?? p.event_id)
      .filter((id): id is string => !!id),
  );

  const rowsFor = (excludeExisting: boolean) =>
    group.items
      .filter((g) => !excludeExisting || !existingIds.has(g.id))
      .map(tripPlaceRowFromGeo);

  const canStartTrip = !!group.countryId;
  const newToActive = rowsFor(true);

  const handleStartTrip = async () => {
    if (!group.countryId) return;
    setBusy('new');
    try {
      const trip = await createTrip.mutateAsync({
        title: t('trips.savedBridge.defaultTitle', 'Trip to {{city}}', { city: group.cityName }),
        primary_city_id: group.cityId,
        primary_country_id: group.countryId,
        primary_city_name: group.cityName,
      });
      await addPlacesBulk.mutateAsync({ tripId: trip.id, rows: rowsFor(false) });
      navigate(`/trips/${trip.id}`);
    } catch (err) {
      toast({
        title: t('trips.savedBridge.failed', 'Could not start trip'),
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
      setBusy(null);
    }
  };

  const handleAddToActive = async () => {
    if (!activeTrip) return;
    if (newToActive.length === 0) {
      toast({
        title: t('trips.savedBridge.allAdded', 'Already in your trip'),
        description: t('trips.savedBridge.allAddedDesc', 'These saves are already on {{trip}}.', {
          trip: activeTrip.title,
        }),
      });
      return;
    }
    setBusy('active');
    try {
      await addPlacesBulk.mutateAsync({ tripId: activeTrip.id, rows: newToActive });
      toast({
        title: t('trips.savedBridge.added', 'Added to {{trip}}', { trip: activeTrip.title }),
        description: t('trips.savedBridge.addedDesc', '{{count}} saved places added.', {
          count: newToActive.length,
        }),
      });
    } catch (err) {
      toast({
        title: t('trips.savedBridge.failedAdd', 'Could not add to trip'),
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <MapPin size={16} aria-hidden="true" />
            </span>
            <p className="text-sm">
              {t('trips.savedBridge.prompt', 'You saved {{count}} places in {{city}}', {
                count: group.items.length,
                city: group.cityName,
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeTrip && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddToActive}
                disabled={busy !== null}
              >
                {busy === 'active' ? (
                  <Loader2 size={14} className="mr-1.5 animate-spin" aria-label="Loading" />
                ) : (
                  <Plus size={14} className="mr-1.5" aria-hidden="true" />
                )}
                {t('trips.savedBridge.addToActive', 'Add to {{trip}}', { trip: activeTrip.title })}
              </Button>
            )}
            {canStartTrip && (
              <Button size="sm" onClick={handleStartTrip} disabled={busy !== null}>
                {busy === 'new' ? (
                  <Loader2 size={14} className="mr-1.5 animate-spin" aria-label="Loading" />
                ) : (
                  <Luggage size={14} className="mr-1.5" aria-hidden="true" />
                )}
                {t('trips.savedBridge.startTrip', 'Start a trip here')}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
