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
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useTrip, type TripPlace, type TripDay } from '@/hooks/useTrips';
import { useReservations, type Reservation } from '@/hooks/useReservations';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/EmptyState';

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
  const { tripId } = useParams<{ tripId: string }>();
  const { data: trip, isLoading, error } = useTrip(tripId);
  const { data: reservations } = useReservations();

  // Tick so "next in N min" stays fresh without a heavy interval.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(i);
  }, []);

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!trip) return [];
    const todayStart = startOfLocalDay(now);
    const todayEnd = endOfLocalDay(now);
    const todayISO = todayStart.toISOString().slice(0, 10);

    // Places scheduled on today's trip_day.
    const todaysDayIds = new Set<string>(
      trip.trip_days.filter((d: TripDay) => d.date === todayISO).map((d) => d.id),
    );

    const placeItems: TimelineItem[] = trip.trip_places
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
    const reservationItems: TimelineItem[] = (reservations ?? [])
      .filter((r) => {
        if (r.trip_id !== trip.id) return false;
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
  }, [trip, reservations, now, t]);

  const nextUp = useMemo<TimelineItem | null>(() => {
    return timeline.find((i) => i.start && i.start.getTime() > now.getTime()) ?? null;
  }, [timeline, now]);

  const activeNow = useMemo<TimelineItem | null>(() => {
    return (
      timeline.find((i) => {
        if (!i.start) return false;
        const end = i.end ?? new Date(i.start.getTime() + 60 * 60_000);
        return i.start.getTime() <= now.getTime() && now.getTime() <= end.getTime();
      }) ?? null
    );
  }, [timeline, now]);

  if (isLoading) {
    return (
      <Container sx={{ py: 8, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error || !trip) {
    return (
      <Container sx={{ py: 8 }}>
        <ErrorState message={t('trips.today.notFound', "Couldn't load this trip.")} />
      </Container>
    );
  }

  if (!isTripActiveToday(trip.start_date, trip.end_date, now)) {
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
          <LocalizedLink to={`/trips/${trip.id}`}>
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
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <LocalizedLink
          to={`/trips/${trip.id}`}
          style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem' }}
        >
          ← {trip.title}
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
