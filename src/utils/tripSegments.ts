/**
 * Walk a trip's chronological timeline and emit per-leg "segments" —
 * each one a contiguous run in a single country. This is what powers
 * the per-leg LGBTQ+ safety briefing: instead of just "your trip
 * covers Germany + Turkey", it shows "Day 1-3 Germany → Day 4-6 Turkey
 * (flag), back to Germany Day 7".
 *
 * Inputs are minimally typed shapes so the util can be tested without
 * pulling in the full TripWithDetails / Reservation types.
 *
 * Algorithm:
 *   1. Build a flat list of "stops" from trip_places + reservations,
 *      each tagged with a date + country_id.
 *   2. Sort chronologically.
 *   3. Collapse adjacent stops with the same country_id into one
 *      segment with [start, end] dates.
 */

export interface SegmentInputPlace {
  trip_id?: string;
  day_id: string | null;
  country_id: string | null;
  start_time: string | null;
  sort_order: number;
}

export interface SegmentInputDay {
  id: string;
  date: string;
}

export interface SegmentInputReservation {
  trip_id: string | null;
  country_id: string | null;
  type: string;
  start_at: string | null;
  end_at: string | null;
}

export interface TripSegment {
  country_id: string;
  /** ISO date (YYYY-MM-DD) — earliest stop in this segment. */
  start_date: string;
  /** ISO date — latest stop in this segment. */
  end_date: string;
  /** How many distinct stops contributed to this segment. */
  stop_count: number;
}

/** Internal: flatten input rows into chronologically sortable stops. */
interface Stop {
  country_id: string;
  /** Used purely for ordering; ISO timestamp string. */
  when: string;
  /** ISO date YYYY-MM-DD that ends up in `start_date` / `end_date`. */
  day: string;
}

const dayFromISO = (iso: string): string => iso.slice(0, 10);

export function computeTripSegments(
  places: SegmentInputPlace[],
  days: SegmentInputDay[],
  reservations: SegmentInputReservation[],
): TripSegment[] {
  const dayDate = new Map<string, string>();
  for (const d of days) dayDate.set(d.id, d.date);

  const stops: Stop[] = [];

  // Places — anchored to their trip_day (and ordered within the day by
  // sort_order). Falls back to start_time if available.
  for (const p of places) {
    if (!p.country_id) continue;
    const date =
      (p.day_id && dayDate.get(p.day_id)) || (p.start_time ? dayFromISO(p.start_time) : null);
    if (!date) continue;
    // Encode sort_order into the timestamp so within-day ordering is stable.
    const when = p.start_time ?? `${date}T00:${String(p.sort_order % 1000).padStart(3, '0')}:00Z`;
    stops.push({ country_id: p.country_id, day: date, when });
  }

  // Reservations — anchored to start_at (or end_at, or as a no-date stop).
  // No-date reservations don't appear in the timeline (we'd just be guessing).
  for (const r of reservations) {
    if (!r.country_id) continue;
    const when = r.start_at ?? r.end_at;
    if (!when) continue;
    stops.push({ country_id: r.country_id, day: dayFromISO(when), when });
  }

  if (stops.length === 0) return [];

  stops.sort((a, b) => a.when.localeCompare(b.when));

  // Collapse runs.
  const segments: TripSegment[] = [];
  let cur: TripSegment | null = null;
  for (const s of stops) {
    if (cur && cur.country_id === s.country_id) {
      cur.end_date = s.day > cur.end_date ? s.day : cur.end_date;
      cur.start_date = s.day < cur.start_date ? s.day : cur.start_date;
      cur.stop_count += 1;
    } else {
      if (cur) segments.push(cur);
      cur = {
        country_id: s.country_id,
        start_date: s.day,
        end_date: s.day,
        stop_count: 1,
      };
    }
  }
  if (cur) segments.push(cur);

  return segments;
}

/**
 * The "active" segment given a timestamp — used by the day-of-travel
 * mode to decide whether to surface a "you're in a restrictive country
 * today" sticky alert.
 */
export function findActiveSegment(
  segments: TripSegment[],
  now: Date = new Date(),
): TripSegment | null {
  const today = now.toISOString().slice(0, 10);
  return segments.find((s) => today >= s.start_date && today <= s.end_date) ?? null;
}
