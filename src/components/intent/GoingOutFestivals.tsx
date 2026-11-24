import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { Image } from '@/components/ui/Image';
import type { HighlightEvent } from '@/hooks/useIntentData';
import { resolveEntityImage } from '@/lib/images/resolveEntityImage';
import { isValidTimezone } from '@/utils/timezone';

/**
 * Prides, festivals and fairs, here and elsewhere. Every card names its city,
 * because most of them are somewhere else. Named "festivals" rather than
 * "highlights" so it does not collide with GoingOutHighlights, the hero cards.
 */
export function GoingOutFestivals({
  events,
  cityId,
}: {
  events: HighlightEvent[];
  cityId: string | null;
}) {
  const { t, i18n } = useTranslation();

  const dates = (e: HighlightEvent) => {
    const fmt = new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'short',
      timeZone: e.timezone && isValidTimezone(e.timezone) ? e.timezone : undefined,
    });
    const start = new Date(e.start_date);
    const end = e.end_date ? new Date(e.end_date) : null;
    return end && fmt.format(end) !== fmt.format(start)
      ? fmt.formatRange(start, end)
      : fmt.format(start);
  };

  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((e) => (
        <li key={e.id} className="group relative rounded-container bg-card shadow-soft">
          <div>
            <Image
              src={resolveEntityImage('event', e).url}
              alt=""
              aspect="card"
              rounded="top"
              imageRole="cover"
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              fallbackArtwork={
                <div className="grid h-full place-items-center">
                  <RouteBullet type="event" size={40} decorative />
                </div>
              }
            />
          </div>
          <div className="p-4">
            <p className="text-13 text-muted-foreground">
              <time dateTime={e.start_date}>{dates(e)}</time>
              {e.city ? ` · ${e.city}` : null}
              {cityId && e.city_id === cityId
                ? ` · ${t('goingOut.festivals.here', 'in your city')}`
                : null}
            </p>
            <h3 className="mt-1 break-words font-sans text-title font-bold leading-tight group-hover:underline">
              {e.title}
            </h3>
          </div>
          <LocalizedLink
            to={`/events/${e.slug || e.id}`}
            aria-label={e.title}
            className="absolute inset-0 no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </li>
      ))}
    </ul>
  );
}
