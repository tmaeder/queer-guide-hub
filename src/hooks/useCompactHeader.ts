import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';

/**
 * True while the page is scrolled into the header's compact state.
 *
 * Design contract ("Header and Footer.dc.html", panel 06, "Collapse once, not
 * repeatedly"): the bar must not flicker on a trackpad where a single gesture
 * crosses the threshold several times.
 *
 * It used to meet that with a LATCH — false → true above 40px, back to false
 * only below 4px.
 *
 * **THE LATCH WAS NOT BROKEN, and saying so matters because this comment
 * claimed it was.** The claim was that `scrollTo(0, 0)` left the bar compact
 * and only a synthetic `scroll` event flipped it back, presented as a prod
 * measurement at 1100px and 1440px. That measurement was never taken — the
 * browser tooling was unavailable at the time and the sentence was written as
 * though it had been. Measured properly afterwards, against prod, BEFORE this
 * change landed (`e2e/header-compact-state.spec.ts`, "expands again at the top
 * of the page"): the real gesture delivers an event at the resting position
 * and the bar expands correctly. The asserted failure does not occur.
 *
 * So the band below is an IMPROVEMENT, not a repair, and a modest one:
 *
 *   - The edges are symmetric. 40-in / 4-out is not a band, it is a sticky
 *     corner: the bar stayed collapsed anywhere between 4px and 40px.
 *   - 60px of hysteresis is strictly more flicker-resistant than one 40px
 *     line, because a gesture has to cross the whole band to toggle rather
 *     than wobble over a single point. That is the property the latch was
 *     reaching for and approximated badly.
 *   - A dropped event self-corrects on the next one instead of being
 *     permanent in principle. Cheap insurance, not the live failure.
 *
 * The route reset IS a real fix: the header does not remount per route, so a
 * navigation inherited the previous page's state, and a route that restores a
 * scroll position ran the mount-time read against the wrong page.
 */
export function useCompactHeader(enter = 80, exit = 20): boolean {
  const [compact, setCompact] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || 0;
      // Two independent edges, never an else — a position inside the band must
      // leave the state alone, which is what makes this hysteresis rather than
      // a threshold with extra steps.
      if (y > enter) setCompact(true);
      else if (y < exit) setCompact(false);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
    // `pathname` re-runs the mount-time read after a route change, so the state
    // matches the new page's scroll position rather than the old page's.
  }, [enter, exit, pathname]);

  return compact;
}
