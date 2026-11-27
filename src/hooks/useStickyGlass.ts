import { useEffect } from 'react';

/** Class a sticky bar carries to opt in. Styled in src/index.css. */
export const STICKY_GLASS = 'sticky-glass';

/**
 * Marks every `.sticky-glass` element with `data-stuck` while it is pinned.
 *
 * Sticky filter and section bars need a background only while they float over
 * scrolling content. At rest they sit on the page ground, and an opaque bar
 * there cut the ground's track lines off in a hard horizontal band. So the bar
 * is transparent until it sticks, then turns into a frosted bar (index.css).
 *
 * One passive, rAF-throttled scroll listener for the whole app instead of a ref
 * and an observer per bar: there are at most two such bars on a page, and
 * `getElementsByClassName` is a live collection, so bars that mount later are
 * picked up without any registration.
 */
export function useStickyGlass(routeKey: string) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const bars = document.getElementsByClassName(STICKY_GLASS);
    let frame = 0;

    const check = () => {
      frame = 0;
      for (const el of Array.from(bars) as HTMLElement[]) {
        const pinTop = Number.parseFloat(getComputedStyle(el).top);
        if (Number.isNaN(pinTop)) continue;
        // Pinned (or pushed past its pin by the end of its container).
        const stuck = el.getBoundingClientRect().top <= pinTop + 1 && window.scrollY > 0;
        if (stuck) el.setAttribute('data-stuck', '');
        else el.removeAttribute('data-stuck');
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(check);
    };

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    schedule();
    // Lazy route content mounts after this effect; check once it has painted.
    const late = window.setTimeout(schedule, 500);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.clearTimeout(late);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [routeKey]);
}
