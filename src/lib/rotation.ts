/**
 * Deterministic content rotation.
 *
 * The homepage used to render the same news lead and the same eight products
 * all day, so a visitor returning in the afternoon saw a byte-identical page.
 *
 * The rule this module encodes: **rotate by selecting a window from an
 * already-cached superset, never by adding a varying parameter to the
 * request.** A seed in a request body fragments the search worker's edge-cache
 * key (built from types/city/limit) and PostgREST's response reuse, costing
 * round-trips to buy nothing a client-side window cannot do for free.
 *
 * Everything here is a pure function of the clock. `Math.random()` is
 * deliberately absent: it would break hydration, make snapshots
 * unreproducible, and make "did rotation regress?" untestable.
 */

/**
 * A stable integer that advances every `hours`.
 *
 * Callers should read this ONCE on mount (`useState(() => timeBucket())`), not
 * per render — otherwise a background refetch (useNewsFront polls every five
 * minutes) could reorder the page under someone mid-read.
 */
export function timeBucket(now: number = Date.now(), hours = 6): number {
  const ms = Math.max(1, hours) * 60 * 60 * 1000;
  return Math.floor(now / ms);
}

/**
 * A circular window of `take` items starting at `bucket`, with the first
 * `pinFirst` items held in place.
 *
 * Pinning exists for editorial: an editors' pick that rotates out of the lead
 * defeats the point of flagging it. Everything after the pinned head cycles.
 *
 * Deterministic by construction — the same `(items, take, bucket, pinFirst)`
 * always yields the same output, which is what makes the "same bucket renders
 * identically" assertion in the tests a real guard against someone
 * reintroducing randomness.
 */
export function rotateWindow<T>(items: T[], take: number, bucket: number, pinFirst = 0): T[] {
  if (items.length === 0 || take <= 0) return [];
  if (items.length <= take) return items.slice(0, take);

  const pinned = items.slice(0, Math.min(pinFirst, take));
  const pool = items.slice(pinned.length);
  const want = take - pinned.length;
  if (want <= 0 || pool.length === 0) return pinned;

  // Advance by a PAGE, not by one. A stride of 1 shifts the window a single
  // item per bucket, so consecutive buckets shared four of five stories and
  // "it changes every six hours" was technically true and practically
  // invisible. Striding by `want` gives each bucket a disjoint set until the
  // pool wraps, which is what "the page changed" actually looks like.
  const start = (((bucket * want) % pool.length) + pool.length) % pool.length;
  const rotated: T[] = [];
  for (let i = 0; i < Math.min(want, pool.length); i++) {
    rotated.push(pool[(start + i) % pool.length]);
  }
  return [...pinned, ...rotated];
}
