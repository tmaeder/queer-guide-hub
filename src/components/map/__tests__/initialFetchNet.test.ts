import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { armInitialFetchNet } from '@/components/map/hooks/initialFetchNet';

/**
 * The net's whole job is to fire when `moveend` never does, so every case here
 * is about the path where no fetch has happened yet. The defect it was written
 * for is the one in `re-arms while the camera is still moving`: a net that
 * bails on a transient condition is spent, and the map is empty forever.
 */

function harness(over: Partial<{ moving: boolean[]; didFetch: boolean }> = {}) {
  // `moving` is read once per net tick, so a queue lets a test say "still
  // moving at 3 s, settled at 4 s" — which is exactly the live sequence.
  const movingQueue = [...(over.moving ?? [false])];
  let didFetch = over.didFetch ?? false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const fetchNow = vi.fn(() => {
    didFetch = true;
  });
  const isMoving = vi.fn(() => (movingQueue.length > 1 ? movingQueue.shift()! : movingQueue[0]));

  armInitialFetchNet({
    didFetch: () => didFetch,
    isMoving,
    fetchNow,
    setTimer: (id) => timers.push(id),
  });

  return { fetchNow, isMoving, timers, setDidFetch: (v: boolean) => (didFetch = v) };
}

describe('the initial-fetch safety net', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires once at 3 s when the camera is already settled', () => {
    const h = harness({ moving: [false] });
    vi.advanceTimersByTime(2999);
    expect(h.fetchNow, 'fired before the 2.5 s geo fallback could resolve').not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(h.fetchNow).toHaveBeenCalledTimes(1);
  });

  it('re-arms while the camera is still moving, and fires once it settles', () => {
    /**
     * THE REGRESSION. The old net did `if (isMoving()) return;` — so at 3 s,
     * mid-fly, it gave up and its one-shot timer was spent. If the fly's
     * `moveend` then never arrived (measured on prod with a URL-supplied
     * camera), no fetch ever happened and `points-source` was never created.
     */
    const h = harness({ moving: [true, false] });
    vi.advanceTimersByTime(3000);
    expect(
      h.fetchNow,
      'fired mid-fly — that is the double fetch the deferral removes',
    ).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(
      h.fetchNow,
      'the net bailed instead of re-arming: the map stays empty forever',
    ).toHaveBeenCalledTimes(1);
  });

  it('keeps waiting across several moving ticks rather than giving up', () => {
    const h = harness({ moving: [true, true, true, false] });
    vi.advanceTimersByTime(3000 + 1000 + 1000);
    expect(h.fetchNow).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(h.fetchNow).toHaveBeenCalledTimes(1);
  });

  it('stands down when a real moveend already fetched', () => {
    const h = harness({ moving: [false] });
    h.setDidFetch(true);
    vi.advanceTimersByTime(60_000);
    expect(
      h.fetchNow,
      'duplicated the fetch a real moveend had already done',
    ).not.toHaveBeenCalled();
  });

  it('fetches at most once even if timers keep running', () => {
    const h = harness({ moving: [false] });
    vi.advanceTimersByTime(60_000);
    expect(h.fetchNow).toHaveBeenCalledTimes(1);
  });

  it('hands every re-armed timer to setTimer, so teardown clears the live one', () => {
    // A ref holding a SPENT timer is why the old shape leaked a pending
    // callback past unmount in the re-arm case.
    const h = harness({ moving: [true, false] });
    vi.advanceTimersByTime(3000);
    expect(h.timers.length, 'the re-armed timer was never reported for teardown').toBe(2);
  });
});
