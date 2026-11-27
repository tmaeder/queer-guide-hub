import { cn } from '@/lib/utils';
import { ROUTE_BULLET_MAP, TRACK_BG, TRACK_TEXT } from './routeBulletMap';
import { eventDateParts } from './eventDateParts';

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
  datePrecision,
  className,
}: {
  startDate: string;
  locale?: string;
  timeZone?: string | null;
  datePrecision?: string | null;
  className?: string;
}) {
  const p = eventDateParts(startDate, locale, timeZone, undefined, datePrecision);
  return (
    <time
      dateTime={datePrecision === 'day' ? startDate.slice(0, 10) : startDate}
      title={p.time ? `${p.full}, ${p.time}` : p.full}
      // A calendar tile, not a disc: three lines of text in a 64px circle ran
      // into the curve. Ink header carries the weekday, the track body the day.
      className={cn(
        'transit-marker flex w-14 shrink-0 flex-col overflow-hidden rounded-element border-2 border-track-ring text-center leading-none',
        TRACK_BG[TRACK],
        TRACK_TEXT[TRACK],
        className,
      )}
    >
      <span className="sr-only">{p.time ? `${p.full}, ${p.time}` : p.full}</span>
      <span
        aria-hidden="true"
        className="bg-track-ring py-0.5 text-3xs font-bold tracking-wide text-logo-plate"
      >
        {p.top}
      </span>
      <span aria-hidden="true" className="py-1 font-display text-headline leading-none">
        {p.day}
      </span>
      {p.time && (
        <span
          aria-hidden="true"
          className="border-t border-track-ring/30 py-0.5 text-3xs font-bold tabular-nums"
        >
          {p.time}
        </span>
      )}
    </time>
  );
}
