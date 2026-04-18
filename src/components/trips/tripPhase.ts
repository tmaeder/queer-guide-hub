import type { Trip } from '@/hooks/useTrips';

export type TripPhase = 'seed' | 'plan' | 'countdown' | 'live' | 'memory';

const COUNTDOWN_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parse a YYYY-MM-DD date string into UTC midnight. Returns null on invalid.
 * Trip dates are stored as date-only (no time component).
 */
function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function todayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Days from `now` (UTC date floor) to `target` (UTC date floor).
 * Positive = future, 0 = today, negative = past.
 */
export function daysFromToday(target: string | null | undefined, now: Date = new Date()): number | null {
  const t = parseDate(target);
  if (!t) return null;
  const diff = t.getTime() - todayUtc(now).getTime();
  return Math.round(diff / MS_PER_DAY);
}

/**
 * Compute lifecycle phase from trip status + dates.
 *
 * - memory:    end_date < today, or status archived/completed
 * - live:      start_date ≤ today ≤ end_date (or status === 'active')
 * - countdown: 0 < daysUntilStart ≤ 14
 * - seed:      no start_date set
 * - plan:      otherwise (dates set, > 14d out)
 *
 * Status takes precedence for archived/completed/active so users can manually
 * archive a trip whose dates haven't passed yet.
 */
export function getTripPhase(
  trip: Pick<Trip, 'status' | 'start_date' | 'end_date'>,
  now: Date = new Date(),
): TripPhase {
  if (trip.status === 'archived' || trip.status === 'completed') return 'memory';

  const daysToStart = daysFromToday(trip.start_date, now);
  const daysToEnd = daysFromToday(trip.end_date, now);

  if (daysToEnd !== null && daysToEnd < 0) return 'memory';
  if (trip.status === 'active') return 'live';
  if (daysToStart !== null && daysToStart <= 0 && (daysToEnd === null || daysToEnd >= 0)) return 'live';
  if (daysToStart !== null && daysToStart > 0 && daysToStart <= COUNTDOWN_DAYS) return 'countdown';
  if (daysToStart === null) return 'seed';
  return 'plan';
}

export function phaseLabel(phase: TripPhase): string {
  switch (phase) {
    case 'seed':
      return 'Inspiration';
    case 'plan':
      return 'Planning';
    case 'countdown':
      return 'Countdown';
    case 'live':
      return 'Live';
    case 'memory':
      return 'Memory';
  }
}

/**
 * Short status snippet for display alongside trip title in the context bar.
 * e.g. "in 5 days", "Day 2 of 7", "12 days ago".
 */
export function phaseStatusText(
  trip: Pick<Trip, 'status' | 'start_date' | 'end_date'>,
  now: Date = new Date(),
): string {
  const phase = getTripPhase(trip, now);
  const daysToStart = daysFromToday(trip.start_date, now);
  const daysToEnd = daysFromToday(trip.end_date, now);

  switch (phase) {
    case 'seed':
      return 'Dates not set';
    case 'plan':
      return daysToStart !== null ? `in ${daysToStart} days` : 'Planning';
    case 'countdown':
      if (daysToStart === 1) return 'Tomorrow';
      return daysToStart !== null ? `in ${daysToStart} days` : 'Soon';
    case 'live': {
      if (daysToStart === null) return 'Live';
      const tripLength = daysToEnd !== null ? Math.abs(daysToEnd - daysToStart) + 1 : null;
      const dayNum = Math.abs(daysToStart) + 1;
      return tripLength ? `Day ${dayNum} of ${tripLength}` : `Day ${dayNum}`;
    }
    case 'memory': {
      if (daysToEnd === null) return 'Past trip';
      const ago = Math.abs(daysToEnd);
      if (ago === 0) return 'Just ended';
      if (ago === 1) return 'Yesterday';
      return `${ago} days ago`;
    }
  }
}
