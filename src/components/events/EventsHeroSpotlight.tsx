import { useTranslation } from 'react-i18next';
import { ArrowRight, Calendar, Sparkles } from 'lucide-react';
import { useEventSpotlight } from '@/hooks/useEventSpotlight';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { format, differenceInCalendarDays } from 'date-fns';
import { dateFnsLocaleFor } from '@/i18n/dateFnsLocale';

export function EventsHeroSpotlight() {
  const { t, i18n } = useTranslation();
  const dfLocale = dateFnsLocaleFor(i18n.language);
  const { spotlight } = useEventSpotlight();

  if (!spotlight) return null;

  const { event, clusterCount } = spotlight;
  const start = new Date(event.start_date);
  const end = event.end_date ? new Date(event.end_date) : null;
  const daysUntil = differenceInCalendarDays(start, new Date());
  const dateLabel = end && start.toDateString() !== end.toDateString()
    ? `${format(start, 'MMM d', { locale: dfLocale })} – ${format(end, 'MMM d', { locale: dfLocale })}`
    : format(start, 'MMM d, yyyy', { locale: dfLocale });

  const countdown = daysUntil <= 0
    ? t('pages.events.spotlight.happeningNow', 'Happening now')
    : daysUntil === 1
      ? t('pages.events.spotlight.tomorrow', 'Starts tomorrow')
      : t('pages.events.spotlight.inDays', { count: daysUntil, defaultValue: `Starts in ${daysUntil} days` });

  return (
    <LocalizedLink
      to={`/events/${event.slug}`}
      className="group block rounded-2xl border border-border bg-card px-5 py-4 sm:px-6 sm:py-5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2"
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{t('pages.events.spotlight.eyebrow', 'Spotlight')}</span>
            <span aria-hidden>·</span>
            <span>{countdown}</span>
          </div>
          <h2 className="text-lg sm:text-xl font-semibold tracking-tight truncate">
            {event.title}
          </h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {dateLabel}
            </span>
            {event.city && (
              <>
                <span aria-hidden>·</span>
                <span>{event.city}</span>
              </>
            )}
            {clusterCount > 1 && event.city && (
              <>
                <span aria-hidden>·</span>
                <span>
                  {t('pages.events.spotlight.nearbyCount', {
                    count: clusterCount,
                    city: event.city,
                    defaultValue: `${clusterCount} events in ${event.city}`,
                  })}
                </span>
              </>
            )}
          </div>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </LocalizedLink>
  );
}
