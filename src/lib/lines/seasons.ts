import { haversineKm, type Station } from './generateLine';

/**
 * Season windows for the line generator — and the reason a month pick can never
 * be a filter.
 *
 * The event corpus is a PRIDE-SEASON corpus. Measured on prod, upcoming events
 * per month from August 2026: 152, 98, 48, 23, 10, 4, 8, 1, 5, 2, then 58 the
 * following June. Narrowed to cities that are actually in the station pool, and
 * then to PAIRS of such cities within 600 km — which is what decides whether a
 * line is geometrically possible at all — it reads:
 *
 *   Aug 68 · Sep 28 · Oct 18 · Nov 6 · Dec 2 · Jan 0 · Feb 0 · Mar 0
 *   Apr 0 · May 0 · Jun 148 · Jul 34 · Aug 26 · Sep–Nov 0
 *
 * An events-gated line is impossible for eight of the next sixteen months. So a
 * month chip that filtered the pool would be a chip that lies: it would either
 * return nothing, or quietly stop filtering to save face.
 *
 * A season therefore does exactly two things:
 *
 *   1. sets the default start and end dates when the line becomes a trip;
 *   2. turns on a per-station "what's on" line, rendered ONLY where that
 *      station genuinely has an event in the window. Silence everywhere else,
 *      because silence is not a claim.
 *
 * `availability()` exists so the UI can say how thin a window is BEFORE the
 * reader clicks it, the way `useEventWindowCounts` does for /events. Counting
 * needs no query: `event_months` already rides along on every pool row.
 */

export type SeasonId = 'now' | 'autumn' | 'winter' | 'pride';

export interface SeasonWindow {
  id: SeasonId;
  /** `YYYY-MM` keys, matching `Station.eventMonths`. */
  months: string[];
  /** First day of the window, for trip dates. */
  start: Date;
}

/** Two pool cities further apart than this cannot be consecutive stops. */
const PAIR_RADIUS_KM = 600;

const key = (year: number, monthIndex0: number) =>
  `${year}-${String(monthIndex0 + 1).padStart(2, '0')}`;

/**
 * Build the four windows relative to `from`.
 *
 * `from` is injected rather than read from the clock so this stays pure and the
 * tests do not drift into failure as real time passes.
 *
 * Pride is deliberately "the next Jun–Aug that STARTS in the future", not "the
 * Jun–Aug we are standing in". Offering the current pride season as a plannable
 * window in mid-August means offering a season that is mostly over — the reader
 * would pick it, get two stations, and conclude the data is broken rather than
 * that they are late. The two-month "now" window already covers what is left of
 * it, and says so in its own name.
 */
export function seasonWindows(from: Date): SeasonWindow[] {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth(); // 0-indexed

  const rel = (offset: number) => {
    const d = new Date(Date.UTC(y, m + offset, 1));
    return { key: key(d.getUTCFullYear(), d.getUTCMonth()), date: d };
  };

  const now = [rel(0), rel(1)];

  // Sep–Nov of whichever year still has one ahead of us.
  const autumnYear = m <= 8 ? y : y + 1;
  const autumn = [8, 9, 10].map((mi) => ({ key: key(autumnYear, mi), date: new Date(Date.UTC(autumnYear, mi, 1)) }));

  // Dec of this year (or next, if December is behind us) plus the Jan–Feb after.
  const winterYear = m <= 11 ? y : y + 1;
  const winter = [
    { key: key(winterYear, 11), date: new Date(Date.UTC(winterYear, 11, 1)) },
    { key: key(winterYear + 1, 0), date: new Date(Date.UTC(winterYear + 1, 0, 1)) },
    { key: key(winterYear + 1, 1), date: new Date(Date.UTC(winterYear + 1, 1, 1)) },
  ];

  const prideYear = m < 5 ? y : y + 1;
  const pride = [5, 6, 7].map((mi) => ({ key: key(prideYear, mi), date: new Date(Date.UTC(prideYear, mi, 1)) }));

  const pack = (id: SeasonId, entries: { key: string; date: Date }[]): SeasonWindow => ({
    id,
    months: entries.map((e) => e.key),
    start: entries[0].date,
  });

  return [pack('now', now), pack('autumn', autumn), pack('winter', winter), pack('pride', pride)];
}

/** Does this station have anything on inside the window? */
export function stationHasEventIn(station: Station, window: SeasonWindow | null): boolean {
  if (!window) return false;
  return station.eventMonths.some((mk) => window.months.includes(mk));
}

export interface SeasonAvailability {
  /** Pool cities with at least one event in the window. */
  cities: number;
  /**
   * Pairs of those cities within 600 km of each other.
   *
   * This is the number that matters and the one a naive event count hides: a
   * window with twenty events spread over three continents has plenty of events
   * and cannot build a single line.
   */
  pairs: number;
}

export function availability(pool: Station[], window: SeasonWindow): SeasonAvailability {
  const hits = pool.filter((s) => stationHasEventIn(s, window));
  let pairs = 0;
  for (let i = 0; i < hits.length; i += 1) {
    for (let j = i + 1; j < hits.length; j += 1) {
      if (haversineKm(hits[i], hits[j]) <= PAIR_RADIUS_KM) pairs += 1;
    }
  }
  return { cities: hits.length, pairs };
}

/**
 * A window is offerable when it could plausibly carry a line.
 *
 * Three stops need at least two adjacent pairs. A window under that bar is
 * still SHOWN — with its real numbers — but not selectable, because the honest
 * thing to tell somebody about December is "we are thin here", not to let them
 * click it and infer that queer life stops for the winter.
 */
export const isOfferable = (a: SeasonAvailability): boolean => a.pairs >= 2;
