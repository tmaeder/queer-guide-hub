import { useTranslation } from 'react-i18next';
import { CalendarDays } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { usePublicGroupMeetup } from '@/hooks/useGroupEvents';
import { isValidTimezone } from '@/utils/timezone';

/** A real upcoming meetup adds context; an empty module does not precede the directory. */
export function GroupDiscoveryOpening() {
  const { t, i18n } = useTranslation();
  const { data: meetup, isLoading, isError, refetch } = usePublicGroupMeetup();
  if (isLoading) return <Skeleton className="h-16" />;
  if (isError)
    return (
      <div role="alert" className="flex flex-wrap items-center gap-4 text-sm">
        <p>{t('pages.groups.opening.meetupError', 'We couldn’t load group meetups.')}</p>
        <Button variant="ghost" onClick={() => void refetch()}>
          {t('pages.groups.opening.retry', 'Try again')}
        </Button>
      </div>
    );
  if (!meetup) return null;
  const date = new Intl.DateTimeFormat(i18n?.resolvedLanguage, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: meetup.timezone && isValidTimezone(meetup.timezone) ? meetup.timezone : undefined,
  }).format(new Date(meetup.start_date));
  return (
    <aside
      className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
      aria-label={t('pages.groups.opening.meetup', 'Next group meetup')}
    >
      <span className="inline-flex items-center gap-2 font-semibold">
        <CalendarDays size={16} aria-hidden />
        {t('pages.groups.opening.meetup', 'Next group meetup')}
      </span>
      <LocalizedLink
        to={`/events/${meetup.slug || meetup.id}`}
        className="underline underline-offset-4"
      >
        {meetup.title}
      </LocalizedLink>
      <span className="text-muted-foreground">
        <time dateTime={meetup.start_date}>{date}</time>
        {meetup.city && ` · ${meetup.city}`} · {meetup.group.name}
      </span>
    </aside>
  );
}
