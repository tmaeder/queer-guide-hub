import { isValidTimezone } from '@/utils/timezone';

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
  timeZone?: string | null,
  now = Date.now(),
  datePrecision?: string | null,
): EventDateParts {
  const dateOnly = datePrecision === 'day';
  const d = new Date(dateOnly ? `${iso.slice(0, 10)}T00:00:00Z` : iso);
  // Older rows carry no or an invalid zone; fall back to the viewer's.
  const zone = dateOnly ? 'UTC' : timeZone && isValidTimezone(timeZone) ? timeZone : undefined;
  const fmt = (o: Intl.DateTimeFormatOptions) => d.toLocaleString(locale, { ...o, timeZone: zone });
  const time = fmt({ hour: '2-digit', minute: '2-digit', hour12: false });
  const soon = d.getTime() - now < WEEK_MS;
  return {
    top: fmt(soon ? { weekday: 'short' } : { month: 'short' })
      .replace('.', '')
      .toUpperCase(),
    day: fmt({ day: 'numeric' }),
    time: dateOnly || time === '00:00' || time === '24:00' ? null : time,
    full: fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  };
}
