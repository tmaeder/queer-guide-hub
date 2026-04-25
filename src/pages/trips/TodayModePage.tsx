import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
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
import { ErrorState } from '@/components/ui/EmptyState';
import { classifyTripError } from '@/utils/tripError';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';

/**
 * Day-of-travel mode.
 *
 * Shows the user's plan for *today* — every trip_place on today's trip_day
 * plus every reservation whose start_at falls in today's window — sorted
 * in chronological order. A "next up" card ticks live (1-minute interval)
 * with a countdown until the next item starts.
 *
 * Access is limited to trips that include today in their [start_date,
 * end_date] window. Outside the window we bounce the user to the planner.
 * The page is intentionally narrow — this isn't a planning surface.
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

  // Offline-snapshot rehydration — used only when the live query failed or
  // returned nothing (airplane mode / dead signal). When online with fresh
  // data we write a new snapshot on every successful render.
  const [snapshotTrip, setSnapshotTrip] = useState<TripWithDetails | null>(null);
  const [snapshotReservations, setSnapshotReservations] = useState<Reservation[] | null>(null);
  const [snapshotSavedAt, setSnapshotSavedAt] = useState<string | null>(null);

  // Tick so "next in N min" stays fresh without a heavy interval.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(i);
  }, []);

  // Load any existing snapshot at mount — so we can render immediately if
  // the network is down. Also prune stale snapshots opportunistically.
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

  // Write a fresh snapshot whenever the live data lands — overwrites the
  // prior blob so the next offline visit sees current-ish state.
  const tripReservationsForSnapshot = useMemo(
    () => (reservations ?? []).filter((r) => r.trip_id === trip?.id),
    [reservations, trip?.id],
  );
  useEffect(() => {
    if (!tripId || !trip) return;
    void cacheTripSnapshot(tripId, trip, tripReservationsForSnapshot);
  }, [tripId, trip, tripReservationsForSnapshot]);

  // Pick the source of truth: live data when we have it, snapshot otherwise.
  const effectiveTrip = trip ?? snapshotTrip;
  const effectiveReservations = reservations ?? snapshotReservations ?? undefined;
  const servingFromSnapshot = !trip && !!snapshotTrip;

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!effectiveTrip) return [];
    const todayStart = startOfLocalDay(now);
    const todayEnd = endOfLocalDay(now);
    const todayISO = todayStart.toISOString().slice(0, 10);

    // Places scheduled on today's trip_day.
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

    // Reservations that touch today (start or end intersects [todayStart,todayEnd]).
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

  // Per-leg safety: which country is the user in *today*?
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
      <Container sx={{ py: 8, textAlign: 'center' }}>
        <CircularProgress  aria-label="Loading"/>
      </Container>
    );
  }

  if ((error && !effectiveTrip) || !effectiveTrip) {
    const kind = classifyTripError(tripId, error, effectiveTrip) ?? 'load-error';
    return (
      <Container sx={{ py: 8 }}>
        <ErrorState
          title={t(`trips.error.${kind}.title`)}
          description={t(`trips.error.${kind}.description`)}
          primaryAction={{
            label: t('trips.backToTrips'),
            onClick: () => navigate('/trips'),
            variant: 'default',
          }}
        />
      </Container>
    );
  }

  if (!isTripActiveToday(effectiveTrip.start_date, effectiveTrip.end_date, now)) {
    return (
      <Container sx={{ py: 8 }}>
        <Box sx={{ textAlign: 'center', maxWidth: 480, mx: 'auto' }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
            {t('trips.today.inactiveTitle', "This trip isn't active today")}
          </Typography>
          <Typography sx={{ color: 'text.secondary', mb: 3 }}>
            {t(
              'trips.today.inactiveDescription',
              "Today-mode only shows content while you're on the trip. Head back to the planner.",
            )}
          </Typography>
          <LocalizedLink to={`/trips/${effectiveTrip.id}`}>
            <Button variant="outline">
              <ArrowLeft style={{ width: 16, height: 16, marginRight: 6 }} />
              {t('trips.today.backToPlanner', 'Back to planner')}
            </Button>
          </LocalizedLink>
        </Box>
      </Container>
    );
  }

  return (
    <Container sx={{ py: { xs: 4, md: 6 } }}>
      {/* Offline banner — visible when we're serving a cached snapshot. */}
      {(!online || servingFromSnapshot) && (
        <Box
          sx={{
            mb: 2,
            p: 1.5,
            bgcolor: 'action.hover',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            fontSize: '0.875rem',
            color: 'text.secondary',
          }}
          role="status"
        >
          <WifiOff size={16} />
          <Typography sx={{ fontSize: '0.875rem' }}>
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
          </Typography>
        </Box>
      )}

      {/* Push opt-in — shown on Today mode because this is where the
          reminders (next-item, doc-expiry) are most useful. Discreet. */}
      {online && push.supported && !push.subscribed && (
        <Box
          sx={{
            mb: 2,
            p: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            bgcolor: 'action.hover',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Bell size={16} />
            <Typography sx={{ fontSize: '0.875rem' }}>
              {t(
                'trips.today.pushPrompt',
                'Get a reminder 30 min before each reservation.',
              )}
            </Typography>
          </Box>
          <Button size="sm" onClick={push.subscribe} disabled={push.pending}>
            {t('trips.today.pushEnable', 'Enable')}
          </Button>
        </Box>
      )}

      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <LocalizedLink
          to={`/trips/${effectiveTrip.id}`}
          style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem' }}
        >
          ← {effectiveTrip.title}
        </LocalizedLink>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <Typography variant="h3" sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' } }}>
            {t('trips.today.title', 'Today')}
          </Typography>
          <Typography
            component="span"
            sx={{ color: 'text.secondary', fontSize: '1.1rem', fontWeight: 500 }}
          >
            {now.toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </Typography>
        </Box>
      </Box>

      {/* Per-leg safety alert — only shown when today lands in a country
          with limited rights (score < 50) or active criminalization. */}
      {activeCountrySafety &&
        (activeCountrySafety.criminalized ||
          activeCountrySafety.deathPenalty ||
          (activeCountrySafety.equality_score != null &&
            activeCountrySafety.equality_score < 50)) && (
          <Box
            sx={{
              mb: 3,
              p: 2,
              bgcolor: activeCountrySafety.deathPenalty ? 'error.main' : 'warning.main',
              color: activeCountrySafety.deathPenalty ? 'error.contrastText' : 'warning.contrastText',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1.5,
            }}
            role="alert"
          >
            <Box sx={{ pt: 0.25, flexShrink: 0 }}>
              {activeCountrySafety.deathPenalty ? (
                <Skull size={20} />
              ) : (
                <ShieldAlert size={20} />
              )}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, mb: 0.25 }}>
                {activeCountrySafety.deathPenalty
                  ? t('trips.today.safetyDeathTitle', "You're in a country with the death penalty for same-sex acts")
                  : activeCountrySafety.criminalized
                    ? t('trips.today.safetyCriminalTitle', "You're in a country where same-sex acts are criminalized")
                    : t('trips.today.safetyLimitedTitle', "You're in a country with limited LGBTQ+ rights")}
              </Typography>
              <Typography sx={{ fontSize: '0.875rem', opacity: 0.9 }}>
                {activeCountrySafety.name}
                {activeCountrySafety.equality_score != null && (
                  <> · {t('trips.today.scoreLabel', 'Equality score')} {activeCountrySafety.equality_score}/100</>
                )}
              </Typography>
              <LocalizedLink
                to={`/trips/${effectiveTrip.id}`}
                style={{ color: 'inherit', textDecoration: 'underline', fontSize: '0.8125rem' }}
              >
                {t('trips.today.viewBriefing', 'View full safety briefing →')}
              </LocalizedLink>
            </Box>
          </Box>
        )}

      {/* Next-up / active-now card */}
      {(activeNow || nextUp) && (
        <Box
          sx={{
            mb: 3,
            p: 2,
            bgcolor: 'action.hover',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {activeNow ? <MapPin size={18} /> : <Clock size={18} />}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontSize: '0.7rem',
                fontWeight: 700,
                color: 'primary.main',
              }}
            >
              {activeNow
                ? t('trips.today.happeningNow', 'Happening now')
                : t('trips.today.nextUp', 'Next up')}
            </Typography>
            <Typography sx={{ fontWeight: 700 }}>
              {activeNow?.title ?? nextUp?.title}
            </Typography>
            {nextUp && !activeNow && nextUp.start && (
              <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                {formatCountdown(nextUp.start, now, t)}
              </Typography>
            )}
          </Box>
        </Box>
      )}

      {/* Timeline */}
      {timeline.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
          <Calendar size={32} style={{ opacity: 0.4, margin: '0 auto 12px' }} />
          <Typography>{t('trips.today.nothingTitle', 'Nothing scheduled today.')}</Typography>
          <Typography sx={{ fontSize: '0.875rem', mt: 0.5 }}>
            {t('trips.today.nothingHint', 'Add items in the planner to see them here.')}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {timeline.map((item) => {
            const Icon = item.icon;
            const isPast = item.end && item.end.getTime() < now.getTime();
            return (
              <Card key={item.id}>
                <CardContent>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', opacity: isPast ? 0.55 : 1 }}>
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        bgcolor: 'action.hover',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={16} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontWeight: 700 }}>{item.title}</Typography>
                        {item.category && (
                          <Chip label={item.category} size="small" sx={{ textTransform: 'capitalize' }} />
                        )}
                        {item.kind === 'reservation' && (
                          <Chip
                            label={t('trips.today.reservationLabel', 'reservation')}
                            size="small"
                            variant="outlined"
                          />
                        )}
                      </Box>
                      {item.subtitle && (
                        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                          {item.subtitle}
                        </Typography>
                      )}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                        <Clock size={12} style={{ color: 'var(--muted-foreground)' }} />
                        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
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
                        </Typography>
                      </Box>
                    </Box>
                    <ArrowRight
                      size={14}
                      style={{ color: 'var(--muted-foreground)', flexShrink: 0, marginTop: 10 }}
                    />
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
    </Container>
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
