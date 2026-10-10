export type DepartureWindow = 'upcoming' | 'today' | 'weekend' | 'week';
interface Departure {
  start_date?: string | null;
  end_date?: string | null;
}

/** Compare calendar days in the destination, independent of the visitor's zone and DST. */
function calendarDay(date: Date, timeZone?: string | null): number {
  const parts = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(date);
  const get = (key: string) => Number(parts.find((part) => part.type === key)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day')) / 86_400_000;
}

/** Include ongoing events and multi-day events overlapping the chosen destination dates. */
export function matchesDepartureDate(
  event: Departure,
  window: DepartureWindow,
  now: Date,
  timeZone?: string | null,
): boolean {
  const start = new Date(event.start_date || '');
  const end = new Date(event.end_date || event.start_date || '');
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return false;
  if (end.getTime() < now.getTime()) return false;
  if (window === 'upcoming') return true;
  let from = calendarDay(now, timeZone);
  let until = from + (window === 'week' ? 7 : 1);
  if (window === 'weekend') {
    const weekday = new Date(from * 86_400_000).getUTCDay();
    if (weekday !== 0 && weekday !== 6) from += 6 - weekday;
    until = from + (weekday === 0 ? 1 : 2);
  }
  return calendarDay(start, timeZone) < until && calendarDay(end, timeZone) >= from;
}

/** Sort by the date the board displays: start dates, or the end of an ongoing range. */
export function sortDepartures<T extends Departure>(events: T[], now = new Date()): T[] {
  const time = (event: Departure) => {
    const start = new Date(event.start_date || '').getTime();
    const end = new Date(event.end_date || '').getTime();
    if (!Number.isFinite(start)) return Infinity;
    return start <= now.getTime() && end > now.getTime() ? end : start;
  };
  return [...events].sort((a, b) => time(a) - time(b));
}

/** Bad source metadata must not take down the city guide. */
export function destinationTimezone(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}
