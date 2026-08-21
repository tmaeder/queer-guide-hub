import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TrackLoader } from './TrackLoader';

/** How far below the fold the sentinel may sit and still count as reached. */
const NEAR_PX = 300;

export interface LoadMoreProps {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void | Promise<unknown>;
  /**
   * How many times the sentinel may fire ITSELF before the reader has to ask.
   * `0` disables auto-loading entirely — the button is then the only trigger.
   *
   * Counted in loads, not items. The two pages that had a cap expressed it in
   * items against a page size of 24 and picked different numbers (50 and 48),
   * which is not a decision anyone made: 50 buys a silent THIRD auto-load
   * (24 → 48 → 72, clamped) where 48 stops after the second. Two is the
   * documented value now.
   */
  autoLoadLimit?: number;
  /**
   * Change this when the list itself changes — a new filter set, a new query.
   * The auto-load budget re-arms, because the reader is looking at a new list
   * and has not scrolled through anything yet.
   */
  resetKey?: string | number;
  /** Overrides "Load more" — for a surface that can say how much is left. */
  label?: string;
  className?: string;
}

/**
 * "Load more", as a sentinel plus a button.
 *
 * Promoted from `search/LoadMoreSentinel`, which was the only one of five
 * implementations that was correct. The other four:
 *
 * | Surface | Shape |
 * |---|---|
 * | `/search` | IO + latch + disconnect. Correct, no cap. |
 * | `/venues` | IO, async callback, **no latch**, cap 50 items |
 * | `/personalities` | IO, async callback, **no latch**, cap 48 items |
 * | `/events` | **no observer at all**, button gated on a dead counter |
 * | `/marketplace` | manual button only |
 *
 * **The latch is the whole point, and two pages did not have it.** Their async
 * callbacks `await` a fetch before React has re-rendered with `loading = true`,
 * and an IntersectionObserver keeps delivering entries until disconnected — so
 * every tick in that window re-entered, read the same `page` from the same stale
 * closure, and called `setPage(page + 1)` again. Guarding on `!loading` cannot
 * fix that; only latching can.
 *
 * **`autoLoadLimit` is not a nicety — it is what makes the latch safe to have.**
 * The observer re-arms when `loading` settles, and on a VIRTUALIZED grid that
 * instant can be an unmeasured frame: the virtualizer has not sized its rows,
 * so the sentinel sits under a collapsed container, trivially inside the margin.
 * Unbounded, the list then walks itself forward — /personalities reached page 3
 * before the reader had touched anything. The old code hid that because its
 * double-fire re-read the same stale `page`, so two ticks produced one net
 * advance; fixing the latch is precisely what made a bound necessary. Both land
 * together.
 *
 * A surface that must not move under the reader passes `autoLoadLimit={0}` and
 * keeps the button as its only trigger.
 *
 * The button is not a fallback for the sentinel — it is the primary control for
 * anyone using a keyboard, and it stays rendered and reachable whether or not
 * the sentinel ever fires.
 */
export function LoadMore({
  hasMore,
  loading,
  onLoadMore,
  autoLoadLimit = 2,
  resetKey,
  label,
  className,
}: LoadMoreProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const autoLoads = useRef(0);

  // Held in a ref, NOT an effect dependency. Callers pass inline arrows, so a
  // dependency rebuilds the observer on every render — which is how the
  // component this replaces auto-loaded at all, and equally why it could never
  // have been given a budget: each rebuild resets the latch.
  const onLoadMoreRef = useRef(onLoadMore);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  });

  // A new list is a new budget, and a new chance to fill the first screen.
  useEffect(() => {
    autoLoads.current = 0;
  }, [resetKey]);

  useEffect(() => {
    if (autoLoadLimit === 0) return;
    if (!hasMore || loading) return;
    if (autoLoads.current >= autoLoadLimit) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;

    // Disconnect on the first intersecting entry, BEFORE handing control to a
    // caller that will await. This is the latch, and it is the whole reason the
    // component exists: without it the entries that keep arriving during the
    // fetch re-enter, read the same stale `page`, and skip one.
    //
    // Re-arming happens by the effect re-running when `loading` settles, which
    // is what makes a second auto-load possible at all. `autoLoadLimit` is what
    // bounds it — without a bound this re-arms into whatever the layout looks
    // like at that instant, and on a virtualized grid that is an unmeasured
    // frame where the sentinel sits under a collapsed container.
    let fired = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (fired) return;
        if (entries.some((e) => e.isIntersecting)) {
          fired = true;
          io.disconnect();
          autoLoads.current += 1;
          void onLoadMoreRef.current();
        }
      },
      { rootMargin: `${NEAR_PX}px 0px` },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, loading, autoLoadLimit, resetKey]);

  if (!hasMore) return null;

  return (
    <div ref={ref} className={cn('mt-8 mb-4 flex min-h-12 items-center justify-center', className)}>
      <Button variant="outline" onClick={() => void onLoadMoreRef.current()} disabled={loading}>
        {loading ? (
          <>
            <TrackLoader size={14} className="mr-2" />
            {t('common.loading', 'Loading…')}
          </>
        ) : (
          (label ?? t('common.loadMore', 'Load more'))
        )}
      </Button>
    </div>
  );
}
