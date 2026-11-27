/**
 * One definition of where an event sits in time, shared by every preview
 * (country gallery, city board, village list) and the event page itself.
 *
 * Before this, each surface decided on its own: the country gallery showed a
 * 2022 start date as "Aug 29" on 27 Nov 2026 because it never asked whether
 * the row had started, and the event page called a start-only event "Ended"
 * one second after its doors opened.
 */

export type EventTiming = 'upcoming' | 'ongoing' | 'ended' | 'cancelled';

export interface TimedEvent {
  start_date?: string | null;
  end_date?: string | null;
  timezone?: string | null;
  status?: string | null;
  liveness_status?: string | null;
}

/**
 * A row that started more than this long ago and is still "on" is a standing
 * schedule (weekly club nights stored as one 2022-2027 span), not a dated
 * event. Previews that promise "upcoming" leave these out of their default view.
 */
export const LONG_RUNNING_DAYS = 31;
const DAY = 86_400_000;

function time(value?: string | null): number {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
}

function validZone(zone?: string | null): string | undefined {
  if (!zone) return undefined;
  try {
    return new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/** Last instant of the calendar day containing `at`, in `zone` (UTC when unknown). */
export function endOfLocalDay(at: number, zone?: string | null): number {
  const tz = validZone(zone) ?? 'UTC';
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const elapsed = ((get('hour') * 60 + get('minute')) * 60 + get('second')) * 1000;
  // Seconds into the local day, so the day's end is `DAY - elapsed` away. DST
  // days are 23/25h; that skews the boundary by at most an hour on two days a
  // year, which is fine for a "still on today" judgement.
  return at - elapsed - (at % 1000) + DAY - 1;
}

/**
 * When the event stops being worth showing as current. A row without an end
 * stays current for the rest of its start's local day, so a 20:00 party is
 * not "ended" at 20:01, and a date-only listing is not ended at midnight UTC
 * when its own city is still on that date.
 */
export function effectiveEnd(event: TimedEvent): number {
  const start = time(event.start_date);
  const end = time(event.end_date);
  if (!Number.isNaN(end)) return end;
  if (Number.isNaN(start)) return Number.NaN;
  return endOfLocalDay(start, event.timezone);
}

export function eventTiming(event: TimedEvent, now: number = Date.now()): EventTiming {
  const state = `${event.liveness_status ?? ''} ${event.status ?? ''}`.toLowerCase();
  if (state.includes('cancel')) return 'cancelled';
  const start = time(event.start_date);
  // A recorded end in the past is ended even when the start is malformed or
  // later than the end: the end date is the claim the reader acts on.
  const end0 = time(event.end_date);
  if (!Number.isNaN(end0) && end0 < now) return 'ended';
  if (Number.isNaN(start)) return 'upcoming';
  if (start > now) return 'upcoming';
  const end = effectiveEnd(event);
  return end >= now ? 'ongoing' : 'ended';
}

/** Started long ago and still listed as on: a standing schedule, not a dated event. */
export function isLongRunning(event: TimedEvent, now: number = Date.now()): boolean {
  const start = time(event.start_date);
  return (
    eventTiming(event, now) === 'ongoing' &&
    !Number.isNaN(start) &&
    now - start > LONG_RUNNING_DAYS * DAY
  );
}

/** The ISO bound below which a start counts as long-running at `now`. */
export function longRunningCutoff(now: number = Date.now()): string {
  return new Date(now - LONG_RUNNING_DAYS * DAY).toISOString();
}
