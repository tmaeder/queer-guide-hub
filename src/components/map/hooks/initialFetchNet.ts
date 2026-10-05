/**
 * The initial-viewport-fetch safety net.
 *
 * When an auto-fly is coming, the fly's `moveend` does the first real fetch, so
 * the net exists only for the case where that `moveend` never arrives — the fly
 * never fired, `flyTo` was a no-op, or the camera came from the URL and nothing
 * moved. A stranded empty map is far worse than one duplicate fetch.
 *
 * IT RE-ARMS RATHER THAN BAILING, AND THAT IS THE WHOLE POINT.
 *
 * It used to `return` when the map was mid-fly, on the reasoning that the fly's
 * own `moveend` would cover it. That is correct only if a `moveend` is
 * guaranteed to follow, and it is not. Measured on prod: with a camera supplied
 * in the URL and a fly in the air at t=3000 ms, the net bailed, its one-shot
 * timer was spent, no `moveend` arrived, `onViewportChange` was never called,
 * `usePointLayers` saw zero features and took its defer-creation branch, and
 * `points-source` was never added at all. `heatmap-source` WAS present on the
 * same map, because that hook calls `addSource` unconditionally — which is
 * exactly why the two disagree, and the asymmetry is what identified this.
 *
 * A one-shot net that a transient condition can consume is not a net.
 *
 * Extracted from the hook so this is testable: inline in a `map.on('load')`
 * callback it could only ever be exercised by an end-to-end run, which is how
 * it went unguarded in the first place.
 */
export interface InitialFetchNetOptions {
  /** Has a viewport fetch already happened? If so the net stands down. */
  didFetch: () => boolean;
  /** Is the camera currently animating? While true, wait — never give up. */
  isMoving: () => boolean;
  /** Perform the fetch. Called at most once by the net. */
  fetchNow: () => void;
  /**
   * Record the live timer so teardown can clear it. Called on every re-arm, so
   * the ref always holds the pending timer rather than a spent one.
   */
  setTimer: (id: ReturnType<typeof setTimeout>) => void;
  /** Just past the 2.5 s Berlin geo fallback. */
  firstDelay?: number;
  /** How long to wait before re-checking a map that is still moving. */
  retryDelay?: number;
}

export function armInitialFetchNet(opts: InitialFetchNetOptions): void {
  const { didFetch, isMoving, fetchNow, setTimer } = opts;
  const retryDelay = opts.retryDelay ?? 1000;

  const arm = (delay: number) => {
    setTimer(
      setTimeout(() => {
        if (didFetch()) return;
        // Firing mid-fly would cause the exact double fetch the deferral exists
        // to remove, so wait for it to settle — but keep waiting.
        if (isMoving()) {
          arm(retryDelay);
          return;
        }
        fetchNow();
      }, delay),
    );
  };

  arm(opts.firstDelay ?? 3000);
}
