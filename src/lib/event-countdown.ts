/**
 * Live-state for an event detail page: a single line under the hero title that
 * tells the user where the event sits in time — counting down, happening now,
 * or ended. Pure + unit-tested; the ticking UI lives in EventDetail.parts.
 */

export type EventLiveState =
  | { kind: 'upcoming'; label: string; soon: boolean }
  | { kind: 'live'; label: string }
  | { kind: 'ended'; label: string };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/** Humanize a positive ms gap into the largest natural unit. */
export function humanizeGap(ms: number): string {
  if (ms < MINUTE) return 'less than a minute';
  if (ms < HOUR) return plural(Math.round(ms / MINUTE), 'minute');
  if (ms < DAY) return plural(Math.round(ms / HOUR), 'hour');
  return plural(Math.round(ms / DAY), 'day');
}

/**
 * Resolve the event's live state at `now`. `soon` (< 24h out) lets the UI
 * tick every second; anything further out updates lazily.
 */
export function getEventLiveState(
  startDate: string,
  endDate: string | null | undefined,
  now: number = Date.now(),
): EventLiveState {
  const start = Date.parse(startDate);
  if (!Number.isFinite(start)) return { kind: 'upcoming', label: '', soon: false };
  const end = endDate ? Date.parse(endDate) : NaN;
  const effectiveEnd = Number.isFinite(end) ? end : start + 3 * HOUR;

  if (now >= start && now <= effectiveEnd) return { kind: 'live', label: 'Happening now' };
  if (now > effectiveEnd) return { kind: 'ended', label: 'Ended' };

  const gap = start - now;
  return { kind: 'upcoming', label: `Starts in ${humanizeGap(gap)}`, soon: gap < DAY };
}
