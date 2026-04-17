/**
 * Cluster orphan reservations into "looks like one trip" suggestions.
 *
 * Heuristic, intentionally simple — runs client-side on the user's own data.
 * Two reservations belong to the same suggestion when:
 *   - their date ranges overlap OR are within `maxGapDays` of each other
 *   - they share at least one city/country, OR neither has location info
 *     (we don't want to merge unrelated city stays).
 *
 * Single-reservation clusters are dropped — those are just orphan items
 * shown individually in the inbox; suggestions are for multi-item trips.
 */

import type { Reservation } from '@/hooks/useReservations';

export interface TripSuggestion {
  /** Stable id derived from the member ids — same set produces same id. */
  id: string;
  reservations: Reservation[];
  start_at: string;
  end_at: string;
  /** Most common city_id across members, if any agree. */
  city_id: string | null;
  country_id: string | null;
  /** Total amount across members in mixed currencies — we just sum same-currency. */
  total_amount: number | null;
  currency: string | null;
}

interface GroupingOptions {
  /** Days of gap between two reservations that still counts as same trip. */
  maxGapDays?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const dateOf = (s: string | null): Date | null => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const overlapOrAdjacent = (
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
  maxGapDays: number,
): boolean => {
  const gap = maxGapDays * DAY_MS;
  return aStart.getTime() - gap <= bEnd.getTime() && bStart.getTime() - gap <= aEnd.getTime();
};

const sameLocation = (a: Reservation, b: Reservation): boolean => {
  // Either both unknown (allow grouping) or they share a city / country.
  const aHasLoc = !!(a.city_id || a.country_id);
  const bHasLoc = !!(b.city_id || b.country_id);
  if (!aHasLoc || !bHasLoc) return true;
  if (a.city_id && b.city_id && a.city_id === b.city_id) return true;
  if (a.country_id && b.country_id && a.country_id === b.country_id) return true;
  return false;
};

const mostCommon = <T,>(values: (T | null)[]): T | null => {
  const counts = new Map<T, number>();
  let best: T | null = null;
  let bestCount = 0;
  for (const v of values) {
    if (v == null) continue;
    const c = (counts.get(v) ?? 0) + 1;
    counts.set(v, c);
    if (c > bestCount) {
      bestCount = c;
      best = v;
    }
  }
  return best;
};

/** Union-find over reservation indices. */
class DSU {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]];
      i = this.parent[i];
    }
    return i;
  }
  union(i: number, j: number) {
    const ri = this.find(i);
    const rj = this.find(j);
    if (ri !== rj) this.parent[ri] = rj;
  }
}

export function suggestTripGroupings(
  reservations: Reservation[],
  { maxGapDays = 1 }: GroupingOptions = {},
): TripSuggestion[] {
  // Only group reservations with at least one usable date.
  const dated = reservations
    .map((r) => {
      const start = dateOf(r.start_at) ?? dateOf(r.end_at);
      const end = dateOf(r.end_at) ?? dateOf(r.start_at);
      return start && end ? { r, start, end } : null;
    })
    .filter((x): x is { r: Reservation; start: Date; end: Date } => !!x);

  if (dated.length < 2) return [];

  const dsu = new DSU(dated.length);
  for (let i = 0; i < dated.length; i++) {
    for (let j = i + 1; j < dated.length; j++) {
      if (
        overlapOrAdjacent(dated[i].start, dated[i].end, dated[j].start, dated[j].end, maxGapDays) &&
        sameLocation(dated[i].r, dated[j].r)
      ) {
        dsu.union(i, j);
      }
    }
  }

  const buckets = new Map<number, typeof dated>();
  dated.forEach((entry, i) => {
    const root = dsu.find(i);
    const arr = buckets.get(root) ?? [];
    arr.push(entry);
    buckets.set(root, arr);
  });

  const suggestions: TripSuggestion[] = [];
  for (const members of buckets.values()) {
    if (members.length < 2) continue;

    members.sort((a, b) => a.start.getTime() - b.start.getTime());
    const start = members[0].start.toISOString();
    const end = new Date(
      Math.max(...members.map((m) => m.end.getTime())),
    ).toISOString();

    const city_id = mostCommon(members.map((m) => m.r.city_id));
    const country_id = mostCommon(members.map((m) => m.r.country_id));

    // Sum amounts only when all members share a currency.
    const currencies = new Set(members.map((m) => m.r.currency).filter(Boolean));
    const currency = currencies.size === 1 ? (members[0].r.currency ?? null) : null;
    const total_amount = currency
      ? members.reduce((sum, m) => sum + (m.r.total_amount ?? 0), 0) || null
      : null;

    const id = members
      .map((m) => m.r.key)
      .sort()
      .join('|');

    suggestions.push({
      id,
      reservations: members.map((m) => m.r),
      start_at: start,
      end_at: end,
      city_id,
      country_id,
      total_amount,
      currency,
    });
  }

  // Earliest suggestion first.
  suggestions.sort((a, b) => a.start_at.localeCompare(b.start_at));
  return suggestions;
}
