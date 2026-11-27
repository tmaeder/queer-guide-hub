import { eventTiming } from '@/lib/eventTiming';
import type { EventDateRow } from '@/hooks/useEventDates';

/**
 * "Sat 6 Dec" plus a status word when it is not plainly upcoming, so two
 * occurrences of one recurring night can be told apart (and an ended or
 * cancelled one is not mistaken for the next date).
 */
export function eventDateLine(
  row: EventDateRow | undefined,
  locale: string,
  t: (key: string, fallback: string) => string,
): string | null {
  if (!row?.start_date) return null;
  const start = new Date(row.start_date);
  if (Number.isNaN(start.getTime())) return null;
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
  if (row.timezone) opts.timeZone = row.timezone;
  let date: string;
  try {
    date = new Intl.DateTimeFormat(locale, opts).format(start);
  } catch {
    date = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(start);
  }
  const timing = eventTiming(row);
  if (timing === 'cancelled') return `${date} · ${t('events.timing.cancelled', 'Cancelled')}`;
  if (timing === 'ended') return `${date} · ${t('events.timing.ended', 'Ended')}`;
  if (timing === 'ongoing') return `${date} · ${t('events.timing.ongoing', 'On now')}`;
  return date;
}
