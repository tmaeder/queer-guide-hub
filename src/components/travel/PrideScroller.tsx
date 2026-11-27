import { isValidTimezone } from '@/utils/timezone';
import { useTranslation } from 'react-i18next';
import { ArrowRight, MapPin } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { CardImage } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useUpcomingPrideEvents } from '@/hooks/useUpcomingPrideEvents';

function formatRange(start: string | null, end: string | null, locale?: string, timeZone?: string) {
  if (!start) return null;
  const format = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(new Date(iso));
  const sStr = format(start, { month: 'short', day: 'numeric' });
  const key = { year: 'numeric', month: 'numeric', day: 'numeric' } as const;
  if (!end || format(end, key) === format(start, key))
    return { label: sStr, end: null as string | null };
  return { label: `${sStr} – ${format(end, { month: 'short', day: 'numeric' })}`, end };
}

export function PrideScroller() {
  const { t, i18n } = useTranslation();
  const { data, isLoading } = useUpcomingPrideEvents({ months: 4, limit: 12 });
  const listLabel = t('pages.travel.pride.title', 'Pride this season');

  return (
    <section className="mb-8">
      <p className="mb-4 text-sm text-muted-foreground">
        {t('pages.travel.pride.window', 'Next 4 months')}
      </p>

      {isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[264px] w-[260px] shrink-0 rounded-container" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <p className="rounded-container bg-card p-6 text-sm text-muted-foreground">
          {t('pages.travel.pride.empty', 'No upcoming Pride events.')}
        </p>
      ) : (
        <ul
          aria-label={listLabel}
          tabIndex={0}
          className="-mx-6 -my-4 flex snap-x scroll-px-6 gap-4 overflow-x-auto px-6 pt-4 pb-12 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {data.map((event) => {
            const timeZone =
              event.timezone && isValidTimezone(event.timezone) ? event.timezone : undefined;
            const range = formatRange(event.start_date, event.end_date, i18n?.language, timeZone);
            const start = event.start_date ? new Date(event.start_date) : null;
            return (
              <li
                key={event.id}
                className="card-lift relative w-[260px] shrink-0 snap-start overflow-hidden rounded-container bg-card shadow-soft"
              >
                <CardImage src={event.images?.[0]} alt="" height={140}>
                  {start && (
                    <span className="absolute left-4 top-4 grid min-w-12 place-items-center rounded-element bg-card px-2 py-1 text-center leading-none shadow-soft">
                      <span className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                        {start.toLocaleDateString(i18n?.language, { month: 'short', timeZone })}
                      </span>
                      <span className="text-title font-bold">
                        {start.toLocaleDateString(i18n?.language, { day: 'numeric', timeZone })}
                      </span>
                    </span>
                  )}
                </CardImage>
                <div className="p-4">
                  <h3 className="line-clamp-2 font-bold leading-snug">{event.title}</h3>
                  <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                    {range && event.start_date && (
                      <time
                        dateTime={range.end ? `${event.start_date}/${range.end}` : event.start_date}
                      >
                        {range.label}
                      </time>
                    )}
                    {event.city && (
                      <span className="inline-flex items-center gap-1 truncate">
                        <MapPin size={12} aria-hidden />
                        {event.city.name}
                        {event.country?.name ? `, ${event.country.name}` : ''}
                      </span>
                    )}
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold">
                    {t('pages.travel.pride.cta', 'View event')} <ArrowRight size={14} aria-hidden />
                  </span>
                </div>
                <LocalizedLink
                  to={`/events/${event.slug ?? event.id}`}
                  aria-label={event.title}
                  className="absolute inset-0 no-underline"
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
