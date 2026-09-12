/**
 * Ordering for the upcoming events feed.
 *
 * WHY THIS EXISTS. The feed is ordered `is_featured DESC, start_date ASC`, which
 * was correct only while the query excluded anything already started. Once an
 * in-progress event is admitted — a four-day festival on its second day is the
 * most actionable row on the page, so it must be — `start_date ASC` ranks it by
 * how long ago it *began*. Measured on prod 2026-09-12: `BLOWN AWAY`, a 126-day
 * installation 119 days in, sorted above Sarajevo Pride and Belgrade Pride,
 * both of which were happening that day.
 *
 * The reader's question is "what can I still catch", so an in-progress event is
 * ranked by when it ENDS, soonest first. A future event keeps start_date.
 *
 * SCOPE — THIS REORDERS WITHIN A PAGE, IT DOES NOT PROMOTE ACROSS PAGES. The
 * SQL sorts `is_featured DESC` first, and measured on prod 2026-09-12 there are
 * 62 featured upcoming events of which **none** are in progress, so on the
 * unfiltered feed the 7 in-progress rows land on page 3 and this function has
 * nothing to do on page 1. An earlier draft of this comment claimed they arrive
 * at the head of page 1; that was wrong, and it was wrong because `is_featured`
 * outranks the date, not because of anything about dates.
 *
 * Where it earns its place is the filtered feed — a city or type filter cuts the
 * featured block away, in-progress rows reach page 1, and their relative order
 * is then what the reader sees. Any city / type / tag / sort filter forces the
 * client query path, so that is the common case, not the rare one.
 *
 * Surfacing "happening now" ABOVE the featured block is a separate product
 * decision about what `is_featured` outranks, and is deliberately not taken
 * here.
 */

export interface OrderableEvent {
  start_date: string;
  end_date?: string | null;
  is_featured?: boolean | null;
}

function ms(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? Number.NaN : t;
}

/** Is `event` running at `now` — started, and not yet ended? */
export function isInProgress(event: OrderableEvent, now: number): boolean {
  const start = ms(event.start_date);
  if (Number.isNaN(start) || start > now) return false;
  const end = ms(event.end_date);
  // No end date means a point event: it is in progress only on the instant it
  // starts, which is not a state worth modelling. Treat it as not in progress
  // rather than as running forever — 22,840 events have no end_date, and
  // hoisting all of the past ones would empty the feed of anything upcoming.
  if (Number.isNaN(end)) return false;
  return end >= now;
}

/**
 * Stable reorder of one page of upcoming events.
 *
 * Preserves the existing featured-first contract, then hoists what is happening
 * now, then ranks: in-progress by soonest end, future by soonest start.
 *
 * Only for the default ascending feed. `date-desc`, `recent` and `distance`
 * order by something else entirely and must be left alone.
 */
export function orderUpcoming<T extends OrderableEvent>(events: readonly T[], now: number): T[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const af = a.event.is_featured ? 1 : 0;
      const bf = b.event.is_featured ? 1 : 0;
      if (af !== bf) return bf - af;

      const ap = isInProgress(a.event, now);
      const bp = isInProgress(b.event, now);
      if (ap !== bp) return ap ? -1 : 1;

      const aKey = ap ? ms(a.event.end_date) : ms(a.event.start_date);
      const bKey = bp ? ms(b.event.end_date) : ms(b.event.start_date);
      // A row with an unparseable date keeps its server position rather than
      // being flung to one end by NaN comparisons, which always return false.
      if (Number.isNaN(aKey) || Number.isNaN(bKey)) return a.index - b.index;
      if (aKey !== bKey) return aKey - bKey;

      return a.index - b.index;
    })
    .map((entry) => entry.event);
}
