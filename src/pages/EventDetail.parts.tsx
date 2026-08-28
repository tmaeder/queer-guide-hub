import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { format } from 'date-fns';
import {
  Calendar,
  MapPin,
  Users,
  Clock,
  ExternalLink,
  Phone,
  Globe,
  Send,
  Download,
  Ticket,
  Luggage,
  Navigation2,
  Repeat,
  Music,
  ShieldCheck,
  CircleCheck,
  Sparkles,
  Flag,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EntitySocialLinks } from '@/components/entity/EntitySocialLinks';
import { ShareMenu } from '@/components/share/ShareMenu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { FavoriteButton } from '@/components/ui/favorite-button';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { Editable } from '@/components/admin/inline/Editable';
import { EntityMap } from '@/components/map/EntityMap';
import { useNearbyMapPoints } from '@/hooks/useNearbyMapPoints';
import { MarkVisitedButton } from '@/components/marks/MarkVisitedButton';
import { AmenityDisplay } from '@/components/venues/AmenityDisplay';
import { DestinationSafetyCard } from '@/components/safety/DestinationSafetyCard';
import EqualityScoreBadge from '@/components/country/EqualityScoreBadge';
import { PeopleHereRail } from '@/components/people/PeopleHereRail';
import type { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { fetchEventBySlugOrId } from '@/hooks/usePageFetchers';
import { formatEventTime } from '@/lib/event-time';
import { formatCurrency } from '@/lib/currency';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useProfile } from '@/hooks/useProfile';
import { matchNeeds, needLabel } from '@/lib/accessibilityNeeds';
import { FactGrid } from '@/components/transit/FactGrid';
import { NestedEntityCard } from '@/components/transit/NestedEntityCard';
import { getEventLiveState } from '@/lib/event-countdown';

export type EventWithRelations = Database['public']['Tables']['events']['Row'] & {
  social_links?: Record<string, string> | null;
  venues?: {
    id: string;
    slug?: string;
    name: string;
    address: string;
    city: string;
    state: string | null;
    country: string;
    phone: string | null;
    website: string | null;
    email: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  cities?: {
    id: string;
    slug?: string;
    name: string;
    country_id?: string | null;
    countries?: {
      id: string;
      slug?: string;
      name: string;
      equality_score: number | null;
      lgbti_criminalization: Record<string, unknown> | null;
    } | null;
  } | null;
  countries?: {
    id: string;
    slug?: string;
    name: string;
    equality_score: number | null;
    lgbti_criminalization: Record<string, unknown> | null;
  } | null;
  festivals?: { id: string; name: string } | null;
  /** The umbrella this event belongs to, when it is a programme child. */
  parent?: {
    id: string;
    slug: string;
    title: string;
    start_date: string;
    end_date: string | null;
  } | null;
  organizer?: {
    id: string;
    slug?: string;
    name: string;
    website: string | null;
    email: string | null;
    instagram: string | null;
    phone: string | null;
    organizer_handles: Record<string, string> | null;
  } | null;
  attendee_counts?: { going: number; interested: number };
  user_attendance?: string | null;
};

/**
 * The parent is embedded through the FK COLUMN (`parent:parent_event_id(...)`),
 * not the constraint name, and that is load-bearing for a SELF-referential FK.
 *
 * PostgREST registers `events_parent_event_id_fkey` as ONE-TO-MANY only --
 * `events(id)` to `events(parent_event_id)`, i.e. the CHILDREN -- so the hint
 * forms are wrong here in different ways. All three measured against prod:
 *
 *   parent:events!events_parent_event_id_fkey(...)  -> HTTP 400 PGRST200
 *   parent:events!parent_event_id(...)              -> 200 but `[]`, the children
 *   parent:parent_event_id(...)                     -> 200 and `null`, the parent
 *
 * The first form shipped in this PR and 400'd the WHOLE event query, so no
 * event loaded and every `/events/:slug` page rendered no `<h1>` at all -- it
 * is not a degraded embed, it takes the page down. `null` vs `[]` is the tell
 * for which direction PostgREST resolved, and it is the only tell while zero
 * rows carry a `parent_event_id`.
 *
 * NOTE: comments must stay OUTSIDE the template literal below -- its contents
 * are sent to PostgREST verbatim as the `select` parameter.
 */
export const EVENT_SELECT_FIELDS = `
  *,
  venues!venue_id(id, slug, name, address, city, state, country, phone, website, email, latitude, longitude),
  cities(id, slug, name, country_id, countries:country_id(id, slug, name, equality_score, lgbti_criminalization)),
  countries(id, slug, name, equality_score, lgbti_criminalization),
  festivals:festival_id(id, name),
  parent:parent_event_id(id, slug, title, start_date, end_date),
  organizer:venues!organizer_id(id, slug, name, website, email, instagram, phone, organizer_handles)
`;

export async function fetchEvent(
  slug: string,
  userId: string | undefined,
): Promise<EventWithRelations | null> {
  return fetchEventBySlugOrId<EventWithRelations>(slug, EVENT_SELECT_FIELDS, userId);
}

export async function exportEventToCalendar(event: EventWithRelations) {
  const { data, error } = await supabase.functions.invoke('calendar-export', {
    body: { eventId: event.id },
  });
  if (error) throw error;
  const blob = new Blob([data], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.title.replace(/[^a-zA-Z0-9]/g, '_')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function formatEventDate(startDate: string, endDate?: string | null) {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;
  if (end && format(start, 'yyyy-MM-dd') !== format(end, 'yyyy-MM-dd')) {
    return `${format(start, 'EEE, MMM d')} - ${format(end, 'EEE, MMM d, yyyy')}`;
  }
  return format(start, 'EEEE, MMMM d, yyyy');
}

export function getPriceDisplay(event: EventWithRelations) {
  if (event.is_free) return 'Free';
  if (event.price_min && event.price_max) {
    return event.price_min === event.price_max
      ? formatCurrency(event.price_min, event.currency)
      : `${formatCurrency(event.price_min, event.currency)} - ${formatCurrency(event.price_max, event.currency)}`;
  }
  if (event.price_min) return `From ${formatCurrency(event.price_min, event.currency)}`;
  return 'Price TBA';
}

/** Map liveness/status to a header pill. Returns null for routine "scheduled". */
function statusPill(
  event: EventWithRelations,
): { label: string; variant: 'destructive' | 'outline' | 'soft' } | null {
  const s = (event.liveness_status || event.status || '').toLowerCase();
  if (s.includes('cancel')) return { label: 'Cancelled', variant: 'destructive' };
  if (s.includes('postpon')) return { label: 'Postponed', variant: 'destructive' };
  if (s.includes('sold')) return { label: 'Sold out', variant: 'outline' };
  if (s.includes('moved_online') || s === 'online')
    return { label: 'Moved online', variant: 'soft' };
  // Last, so a cancelled or postponed event keeps the stronger label — those
  // say something the date does not.
  //
  // "Ended" is the corpus's DOMINANT state and had no chip at all: 39,795 of
  // 40,119 live events are in the past (324 upcoming), so the overwhelmingly
  // common case was the one the reader had to infer by parsing a date. It is
  // `outline`, not `destructive` — an event finishing is not a fault.
  if (isEventPast(event)) return { label: 'Ended', variant: 'outline' };
  return null;
}

/** Single definition of "already happened", shared by the chip and the page. */
export function isEventPast(event: EventWithRelations): boolean {
  const end = event.end_date || event.start_date;
  if (!end) return false;
  const d = new Date(end);
  return !Number.isNaN(d.getTime()) && d < new Date();
}

function humanizeRecurrence(pattern: string | null | undefined): string {
  if (!pattern) return 'Recurring event';
  const p = pattern.toUpperCase();
  if (p.includes('DAILY')) return 'Repeats daily';
  if (p.includes('WEEKLY')) return 'Repeats weekly';
  if (p.includes('MONTHLY')) return 'Repeats monthly';
  if (p.includes('YEARLY')) return 'Repeats yearly';
  return 'Recurring event';
}

/** The user's accessibility needs this event is known to satisfy (auth-only). */
function useMatchedNeeds(event: EventWithRelations): string[] {
  const { profile } = useProfile();
  const prefs = (profile as { travel_preferences?: { accessibility_needs?: string[] } } | null)
    ?.travel_preferences;
  const needs = Array.isArray(prefs?.accessibility_needs) ? prefs.accessibility_needs : [];
  if (needs.length === 0) return [];
  const { matched } = matchNeeds(event.accessibility_attributes ?? [], needs);
  return matched.map((m) => needLabel(m.need));
}

/* ------------------------------------------------------------------ */
/* Live-state line — ticking countdown / happening-now / ended        */
/* ------------------------------------------------------------------ */

function LiveStateLine({ event }: { event: EventWithRelations }) {
  const reduced = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());
  const state = getEventLiveState(event.start_date, event.end_date, now);
  const soon = state.kind === 'upcoming' && state.soon;

  useEffect(() => {
    if (state.kind === 'ended') return;
    const ms = reduced ? 60_000 : soon ? 1_000 : 60_000;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [state.kind, soon, reduced]);

  if (!state.label) return null;

  if (state.kind === 'live') {
    return (
      <span className="inline-flex items-center gap-2 text-15 font-medium">
        <span className="relative flex h-2.5 w-2.5">
          {!reduced && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-foreground/40" />
          )}
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-foreground" />
        </span>
        {state.label}
      </span>
    );
  }

  if (state.kind === 'ended') {
    return <span className="text-15 text-muted-foreground">{state.label}</span>;
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-15 font-medium text-foreground">
      <Clock size={15} aria-hidden="true" />
      {state.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Hero — cover, eyebrow, title, location, live state                  */
/* ------------------------------------------------------------------ */

interface HeroProps {
  event: EventWithRelations;
  cityName: string | null | undefined;
  countryName: string | null | undefined;
  cityLink: string | null;
  countryLink: string | null;
  heroImage: string | null;
  onContentUpdated?: () => void;
}

/**
 * The masthead action row (spine S5). Ticket link is the one concrete verb
 * where it exists; the rest are the report / admin / share affordances the
 * photo hero used to hide in its top-right corner.
 */
export function EventActions({
  event,
  onShare,
}: {
  event: EventWithRelations;
  onShare: () => void;
}) {
  const OUTLINE =
    'inline-flex items-center gap-2 px-4 py-2 text-13 font-bold no-underline transition-colors hover:bg-foreground hover:text-background';
  return (
    <>
      {/* The SECOND ticket surface, and the more prominent one — this is the
          masthead action row, above the fold, while the decision card sits in
          the rail. Both needed the same `isEventPast` gate; fixing only the
          card would have left a finished event still selling tickets in the
          place the reader looks first. The `website` link below is deliberately
          NOT gated: an event's homepage is still a legitimate reference after
          the event, a ticket checkout is not. */}
      {event.ticket_url && !isEventPast(event) && (
        <a href={event.ticket_url} target="_blank" rel="noopener noreferrer" className={OUTLINE}>
          Get tickets
        </a>
      )}
      {event.website && (
        <a href={event.website} target="_blank" rel="noopener noreferrer" className={OUTLINE}>
          Website
        </a>
      )}
      <button type="button" onClick={onShare} className={OUTLINE}>
        Share
      </button>
      <FavoriteButton itemId={event.id} type="event" size="md" />
      <ReportButton contentType="events" contentId={event.id} contentName={event.title} />
      <AdminEditButton
        contentType="events"
        contentId={event.id}
        contentName={event.title}
        currentData={event as unknown as Record<string, unknown>}
      />
    </>
  );
}

export function eventStatusLabel(event: EventWithRelations): string | undefined {
  return statusPill(event)?.label;
}

/**
 * The masthead's standfirst — where this event is, and whether it is still on.
 *
 * `DetailMasthead` owns the bullet, eyebrow, title and status chip, so this is
 * only what sits under them. It is a `<div>`, not a `<p>`, because it carries
 * links and a live-state line; `SinglePage`'s `lead` slot wraps its child in a
 * paragraph, so this goes in the slot below it instead.
 *
 * The hero photograph is gone. It was a 380px bed with the title lying on a
 * scrim; the photo is now `PhotoInset` in the body, on the same 3px frame as
 * the map — the treatment every other single uses.
 */
export function EventMasthead({
  event,
  cityName,
  countryName,
  cityLink,
  countryLink,
}: Omit<HeroProps, 'heroImage' | 'onContentUpdated'>) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-body-lg text-muted-foreground">
          <MapPin size={16} className="shrink-0" aria-hidden="true" />
          <span>
            {event.venues?.id ? (
              <LocalizedLink
                to={`/venues/${event.venues.slug || event.venues.id}`}
                className="hover:underline"
              >
                {event.venues.name}
              </LocalizedLink>
            ) : (
              event.venue_name || ''
            )}
            {cityName && (
              <>
                {event.venues?.name || event.venue_name ? ', ' : ''}
                {cityLink ? (
                  <LocalizedLink to={cityLink} className="hover:underline">
                    {cityName}
                  </LocalizedLink>
                ) : (
                  cityName
                )}
              </>
            )}
            {countryName && (
              <>
                {', '}
                {countryLink ? (
                  <LocalizedLink to={countryLink} className="hover:underline">
                    {countryName}
                  </LocalizedLink>
                ) : (
                  countryName
                )}
              </>
            )}
          </span>
        </span>
        <LiveStateLine event={event} />
      </div>

      {(event.parent?.id || event.festivals?.id || event.countries?.equality_score != null) && (
        <div className="flex flex-wrap items-center gap-4">
          {/* The umbrella this event belongs to. Linked, unlike the festival
              line below it: the parent is a real event with its own page that
              carries the full programme, which is the whole point of the
              backlink. */}
          {event.parent?.id && (
            <span className="inline-flex items-center gap-1.5 text-13 text-muted-foreground">
              <Flag size={13} aria-hidden="true" />
              Part of{' '}
              <LocalizedLink
                to={`/events/${event.parent.slug || event.parent.id}`}
                className="font-semibold text-foreground"
              >
                {event.parent.title}
              </LocalizedLink>
            </span>
          )}
          {event.festivals?.id && (
            <span className="inline-flex items-center gap-1.5 text-13 text-muted-foreground">
              <Music size={13} aria-hidden="true" />
              Part of <span className="font-semibold text-foreground">{event.festivals.name}</span>
            </span>
          )}
          {event.countries?.equality_score != null && (
            <EqualityScoreBadge score={event.countries.equality_score} size="sm" />
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fact strip — date / time / price / ages, the canonical glance       */
/* ------------------------------------------------------------------ */

export function EventFactStrip({
  event,
  showEventTz,
  setShowEventTz,
}: {
  event: EventWithRelations;
  showEventTz: boolean;
  setShowEventTz: (fn: (prev: boolean) => boolean) => void;
}) {
  const ageRestriction = event.age_restriction;
  // Spec module 01 — the bordered fact strip, shared with every other single.
  // The timezone toggle survives the move as a node in the Time cell: an event
  // read from another country is ambiguous without it, and dropping an
  // interactive affordance to gain a border would be a bad trade.
  return (
    <FactGrid
      facts={[
        {
          label: 'Date',
          value: formatEventDate(event.start_date, event.end_date),
        },
        {
          label: 'Time',
          value: event.timezone ? (
            <button
              type="button"
              onClick={() => setShowEventTz((prev) => !prev)}
              aria-pressed={showEventTz}
              title="Toggle between event timezone and your local time"
              className="text-start underline decoration-dotted underline-offset-4"
            >
              {formatEventTime(
                event.start_date,
                event.end_date,
                showEventTz ? event.timezone : null,
              )}
            </button>
          ) : (
            formatEventTime(event.start_date, event.end_date, null)
          ),
        },
        { label: 'Price', value: getPriceDisplay(event) },
        { label: 'Ages', value: ageRestriction },
      ]}
    />
  );
}

/* ------------------------------------------------------------------ */
/* For-you line — auth-aware personalization, only what's true         */
/* ------------------------------------------------------------------ */

export function EventForYou({
  event,
  isInTrip,
  tripCount,
}: {
  event: EventWithRelations;
  isInTrip?: boolean;
  tripCount?: number;
}) {
  const matchedNeeds = useMatchedNeeds(event);
  const chips: ReactNode[] = [];

  if (isInTrip && tripCount) {
    chips.push(
      <Badge key="trip" variant="soft" className="gap-1.5">
        <Luggage size={13} aria-hidden="true" />
        In {tripCount} of your trip{tripCount !== 1 ? 's' : ''}
      </Badge>,
    );
  }
  for (const need of matchedNeeds) {
    chips.push(
      <Badge key={`need-${need}`} variant="secondary" className="gap-1.5 rounded-badge">
        <CircleCheck size={13} aria-hidden="true" />
        Matches your needs: {need}
      </Badge>,
    );
  }

  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-13 text-muted-foreground">
        <Sparkles size={13} aria-hidden="true" />
        For you
      </span>
      {chips}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Decision card — the sticky buy/RSVP/save panel (desktop rail)       */
/* ------------------------------------------------------------------ */

interface DecisionCardProps {
  event: EventWithRelations;
  user: { id: string } | null;
  isPast: boolean;
  userAttendance: string | null;
  onAttendanceUpdate: (status: 'going' | 'interested' | 'not_going') => void;
  onAddToTrip: () => void;
  onExportToCalendar: () => void;
  onSendEvent: () => void;
}

export function EventDecisionCard({
  event,
  user,
  isPast,
  userAttendance,
  onAttendanceUpdate,
  onAddToTrip,
  onExportToCalendar,
  onSendEvent,
}: DecisionCardProps) {
  const ticketHref = event.ticket_url;
  const lat = event.latitude ?? event.venues?.latitude;
  const lng = event.longitude ?? event.venues?.longitude;
  const hasCoords = typeof lat === 'number' && typeof lng === 'number';
  const venueName = event.venues?.name || event.venue_name;

  return (
    <Card className="md:sticky md:top-24">
      <CardContent className="flex flex-col gap-4 p-6">
        {/* Unknown price stays in the fact strip; a headline-sized "Price TBA"
            here duplicated it and read like a price. */}
        {getPriceDisplay(event) !== 'Price TBA' && (
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-headline font-display leading-none">
              {getPriceDisplay(event)}
            </span>
            {event.is_free && <Badge variant="soft">No ticket needed</Badge>}
          </div>
        )}

        {/* `!isPast` on the ticket CTA too. Every other control in this card
            already checked it — both "Add to Trip" variants and the RSVP pair
            — so the primary button was the one place a finished event still
            invited the reader to buy a ticket. Measured: 443 live events are
            past AND carry a `ticket_url`. */}
        {ticketHref && !isPast ? (
          <Button asChild className="w-full">
            <a href={ticketHref} target="_blank" rel="noopener noreferrer">
              <Ticket size={16} className="mr-2" />
              Get Tickets
            </a>
          </Button>
        ) : (
          !isPast && (
            <Button className="w-full" onClick={onAddToTrip}>
              <Luggage size={16} className="mr-2" />
              Add to Trip
            </Button>
          )
        )}

        {user && !isPast && (
          <div className="flex gap-2">
            <Button
              variant={userAttendance === 'going' ? 'default' : 'outline'}
              onClick={() => onAttendanceUpdate(userAttendance === 'going' ? 'not_going' : 'going')}
              aria-pressed={userAttendance === 'going'}
              className="flex-1"
            >
              {userAttendance === 'going' && <CircleCheck size={16} className="mr-1.5" />}
              Going
            </Button>
            <Button
              variant={userAttendance === 'interested' ? 'default' : 'outline'}
              onClick={() =>
                onAttendanceUpdate(userAttendance === 'interested' ? 'not_going' : 'interested')
              }
              aria-pressed={userAttendance === 'interested'}
              className="flex-1"
            >
              {userAttendance === 'interested' && <CircleCheck size={16} className="mr-1.5" />}
              Interested
            </Button>
          </div>
        )}

        {ticketHref && !isPast && (
          <Button variant="outline" className="w-full" onClick={onAddToTrip}>
            <Luggage size={16} className="mr-2" />
            Add to Trip
          </Button>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <FavoriteButton itemId={event.id} type="event" size="md" />
          <Button variant="outline" size="sm" onClick={onExportToCalendar}>
            <Download size={14} className="mr-1.5" />
            Calendar
          </Button>
          <ShareMenu
            url={
              typeof window !== 'undefined'
                ? window.location.href
                : `https://queer.guide/events/${event.slug ?? event.id}`
            }
            title={event.title}
          />
          {user && (
            <Button variant="outline" size="sm" onClick={onSendEvent}>
              <Send size={14} className="mr-1.5" />
              Send
            </Button>
          )}
        </div>

        <div className="pt-4 text-sm">
          <div className="flex items-start gap-2">
            <Calendar size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
            <div>
              <p>{formatEventDate(event.start_date, event.end_date)}</p>
              <p className="text-muted-foreground">
                {formatEventTime(event.start_date, event.end_date)}
              </p>
            </div>
          </div>
          {venueName && (
            <div className="mt-4 flex items-start gap-2">
              <MapPin size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
              <div className="flex-1">
                <p className="font-medium">{venueName}</p>
                {hasCoords && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <Navigation2 size={13} />
                    Directions
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1 pt-4">
          <MarkVisitedButton entityType="event" entityId={event.id} kind="visited" />
          <ReportButton contentType="events" contentId={event.id} contentName={event.title} />
          <AdminEditButton
            contentType="events"
            contentId={event.id}
            contentName={event.title}
            currentData={event as Record<string, unknown>}
            onSaved={() => window.location.reload()}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* About — description, recurrence/festival, accessibility, source     */
/* ------------------------------------------------------------------ */

export function EventAbout({
  event,
  onContentUpdated,
}: {
  event: EventWithRelations;
  onContentUpdated?: () => void;
}) {
  const hasAccessibility =
    (event.accessibility_attributes?.length ?? 0) > 0 || Boolean(event.accessibility_notes);
  const priceUnknown = !event.is_free && !event.price_min;
  const locationUnknown = !(event.venues?.name || event.venue_name);
  const sourceUrl = event.website || event.ticket_url;
  const showSource = (priceUnknown || locationUnknown) && Boolean(sourceUrl);
  const missing = [priceUnknown && 'price', locationUnknown && 'location']
    .filter(Boolean)
    .join(' and ');

  if (
    !event.description &&
    !event.is_recurring &&
    !event.festivals?.id &&
    !hasAccessibility &&
    !showSource
  ) {
    return null;
  }

  return (
    <div className="flex flex-col gap-8">
      {event.description && (
        <section>
          <Eyebrow as="div" className="mb-2">
            About this event
          </Eyebrow>
          <Editable
            contentType="events"
            recordId={event.id}
            field="description"
            value={event.description}
            onSaved={onContentUpdated}
            fieldOverride={{ type: 'textarea' }}
            as="div"
          >
            <p
              className="max-w-[68ch] whitespace-pre-wrap text-body-lg text-foreground/90"
              style={{ lineHeight: 1.7 }}
            >
              {event.description}
            </p>
          </Editable>
        </section>
      )}

      {(event.is_recurring || event.festivals?.id) && (
        <div className="flex flex-wrap gap-2">
          {event.is_recurring && (
            <Badge variant="soft" className="gap-1.5">
              <Repeat size={13} aria-hidden="true" />
              {humanizeRecurrence(event.recurrence_pattern)}
            </Badge>
          )}
          {event.festivals?.id && (
            <LocalizedLink to={`/events?festival=${event.festivals.id}`} className="no-underline">
              <Badge variant="outline" className="gap-1.5">
                <Music size={13} aria-hidden="true" />
                More from {event.festivals.name}
              </Badge>
            </LocalizedLink>
          )}
        </div>
      )}

      {hasAccessibility && (
        <section>
          <Eyebrow as="div" className="mb-2">
            Accessibility
          </Eyebrow>
          <AmenityDisplay
            accessibility={event.accessibility_attributes}
            accessibilityNotes={event.accessibility_notes}
          />
        </section>
      )}

      {showSource && (
        <div className="flex flex-wrap items-center gap-4 rounded-element bg-muted p-4">
          <p className="text-sm text-muted-foreground">
            {missing.charAt(0).toUpperCase() + missing.slice(1)} not listed yet — check the source
            for the latest info.
          </p>
          <Button size="sm" variant="outline" asChild>
            <a href={sourceUrl!} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} className="mr-1.5" />
              Visit source
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Who's going — counts + people-to-meet                               */
/* ------------------------------------------------------------------ */

export function EventWhoIsGoing({
  event,
  user,
  isPast,
}: {
  event: EventWithRelations;
  user: { id: string } | null;
  isPast: boolean;
}) {
  const { t } = useTranslation();
  const going = event.attendee_counts?.going ?? 0;
  const interested = event.attendee_counts?.interested ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {/* No heading of its own. `SingleSection` already renders "Who's going"
          as the section h2, so this printed the same words twice — and worse,
          that second h2 is what hid the empty-section bug below from
          `e2e/singles.spec.ts`, whose guard strips only the FIRST heading's
          text before asking whether anything is left. */}
      {(going > 0 || interested > 0) && (
        <p className="text-sm text-muted-foreground">
          {going} going · {interested} interested
        </p>
      )}

      {going === 0 && interested === 0 && !isPast && (
        <p className="text-sm text-muted-foreground">
          {user
            ? t('events.rsvpEmptyMember', 'No RSVPs yet. Be the first.')
            : /* Was "sign in to RSVP and see who else is going" — but nobody had
                 RSVP'd, so the second half promised a list that was empty by
                 definition. Offer only what signing in actually gives. */
              t('events.rsvpEmptyAnon', 'No RSVPs yet. Sign in to be the first.')}
        </p>
      )}
    </div>
  );
}

/**
 * "People you may know" at this event.
 *
 * It lives in the page FOOTER, not inside the "Who's going" section, because
 * it is a self-hiding composite rail — it decides internally whether it has
 * anything, and the section filter cannot see that decision. That is the
 * house invariant ("a self-hiding rail is never a section"), and breaking it
 * is what made the section render a heading with nothing under it for a
 * SIGNED-IN reader on a past event: the count is zero, the "be the first"
 * prompt is suppressed once the event is over, and the rail returns null when
 * the discovery RPC finds no matches — which is the normal cold-start result.
 * The footer has no stations, so a rail that hides itself there costs nothing.
 */
export function EventPeopleRail({ event }: { event: EventWithRelations }) {
  const { t } = useTranslation();
  return (
    <PeopleHereRail
      mode="locals"
      eventId={event.id}
      title={t('events.peopleYouMayKnow', 'People you may know')}
    />
  );
}

/**
 * Whether the "Who's going" section has anything to say — read by the page so
 * the SECTION can be dropped, not just its body.
 *
 * Now that the people rail has moved to the footer, the section's content is
 * entirely deterministic from the row: a count when anyone has RSVP'd, or the
 * "be the first" prompt while the event is still ahead. Once it is over with
 * no RSVPs there is nothing to say, which is the state 99.2% of the corpus is
 * in (39,795 of 40,119 live events have finished).
 *
 * Deliberately NOT a function of the signed-in user. The first version of this
 * guard returned `Boolean(user)` on the grounds that a signed-in reader could
 * still get the people rail — but "could" is not "does": the rail returns null
 * whenever discovery finds no matches, which is the ordinary cold-start
 * result. CI caught it because its chromium project carries an admin
 * storageState, so it runs signed IN where the local check had run signed out.
 * A guard that depends on what another component *might* render is the same
 * mistake as no guard at all.
 */
export function hasWhoIsGoingContent(event: EventWithRelations, isPast: boolean): boolean {
  const going = event.attendee_counts?.going ?? 0;
  const interested = event.attendee_counts?.interested ?? 0;
  if (going > 0 || interested > 0) return true;
  return !isPast; // the "be the first" prompt
}

/* ------------------------------------------------------------------ */
/* Where — map, venue contact, organizer, safety                       */
/* ------------------------------------------------------------------ */

interface WhereProps {
  event: EventWithRelations;
  /** `| null` matches what `useRef<HTMLDivElement>(null)` actually produces —
   *  without it this prop was the single baselined TS2322 on the event page. */
  venueRef: RefObject<HTMLDivElement | null>;
  countryId?: string | null;
  onOrganizerClick: (organizer: string) => void;
}

export function EventWhere({ event, venueRef, countryId, onOrganizerClick }: WhereProps) {
  const lat = event.latitude ?? event.venues?.latitude;
  const lng = event.longitude ?? event.venues?.longitude;
  const hasNamedVenue = Boolean(event.venues?.name || event.venue_name);
  const hasMap = hasNamedVenue && typeof lat === 'number' && typeof lng === 'number';
  const org = event.organizer;
  const handles = org?.organizer_handles ?? {};

  const socials: Array<{ label: string; href: string }> = [];
  if (org) {
    const website = org.website || handles.website;
    if (website) socials.push({ label: 'Website', href: website });
    const insta = org.instagram || handles.instagram;
    if (insta)
      socials.push({
        label: 'Instagram',
        href: `https://instagram.com/${insta.replace(/^@/, '')}`,
      });
    if (handles.telegram)
      socials.push({
        label: 'Telegram',
        href: `https://t.me/${handles.telegram.replace(/^@/, '')}`,
      });
    if (handles.bluesky)
      socials.push({
        label: 'Bluesky',
        href: `https://bsky.app/profile/${handles.bluesky.replace(/^@/, '')}`,
      });
    if (org.email) socials.push({ label: 'Email', href: `mailto:${org.email}` });
    if (org.phone) socials.push({ label: 'Call', href: `tel:${org.phone}` });
  }

  const hasOrganizer = Boolean(org || event.organizer_name);

  const nearby = useNearbyMapPoints({
    lat: typeof lat === 'number' ? lat : null,
    lng: typeof lng === 'number' ? lng : null,
    excludeType: 'event',
    excludeId: event.id,
    enabled: hasMap,
  });

  return (
    <div className="flex flex-col gap-6">
      <Card ref={venueRef}>
        <CardHeader>
          <CardTitle>Where</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {hasMap && (
            <EntityMap
              center={[Number(lng), Number(lat)]}
              zoom={15}
              height={220}
              markers={[
                {
                  id: event.id,
                  lat: Number(lat),
                  lng: Number(lng),
                  name: event.title ?? 'Event',
                  subtitle: event.venues?.name,
                  type: 'events',
                  primary: true,
                },
                ...nearby,
              ]}
            />
          )}
          {event.venues ? (
            // Spec module 08 — REQUIRED on events, and the spec's own example
            // of it ("the venue on an event"). It leads with the VENUE's
            // bullet, not the event's, per rule 4: the reader should be able
            // to tell it links to a different type before clicking.
            //
            // Only the linked-venue branch becomes a card. `venue_name` below
            // is free text with no venue row behind it, so there is nothing to
            // link to — rendering it as a card would promise a page that does
            // not exist.
            <NestedEntityCard
              type="venue"
              eyebrow="Venue"
              name={event.venues.name}
              description={[
                event.venues.address,
                [event.venues.city, event.venues.state].filter(Boolean).join(', '),
                event.venues.country,
              ]
                .filter(Boolean)
                .join(' · ')}
              href={`/venues/${event.venues.slug ?? event.venues.id}`}
              actionLabel="Open venue"
            />
          ) : (
            event.venue_name && (
              <div className="flex items-start gap-2">
                <MapPin size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                <p className="text-sm font-medium">{event.venue_name}</p>
              </div>
            )
          )}
          {event.max_attendees && (
            <div className="flex items-center gap-2">
              <Users size={16} className="shrink-0 text-muted-foreground" />
              <span className="text-sm">Capacity {event.max_attendees}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {hasMap && (
              <Button variant="outline" size="sm" asChild>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Navigation2 size={14} className="mr-1.5" />
                  Directions
                </a>
              </Button>
            )}
            {event.venues?.phone && (
              <Button variant="outline" size="sm" asChild>
                <a href={`tel:${event.venues.phone}`}>
                  <Phone size={14} className="mr-1.5" />
                  Call
                </a>
              </Button>
            )}
            {event.venues && (
              <Button asChild variant="outline" size="sm">
                <LocalizedLink
                  to={`/venues/${event.venues.slug || event.venues.id}`}
                  className="no-underline"
                >
                  View venue
                </LocalizedLink>
              </Button>
            )}
            {event.website && (
              <Button variant="outline" size="sm" asChild>
                <a href={event.website} target="_blank" rel="noopener noreferrer">
                  <Globe size={14} className="mr-1.5" />
                  Website
                </a>
              </Button>
            )}
            <EntitySocialLinks links={event.social_links} size="sm" />
          </div>
        </CardContent>
      </Card>

      {hasOrganizer && (
        <Card>
          <CardHeader>
            <CardTitle>Organizer</CardTitle>
          </CardHeader>
          <CardContent>
            {org ? (
              <>
                <LocalizedLink
                  to={`/venues/${org.slug || org.id}`}
                  className="font-medium hover:underline"
                >
                  {org.name}
                </LocalizedLink>
                {socials.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {socials.map((s) => (
                      <Button key={s.label} variant="outline" size="sm" asChild>
                        <a
                          href={s.href}
                          target={s.href.startsWith('http') ? '_blank' : undefined}
                          rel={s.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                        >
                          {s.label}
                        </a>
                      </Button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={() => onOrganizerClick(event.organizer_name!)}
                  className="cursor-pointer border-0 bg-transparent p-0 text-left font-medium hover:underline"
                >
                  {event.organizer_name}
                </button>
                {event.organizer_contact && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {event.organizer_contact}
                  </span>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <DestinationSafetyCard countryIds={[countryId]} />

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck size={13} aria-hidden="true" />
        Spotted something off? Use the flag to let us know.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile sticky action bar                                            */
/* ------------------------------------------------------------------ */

export function EventMobileBar({
  event,
  isPast,
  user,
  userAttendance,
  onAddToTrip,
  onAttendanceUpdate,
}: {
  event: EventWithRelations;
  isPast: boolean;
  user: { id: string } | null;
  userAttendance: string | null;
  onAddToTrip: () => void;
  onAttendanceUpdate: (status: 'going' | 'interested' | 'not_going') => void;
}) {
  if (isPast) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[1100] flex items-center gap-2 bg-background/95 p-4 backdrop-blur md:hidden">
      {event.ticket_url ? (
        <Button asChild className="flex-1">
          <a href={event.ticket_url} target="_blank" rel="noopener noreferrer">
            <Ticket size={16} className="mr-2" />
            Get Tickets
          </a>
        </Button>
      ) : user ? (
        <Button
          className="flex-1"
          variant={userAttendance === 'going' ? 'default' : 'outline'}
          onClick={() => onAttendanceUpdate(userAttendance === 'going' ? 'not_going' : 'going')}
        >
          {userAttendance === 'going' && <CircleCheck size={16} className="mr-1.5" />}
          {userAttendance === 'going' ? 'Going' : "I'm going"}
        </Button>
      ) : (
        <Button className="flex-1" onClick={onAddToTrip}>
          <Luggage size={16} className="mr-2" />
          Add to Trip
        </Button>
      )}
      <FavoriteButton itemId={event.id} type="event" size="md" />
    </div>
  );
}
