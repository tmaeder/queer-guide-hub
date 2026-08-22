import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useTrackView } from '@/hooks/useTrackView';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Skeleton } from '@/components/ui/skeleton';
import { GatedDetailFallback } from '@/components/safety/GatedDetailFallback';
import { AddToTripDialog } from '@/components/trips/AddToTripDialog';
import { ShareEntityDialog } from '@/components/messaging/ShareEntityDialog';
import { EventMoreEvents } from '@/components/events/EventMoreEvents';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { useAuth } from '@/hooks/useAuth';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { useEntityTripStatus } from '@/hooks/useEntityTripStatus';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useSlugRedirect } from '@/hooks/useSlugRedirect';
import { useMeta } from '@/hooks/useMeta';
import { socialSameAs } from '@/lib/social/registry';
import { toast } from '@/hooks/use-toast';
import { upsertEventAttendance } from '@/hooks/usePageFetchers';
import { resolveEntityImage } from '@/lib/images/resolveEntityImage';
import { MarketplaceForEvent } from '@/components/marketplace/MarketplaceForEvent';
import { MilestonesForEntity } from '@/components/discovery/MilestonesForEntity';
import {
  type EventWithRelations,
  EventMasthead,
  EventActions,
  eventStatusLabel,
  EventFactStrip,
  EventForYou,
  EventDecisionCard,
  EventAbout,
  EventWhoIsGoing,
  hasWhoIsGoingContent,
  EventPeopleRail,
  isEventPast,
  EventWhere,
  EventMobileBar,
  fetchEvent,
  exportEventToCalendar,
  formatEventDate,
} from './EventDetail.parts';
import { PageContainer } from '@/components/layout/PageContainer';
import { SinglePage, StickyRailGroup } from '@/components/transit/SinglePage';
import { PhotoInset } from '@/components/transit/PhotoInset';
import { ProvenanceLine } from '@/components/transit/ProvenanceLine';
import { SingleSectionList, SingleRouteRail } from '@/components/transit/SingleSections';
import {
  singleSections,
  useSingleActiveSection,
  type SingleSectionDef,
} from '@/components/transit/singleSectionModel';
import { TagChipRow } from '@/components/tags/TagChipRow';
import SafetyAlertBanner from '@/components/country/SafetyAlertBanner';

export default function EventDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { user } = useAuth();
  const [userAttendance, setUserAttendance] = useState<string | null>(null);
  const [showEventTz, setShowEventTz] = useState(true);
  const [addToTripOpen, setAddToTripOpen] = useState(false);
  const [sendEventOpen, setSendEventOpen] = useState(false);
  const venueRef = useRef<HTMLDivElement>(null);

  const { track } = useTrackEvent();

  const {
    data: event,
    isLoading,
    error,
    refetch,
  } = useQuery<EventWithRelations | null>({
    queryKey: ['event-detail', slug, user?.id ?? null],
    enabled: Boolean(slug),
    staleTime: 60_000,
    queryFn: () => fetchEvent(slug!, user?.id),
  });

  // Merged-duplicate slug redirect: a dropped event's old slug points via
  // event_slug_redirects to its canonical survivor. Client-side fallback for
  // in-app navigation (the edge middleware handles the SEO-correct 301).
  const redirectEventSlug = useSlugRedirect(
    { redirectTable: 'event_slug_redirects', redirectIdColumn: 'event_id', entityTable: 'events' },
    !isLoading && !event ? (slug ?? null) : null,
  );
  useEffect(() => {
    if (redirectEventSlug) navigate(`/events/${redirectEventSlug}`, { replace: true });
  }, [redirectEventSlug, navigate]);

  const { data: tripStatus } = useEntityTripStatus('event', event?.id);
  useTrackView({
    type: 'event',
    slug: event?.slug,
    title: event?.title,
    image: resolveEntityImage('event', event).url ?? undefined,
    city: event?.cities?.name ?? event?.city,
    country: event?.countries?.name ?? event?.country,
  });

  const cityForMeta = event?.cities?.name ?? event?.city ?? null;
  const eventOgImage = event ? resolveEntityImage('event', event).url : undefined;
  useMeta({
    title: event?.title ?? undefined,
    description: event
      ? (event.description?.slice(0, 160) ??
        `Queer Guide event${cityForMeta ? ` in ${cityForMeta}` : ''}.`)
      : undefined,
    canonicalPath: event ? `/events/${event.slug}` : undefined,
    ogImage: eventOgImage || undefined,
    ogType: 'event',
    jsonLd: event
      ? {
          '@context': 'https://schema.org',
          '@type': 'Event',
          name: event.title,
          startDate: event.start_date,
          endDate: event.end_date ?? undefined,
          eventStatus: 'https://schema.org/EventScheduled',
          location: event.venues
            ? {
                '@type': 'Place',
                name: event.venues.name,
                address: [event.venues.address, event.venues.city, event.venues.country]
                  .filter(Boolean)
                  .join(', '),
              }
            : cityForMeta
              ? { '@type': 'Place', name: cityForMeta }
              : undefined,
          image: eventOgImage || undefined,
          description: event.description ?? undefined,
          sameAs: socialSameAs(event.social_links).length
            ? socialSameAs(event.social_links)
            : undefined,
        }
      : undefined,
  });

  useEffect(() => {
    if (!user || !event) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs RSVP state with fetched data.
      setUserAttendance(null);
      return;
    }
    setUserAttendance(event.user_attendance ?? null);
  }, [event, user]);

  useEffect(() => {
    if (event?.id) {
      track({
        eventType: 'page_view',
        entityType: 'event',
        entityId: event.id,
        metadata: { title: event.title },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  useEffect(() => {
    if (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('pages.eventDetail.loadFailed', 'Failed to load event details.'),
        variant: 'destructive',
      });
    }
  }, [error, t]);

  const cityName = event?.cities?.name ?? event?.city ?? null;
  // D10: prefer the city's country when it disagrees with the event's
  // denormalised country (cities are coordinate-anchored, so they win).
  const effectiveCountry =
    event?.cities?.country_id &&
    event?.countries?.id &&
    event.cities.country_id !== event.countries.id &&
    event.cities.countries
      ? event.cities.countries
      : (event?.countries ?? null);
  const countryName = effectiveCountry?.name ?? event?.country ?? null;
  const cityLink = event?.cities?.id ? `/city/${event.cities.slug || event.cities.id}` : null;
  const countryLink = effectiveCountry?.id
    ? `/country/${effectiveCountry.slug || effectiveCountry.id}`
    : null;

  useBreadcrumbs(
    event
      ? [
          { label: t('breadcrumb.events', 'Events'), href: '/events' },
          ...(countryName ? [{ label: countryName, href: countryLink ?? undefined }] : []),
          ...(cityName ? [{ label: cityName, href: cityLink ?? undefined }] : []),
          { label: event.title },
        ]
      : null,
  );

  const handleAttendanceUpdate = async (status: 'going' | 'interested' | 'not_going') => {
    if (!user || !event) {
      toast({
        title: t('pages.eventDetail.authRequired', 'Authentication required'),
        description: t(
          'pages.eventDetail.signInAttendance',
          'Please sign in to update your attendance',
        ),
        variant: 'destructive',
      });
      return;
    }
    try {
      const { error: upsertError } = await upsertEventAttendance({
        event_id: event.id,
        user_id: user.id,
        status,
      });
      if (upsertError) throw upsertError;
      setUserAttendance(status);
      toast({
        title:
          status === 'not_going'
            ? t('pages.eventDetail.rsvpCleared', 'RSVP cleared')
            : t('pages.eventDetail.attendanceUpdated', 'Attendance updated'),
        description:
          status === 'not_going'
            ? t('pages.eventDetail.rsvpClearedDesc', 'You are no longer marked for this event.')
            : `You're now marked as ${status.replace('_', ' ')} for this event`,
      });
      await refetch();
    } catch (e) {
      console.error('Error updating attendance:', e);
      toast({
        title: t('common.error', 'Error'),
        description: t('pages.eventDetail.attendanceFailed', 'Failed to update attendance'),
        variant: 'destructive',
      });
    }
  };

  const handleExportToCalendar = async () => {
    if (!event) return;
    try {
      await exportEventToCalendar(event);
      toast({
        title: t('pages.eventDetail.exportSuccess', 'Calendar export successful'),
        description: t(
          'pages.eventDetail.exportSuccessDesc',
          'Event has been exported to your calendar',
        ),
      });
    } catch (e) {
      console.error('Error exporting calendar:', e);
      toast({
        title: t('pages.eventDetail.exportFailed', 'Export failed'),
        description: t('pages.eventDetail.exportFailedDesc', 'Failed to export event to calendar'),
        variant: 'destructive',
      });
    }
  };

  // ---- render states -------------------------------------------------

  const heroImage = event ? resolveEntityImage('event', event).url : undefined;
  // One definition, shared with the masthead's "Ended" chip — two copies of
  // "has it happened yet" is how a page says Ended in one place and offers
  // tickets in another.
  const isPast = event ? isEventPast(event) : false;

  // Spec module order for `event`: 01 fact strip, 03 occurrences, 04 access,
  // 08 nested entity, 15 stat line.
  //
  // Module 03 (occurrence board) is the OWNER module for this type and is NOT
  // rendered: `event_occurrences` is an empty table. It was specced in
  // 20260429130000, given an expansion function, and never populated — 0 rows
  // against 39,899 events. `is_recurring` is true on 1,098 of them, but a
  // recurrence PATTERN is not a list of dates, and inventing occurrences from
  // an RRULE at render time would put times on screen that nothing has
  // validated. Rule 2: a module with no data does not render.
  //
  // Module 15 (stat line) is absent for the same reason: `max_attendees` is set
  // on 14 rows of 39,899, and `event_attendees` is aggregate-only behind an RPC.
  const sections: SingleSectionDef[] = event
    ? singleSections([
        {
          id: 'about',
          title: t('events.detail.section.about', 'About this event'),
          content: <EventAbout event={event} onContentUpdated={refetch} />,
        },
        {
          id: 'where',
          title: t('events.detail.section.where', 'Getting there'),
          content: (
            <EventWhere
              event={event}
              venueRef={venueRef}
              countryId={effectiveCountry?.id ?? event.country_id}
              onOrganizerClick={(organizer) =>
                navigate(`/events?organizer=${encodeURIComponent(organizer)}`)
              }
            />
          ),
        },
        {
          // Guarded, like every other section on every other single. Without
          // this the section rendered its heading and nothing under it for any
          // signed-out reader on a past event — 99.2% of the corpus. It was
          // invisible to `e2e/singles.spec.ts` because the component ALSO
          // rendered its own "Who's going" h2 and that guard strips only the
          // first heading before checking for a body; both halves are fixed.
          id: 'going',
          title: t('events.detail.section.going', "Who's going"),
          content: hasWhoIsGoingContent(event, isPast) ? (
            <EventWhoIsGoing event={event} user={user} isPast={isPast} />
          ) : null,
        },
      ])
    : [];

  // Built above the early returns so the hook order is stable and the route
  // rail's stations come from the same filtered array the body renders.
  const { activeId, select } = useSingleActiveSection(sections);

  if (error) {
    return (
      <PageContainer data-testid="event-detail-error">
        <Alert variant="destructive">
          <AlertTitle>Failed to load</AlertTitle>
          <AlertDescription>{(error as Error).message || 'Something went wrong.'}</AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  if (isLoading) {
    return (
      <PageContainer data-testid="event-detail-loading">
        <Skeleton variant="rectangular" height={380} className="mb-6 rounded-container" />
        <Skeleton variant="rectangular" height={28} style={{ width: '50%' }} className="mb-6" />
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[2fr_1fr]">
          <Skeleton variant="rectangular" height={320} className="rounded-container" />
          <Skeleton variant="rectangular" height={280} className="rounded-container" />
        </div>
      </PageContainer>
    );
  }

  if (!event) {
    const eventNotFound = (
      <PageContainer className="text-center">
        <h2 className="mb-4 text-2xl font-bold">Event Not Found</h2>
        <p className="mb-6 text-muted-foreground">The event you're looking for doesn't exist.</p>
        {/* asChild, not a Link wrapping a Button — that nests a <button>
            inside an <a>, which is invalid HTML. */}
        <Button asChild>
          <LocalizedLink to="/events" className="no-underline">
            <ArrowLeft size={16} className="mr-2" />
            Back to Events
          </LocalizedLink>
        </Button>
      </PageContainer>
    );
    return <GatedDetailFallback entityType="event" slug={slug} notFound={eventNotFound} />;
  }

  const decisionCard = (
    <EventDecisionCard
      event={event}
      user={user}
      isPast={isPast}
      userAttendance={userAttendance}
      onAttendanceUpdate={handleAttendanceUpdate}
      onAddToTrip={() => setAddToTripOpen(true)}
      onExportToCalendar={handleExportToCalendar}
      onSendEvent={() => setSendEventOpen(true)}
    />
  );

  return (
    <>
      <SinglePage
        type="event"
        eyebrow={[t('events.detail.eyebrow', 'Event'), cityName].filter(Boolean).join(' · ')}
        title={event.title}
        status={eventStatusLabel(event)}
        // No lead: the standfirst below carries where-and-whether-it-is-on,
        // and `events.description` is long-form (98.8% populated) — it belongs
        // in the About section, not squeezed under the title.
        tags={
          <div className="flex flex-col gap-4">
            <EventMasthead
              event={event}
              cityName={cityName}
              countryName={countryName}
              cityLink={cityLink}
              countryLink={countryLink}
            />
            {/* `events.tags` is populated on 82.5% of the corpus (32,910 of
                39,899) and was rendered NOWHERE — the single biggest piece of
                already-collected data missing from this page. */}
            {event.tags && event.tags.length > 0 && (
              <TagChipRow tags={event.tags} max={16} more="expand" />
            )}
          </div>
        }
        action={<EventActions event={event} onShare={() => setSendEventOpen(true)} />}
        body={
          <>
            {/* The city-resolved country, not `event.countries`. The page has
                always computed `effectiveCountry` because cities are
                coordinate-anchored and win when the two disagree — but the
                banner read the denormalised FK, so a disagreement would have
                stated the wrong country's law. 0 events disagree today; the
                fix is for the next time a relink moves one. */}
            {effectiveCountry?.lgbti_criminalization && (
              <SafetyAlertBanner
                criminalization={effectiveCountry.lgbti_criminalization as Record<string, unknown>}
                countryName={effectiveCountry.name}
              />
            )}
            <ErrorBoundary section="event-fact-strip" fallback={null}>
              <EventFactStrip
                event={event}
                showEventTz={showEventTz}
                setShowEventTz={setShowEventTz}
              />
            </ErrorBoundary>
            <PhotoInset
              src={heroImage}
              alt={event.title}
              fallbackEntityType="event"
              fallbackKey={event.id}
              priority
              caption={cityName}
            />
            <ErrorBoundary section="event-for-you" fallback={null}>
              <EventForYou
                event={event}
                isInTrip={tripStatus?.isInTrip}
                tripCount={tripStatus?.count}
              />
            </ErrorBoundary>
            <SingleRouteRail
              sections={sections}
              activeId={activeId}
              onNavigate={select}
              orientation="horizontal"
              track="blue"
              label={t('events.detail.sections', 'Sections')}
              className="lg:hidden"
            />
            <SingleSectionList sections={sections} />
          </>
        }
        rail={
          <>
            {/* ONE copy. This was `hidden md:block` in the rail with a
                duplicate `md:hidden` copy inside the body — so a phone got the
                inline one and the rail's contents were dropped outright.
                `SinglePage`'s rail is a sibling that reflows under the body,
                which is the whole reason the duplication existed. */}
            <ErrorBoundary section="event-decision-card" fallback={null}>
              {decisionCard}
            </ErrorBoundary>
            <StickyRailGroup>
              <SingleRouteRail
                sections={sections}
                activeId={activeId}
                onNavigate={select}
                orientation="vertical"
                track="blue"
                label={t('events.detail.sections', 'Sections')}
                className="hidden lg:block"
              />
              <ProvenanceLine
                addedAt={event.created_at}
                checkedAt={event.last_verified_at ?? null}
                correctHref="/contact"
              />
            </StickyRailGroup>
          </>
        }
        footer={
          <div className="flex flex-col gap-12 pb-28 md:pb-12">
            {/* Self-hiding composite rail: it belongs here, not in the
                "Who's going" section, where its internal decision to render
                nothing was invisible to the section filter. */}
            <ErrorBoundary section="event-people" fallback={null}>
              <EventPeopleRail event={event} />
            </ErrorBoundary>
            <ErrorBoundary section="event-milestones" fallback={null}>
              <MilestonesForEntity entityType="event" entityId={event.id} />
            </ErrorBoundary>
            <ErrorBoundary section="event-marketplace" fallback={null}>
              <MarketplaceForEvent eventType={event.event_type} eventTitle={event.title} />
            </ErrorBoundary>
            <ErrorBoundary section="event-more-events" fallback={null}>
              <EventMoreEvents eventId={event.id} city={cityName} />
            </ErrorBoundary>
          </div>
        }
      />

      <AddToTripDialog
        open={addToTripOpen}
        onClose={() => setAddToTripOpen(false)}
        entity={{
          type: 'event',
          id: event.id,
          name: event.title,
          latitude: event.latitude,
          longitude: event.longitude,
          city_id: event.city_id,
          country_id: event.country_id,
          category: event.event_type,
        }}
      />

      <ShareEntityDialog
        open={sendEventOpen}
        onOpenChange={setSendEventOpen}
        entity={{
          entity_table: 'events',
          entity_id: event.id,
          title: event.title,
          subtitle: [formatEventDate(event.start_date, event.end_date), event.venues?.name]
            .filter(Boolean)
            .join(' · '),
          image_url: resolveEntityImage('event', event).url ?? null,
          path: `/events/${event.slug || event.id}`,
          gated: Boolean((event as { safety_gated?: boolean }).safety_gated),
        }}
      />

      <EventMobileBar
        event={event}
        isPast={isPast}
        user={user}
        userAttendance={userAttendance}
        onAddToTrip={() => setAddToTripOpen(true)}
        onAttendanceUpdate={handleAttendanceUpdate}
      />
    </>
  );
}
