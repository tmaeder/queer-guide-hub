import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router';
import {
  resolveScrollAction,
  type NavSnapshot,
  type NavigationKind,
  type ScrollAction,
} from '@/lib/scrollBehavior';
import { getScrollPosition, setScrollPosition } from '@/lib/scrollPositions';

/**
 * Owns the scroll offset across client-side navigation.
 *
 * WHY THIS EXISTS: nothing did. `<BrowserRouter>` is not a data router, so
 * react-router contributes no scroll handling, and `history.pushState` leaves
 * the offset untouched — so following a link from halfway down a listing
 * opened the destination halfway down, and because destinations are usually
 * shorter than the page they were reached from, the browser clamped that to
 * the maximum and the reader landed on the footer. `scrollBehavior.ts` holds
 * the decision table and the measurements; this file only performs it.
 *
 * Three things here are load-bearing.
 *
 * 1. `history.scrollRestoration = 'manual'`. Chrome restores the offset itself
 *    on a same-document Back, and it does so BEFORE React has rendered the
 *    route's content — against a near-empty document, so the offset clamps to
 *    roughly zero and the restoration silently does nothing. Owning it means
 *    one implementation that can wait for the content instead of two that
 *    disagree.
 *
 * 2. Restoring and fragment-jumping SETTLE rather than fire once. Routes are
 *    lazy and their data is async, so at the moment of navigation the document
 *    is usually a skeleton: the saved offset is not reachable yet and the
 *    fragment's target does not exist yet. Both are retried on a short budget.
 *    Timers, not `requestAnimationFrame`, for the same reason `Rights.tsx`
 *    documents — rAF is paused in a background tab, and a link opened in a new
 *    tab is exactly how a deep link tends to arrive.
 *
 * 3. A settle is ABANDONED the moment the reader scrolls for themselves. The
 *    gesture events are the signal, not `scroll`, because our own programmatic
 *    scrolling raises `scroll` too and would cancel the very pass that set it
 *    — the same distinction `useActiveStation` draws for its pin.
 *
 * All scrolling here is instant. Navigation is not a place for smooth
 * scrolling (it animates past content the reader never asked to see), so
 * `prefers-reduced-motion` needs no special case: there is no motion.
 */

/**
 * Settle rhythm. Four attempts 100ms apart is the same cadence
 * `scrollSettle.ts` and the `/rights` fragment effect already use for the
 * in-page case, and it is what the header collapse needs: the bar drops to its
 * compact height on the first scroll and moves the target ~64px, so a single
 * jump lands short. The budget is how long to keep waiting for a lazy route's
 * content to exist at all before giving up.
 */
const SETTLE_BUDGET_MS = 2000;
const SETTLE_STEP_MS = 100;
/** Consecutive on-target ticks before a settle is considered finished. */
const SETTLE_CONFIRMATIONS = 4;
/** sessionStorage writes while the reader scrolls. */
const SAVE_THROTTLE_MS = 250;

/**
 * The element that actually scrolls. The public site scrolls the window;
 * `AdminShell` renders its own `overflow-auto` main and is marked with
 * `data-scroll-container`, where the window never scrolls at all.
 *
 * Resolved per call rather than cached: during a navigation into or out of
 * admin the container mounts or unmounts mid-settle.
 */
function getScroller(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>('[data-scroll-container]');
}

/**
 * Whether a `scroll` event came from the surface that scrolls the PAGE.
 *
 * The listener below is registered in the capture phase on `document`, which
 * is the only way to hear the admin console's inner container — but that also
 * means it hears every horizontally-scrolling card rail, every dropdown, the
 * map, and the message list. Those are not the page moving, and recording an
 * offset for them is both wrong and needless work on the scroll path.
 *
 * Window scrolling reports `document` as the target; an element reports
 * itself.
 */
function isPageScroller(target: EventTarget | null): boolean {
  if (!target) return false;
  if (target === document || target === document.documentElement || target === document.body) {
    return true;
  }
  return target instanceof Element && target.hasAttribute('data-scroll-container');
}

/** The offset of a surface `isPageScroller` has already accepted. */
function topOfScroller(target: EventTarget | null): number {
  return target instanceof Element && target.hasAttribute('data-scroll-container')
    ? target.scrollTop
    : window.scrollY;
}

function readTop(): number {
  const el = getScroller();
  if (el) return el.scrollTop;
  return typeof window === 'undefined' ? 0 : window.scrollY;
}

function writeTop(top: number): void {
  const el = getScroller();
  if (el) {
    el.scrollTop = top;
    return;
  }
  window.scrollTo(0, top);
}

export const ScrollManager = () => {
  const location = useLocation();
  const navigationType = useNavigationType() as NavigationKind;

  const previousRef = useRef<NavSnapshot | null>(null);
  const previousKeyRef = useRef<string | null>(null);
  /** The live offset, updated unthrottled so it is accurate at navigation time. */
  const liveTopRef = useRef(0);
  const cancelSettleRef = useRef<(() => void) | null>(null);

  // Take ownership before the browser's own restoration can run.
  useLayoutEffect(() => {
    if (typeof window === 'undefined' || !('scrollRestoration' in window.history)) return;
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  // Record where the reader is, continuously.
  //
  // Capture phase on `document`, not a `window` scroll listener: scroll events
  // do not bubble, so a listener on `window` never hears the admin console's
  // inner scroll container. Capture hears every one of them.
  useEffect(() => {
    let throttle = 0;
    const onScroll = (event: Event) => {
      // Read from the event's own target rather than re-resolving the
      // scroller: this runs on every frame of every scroll gesture, and a
      // `document.querySelector` there is exactly the kind of unthrottled
      // scroll-path work `useActiveStation` documents having had to remove.
      if (!isPageScroller(event.target)) return;
      liveTopRef.current = topOfScroller(event.target);
      if (throttle) return;
      throttle = window.setTimeout(() => {
        throttle = 0;
        if (previousKeyRef.current) setScrollPosition(previousKeyRef.current, liveTopRef.current);
      }, SAVE_THROTTLE_MS);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      if (throttle) window.clearTimeout(throttle);
    };
  }, []);

  useLayoutEffect(() => {
    // The offset the entry we are leaving was left at. Read from the ref, not
    // from the DOM: React has already committed the incoming route by the time
    // a layout effect runs, so the document may be a short skeleton and the
    // live offset already clamped to something the reader never chose.
    if (previousKeyRef.current) {
      setScrollPosition(previousKeyRef.current, liveTopRef.current);
    }

    const next: NavSnapshot = {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    };
    const action = resolveScrollAction(
      previousRef.current,
      next,
      navigationType,
      getScrollPosition(location.key),
    );

    previousRef.current = next;
    previousKeyRef.current = location.key;

    cancelSettleRef.current?.();
    cancelSettleRef.current = perform(action);

    // Re-seed the live offset from the DOM, because a scroll event is not
    // guaranteed to follow. If the incoming route's skeleton has already
    // clamped the offset to 0, `writeTop(0)` is a no-op and fires nothing, so
    // the ref would still hold the offset of the page we just LEFT — and the
    // next navigation would file that against this entry, so a later Back
    // would faithfully "restore" the reader to the bottom of a page they had
    // never scrolled. That is the original defect, re-entering through the
    // restore path.
    liveTopRef.current = readTop();

    return () => {
      cancelSettleRef.current?.();
      cancelSettleRef.current = null;
    };
    // location.key changes on every navigation, including one that only
    // rewrites the query string — the decision above is what filters those out.
  }, [location.key, location.pathname, location.search, location.hash, navigationType]);

  return null;
};

/**
 * Carry out one action. Returns a canceller for the settle it may have started.
 */
function perform(action: ScrollAction): (() => void) | null {
  if (action.kind === 'keep') return null;

  if (action.kind === 'top') {
    // Zero is reachable in every document state, so this needs no settle —
    // and adding one would fight any page that legitimately scrolls itself on
    // mount.
    writeTop(0);
    return null;
  }

  let elapsed = 0;
  let confirmations = 0;
  let timer = 0;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer) window.clearInterval(timer);
    timer = 0;
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchmove', stop);
    window.removeEventListener('keydown', stop);
  };

  const tick = () => {
    elapsed += SETTLE_STEP_MS;
    let onTarget = false;

    if (action.kind === 'restore') {
      writeTop(action.top);
      onTarget = Math.abs(readTop() - action.top) <= 2;
    } else {
      const el = document.getElementById(action.id);
      if (el) {
        // `scrollIntoView`, not an offset write: it works for the window and
        // for the admin console's inner container alike, and it honours the
        // `scroll-padding-top` that `index.css` sets on <html> so the target
        // clears the sticky header island instead of landing under it.
        el.scrollIntoView({ block: 'start' });
        onTarget = true;
      }
    }

    // Several confirmations, not one: the header collapses to its compact
    // height on the first scroll and moves the target under it, which is the
    // ~64px correction `useActiveStation` and `scrollSettle` both document.
    confirmations = onTarget ? confirmations + 1 : 0;
    if (confirmations >= SETTLE_CONFIRMATIONS || elapsed >= SETTLE_BUDGET_MS) stop();
  };

  // Gestures only — a programmatic scroll raises `scroll`, so listening for
  // that would cancel the settle on its own first write.
  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchmove', stop, { passive: true });
  window.addEventListener('keydown', stop);

  tick(); // Immediately; the interval alone would wait a beat.
  if (!stopped) timer = window.setInterval(tick, SETTLE_STEP_MS);
  return stop;
}
