/**
 * Date-overlap helpers for surfacing entities that fall within an active trip.
 *
 * Used by event/festival cards in lists to show a "Happens during your trip"
 * badge when the entity's date range intersects the active trip's range.
 */

export interface DateRange {
  start_date?: string | null;
  end_date?: string | null;
}

/**
 * Returns true if the two ranges overlap (inclusive). A range with no end_date
 * is treated as a single-day event on start_date. Returns false when either
 * range lacks a start_date.
 */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  if (!a.start_date || !b.start_date) return false;
  const aStart = a.start_date;
  const aEnd = a.end_date ?? a.start_date;
  const bStart = b.start_date;
  const bEnd = b.end_date ?? b.start_date;
  // ISO strings sort lexicographically — no Date construction needed.
  return aStart <= bEnd && bStart <= aEnd;
}
