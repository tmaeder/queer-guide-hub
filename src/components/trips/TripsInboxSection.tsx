import { useMemo, useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

const STATUS_CLASS: Record<Reservation['status'], string> = {
  pending: 'bg-muted text-muted-foreground border-border',
  confirmed: 'bg-foreground/5 text-foreground border-foreground/20',
  completed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-destructive/15 text-destructive border-destructive/30',
  failed: 'bg-destructive/15 text-destructive border-destructive/30',
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
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <InboxIcon style={{ width: 20, height: 20, color: 'var(--primary)' }} />
        <h2 className="text-base font-bold">
          {t('pages.inbox.title', 'Travel inbox')}
          {orphanReservations.length > 0 && (
            <span
              className="ml-2 text-muted-foreground font-medium"
              style={{ fontSize: '0.75em', fontVariantNumeric: 'tabular-nums' }}
            >
              · {orphanReservations.length}
            </span>
          )}
        </h2>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-element" />
          ))}
        </div>
      )}

      {error && !isLoading && (
        <p className="text-destructive py-4">
          {t('pages.inbox.error', "Couldn't load your reservations. Please retry.")}
        </p>
      )}

      {suggestions.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles style={{ width: 16, height: 16, color: 'var(--primary)' }} />
            <p className="font-bold text-[0.9375rem]">
              {t('pages.inbox.suggestions.title', 'Suggested trips')}
            </p>
          </div>
          <div className="flex flex-col gap-3">
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
          </div>
        </div>
      )}

      {standaloneOrphans.length > 0 && (
        <div className="mb-6">
          <p className="font-bold text-[0.9375rem] mb-3">
            {t('pages.inbox.orphans.title', 'Unattached reservations')}
          </p>
          <div className="flex flex-col gap-2">
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
          </div>
        </div>
      )}

      <ForwardingAddressCard />
    </div>
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
    <div className="p-4 bg-muted flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <p className="font-bold">
          {t('pages.inbox.suggestions.headline', {
            count: suggestion.reservations.length,
            defaultValue: `{{count}} reservations look like the same trip`,
          })}
        </p>
        <p className="text-sm text-muted-foreground">
          {dateRange}
          {formatAmount(suggestion.total_amount, suggestion.currency) &&
            ` · ${formatAmount(suggestion.total_amount, suggestion.currency)}`}
        </p>
        <div className="flex flex-wrap gap-1 mt-2">
          {suggestion.reservations.map((r) => (
            <Badge key={r.key} variant="secondary" className="capitalize">
              {`${r.type} · ${r.provider ?? 'manual'}`}
            </Badge>
          ))}
        </div>
      </div>
      <Button
        variant="brand"
        onClick={() => void onCreate(titleSuggestion)}
        disabled={pending}
      >
        <Plus style={{ width: 16, height: 16, marginRight: 6 }} />
        {t('pages.inbox.suggestions.createCta', 'Create trip')}
      </Button>
    </div>
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
  const Icon = TYPE_ICONS[reservation.type] ?? InboxIcon;
  const range = formatRange(reservation.start_at, reservation.end_at);
  const amount = formatAmount(reservation.total_amount, reservation.currency);

  return (
    <div className="p-4 bg-background flex items-start gap-4 border border-border rounded-element">
      <div className="p-2 bg-muted rounded">
        <Icon style={{ width: 22, height: 22, color: 'var(--primary)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-2">
          <p className="font-bold">{reservation.title}</p>
          <Badge variant="outline" className={`capitalize ${STATUS_CLASS[reservation.status]}`}>
            {reservation.status}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {[reservation.provider, reservation.type].filter(Boolean).join(' · ')}
        </p>
        {range && (
          <div className="flex items-center gap-1 mt-1">
            <Calendar style={{ width: 13, height: 13, color: 'var(--muted-foreground)' }} />
            <span className="text-xs text-muted-foreground">{range}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {amount && (
          <span className="font-bold text-primary whitespace-nowrap">{amount}</span>
        )}
        {canAttach && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={trips.length === 0}
                aria-label={t('pages.inbox.orphans.attach', 'Attach to trip')}
              >
                <Link2 style={{ width: 16, height: 16, marginRight: 4 }} />
                {t('pages.inbox.orphans.attach', 'Attach')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {trips.length === 0 && (
                <DropdownMenuItem disabled>
                  {t('pages.inbox.orphans.noTrips', 'No trips yet')}
                </DropdownMenuItem>
              )}
              {trips.map((trip) => (
                <DropdownMenuItem
                  key={trip.id}
                  onClick={async () => {
                    await onAttach(trip.id);
                  }}
                >
                  {resolveTripTitle(trip, t)}
                </DropdownMenuItem>
              ))}
              {trips.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem asChild>
                <LocalizedLink to="/trips">
                  <Plus style={{ width: 14, height: 14, marginRight: 6 }} />
                  {t('pages.inbox.orphans.newTrip', 'Create new trip')}
                </LocalizedLink>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
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
    <div className="mt-4 p-6 bg-muted">
      <div className="flex items-center gap-2 mb-2">
        <Mail style={{ width: 18, height: 18, color: 'var(--primary)' }} />
        <p className="font-bold">
          {t('pages.inbox.forwarding.title', 'Forward bookings here')}
        </p>
      </div>
      <p className="text-muted-foreground text-sm mb-4">
        {t(
          'pages.inbox.forwarding.description',
          'Forward any confirmation email to this address and it will appear in your Inbox. Booking.com, Airbnb, and Lufthansa are recognized today.',
        )}
      </p>
      <div className="flex items-center gap-2 p-3 bg-background font-mono text-[0.95rem] break-all">
        <div className="flex-1 min-w-0">{data.address}</div>
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
      </div>
    </div>
  );
}
