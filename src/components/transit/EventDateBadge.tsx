import { cn } from '@/lib/utils';
import { ROUTE_BULLET_MAP, TRACK_BG, TRACK_TEXT } from './routeBulletMap';

const WEEK_MS = 6 * 24 * 60 * 60 * 1000;

export interface EventDateParts {
  /** Weekday within the coming week, else the month — never ambiguous. */
  top: string;
  day: string;
  /** Clock time, or null for all-day (midnight) rows. */
  time: string | null;
  /** Full date for assistive tech and the tooltip. */
  full: string;
}

export function eventDateParts(
  iso: string,
  locale: string | undefined,
  timeZone?: string,
  now = Date.now(),
): EventDateParts {
  const d = new Date(iso);
  const fmt = (o: Intl.DateTimeFormatOptions) => d.toLocaleString(locale, { ...o, timeZone });
  const time = fmt({ hour: '2-digit', minute: '2-digit', hour12: false });
  const soon = d.getTime() - now < WEEK_MS;
  return {
    top: fmt(soon ? { weekday: 'short' } : { month: 'short' })
      .replace('.', '')
      .toUpperCase(),
    day: fmt({ day: 'numeric' }),
    time: time === '00:00' || time === '24:00' ? null : time,
    full: fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
  };
}

const TRACK = ROUTE_BULLET_MAP.event.track;

/**
 * The event's route bullet carrying its date and time: same track fill and ink
 * ring as RouteBullet, with weekday (or month, beyond a week), day and time in
 * place of the letter E. Shared by the homepage board, /going-out and /people,
 * so the row's secondary text is the place, never the date again.
 */
export function EventDateBadge({
  startDate,
  locale,
  timeZone,
  className,
}: {
  startDate: string;
  locale?: string;
  timeZone?: string;
  className?: string;
}) {
  const p = eventDateParts(startDate, locale, timeZone);
  return (
    <time
      dateTime={startDate}
      title={p.time ? `${p.full}, ${p.time}` : p.full}
      className={cn(
        'transit-marker grid size-14 shrink-0 place-content-center rounded-full border-2 border-track-ring text-center leading-none',
        TRACK_BG[TRACK],
        TRACK_TEXT[TRACK],
        className,
      )}
    >
      <span className="sr-only">{p.time ? `${p.full}, ${p.time}` : p.full}</span>
      <span aria-hidden="true" className="text-3xs font-bold">
        {p.top}
      </span>
      <span aria-hidden="true" className="text-15 font-bold tabular-nums">
        {p.day}
      </span>
      {p.time && (
        <span aria-hidden="true" className="text-3xs font-bold tabular-nums">
          {p.time}
        </span>
      )}
    </time>
  );
}
