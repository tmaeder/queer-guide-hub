import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import {
  Inbox as InboxIcon,
  Plane,
  Hotel,
  Ticket,
  Calendar,
  Link2,
  Plus,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useAuth } from '@/hooks/useAuth';
import { useTrips, useTripMutations } from '@/hooks/useTrips';
import {
  useReservations,
  useAttachBookingToTrip,
  type Reservation,
} from '@/hooks/useReservations';
import { suggestTripGroupings, type TripSuggestion } from '@/utils/tripGrouping';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TripsSignedOutHero } from '@/components/trips/TripsSignedOutHero';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';

const TYPE_ICONS: Record<Reservation['type'], typeof Plane> = {
  flight: Plane,
  hotel: Hotel,
  activity: Ticket,
  transit: Plane,
  restaurant: Ticket,
  event: Ticket,
  other: InboxIcon,
};

const STATUS_COLORS: Record<Reservation['status'], 'default' | 'success' | 'warning' | 'error'> = {
  pending: 'warning',
  confirmed: 'success',
  completed: 'default',
  cancelled: 'error',
  failed: 'error',
};

const formatRange = (start: string | null, end: string | null): string | null => {
  if (!start && !end) return null;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString();
  if (start && end) {
    const s = fmt(start);
    const e = fmt(end);
    return s === e ? s : `${s} – ${e}`;
  }
  return fmt((start || end) as string);
};

const formatAmount = (amount: number | null, currency: string | null) => {
  if (!amount) return null;
  const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency ?? '';
  return `${symbol}${Math.round(amount).toLocaleString()}`;
};

export default function TripsInboxPage() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const { data: reservations, isLoading, error } = useReservations();
  const { data: trips } = useTrips();
  const { createTrip } = useTripMutations();
  const attach = useAttachBookingToTrip();
  const navigate = useNavigate();

  const orphanReservations = useMemo(
    () => (reservations ?? []).filter((r) => !r.trip_id),
    [reservations],
  );
  const suggestions = useMemo(
    () => suggestTripGroupings(orphanReservations),
    [orphanReservations],
  );

  // Reservations already in a suggestion are hidden from the orphan list
  // to avoid showing them twice.
  const reservationIdsInSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const s of suggestions) for (const r of s.reservations) set.add(r.key);
    return set;
  }, [suggestions]);

  const standaloneOrphans = useMemo(
    () => orphanReservations.filter((r) => !reservationIdsInSuggestions.has(r.key)),
    [orphanReservations, reservationIdsInSuggestions],
  );

  if (!user) return <TripsSignedOutHero />;

  return (
    <Container sx={{ py: { xs: 4, md: 6 } }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { sm: 'center' },
          justifyContent: 'space-between',
          gap: 2,
          mb: 4,
        }}
      >
        <Box>
          <Typography variant="h3" sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' }, mb: 0.5 }}>
            {t('pages.inbox.title', 'Travel inbox')}
            {orphanReservations.length > 0 && (
              <Box
                component="span"
                sx={{
                  ml: 1.25,
                  color: 'text.secondary',
                  fontSize: '0.65em',
                  fontWeight: 500,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                · {orphanReservations.length}
              </Box>
            )}
          </Typography>
          <Typography color="text.secondary">
            {t(
              'pages.inbox.subtitle',
              'Bookings not yet attached to a trip. Group them into a trip or attach them to an existing one.',
            )}
          </Typography>
        </Box>
        <LocalizedLink to="/trips">
          <Button variant="outline">
            {t('pages.inbox.viewTrips', 'View all trips')}
            <ArrowRight style={{ width: 16, height: 16, marginLeft: 6 }} />
          </Button>
        </LocalizedLink>
      </Box>

      {/* Loading */}
      {isLoading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={96} />
          ))}
        </Box>
      )}

      {/* Error */}
      {error && !isLoading && (
        <Typography color="error" sx={{ py: 4 }}>
          {t('pages.inbox.error', "Couldn't load your reservations. Please retry.")}
        </Typography>
      )}

      {/* Empty */}
      {!isLoading && !error && orphanReservations.length === 0 && (
        <EmptyState
          icon={InboxIcon}
          title={t('pages.inbox.empty.title', 'Inbox zero')}
          description={t(
            'pages.inbox.empty.description',
            'Every booking is attached to a trip. New bookings will appear here when they arrive.',
          )}
        />
      )}

      {/* Grouping suggestions */}
      {suggestions.length > 0 && (
        <Box sx={{ mb: 5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Sparkles style={{ width: 18, height: 18, color: 'var(--primary)' }} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {t('pages.inbox.suggestions.title', 'Suggested trips')}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                onCreate={async (title) => {
                  const trip = await createTrip.mutateAsync({
                    title,
                    start_date: s.start_at.slice(0, 10),
                    end_date: s.end_at.slice(0, 10),
                    currency: s.currency ?? 'EUR',
                  });
                  // Attach each member booking. Trip-reservation members already
                  // have a trip_id (their own); only external bookings need moving.
                  await Promise.all(
                    s.reservations
                      .filter((r) => r.origin === 'booking')
                      .map((r) => attach.mutateAsync({ bookingId: r.id, tripId: trip.id })),
                  );
                  navigate(`/trips/${trip.id}`);
                }}
                pending={createTrip.isPending}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Orphan list */}
      {standaloneOrphans.length > 0 && (
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            {t('pages.inbox.orphans.title', 'Unattached reservations')}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {standaloneOrphans.map((r) => (
              <OrphanRow
                key={r.key}
                reservation={r}
                trips={trips ?? []}
                onAttach={async (tripId) => {
                  if (r.origin !== 'booking') return;
                  await attach.mutateAsync({ bookingId: r.id, tripId });
                }}
                canAttach={r.origin === 'booking'}
              />
            ))}
          </Box>
        </Box>
      )}
    </Container>
  );
}

// ── Suggestion card ─────────────────────────────────────────────

function SuggestionCard({
  suggestion,
  onCreate,
  pending,
}: {
  suggestion: TripSuggestion;
  onCreate: (title: string) => void | Promise<void>;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const dateRange = formatRange(suggestion.start_at, suggestion.end_at);
  const titleSuggestion = useMemo(() => {
    // Pick a city name if we have one, otherwise fall back to date range.
    const dateLabel = dateRange ?? '';
    return `${t('pages.inbox.suggestions.defaultTitle', 'Trip')} · ${dateLabel}`;
  }, [dateRange, t]);

  return (
    <Box
      sx={{
        p: 2,
        bgcolor: 'action.hover',
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { sm: 'center' },
        justifyContent: 'space-between',
        gap: 1.5,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700 }}>
          {t('pages.inbox.suggestions.headline', {
            count: suggestion.reservations.length,
            defaultValue: `{{count}} reservations look like the same trip`,
          })}
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
          {dateRange}
          {formatAmount(suggestion.total_amount, suggestion.currency) &&
            ` · ${formatAmount(suggestion.total_amount, suggestion.currency)}`}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
          {suggestion.reservations.map((r) => (
            <Chip
              key={r.key}
              label={`${r.type} · ${r.provider ?? 'manual'}`}
              size="small"
              sx={{ textTransform: 'capitalize' }}
            />
          ))}
        </Box>
      </Box>
      <Button
        variant="brand"
        onClick={() => void onCreate(titleSuggestion)}
        disabled={pending}
      >
        <Plus style={{ width: 16, height: 16, marginRight: 6 }} />
        {t('pages.inbox.suggestions.createCta', 'Create trip')}
      </Button>
    </Box>
  );
}

// ── Orphan row ──────────────────────────────────────────────────

function OrphanRow({
  reservation,
  trips,
  onAttach,
  canAttach,
}: {
  reservation: Reservation;
  trips: Array<{ id: string; title: string }>;
  onAttach: (tripId: string) => void | Promise<void>;
  canAttach: boolean;
}) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const Icon = TYPE_ICONS[reservation.type] ?? InboxIcon;
  const range = formatRange(reservation.start_at, reservation.end_at);
  const amount = formatAmount(reservation.total_amount, reservation.currency);

  return (
    <Box
      sx={{
        p: 2,
        bgcolor: 'background.paper',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 2,
      }}
    >
      <Box sx={{ p: 1, bgcolor: 'action.hover' }}>
        <Icon style={{ width: 22, height: 22, color: 'var(--primary)' }} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
          <Typography sx={{ fontWeight: 700 }}>{reservation.title}</Typography>
          <Chip
            label={reservation.status}
            size="small"
            color={STATUS_COLORS[reservation.status]}
            sx={{ textTransform: 'capitalize' }}
          />
        </Box>
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
          {[reservation.provider, reservation.type].filter(Boolean).join(' · ')}
        </Typography>
        {range && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
            <Calendar style={{ width: 13, height: 13, color: 'var(--muted-foreground)' }} />
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{range}</Typography>
          </Box>
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
        {amount && (
          <Typography sx={{ fontWeight: 700, color: 'primary.main', whiteSpace: 'nowrap' }}>
            {amount}
          </Typography>
        )}
        {canAttach && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => setAnchor(e.currentTarget)}
              disabled={trips.length === 0}
              aria-label={t('pages.inbox.orphans.attach', 'Attach to trip')}
            >
              <Link2 style={{ width: 16, height: 16, marginRight: 4 }} />
              {t('pages.inbox.orphans.attach', 'Attach')}
            </Button>
            <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
              {trips.length === 0 && (
                <MenuItem disabled>
                  {t('pages.inbox.orphans.noTrips', 'No trips yet')}
                </MenuItem>
              )}
              {trips.map((trip) => (
                <MenuItem
                  key={trip.id}
                  onClick={async () => {
                    setAnchor(null);
                    await onAttach(trip.id);
                  }}
                >
                  {trip.title}
                </MenuItem>
              ))}
              {trips.length > 0 && <Divider />}
              <MenuItem component={LocalizedLink} to="/trips" onClick={() => setAnchor(null)}>
                <Plus style={{ width: 14, height: 14, marginRight: 6 }} />
                {t('pages.inbox.orphans.newTrip', 'Create new trip')}
              </MenuItem>
            </Menu>
          </>
        )}
      </Box>
    </Box>
  );
}
