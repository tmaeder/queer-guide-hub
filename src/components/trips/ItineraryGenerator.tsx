import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Check, RefreshCw, Sunrise, Sun, Sunset, Moon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useTripMutations, type TripWithDetails } from '@/hooks/useTrips';
import { useItineraryPool } from '@/hooks/useItineraryPool';
import { useAccessibilityNeeds } from '@/hooks/useAccessibilityMatches';
import { useUserTravelPreferences } from '@/hooks/useUserTravelPreferences';
import { VIBE_IDS, type PaceId, type VibeId } from '@/lib/lines/generateLine';
import { generateItinerary, slotsForDay, type DayPart } from '@/lib/itinerary/generateItinerary';
import { assignDaysToStops, itineraryToPlaceRows } from '@/lib/itinerary/itineraryPlan';

/**
 * "Build the days" — the deterministic day-level planner.
 *
 * Sits BESIDE the LLM concierge (`AiPlanTab`), not instead of it. The two
 * answer different questions: the concierge takes a sentence and converses;
 * this takes three picks and is reproducible, auditable and free. A traveller
 * who wants "the same plan again, but starting Tuesday" is asking this one.
 *
 * Generation writes NOTHING. The plan is rendered as a preview and only the
 * explicit Apply inserts `trip_places`, so a reroll costs nothing and cannot
 * damage an itinerary somebody has already edited.
 *
 * THE EMPTY SLOTS ARE THE FEATURE. `generateItinerary` never pads, so a slot
 * with no candidate arrives here as a real outcome with a reason, and this
 * component renders it as a stated gap. Hiding empty slots would turn "we have
 * nothing for Tuesday night in this city" into a plan that looks complete.
 */

const SLOT_ICON: Record<DayPart, typeof Sunrise> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
  night: Moon,
};

const SLOT_LABEL: Record<DayPart, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

const VIBE_LABEL: Record<VibeId, string> = {
  nightlife: 'Nightlife',
  sauna: 'Sauna & cruising',
  slow: 'Slow days',
  community: 'Community & culture',
  outdoors: 'Outdoors',
};

const PACE_LABEL: Record<PaceId, string> = {
  slow: 'Slow',
  steady: 'Steady',
  sprint: 'Packed',
};

const PACES: PaceId[] = ['slow', 'steady', 'sprint'];

interface Props {
  trip: TripWithDetails;
  canEdit: boolean;
}

export function ItineraryGenerator({ trip, canEdit }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { addPlacesBulk } = useTripMutations();

  const [vibe, setVibe] = useState<VibeId | null>(null);
  const [pace, setPace] = useState<PaceId>('steady');
  // Math.random may CHOOSE a seed at the call site; the generator never reaches
  // for it. A reroll is a seed bump, so the same seed always replays.
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [applying, setApplying] = useState(false);

  const { data: prefs } = useUserTravelPreferences();
  const { data: accessibilityNeeds } = useAccessibilityNeeds();

  // Which city each day happens in. Pure and tested in `itineraryPlan.ts`;
  // this only gathers the inputs.
  const days = useMemo(
    () =>
      assignDaysToStops(
        trip.trip_days ?? [],
        (trip.trip_places ?? [])
          .filter((p) => p.category === 'city' && !!p.city_id)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((p) => ({
            cityId: p.city_id as string,
            name: p.custom_name ?? trip.primary_city_name ?? 'This city',
          })),
        trip.primary_city_id
          ? {
              cityId: trip.primary_city_id,
              name: trip.primary_city_name ?? 'This city',
            }
          : null,
      ),
    [trip],
  );

  const cityIds = useMemo(() => days.map((d) => d.cityId), [days]);
  const window = useMemo(
    () =>
      days.length > 0
        ? { from: days[0].date, to: days[days.length - 1].date }
        : { from: null, to: null },
    [days],
  );

  const { data: pool, isLoading, error } = useItineraryPool(cityIds, window.from, window.to);

  /** Places already on the trip are never re-suggested. */
  const excludeIds = useMemo(
    () =>
      (trip.trip_places ?? [])
        .map((p) => p.venue_id ?? p.event_id)
        .filter((id): id is string => !!id),
    [trip.trip_places],
  );

  const result = useMemo(() => {
    if (!pool) return null;
    return generateItinerary(pool, {
      days,
      vibe,
      pace,
      budget: prefs?.budget_tier ?? null,
      accessibilityNeeds: accessibilityNeeds ?? [],
      group: (trip.trip_members?.length ?? 0) > 1 ? 'group' : 'solo',
      seed,
      excludeIds,
    });
  }, [pool, days, vibe, pace, prefs, accessibilityNeeds, trip.trip_members, seed, excludeIds]);

  const dayIdByDate = useMemo(
    () => new Map((trip.trip_days ?? []).map((d) => [d.date, d.id])),
    [trip.trip_days],
  );

  const handleApply = async () => {
    if (!result) return;
    const rows = itineraryToPlaceRows(result, dayIdByDate);
    if (rows.length === 0) return;
    setApplying(true);
    try {
      await addPlacesBulk.mutateAsync({ tripId: trip.id, rows });
      toast({
        title: t('trips.itinerary.applied', 'Added {{count}} stops', { count: rows.length }),
      });
    } catch (err) {
      toast({
        title: t('trips.itinerary.applyFailed', 'Could not add the plan'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setApplying(false);
    }
  };

  if (days.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t(
              'trips.itinerary.needDates',
              'Set the trip dates and a destination city, and the days can be built from them.',
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  const plannedSlots = slotsForDay(vibe, pace);

  return (
    <div className="space-y-6">
      {/* Picks */}
      <div className="space-y-4">
        <div>
          <p className="text-2xs uppercase tracking-wider text-muted-foreground mb-2">
            {t('trips.itinerary.vibeLabel', 'What you are after')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={vibe === null ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setVibe(null)}
            >
              {t('trips.itinerary.vibeAny', 'A bit of everything')}
            </Badge>
            {VIBE_IDS.map((id) => (
              <Badge
                key={id}
                variant={vibe === id ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setVibe(id)}
              >
                {t(`trips.discover.picker.vibe.${id}`, VIBE_LABEL[id])}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <p className="text-2xs uppercase tracking-wider text-muted-foreground mb-2">
            {t('trips.itinerary.paceLabel', 'How full a day')}
          </p>
          <div className="flex flex-wrap gap-2">
            {PACES.map((p) => (
              <Badge
                key={p}
                variant={pace === p ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setPace(p)}
              >
                {t(`trips.discover.picker.pace.${p}`, PACE_LABEL[p])}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {plannedSlots.map((s) => SLOT_LABEL[s]).join(' · ')}
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-container" />
          <Skeleton className="h-20 w-full rounded-container" />
        </div>
      )}

      {/* A failed pool is said, not swallowed. Without this the panel renders
          the pickers over nothing and reads as a feature that does not work. */}
      {error && (
        <Card>
          <CardContent>
            <p className="text-sm">
              {t(
                'trips.itinerary.loadFailed',
                'Could not load places for these cities. Try again in a moment.',
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {result && result.outcome === 'too_few_candidates' && (
        <Card>
          <CardContent>
            <p className="text-sm">
              {t(
                'trips.itinerary.tooFew',
                'Only {{count}} places here match that. Not enough to build days from. Try another vibe, or add stops by hand.',
                { count: result.eligibleCount },
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {result && result.outcome !== 'too_few_candidates' && (
        <>
          {/* What the plan does and does not know. Stated, not implied. */}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              {t('trips.itinerary.summary', '{{filled}} of {{requested}} slots filled', {
                filled: result.filledSlots,
                requested: result.requestedSlots,
              })}
            </p>
            {(accessibilityNeeds?.length ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">
                {t(
                  'trips.itinerary.a11yCoverage',
                  '{{withData}} of {{total}} places here publish accessibility information. Nothing is ruled out for staying silent.',
                  result.accessibilityCoverage,
                )}
              </p>
            )}
            {prefs?.budget_tier && (
              <p className="text-xs text-muted-foreground">
                {t(
                  'trips.itinerary.budgetCoverage',
                  '{{withData}} of {{total}} places here list a price. Budget nudges the order; it does not filter.',
                  result.budgetCoverage,
                )}
              </p>
            )}
          </div>

          <div className="space-y-4">
            {result.days.map((day) => (
              <Card key={day.date}>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CalendarDays size={16} className="text-muted-foreground shrink-0" />
                    <h4 className="font-bold text-sm">
                      {day.date} · {day.cityName}
                    </h4>
                  </div>
                  {day.slots.map((slot) => {
                    const Icon = SLOT_ICON[slot.dayPart];
                    return (
                      <div
                        key={slot.dayPart}
                        className="flex items-start gap-2 border-b border-border-hairline last:border-0 py-2"
                      >
                        <Icon size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-2xs uppercase tracking-wider text-muted-foreground">
                            {SLOT_LABEL[slot.dayPart]}
                          </p>
                          {slot.candidate ? (
                            <>
                              <p className="text-sm font-bold truncate">{slot.candidate.name}</p>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                {slot.candidate.kind === 'event' && (
                                  <Badge variant="outline">
                                    {t('trips.itinerary.event', 'Event')}
                                  </Badge>
                                )}
                                {slot.candidate.category && (
                                  <span className="text-xs text-muted-foreground">
                                    {slot.candidate.category}
                                  </span>
                                )}
                                {slot.matchedNeeds.length > 0 && (
                                  <Badge variant="outline">
                                    {t('trips.itinerary.matchesNeeds', 'Matches your needs')}
                                  </Badge>
                                )}
                                {/* An assumed time of day is SAID, not hidden.
                                    The venue has no category signal, so this
                                    slot is a placement, not a recommendation. */}
                                {slot.dayPartAssumed && (
                                  <span className="text-xs text-muted-foreground">
                                    {t('trips.itinerary.timeUnknown', 'time of day not known')}
                                  </span>
                                )}
                              </div>
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              {slot.outcome === 'exhausted'
                                ? t(
                                    'trips.itinerary.exhausted',
                                    'Nothing left. The matches here are already on other days.',
                                  )
                                : t(
                                    'trips.itinerary.noCandidate',
                                    'Nothing listed here for this time of day.',
                                  )}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setSeed(Math.floor(Math.random() * 1e9))}
              disabled={applying}
            >
              <RefreshCw size={16} />
              {t('trips.itinerary.reroll', 'Try another')}
            </Button>
            {canEdit && (
              <Button onClick={handleApply} loading={applying} disabled={result.filledSlots === 0}>
                <Check size={16} />
                {t('trips.itinerary.apply', 'Add {{count}} stops to the trip', {
                  count: result.filledSlots,
                })}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
