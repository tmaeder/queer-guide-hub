import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Image } from '@/components/ui/Image';
import type { EventsWithFallback, LocalGroup, MeetSpace, MeetScope } from '@/hooks/useIntentData';
import { selectDiscoveryEvent } from '@/lib/discoveryEvent';
import { isValidImageUrl, resolveEntityImage } from '@/lib/images/resolveEntityImage';
import { isValidTimezone } from '@/utils/timezone';

type Entry = { title: string; label: string; href: string; image: string | null };

export function PeopleDiscoveryLead({
  spaces,
  groups,
  events,
}: {
  spaces?: { spaces: MeetSpace[]; scope: MeetScope };
  groups?: LocalGroup[];
  events?: EventsWithFallback;
}) {
  const { t, i18n } = useTranslation();
  const [openedAt] = useState(Date.now);
  // Country and worldwide results still belong to their labelled sections.
  const space = spaces?.scope === 'city' ? spaces.spaces.find((item) => item.slug) : undefined;
  const event =
    events && events.window !== 'anywhere'
      ? selectDiscoveryEvent(events.events, openedAt)
      : undefined;
  const group = groups?.[0];
  const entries: Entry[] = [];

  if (space) {
    entries.push({
      title: space.name,
      label:
        space.kind === 'village'
          ? t('people.spaceKind.village', 'Queer neighbourhood')
          : t('people.spaceKind.venue', 'Community centre'),
      href: `${space.kind === 'village' ? '/place' : '/venues'}/${space.slug}`,
      image: isValidImageUrl(space.imageUrl) ? space.imageUrl : null,
    });
  }

  if (event) {
    const timeZone = event.timezone && isValidTimezone(event.timezone) ? event.timezone : undefined;
    const date = new Intl.DateTimeFormat(i18n?.language, {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(new Date(event.start_date));
    entries.push({
      title: event.title,
      label: [date, event.city].filter(Boolean).join(' · '),
      href: `/events/${event.slug || event.id}`,
      image: resolveEntityImage('event', event).url,
    });
  }

  if (group) {
    entries.push({
      title: group.name,
      label: t('people.sections.groups', 'Groups to join'),
      href: `/hub/groups/${group.id}`,
      image: isValidImageUrl(group.image_url) ? group.image_url : null,
    });
  }

  const lead = entries.find((entry) => entry.image) ?? entries[0];
  if (!lead) return null;

  return (
    <div className="min-w-0 overflow-hidden rounded-panel bg-card">
      <LocalizedLink
        to={lead.href}
        className="group flex min-w-0 items-stretch no-underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        {lead.image && (
          <div className="w-1/4 max-w-36 shrink-0 self-center">
            <Image
              src={lead.image}
              alt=""
              aspect="square"
              fit="contain"
              imageRole="thumb"
              rounded="none"
              priority
              sizes="(min-width: 1024px) 144px, 23vw"
            />
          </div>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-4 px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="text-13 text-muted-foreground">{lead.label}</p>
            <h2 className="mt-1 break-words font-display text-headline leading-tight group-hover:underline rtl:font-sans rtl:font-bold">
              {lead.title}
            </h2>
          </div>
          <ArrowRight size={20} aria-hidden className="shrink-0 rtl:rotate-180" />
        </div>
      </LocalizedLink>
      {entries.length > 1 && (
        <div className="divide-y divide-border-hairline border-t border-border-hairline">
          {entries
            .filter((entry) => entry !== lead)
            .map((entry) => (
              <LocalizedLink
                key={entry.href}
                to={entry.href}
                className="group flex min-h-11 items-center gap-4 px-4 py-2 no-underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-6"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-13 text-muted-foreground">{entry.label}</span>
                  <span className="block break-words font-bold group-hover:underline">
                    {entry.title}
                  </span>
                </span>
                <ArrowRight size={16} aria-hidden className="shrink-0 rtl:rotate-180" />
              </LocalizedLink>
            ))}
        </div>
      )}
    </div>
  );
}
