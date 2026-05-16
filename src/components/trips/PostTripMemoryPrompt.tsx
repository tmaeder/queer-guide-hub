import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import { useMyPlaceMarks, type PlaceMarkEntity } from '@/hooks/usePlaceMarks';
import { useQueryClient } from '@tanstack/react-query';
import type { TripWithDetails, TripPlace } from '@/hooks/useTrips';
import { useTripReservations } from '@/hooks/useTripReservations';

interface Props {
  trip: TripWithDetails;
}

interface Candidate {
  place: TripPlace;
  entityType: PlaceMarkEntity;
  entityId: string;
  label: string;
}

/**
 * Post-trip memory prompt. Shown only after the trip's end_date has passed.
 * Lists every place not yet marked visited and lets the user confirm them
 * all in one tap. Pre-ticks places whose reservation has ended (or whose
 * booking_status is 'completed').
 */
export function PostTripMemoryPrompt({ trip }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: marks = [] } = useMyPlaceMarks();
  const { data: reservations = [] } = useTripReservations(trip.id);

  const isPastTrip = useMemo(() => {
    if (!trip.end_date) return false;
    return new Date(trip.end_date) < new Date();
  }, [trip.end_date]);

  const candidates: Candidate[] = useMemo(() => {
    const visitedSet = new Set(
      marks
        .filter((m) => m.mark_type === 'visited')
        .map((m) => `${m.entity_type}:${m.entity_id}`),
    );
    const out: Candidate[] = [];
    for (const place of trip.trip_places) {
      let entityType: PlaceMarkEntity | null = null;
      let entityId: string | null = null;
      let label = place.custom_name ?? '';
      if (place.venue_id) {
        entityType = 'venue';
        entityId = place.venue_id;
        label = place.venues?.name ?? label ?? 'Venue';
      } else if (place.event_id) {
        entityType = 'event';
        entityId = place.event_id;
        label = place.events?.title ?? label ?? 'Event';
      }
      if (!entityType || !entityId) continue;
      if (visitedSet.has(`${entityType}:${entityId}`)) continue;
      out.push({ place, entityType, entityId, label });
    }
    return out;
  }, [trip.trip_places, marks]);

  // Auto-tick places whose reservation ended OR booking_status is 'completed'.
  const now = new Date();
  const reservationById = useMemo(() => {
    const m = new Map<string, { end_at: string | null }>();
    reservations.forEach((r) => m.set(r.id, { end_at: r.check_out ?? null }));
    return m;
  }, [reservations]);

  const initiallyChecked = useMemo(() => {
    const set = new Set<string>();
    for (const c of candidates) {
      const reservation = c.place.reservation_id
        ? reservationById.get(c.place.reservation_id)
        : null;
      const reservationEnded =
        !!reservation?.end_at && new Date(reservation.end_at) < now;
      const completed = c.place.booking_status === 'completed';
      if (reservationEnded || completed) set.add(c.place.id);
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, reservationById]);

  const [checked, setChecked] = useState<Set<string>>(initiallyChecked);
  useEffect(() => {
    setChecked(initiallyChecked);
  }, [initiallyChecked]);

  const [submitting, setSubmitting] = useState(false);

  if (!user || !isPastTrip || candidates.length === 0) return null;

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const checkAll = () => setChecked(new Set(candidates.map((c) => c.place.id)));

  const submit = async () => {
    const selected = candidates.filter((c) => checked.has(c.place.id));
    if (selected.length === 0) return;
    setSubmitting(true);
    try {
      const rows = selected.map((c) => ({
        user_id: user.id,
        entity_type: c.entityType,
        entity_id: c.entityId,
        mark_type: 'visited' as const,
        trip_id: trip.id,
        is_public: false,
      }));
      const { error } = await untypedFrom('user_place_marks').upsert(rows, {
        onConflict: 'user_id,entity_type,entity_id,mark_type',
        ignoreDuplicates: true,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['place_marks', user.id] });
      toast({
        title: 'Added to footprint',
        description: `${selected.length} place${selected.length > 1 ? 's' : ''} marked visited.`,
      });
    } catch (err) {
      toast({
        title: 'Could not save',
        description: String((err as Error).message ?? err),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card data-testid="post-trip-memory-prompt">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          How was it? Add to your footprint
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Confirm the places you actually visited on this trip. They become
          part of your private passport.
        </p>
        <div className="space-y-2">
          {candidates.map((c) => (
            <label
              key={c.place.id}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Checkbox
                checked={checked.has(c.place.id)}
                onCheckedChange={() => toggle(c.place.id)}
                aria-label={`Mark ${c.label} visited`}
              />
              <span className="text-sm">{c.label}</span>
              <span className="text-xs text-muted-foreground capitalize">
                {c.entityType}
              </span>
            </label>
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            onClick={submit}
            disabled={submitting || checked.size === 0}
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
            Confirm {checked.size > 0 ? `(${checked.size})` : 'all visited'}
          </Button>
          {checked.size < candidates.length && (
            <Button type="button" variant="outline" onClick={checkAll}>
              Tick all
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
