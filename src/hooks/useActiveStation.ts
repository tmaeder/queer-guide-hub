/**
 * useActiveStation — which station on a RouteStrip the reader is looking at.
 *
 * Lifted verbatim out of LegalPageLayout so the tag wiki can index its own
 * bands with the same behaviour. Every comment below records a defect that was
 * measured on a real page; none of them are hypothetical.
 *
 * Returns `{ activeId, goToStation }`. Pass `goToStation` to
 * `<RouteStrip onNavigate>` — a rail click uses `pushState`, which fires no
 * `hashchange`, so this is the only signal that navigation happened.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RouteStation } from '@/components/transit/RouteStrip';

/** How far down the viewport a heading has to be before it counts as "here".
 *  Clears the 64px sticky header plus the mobile route strip below it. */
const TRIGGER_Y = 140;

export function useActiveStation(sections: RouteStation[]) {
  // Seeded from the fragment so an inbound deep link starts on the right
  // station instead of flashing station 1 and correcting itself.
  const [activeId, setActiveId] = useState<string>(() =>
    typeof window === 'undefined' ? '' : decodeURIComponent(window.location.hash.slice(1)),
  );
  const didUserMove = useRef(false);
  // The station the reader ASKED for, via a deep link or a rail click. It
  // outranks the geometry until they scroll away themselves — see the spy.
  const pinned = useRef<string | null>(null);

  // Deep links. The browser's own fragment jump fires before the body has
  // arrived over the network, so an SPA has to redo it once the headings
  // actually exist in the document.
  //
  // It is redone for several frames, not once: the site header pins to its
  // COMPACT height as soon as the page is scrolled, and that happens after the
  // first jump — which left the target 64px below where it asked to be, with
  // the PREVIOUS heading sitting on the trigger line. Measured on /privacy
  // #your-rights: the heading settled at top 192 while `retention` sat at 1.
  useEffect(() => {
    if (!sections.length) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    let raf = 0;
    let tries = 0;
    const settle = () => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ block: 'start' });
      pinned.current = id;
      setActiveId(id);
      // ~6 frames (100ms). Long enough for the header to collapse, far too
      // short for a reader to have scrolled anywhere themselves.
      if (++tries < 6) raf = requestAnimationFrame(settle);
    };
    settle();
    return () => cancelAnimationFrame(raf);
  }, [sections.length]);

  // The reader chose a station. Either route reaches the same place:
  //
  // - `onNavigate` from the rail, which owns its own scroll and writes the
  //   fragment with `pushState` — and `pushState` fires NO `hashchange`, so
  //   the listener below cannot see a rail click at all.
  // - `hashchange`, for Back/Forward across those entries and for a fragment
  //   typed into the address bar.
  const goToStation = useCallback((id: string) => {
    if (!id || !document.getElementById(id)) return;
    pinned.current = id;
    setActiveId(id);
  }, []);

  useEffect(() => {
    const onHashChange = () => goToStation(decodeURIComponent(window.location.hash.slice(1)));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [goToStation]);

  useEffect(() => {
    if (!sections.length) return;
    let frame = 0;

    // The active station is the last heading that has passed the trigger line.
    //
    // An IntersectionObserver was tried here first and is the wrong tool: it
    // reports *changes in intersection*, and a heading well above the fold has
    // no further changes to report, so after a jump to section 11 the observer
    // went quiet and the rail stayed pinned to section 1. Position is the
    // question being asked, so positions are what this reads.
    //
    // The fix for the original defect is the rAF gate, not the API: the old
    // implementation ran this same sweep on *every* scroll event, unthrottled.
    // Now it runs at most once per painted frame.
    const resolve = () => {
      frame = 0;
      // A station the reader asked for wins over the one the geometry would
      // name. A fragment jump parks its target near the trigger line, so the
      // heading ABOVE it is usually the last one past that line — answering
      // "you are at Data Retention" to someone who just clicked Your Privacy
      // Rights. Released the moment they scroll for themselves.
      if (pinned.current) {
        setActiveId(pinned.current);
        return;
      }
      let current = sections[0]?.id ?? '';
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= TRIGGER_Y) current = s.id;
      }
      setActiveId((prev) => {
        // Only a move *between* stations counts. The first resolve goes from
        // "" to station 1, and treating that as a move made simply opening
        // /terms rewrite the address bar to /terms#acceptance.
        if (prev && prev !== current) didUserMove.current = true;
        return current;
      });
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(resolve);
    };

    // Gestures, not scroll: a programmatic jump fires `scroll` too, so
    // releasing the pin there would release it on the very jump that set it.
    const release = () => {
      pinned.current = null;
      schedule();
    };

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('wheel', release, { passive: true });
    window.addEventListener('touchmove', release, { passive: true });
    window.addEventListener('keydown', release);
    resolve();
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('wheel', release);
      window.removeEventListener('touchmove', release);
      window.removeEventListener('keydown', release);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sections]);

  // Keep the address bar pointing at what the reader is looking at, so copying
  // the URL mid-document shares the section rather than the top of the page.
  // `replaceState` (not push) — scrolling must not fill the Back button.
  useEffect(() => {
    if (!activeId || !didUserMove.current) return;
    if (window.location.hash === `#${activeId}`) return;
    window.history.replaceState(window.history.state, '', `#${activeId}`);
  }, [activeId]);

  return { activeId, goToStation };
}
