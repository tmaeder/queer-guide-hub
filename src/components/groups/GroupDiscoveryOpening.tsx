import { useTranslation } from 'react-i18next';
import { ArrowUpRight, CalendarDays } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Image } from '@/components/ui/Image';
import { Skeleton } from '@/components/ui/skeleton';
import { usePublicGroupMeetup } from '@/hooks/useGroupEvents';
import type { Group } from '@/hooks/useGroups';
import { isValidTimezone } from '@/utils/timezone';

interface GroupDiscoveryOpeningProps {
  groups: Pick<Group, 'id' | 'name' | 'image_url' | 'city' | 'member_count'>[];
  groupsLoading: boolean;
  recentlyActive: boolean;
}

export function GroupDiscoveryOpening({
  groups,
  groupsLoading,
  recentlyActive,
}: GroupDiscoveryOpeningProps) {
  const { t, i18n } = useTranslation();
  const { data: meetup, isLoading, isError, refetch } = usePublicGroupMeetup();
  const date = meetup
    ? new Intl.DateTimeFormat(i18n?.resolvedLanguage, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: meetup.timezone && isValidTimezone(meetup.timezone) ? meetup.timezone : undefined,
      }).format(new Date(meetup.start_date))
    : null;

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {(groupsLoading || groups.length > 0) && (
        <section aria-labelledby="groups-opening-heading" className="min-w-0">
          <h2 id="groups-opening-heading" className="mb-2 font-sans text-title font-bold">
            {recentlyActive
              ? t('pages.groups.opening.active', 'Recently active groups')
              : t('pages.groups.opening.explore', 'Groups to explore')}
          </h2>
          {groupsLoading ? (
            <Skeleton className="h-32 rounded-container" />
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {groups.map((group) => (
                <li key={group.id}>
                  <LocalizedLink
                    to={`/hub/groups/${group.id}`}
                    className="group grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2 px-1 py-2.5 text-foreground no-underline hover:bg-muted/45 focus-visible:outline-ring"
                  >
                    <Image
                      src={group.image_url}
                      alt=""
                      aspect="square"
                      imageRole="thumb"
                      rounded="element"
                      fallbackEntityType="default"
                      fallbackKey={group.id}
                      fallbackGlyph="community"
                    />
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold group-hover:underline">{group.name}</h3>
                      <p className="truncate text-sm text-muted-foreground">
                        {group.city && `${group.city} · `}
                        {t('pages.groups.opening.memberCount', {
                          count: group.member_count,
                          defaultValue_one: '{{count}} member',
                          defaultValue_other: '{{count}} members',
                        })}
                      </p>
                    </div>
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </LocalizedLink>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section
        aria-labelledby="groups-meetup-heading"
        className="min-w-0 rounded-container bg-muted/55 p-4"
      >
        <h2 id="groups-meetup-heading" className="flex items-center gap-2 font-sans text-title font-bold">
          <CalendarDays size={18} aria-hidden="true" />
          {t('pages.groups.opening.meetup', 'Next group meetup')}
        </h2>
        {isLoading ? (
          <Skeleton className="mt-2 h-14 rounded-element" />
        ) : meetup ? (
          <LocalizedLink
            to={`/events/${meetup.slug || meetup.id}`}
            className="group mt-2 flex items-start justify-between gap-2 py-1 text-foreground no-underline focus-visible:outline-ring"
          >
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">
                <time dateTime={meetup.start_date}>{date}</time>
                {meetup.city && ` · ${meetup.city}`}
              </p>
              <h3 className="mt-1 break-words font-semibold group-hover:underline">{meetup.title}</h3>
              <p className="break-words text-sm text-muted-foreground">{meetup.group.name}</p>
            </div>
            <ArrowUpRight className="mt-1 shrink-0" size={16} aria-hidden="true" />
          </LocalizedLink>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              {isError
                ? t('pages.groups.opening.meetupError', 'We couldn’t load group meetups.')
                : t('pages.groups.opening.noMeetup', 'No public group meetups are listed for the next 30 days.')}
            </p>
            {isError ? (
              <button
                type="button"
                onClick={() => void refetch()}
                className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
              >
                {t('pages.groups.opening.retry', 'Try again')}
              </button>
            ) : (
              <LocalizedLink
                to="/events"
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold underline underline-offset-4"
              >
                {t('pages.groups.opening.browseEvents', 'Explore queer events')}
                <ArrowUpRight size={14} aria-hidden="true" />
              </LocalizedLink>
            )}
          </>
        )}
      </section>
    </div>
  );
}
