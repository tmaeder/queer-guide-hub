import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarDays } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatEventDateTime } from '@/lib/event-time';
import { isValidTimezone } from '@/utils/timezone';

interface Meetup {
  title: string;
  start_date: string;
  end_date?: string | null;
  timezone?: string | null;
  venue_name?: string | null;
  city?: string | null;
}

interface GroupNextMeetupProps {
  meetup?: Meetup | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  emptyMessage: string;
  eventPath?: string;
  onViewEvents?: () => void;
}

export function GroupNextMeetup({
  meetup,
  loading,
  error,
  onRetry,
  emptyMessage,
  eventPath,
  onViewEvents,
}: GroupNextMeetupProps) {
  const { t } = useTranslation();

  return (
    <section
      aria-labelledby="group-next-meetup"
      className="min-w-0 rounded-container bg-muted/55 p-4 sm:p-6"
    >
      <h2 id="group-next-meetup" className="flex items-center gap-2 font-sans text-title font-bold">
        <CalendarDays size={18} className="shrink-0" aria-hidden="true" />
        {t('pages.groupDetail.opening.nextMeetup', 'Next meetup')}
      </h2>
      {loading ? (
        <Skeleton className="mt-2 h-16 rounded-element" />
      ) : meetup ? (
        <>
          <time dateTime={meetup.start_date} className="mt-2 block text-sm font-medium text-muted-foreground">
            {formatEventDateTime(
              meetup.start_date,
              meetup.end_date,
              meetup.timezone && isValidTimezone(meetup.timezone) ? meetup.timezone : undefined,
            )}
          </time>
          <h3 className="break-words text-lg font-semibold">{meetup.title}</h3>
          <p className="break-words text-sm text-muted-foreground">
            {[meetup.venue_name, meetup.city].filter(Boolean).join(' · ')}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          {error
            ? t('pages.groupDetail.opening.meetupError', 'We couldn’t load the group’s meetups.')
            : emptyMessage}
        </p>
      )}
      {meetup && eventPath ? (
        <Button variant="ghost" className="mt-2" asChild>
          <LocalizedLink to={eventPath}>
            {t('pages.groupDetail.opening.meetupDetails', 'Meetup details')}
            <ArrowRight size={16} aria-hidden="true" />
          </LocalizedLink>
        </Button>
      ) : onViewEvents && !loading && !error ? (
        <Button variant="ghost" className="mt-2" onClick={onViewEvents}>
          {meetup
            ? t('pages.groupDetail.opening.meetupDetails', 'Meetup details')
            : t('pages.groupDetail.events', 'Group events')}
          <ArrowRight size={16} aria-hidden="true" />
        </Button>
      ) : error ? (
        <Button variant="ghost" className="mt-2" onClick={onRetry}>
          {t('pages.groupDetail.opening.retry', 'Try again')}
        </Button>
      ) : null}
    </section>
  );
}
