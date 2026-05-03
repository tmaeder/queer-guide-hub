import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SimilarItems } from '@/components/discovery/SimilarItems';
import { AddToTripDialog } from '@/components/trips/AddToTripDialog';
import { SendEventDialog } from '@/components/messaging/SendEventDialog';
import { EntityDetailLayout, type EntityDetailTab } from '@/components/entity/EntityDetailLayout';
import { useAuth } from '@/hooks/useAuth';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { useEntityTripStatus } from '@/hooks/useEntityTripStatus';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { toast } from '@/hooks/use-toast';
import { upsertEventAttendance } from '@/hooks/usePageFetchers';
import { resolveEntityImage } from '@/lib/images/resolveEntityImage';
import {
  type EventWithRelations,
  EventHero,
  EventOverview,
  EventSidebar,
  fetchEvent,
  exportEventToCalendar,
  formatEventDate,
} from './EventDetail.parts';

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

  const { data: tripStatus } = useEntityTripStatus('event', event?.id);

  useEffect(() => {
    if (!user || !event) {
      setUserAttendance(null);
      return;
    }
    const u = event.event_attendees?.find((a) => a.user_id === user.id);
    setUserAttendance(u?.status || null);
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

  const handleAttendanceUpdate = async (status: 'going' | 'interested' | 'not_going') => {
    if (!user || !event) {
      toast({
        title: t('pages.eventDetail.authRequired', 'Authentication required'),
        description: t('pages.eventDetail.signInAttendance', 'Please sign in to update your attendance'),
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
        title: t('pages.eventDetail.attendanceUpdated', 'Attendance updated'),
        description: `You're now marked as ${status.replace('_', ' ')} for this event`,
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
        description: t('pages.eventDetail.exportSuccessDesc', 'Event has been exported to your calendar'),
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

  const handleShare = async () => {
    if (!event) return;
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: event.title, url: shareUrl });
      } catch {
        /* user cancelled */
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: t('pages.eventDetail.linkCopied', 'Link copied'),
        description: t('pages.eventDetail.linkCopiedDesc', 'Event link copied to clipboard'),
      });
    }
  };

  if (!isLoading && !event && !error) {
    return (
      <div className="container mx-auto py-8 text-center">
        <h2 className="text-2xl font-bold mb-4">Event Not Found</h2>
        <p className="text-muted-foreground mb-6">
          The event you're looking for doesn't exist.
        </p>
        <LocalizedLink to="/events">
          <Button>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
            Back to Events
          </Button>
        </LocalizedLink>
      </div>
    );
  }

  const cityName = event?.cities?.name ?? event?.city ?? null;
  const countryName = event?.countries?.name ?? event?.country ?? null;
  const cityLink = event?.cities?.id ? `/city/${event.cities.slug || event.cities.id}` : null;
  const countryLink = event?.countries?.id
    ? `/country/${event.countries.slug || event.countries.id}`
    : null;
  const heroImage = event ? resolveEntityImage('event', event).url : null;
  const locationLabel = event?.venues?.name || event?.venue_name || 'Location TBA';
  const isPast = event ? new Date(event.end_date || event.start_date) < new Date() : false;

  const breadcrumbs = event
    ? [
        { label: 'Events', href: '/events' },
        ...(countryName ? [{ label: countryName, href: countryLink ?? undefined }] : []),
        ...(cityName ? [{ label: cityName, href: cityLink ?? undefined }] : []),
        { label: event.title },
      ]
    : undefined;

  const tabs: EntityDetailTab[] = event
    ? [
        {
          id: 'overview',
          label: 'Overview',
          content: (
            <EventOverview
              event={event}
              user={user}
              isPast={isPast}
              userAttendance={userAttendance}
              onAttendanceUpdate={handleAttendanceUpdate}
            />
          ),
        },
      ]
    : [];

  return (
    <>
      <EntityDetailLayout
        loading={isLoading}
        error={(error as Error | null) ?? null}
        breadcrumbs={breadcrumbs}
        hero={
          event ? (
            <EventHero
              event={event}
              cityName={cityName}
              countryName={countryName}
              cityLink={cityLink}
              countryLink={countryLink}
              isPast={isPast}
              showEventTz={showEventTz}
              setShowEventTz={setShowEventTz}
              venueRef={venueRef}
              tripCount={tripStatus?.count}
              isInTrip={tripStatus?.isInTrip}
              onAddToTrip={() => setAddToTripOpen(true)}
              onShare={handleShare}
              onExportToCalendar={handleExportToCalendar}
              onSendEvent={() => setSendEventOpen(true)}
              showSendButton={Boolean(user)}
              heroImage={heroImage}
              locationLabel={locationLabel}
            />
          ) : null
        }
        tabs={tabs}
        sidebar={
          event ? (
            <EventSidebar
              event={event}
              venueRef={venueRef}
              onOrganizerClick={(organizer) =>
                navigate(`/events?organizer=${encodeURIComponent(organizer)}`)
              }
            />
          ) : undefined
        }
        entityType="event"
        entityId={event?.id}
      />

      {event && (
        <>
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

          <SendEventDialog
            open={sendEventOpen}
            onOpenChange={setSendEventOpen}
            eventTitle={event.title}
            eventDate={formatEventDate(event.start_date, event.end_date)}
            eventVenue={event.venues?.name}
            eventPath={`/events/${event.slug || event.id}`}
          />

          <div className="container mx-auto pb-8">
            <SimilarItems entity={{ type: 'event', id: event.id }} className="mt-8" />
          </div>
        </>
      )}
    </>
  );
}
