import { useTranslation } from 'react-i18next';
import { Calendar, MapPin } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Skeleton } from '@/components/ui/skeleton';
import { useUpcomingPrideEvents } from '@/hooks/useUpcomingPrideEvents';

function formatRange(start: string | null, end: string | null) {
  if (!start) return null;
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const sStr = s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (!e || e.toDateString() === s.toDateString()) return sStr;
  const eStr = e.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${sStr} – ${eStr}`;
}

export function PrideScroller() {
  const { t } = useTranslation();
  const { data, isLoading } = useUpcomingPrideEvents({ months: 4, limit: 12 });

  return (
    <section className="border border-border bg-background p-6 mb-8 rounded">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xl font-bold tracking-tight">
          {t('pages.travel.pride.title', 'Pride this season')}
        </h2>
        <span className="text-xs text-muted-foreground">
          {t('pages.travel.pride.window', 'Next 4 months')}
        </span>
      </div>

      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[140px] rounded shrink-0" style={{ width: 240 }} />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6">
          {t('pages.travel.pride.empty', 'No upcoming Pride events.')}
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {data.map((event) => {
            const range = formatRange(event.start_date, event.end_date);
            const safety = event.country?.equality_score;
            return (
              <LocalizedLink
                key={event.id}
                to={`/events/${event.id}`}
                className="shrink-0 border border-border bg-background p-3 hover:bg-muted transition-colors"
                style={{ width: 240, textDecoration: 'none' }}
              >
                <div className="font-semibold text-sm truncate mb-2">
                  {event.title}
                </div>
                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {range && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={12} />
                      {range}
                    </span>
                  )}
                  {event.city && (
                    <span className="inline-flex items-center gap-1 truncate">
                      <MapPin size={12} />
                      {event.city.name}
                      {event.country?.name ? `, ${event.country.name}` : ''}
                    </span>
                  )}
                  {typeof safety === 'number' && (
                    <span className="text-[11px] mt-1">
                      {t('pages.travel.pride.safety', 'Equality score')}: {safety}
                    </span>
                  )}
                </div>
              </LocalizedLink>
            );
          })}
        </div>
      )}
    </section>
  );
}
