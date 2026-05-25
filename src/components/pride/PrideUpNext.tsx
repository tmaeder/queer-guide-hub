import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation, type TFunction } from 'react-i18next';
import { Calendar, MapPin, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PrideCalendarEvent } from '@/hooks/usePrideCalendar';

interface PrideUpNextProps {
  events: PrideCalendarEvent[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  limit?: number;
}

/**
 * relativeDateLabel — pure: takes the i18n t() so the component can pass its
 * translation function in. Test code may pass a stub.
 */
// eslint-disable-next-line react-refresh/only-export-components -- pure helper colocated with consumer; tests import it directly.
export function relativeDateLabel(
  iso: string,
  now: number = Date.now(),
  t?: TFunction | ((key: string, vars?: Record<string, unknown>) => string),
): string {
  const days = Math.round((new Date(iso).getTime() - now) / 86_400_000);
  const tr = (key: string, vars?: Record<string, unknown>) => (t ? (t as (k: string, v?: Record<string, unknown>) => string)(`pride.upNext.${key}`, vars) : fallback(key, vars));
  if (days < 0) return tr('past');
  if (days === 0) return tr('today');
  if (days === 1) return tr('tomorrow');
  if (days < 7) return tr('inDays', { count: days });
  if (days < 30) return tr('inWeeks', { count: Math.round(days / 7) });
  if (days < 365) return tr('inMonths', { count: Math.round(days / 30) });
  return tr('inYears', { count: Math.round(days / 365) });
}

function fallback(key: string, vars?: Record<string, unknown>): string {
  if (key === 'past') return 'Past';
  if (key === 'today') return 'Today';
  if (key === 'tomorrow') return 'Tomorrow';
  if (key === 'inDays') return `In ${vars?.count} days`;
  if (key === 'inWeeks') return `In ${vars?.count} weeks`;
  if (key === 'inMonths') return `In ${vars?.count} months`;
  return `In ${vars?.count}y`;
}

export function PrideUpNext({ events, selectedId, onSelect, limit = 8 }: PrideUpNextProps) {
  const { t } = useTranslation();
  // Pin "now" once per mount so the upcoming list is stable across renders.
  const [now] = useState(() => Date.now());
  const upcoming = useMemo(() => {
    return events
      .filter((e) => new Date(e.start_date).getTime() >= now - 86_400_000)
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
      .slice(0, limit);
  }, [events, limit, now]);

  if (upcoming.length === 0) return null;

  return (
    <section aria-labelledby="upnext-heading">
      <div className="flex items-baseline justify-between mb-3">
        <h2 id="upnext-heading" className="text-title font-medium">
          {t('pride.upNext.title')}
        </h2>
        <span className="text-xs2 text-foreground/50">{t('pride.upNext.subtitle')}</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin -mx-2 px-2 snap-x">
        {upcoming.map((e) => {
          const isSelected = selectedId === e.id;
          const d = new Date(e.start_date);
          const monthShort = d.toLocaleDateString(undefined, { month: 'short' });
          const day = d.getUTCDate();
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => onSelect?.(isSelected ? null : e.id)}
              aria-pressed={isSelected}
              className={cn(
                'snap-start shrink-0 w-[240px] min-h-0 p-4 text-left rounded-container border bg-background transition-colors',
                isSelected ? 'border-foreground' : 'border-foreground/15 hover:border-foreground',
              )}
            >
              <div className="flex items-center justify-between text-xs2 uppercase tracking-label text-foreground/60 mb-3">
                <span>{relativeDateLabel(e.start_date, now, t)}</span>
                {e.is_featured && <Star className="size-3 fill-foreground text-foreground" aria-label={t('pride.featured')} />}
              </div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-display leading-none font-medium tabular-nums">{day}</span>
                <span className="text-title text-foreground/60 leading-none">{monthShort}</span>
              </div>
              <p className="text-sm font-medium leading-tight mb-1 line-clamp-2">
                <Link
                  to={`/events/${e.slug}`}
                  onClick={(ev) => ev.stopPropagation()}
                  className="hover:underline"
                >
                  {e.title}
                </Link>
              </p>
              <p className="flex items-center gap-1 text-xs2 text-foreground/60">
                <MapPin className="size-3" />
                {[e.city, e.country].filter(Boolean).join(', ')}
              </p>
              {e.verification_status !== 'verified' && (
                <p className="mt-2 inline-flex items-center gap-1 text-2xs text-foreground/50">
                  <Calendar className="size-3" /> {t('pride.estimated')}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
