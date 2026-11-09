import { useTranslation } from 'react-i18next';
import { ArrowRight, Calendar } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Image } from '@/components/ui/Image';
import type { Database } from '@/integrations/supabase/types';
import { resolveEntityImage } from '@/lib/images/resolveEntityImage';
import { localizedField, type I18nMap } from '@/lib/localizeContent';
import { isValidTimezone } from '@/utils/timezone';

type Event = Database['public']['Tables']['events']['Row'];

export function EventsHeroSpotlight({ event }: { event: Event }) {
  const { t, i18n } = useTranslation();
  const title = localizedField(event.title, event.title_i18n as I18nMap, i18n.language);
  const artwork = resolveEntityImage('event', event).url;
  const timeZone = event.timezone && isValidTimezone(event.timezone) ? event.timezone : undefined;
  const date = new Intl.DateTimeFormat(i18n.language, {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(event.start_date));
  const place = [event.venue_name, event.city].filter(Boolean).join(' · ');

  return (
    <LocalizedLink
      to={`/events/${event.slug || event.id}`}
      className="group flex min-w-0 items-stretch overflow-hidden rounded-container bg-card no-underline outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
    >
      {artwork && (
        <div className="w-1/4 max-w-48 shrink-0 bg-muted [&>div]:h-full">
          <Image
            src={artwork}
            alt=""
            aspect="auto"
            rounded="none"
            imageRole="thumb"
            priority
            sizes="(min-width: 1024px) 192px, 22vw"
          />
        </div>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-2 px-4 py-4 md:gap-4 md:px-6 md:py-6">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Calendar size={16} aria-hidden="true" className="shrink-0" />
            <time dateTime={event.start_date}>{date}</time>
          </p>
          <h2 className="mt-2 text-balance break-words font-display text-title leading-tight group-hover:underline sm:text-headline rtl:font-sans rtl:font-bold">
            {title}
          </h2>
          {place && <p className="mt-2 break-words text-sm text-muted-foreground">{place}</p>}
          {event.organizer_name && event.organizer_name !== event.venue_name && (
            <p className="mt-1 break-words text-13 text-muted-foreground">
              {t('events.organizer', 'Organizer')} · {event.organizer_name}
            </p>
          )}
        </div>
        <ArrowRight size={20} aria-hidden="true" className="shrink-0 rtl:rotate-180" />
      </div>
    </LocalizedLink>
  );
}
