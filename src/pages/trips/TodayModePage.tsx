import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import {
  Calendar,
  Clock,
  MapPin,
  Plane,
  Hotel as HotelIcon,
  Ticket,
  ArrowLeft,
  ArrowRight,
  ShieldAlert,
  Skull,
  WifiOff,
  Bell,
  Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useTrip, type TripPlace, type TripDay, type TripWithDetails } from '@/hooks/useTrips';
import { useReservations, type Reservation } from '@/hooks/useReservations';
import { useTripSafety } from '@/hooks/useTripSafety';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { usePushSubscription } from '@/hooks/usePushSubscription';
import { computeTripSegments, findActiveSegment } from '@/utils/tripSegments';
import {
  cacheTripSnapshot,
  readTripSnapshot,
  pruneStaleSnapshots,
} from '@/utils/offlineTripPack';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/EmptyState';
import { classifyTripError } from '@/utils/tripError';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';

/**
 * Day-of-travel mode.
 */

interface TimelineItem {
  id: string;
  start: Date | null;
  end: Date | null;
  title: string;
  subtitle?: string | null;
  kind: 'place' | 'reservation';
  icon: typeof Clock;
  category?: string | null;
}

const iconForReservation = (r: Reservation): typeof Clock => {
  switch (r.type) {
    case 'flight':
    case 'transit':
      return Plane;
    case 'hotel':
      return HotelIcon;
    case 'activity':
    case 'restaurant':
    case 'event':
    case 'other':
    default:
      return Ticket;
  }
};

const iconForPlace = (p: TripPlace): typeof Clock => {
  if (p.venues) return MapPin;
  if (p.hotels) return HotelIcon;
  if (p.events) return Ticket;
  return MapPin;
};

function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function endOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

function isTripActiveToday(startDate: string | null, endDate: string | null, now: Date): boolean {
  if (!startDate || !endDate) return false;
  const start = new Date(startDate);
  const end = endOfLocalDay(new Date(endDate));
  return now >= startOfLocalDay(start) && now <= end;
}

export default function TodayModePage() {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { tripId } = useParams<{ tripId: string }>();
  const { data: trip, isLoading, error } = useTrip(tripId);
  const { data: reservations } = useReservations();
  const online = useOnlineStatus();
  const push = usePushSubscription();

  const [snapshotTrip, setSnapshotTrip] = useState<TripWithDetails | null>(null);
  const [snapshotReservations, setSnapshotReservations] = useState<Reservation[] | null>(null);
  const [snapshotSavedAt, setSnapshotSavedAt] = useState<string | null>(null);

  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (!tripId) return;
    void pruneStaleSnapshots();
    void readTripSnapshot(tripId).then((snap) => {
      if (!snap) return;
      setSnapshotTrip(snap.trip);
      setSnapshotReservations(snap.reservations);
      setSnapshotSavedAt(snap.savedAt);
    });
  }, [tripId]);

  const tripReservationsForSnapshot = useMemo(
    () => (reservations ?? []).filter((r) => r.trip_id === trip?.id),
    [reservations, trip?.id],
  );
  useEffect(() => {
    if (!tripId || !trip) return;
    void cacheTripSnapshot(tripId, trip, tripReservationsForSnapshot);
  }, [tripId, trip, tripReservationsForSnapshot]);

  const effectiveTrip = trip ?? snapshotTrip;
  const effectiveReservations = reservations ?? snapshotReservations ?? undefined;
  const servingFromSnapshot = !trip && !!snapshotTrip;

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!effectiveTrip) return [];
    const todayStart = startOfLocalDay(now);
    const todayEnd = endOfLocalDay(now);
    const todayISO = todayStart.toISOString().slice(0, 10);

    const todaysDayIds = new Set<string>(
      effectiveTrip.trip_days.filter((d: TripDay) => d.date === todayISO).map((d) => d.id),
    );

    const placeItems: TimelineItem[] = effectiveTrip.trip_places
      .filter((p: TripPlace) => !!p.day_id && todaysDayIds.has(p.day_id))
      .map((p: TripPlace) => {
        const name =
          p.venues?.name ??
          p.events?.title ??
          p.hotels?.name ??
          p.custom_name ??
          t('trips.today.unnamedPlace', 'Untitled stop');
        const start = p.start_time ? new Date(p.start_time) : null;
        const end = p.end_time
          ? new Date(p.end_time)
          : start && p.duration_minutes
            ? new Date(start.getTime() + p.duration_minutes * 60_000)
            : null;
        return {
          id: `place:${p.id}`,
          start,
          end,
          title: name,
          subtitle: p.notes,
          kind: 'place',
          icon: iconForPlace(p),
          category: p.category,
        };
      });

    const reservationItems: TimelineItem[] = (effectiveReservations ?? [])
      .filter((r) => {
        if (r.trip_id !== effectiveTrip.id) return false;
        const start = r.start_at ? new Date(r.start_at) : null;
        const end = r.end_at ? new Date(r.end_at) : null;
        if (!start && !end) return false;
        const s = start ?? end!;
        const e = end ?? start!;
        return e >= todayStart && s <= todayEnd;
      })
      .map((r) => ({
        id: `res:${r.key}`,
        start: r.start_at ? new Date(r.start_at) : null,
        end: r.end_at ? new Date(r.end_at) : null,
        title: r.title,
        subtitle: [r.provider, r.confirmation_code].filter(Boolean).join(' · ') || null,
        kind: 'reservation',
        icon: iconForReservation(r),
        category: r.type,
      }));

    const combined = [...placeItems, ...reservationItems];
    combined.sort((a, b) => {
      const ax = a.start?.getTime() ?? Number.POSITIVE_INFINITY;
      const bx = b.start?.getTime() ?? Number.POSITIVE_INFINITY;
      return ax - bx;
    });
    return combined;
  }, [effectiveTrip, effectiveReservations, now, t]);

  const nextUp = useMemo<TimelineItem | null>(() => {
    return timeline.find((i) => i.start && i.start.getTime() > now.getTime()) ?? null;
  }, [timeline, now]);

  const tripReservations = useMemo(
    () => (effectiveReservations ?? []).filter((r) => r.trip_id === effectiveTrip?.id),
    [effectiveReservations, effectiveTrip?.id],
  );
  const segments = useMemo(
    () =>
      effectiveTrip
        ? computeTripSegments(effectiveTrip.trip_places, effectiveTrip.trip_days, tripReservations)
        : [],
    [effectiveTrip, tripReservations],
  );
  const activeSegment = useMemo(() => findActiveSegment(segments, now), [segments, now]);
  const activeCountryIds = useMemo(
    () => (activeSegment ? [activeSegment.country_id] : []),
    [activeSegment],
  );
  const activeSafety = useTripSafety(activeCountryIds);
  const activeCountrySafety = activeSafety.countries[0] ?? null;

  const activeNow = useMemo<TimelineItem | null>(() => {
    return (
      timeline.find((i) => {
        if (!i.start) return false;
        const end = i.end ?? new Date(i.start.getTime() + 60 * 60_000);
        return i.start.getTime() <= now.getTime() && now.getTime() <= end.getTime();
      }) ?? null
    );
  }, [timeline, now]);

  if (isLoading && !effectiveTrip) {
    return (
      <div className="container mx-auto py-16 px-4 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto" aria-label="Loading" />
      </div>
    );
  }

  if ((error && !effectiveTrip) || !effectiveTrip) {
    const kind = classifyTripError(tripId, error, effectiveTrip) ?? 'load-error';
    return (
      <div className="container mx-auto py-16 px-4">
        <ErrorState
          title={t(`trips.error.${kind}.title`)}
          description={t(`trips.error.${kind}.description`)}
          primaryAction={{
            label: t('trips.backToTrips'),
            onClick: () => navigate('/trips'),
            variant: 'default',
          }}
        />
      </div>
    );
  }

  if (!isTripActiveToday(effectiveTrip.start_date, effectiveTrip.end_date, now)) {
    return (
      <div className="container mx-auto py-16 px-4">
        <div className="text-center max-w-[480px] mx-auto">
          <h5 className="text-xl font-bold mb-2">
            {t('trips.today.inactiveTitle', "This trip isn't active today")}
          </h5>
          <p className="text-muted-foreground mb-6">
            {t(
              'trips.today.inactiveDescription',
              "Today-mode only shows content while you're on the trip. Head back to the planner.",
            )}
          </p>
          <LocalizedLink to={`/trips/${effectiveTrip.id}`}>
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              {t('trips.today.backToPlanner', 'Back to planner')}
            </Button>
          </LocalizedLink>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 md:py-12 px-4">
      {(!online || servingFromSnapshot) && (
        <div
          className="mb-4 p-3 bg-muted flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <WifiOff size={16} />
          <span className="text-sm">
            {t(
              'trips.today.offlineBanner',
              "You're offline — showing your last-saved itinerary.",
            )}
            {snapshotSavedAt && (
              <>
                {' '}
                <span style={{ opacity: 0.7 }}>
                  ({new Date(snapshotSavedAt).toLocaleString()})
                </span>
              </>
            )}
          </span>
        </div>
      )}

      {online && push.supported && !push.subscribed && (
        <div className="mb-4 p-3 flex items-center justify-between gap-2 bg-muted">
          <div className="flex items-center gap-2">
            <Bell size={16} />
            <span className="text-sm">
              {t(
                'trips.today.pushPrompt',
                'Get a reminder 30 min before each reservation.',
              )}
            </span>
          </div>
          <Button size="sm" onClick={push.subscribe} disabled={push.pending}>
            {t('trips.today.pushEnable', 'Enable')}
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <LocalizedLink
          to={`/trips/${effectiveTrip.id}`}
          style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem' }}
        >
          ← {effectiveTrip.title}
        </LocalizedLink>
        <div className="flex items-center gap-2 mt-2">
          <h3 className="text-3xl md:text-4xl font-bold">
            {t('trips.today.title', 'Today')}
          </h3>
          <span className="text-muted-foreground text-lg font-medium">
            {now.toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </span>
        </div>
      </div>

      {activeCountrySafety &&
        (activeCountrySafety.criminalized ||
          activeCountrySafety.deathPenalty ||
          (activeCountrySafety.equality_score != null &&
            activeCountrySafety.equality_score < 50)) && (
          <div
            className={`mb-6 p-4 flex items-start gap-3 ${
              activeCountrySafety.deathPenalty
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-muted text-foreground'
            }`}
            role="alert"
          >
            <div className="pt-0.5 flex-shrink-0">
              {activeCountrySafety.deathPenalty ? (
                <Skull size={20} />
              ) : (
                <ShieldAlert size={20} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold mb-1">
                {activeCountrySafety.deathPenalty
                  ? t('trips.today.safetyDeathTitle', "You're in a country with the death penalty for same-sex acts")
                  : activeCountrySafety.criminalized
                    ? t('trips.today.safetyCriminalTitle', "You're in a country where same-sex acts are criminalized")
                    : t('trips.today.safetyLimitedTitle', "You're in a country with limited LGBTQ+ rights")}
              </p>
              <p className="text-sm opacity-90">
                {activeCountrySafety.name}
                {activeCountrySafety.equality_score != null && (
                  <> · {t('trips.today.scoreLabel', 'Equality score')} {activeCountrySafety.equality_score}/100</>
                )}
              </p>
              <LocalizedLink
                to={`/trips/${effectiveTrip.id}`}
                style={{ color: 'inherit', textDecoration: 'underline', fontSize: '0.8125rem' }}
              >
                {t('trips.today.viewBriefing', 'View full safety briefing →')}
              </LocalizedLink>
            </div>
          </div>
        )}

      {(activeNow || nextUp) && (
        <div className="mb-6 p-4 bg-muted flex items-center gap-3">
          <div className="w-10 h-10 bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
            {activeNow ? <MapPin size={18} /> : <Clock size={18} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="uppercase tracking-wider text-xs font-bold text-primary">
              {activeNow
                ? t('trips.today.happeningNow', 'Happening now')
                : t('trips.today.nextUp', 'Next up')}
            </p>
            <p className="font-bold">
              {activeNow?.title ?? nextUp?.title}
            </p>
            {nextUp && !activeNow && nextUp.start && (
              <p className="text-muted-foreground text-sm">
                {formatCountdown(nextUp.start, now, t)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Timeline */}
      {timeline.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar size={32} style={{ opacity: 0.4, margin: '0 auto 12px' }} />
          <p>{t('trips.today.nothingTitle', 'Nothing scheduled today.')}</p>
          <p className="text-sm mt-1">
            {t('trips.today.nothingHint', 'Add items in the planner to see them here.')}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {timeline.map((item) => {
            const Icon = item.icon;
            const isPast = item.end && item.end.getTime() < now.getTime();
            return (
              <Card key={item.id}>
                <CardContent>
                  <div
                    className="flex gap-3 items-start"
                    style={{ opacity: isPast ? 0.55 : 1 }}
                  >
                    <div className="w-9 h-9 bg-muted flex items-center justify-center flex-shrink-0">
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold">{item.title}</p>
                        {item.category && (
                          <Badge className="capitalize">{item.category}</Badge>
                        )}
                        {item.kind === 'reservation' && (
                          <Badge variant="outline">
                            {t('trips.today.reservationLabel', 'reservation')}
                          </Badge>
                        )}
                      </div>
                      {item.subtitle && (
                        <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                      )}
                      <div className="flex items-center gap-1 mt-1">
                        <Clock size={12} style={{ color: 'var(--muted-foreground)' }} />
                        <span className="text-xs text-muted-foreground">
                          {item.start
                            ? item.start.toLocaleTimeString(undefined, {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : t('trips.today.anytime', 'Any time')}
                          {item.end && item.start && (
                            <>
                              {' '}–{' '}
                              {item.end.toLocaleTimeString(undefined, {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                    <ArrowRight
                      size={14}
                      style={{ color: 'var(--muted-foreground)', flexShrink: 0, marginTop: 10 }}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────

function formatCountdown(
  when: Date,
  now: Date,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const diffMs = when.getTime() - now.getTime();
  if (diffMs <= 0) return t('trips.today.startingNow', 'Starting now');
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) {
    return t('trips.today.inMinutes', {
      count: minutes,
      defaultValue: 'in {{count}} min',
    });
  }
  const hours = Math.floor(minutes / 60);
  const restMin = minutes % 60;
  if (restMin === 0) {
    return t('trips.today.inHours', {
      count: hours,
      defaultValue: 'in {{count}} h',
    });
  }
  return `${hours}h ${restMin}m`;
}
