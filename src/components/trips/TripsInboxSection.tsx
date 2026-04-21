import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
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
  Mail,
  Copy,
  Check,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useTrips, useTripMutations } from '@/hooks/useTrips';
import {
  useReservations,
  useAttachBookingToTrip,
  type Reservation,
} from '@/hooks/useReservations';
import { suggestTripGroupings, type TripSuggestion } from '@/utils/tripGrouping';
import { useEmailForwardingAddress } from '@/hooks/useEmailForwardingAddress';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { resolveTripTitle } from '@/components/trips/tripTitle';

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

export function TripsInboxSection() {
  const { t } = useTranslation();

  const { data: reservations, isLoading, error } = useReservations();
  const { data: trips } = useTrips();
  const { createTrip } = useTripMutations();
  const attach = useAttachBookingToTrip();
  const navigate = useNavigate();
  const { data: forwarding } = useEmailForwardingAddress();

  const orphanReservations = useMemo(
    () => (reservations ?? []).filter((r) => !r.trip_id),
    [reservations],
  );
  const suggestions = useMemo(
    () => suggestTripGroupings(orphanReservations),
    [orphanReservations],
  );

  const reservationIdsInSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const s of suggestions) for (const r of s.reservations) set.add(r.key);
    return set;
  }, [suggestions]);

  const standaloneOrphans = useMemo(
    () => orphanReservations.filter((r) => !reservationIdsInSuggestions.has(r.key)),
    [orphanReservations, reservationIdsInSuggestions],
  );

  // Hide the section entirely when there's nothing to show and no
  // forwarding address to surface — keeps the Trips page clean.
  const hasContent =
    isLoading || !!error || orphanReservations.length > 0 || !!forwarding;
  if (!hasContent) return null;

  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <InboxIcon style={{ width: 20, height: 20, color: 'var(--primary)' }} />
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {t('pages.inbox.title', 'Travel inbox')}
          {orphanReservations.length > 0 && (
            <Box
              component="span"
              sx={{
                ml: 1,
                color: 'text.secondary',
                fontSize: '0.75em',
                fontWeight: 500,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              · {orphanReservations.length}
            </Box>
          )}
        </Typography>
      </Box>

      {isLoading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={96} />
          ))}
        </Box>
      )}

      {error && !isLoading && (
        <Typography color="error" sx={{ py: 2 }}>
          {t('pages.inbox.error', "Couldn't load your reservations. Please retry.")}
        </Typography>
      )}

      {suggestions.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Sparkles style={{ width: 16, height: 16, color: 'var(--primary)' }} />
            <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>
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
                  await Promise.all(
                    s.reservations.map((r) =>
                      attach.mutateAsync({ reservationId: r.id, tripId: trip.id }),
                    ),
                  );
                  navigate(`/trips/${trip.id}`);
                }}
                pending={createTrip.isPending}
              />
            ))}
          </Box>
        </Box>
      )}

      {standaloneOrphans.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', mb: 1.5 }}>
            {t('pages.inbox.orphans.title', 'Unattached reservations')}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {standaloneOrphans.map((r) => (
              <OrphanRow
                key={r.key}
                reservation={r}
                trips={trips ?? []}
                onAttach={async (tripId) => {
                  await attach.mutateAsync({ reservationId: r.id, tripId });
                }}
                canAttach={true}
              />
            ))}
          </Box>
        </Box>
      )}

      <ForwardingAddressCard />
    </Box>
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
  trips: Array<{ id: string; title: string; primary_city_name: string | null }>;
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
                  {resolveTripTitle(trip, t)}
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

// ── Forwarding address card ─────────────────────────────────────

function ForwardingAddressCard() {
  const { t } = useTranslation();
  const { data, isLoading } = useEmailForwardingAddress();
  const [copied, setCopied] = useState(false);

  if (isLoading || !data) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API blocked — silently no-op; the address is visible.
    }
  };

  return (
    <Box sx={{ mt: 2, p: 3, bgcolor: 'action.hover' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Mail style={{ width: 18, height: 18, color: 'var(--primary)' }} />
        <Typography sx={{ fontWeight: 700 }}>
          {t('pages.inbox.forwarding.title', 'Forward bookings here')}
        </Typography>
      </Box>
      <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', mb: 2 }}>
        {t(
          'pages.inbox.forwarding.description',
          'Forward any confirmation email to this address and it will appear in your Inbox. Booking.com, Airbnb, and Lufthansa are recognized today.',
        )}
      </Typography>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1.5,
          bgcolor: 'background.paper',
          fontFamily: 'monospace',
          fontSize: '0.95rem',
          wordBreak: 'break-all',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>{data.address}</Box>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void copy()}
          aria-label={t('pages.inbox.forwarding.copy', 'Copy address')}
        >
          {copied ? (
            <Check style={{ width: 16, height: 16 }} />
          ) : (
            <Copy style={{ width: 16, height: 16 }} />
          )}
        </Button>
      </Box>
    </Box>
  );
}
