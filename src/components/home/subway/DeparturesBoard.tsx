import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { useDepartureBoard } from '@/hooks/useDepartureBoard';
import { Band } from '@/components/home/Band';

const formatBoardTime = (iso: string | null, locale: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const day = d.toLocaleDateString(locale, { weekday: 'short' }).toUpperCase();
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  // All-day rows (midnight timestamps) read as a date, not a fake 00:00.
  const date = d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  return time === '00:00' ? `${day} ${date}` : `${day} ${time}`;
};

/** Homepage departures board — the soonest real events as board rows.
 *  Bullet · time · title/via · arrow, in a 3px ink frame on a tinted band. */
export function DeparturesBoard() {
  const { t, i18n } = useTranslation();
  const { data: rows = [], isLoading } = useDepartureBoard(6);

  if (!isLoading && rows.length === 0) return null;

  return (
    <Band
      surface="tint"
      title={t('home.departures.title', 'Departures — this week')}
      seeAllHref="/events"
      seeAllLabel={t('home.departures.seeAll', 'Full board')}
    >
      <div className="border-[3px] border-foreground bg-background">
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse border-b-2 border-foreground/10" />
              ))
            : rows.map((r) => (
                <div
                  key={r.id}
                  className="relative border-b-2 border-foreground/10 last:border-b-0"
                >
                  <div className="grid grid-cols-[42px_1fr_auto] items-center gap-4 px-4 py-4 transition-colors group-hover:bg-surface-container md:grid-cols-[52px_120px_1fr_28px] md:px-6">
                    <RouteBullet type="event" size={42} />
                    <span className="hidden text-body-lg font-bold tabular-nums md:block">
                      {formatBoardTime(r.start_date, i18n.language)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-title font-bold md:text-headline">
                        {r.title}
                      </span>
                      <span className="mt-0.5 block truncate text-13 text-muted-foreground">
                        <span className="md:hidden">
                          {formatBoardTime(r.start_date, i18n.language)} ·{' '}
                        </span>
                        {[r.venue_name, r.city?.name].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="hidden text-xl font-bold md:block" aria-hidden>
                      →
                    </span>
                  </div>
                  <LocalizedLink
                    to={`/events/${r.slug || r.id}`}
                    className="absolute inset-0 no-underline"
                    aria-label={r.title}
                  />
                </div>
              ))}
      </div>
    </Band>
  );
}
