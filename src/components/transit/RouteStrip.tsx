import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { PAGE_BLEED, STICKY_UNDER_HEADER } from '@/components/layout/PageContainer';
import { StationRing } from './StationRing';
import { TRACK_BG, type Track } from './routeBulletMap';

export interface RouteStation {
  id: string;
  title: string;
  /** 1 = a station on the line (an `<h2>`), 2 = a sub-station (an `<h3>`). */
  depth?: 1 | 2;
}

interface RouteStripProps {
  stations: RouteStation[];
  activeId: string;
  /** Omitted = an ink line. Accessibility runs monochrome on purpose. */
  track?: Track;
  orientation?: 'vertical' | 'horizontal';
  className?: string;
  /** Accessible name for the nav landmark. */
  label?: string;
  /** The reader chose a station. `pushState` fires no `hashchange`, so this is
   *  the only signal the owner gets that navigation — not scrolling — happened. */
  onNavigate?: (id: string) => void;
}

/**
 * The table of contents as a route: sections are stations on a line.
 *
 * Two things here are deliberate and were both broken in the layout this
 * replaces.
 *
 * 1. Stations are `<a href="#id">`, not `<button>` + `scrollIntoView`. The old
 *    TOC never wrote a hash, so no section of any policy was linkable — you
 *    could not send someone "the data-deletion clause", only "the privacy
 *    page, scroll down". Anchors also give middle-click, open-in-new-tab and
 *    the browser's own find-on-page behaviour for free.
 * 2. `depth: 2` sub-stations render. Only `<h2>` was ever indexed, which made
 *    the Cookie Policy's three cookie categories — the part a reader is
 *    actually looking for — invisible to navigation.
 *
 * Smooth scrolling is gated on `prefers-reduced-motion`; the previous
 * implementation passed `behavior: 'smooth'` unconditionally.
 */
export function RouteStrip({
  stations,
  activeId,
  track,
  orientation = 'vertical',
  className,
  label = 'Sections',
  onNavigate,
}: RouteStripProps) {
  const listRef = useRef<HTMLOListElement | null>(null);
  const lineColor = track ? TRACK_BG[track] : 'bg-foreground';

  // Station numbers count only depth-1 stops, matching the `counter-increment`
  // on `.qg-cms-body h2` — the sidebar and the prose must agree on "section 7".
  let counter = 0;
  const numbers = stations.map((s) => ((s.depth ?? 1) === 1 ? ++counter : null));

  const activeIndex = stations.findIndex((s) => s.id === activeId);

  // Keep the active chip in view on the horizontal bar as the reader scrolls.
  useEffect(() => {
    if (orientation !== 'horizontal') return;
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(`[data-station-id="${activeId}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [activeId, orientation]);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    // Let modified clicks (new tab, new window, download) behave natively.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    // Preserve history.state — react-router keeps its own key in there, and
    // dropping it desyncs the router's idea of where it is.
    window.history.pushState(window.history.state, '', `#${id}`);
    // `pushState` deliberately fires no `hashchange`, so a listener on that
    // event never learns about this. Without telling the owner directly, the
    // scroll-spy would keep answering with whatever the geometry says — and a
    // jump parks its target below the trigger line, so that is the station
    // BEFORE the one just clicked.
    onNavigate?.(id);
  };

  if (orientation === 'horizontal') {
    return (
      <nav
        aria-label={label}
        /* Same grammar as SectionNav: solid paper, an ink rule that IS the
           band's edge, and a bleed that follows PAGE_GUTTER at every
           breakpoint so the rule reaches the viewport edge.

           Both geometry values come from PageContainer, which owns the page
           frame — `PAGE_BLEED` cancels the gutter and `STICKY_UNDER_HEADER`
           is the site header's PINNED height (60px on mobile, 64px from md
           where it collapses to the one-line ink flood; a flat `top-16` left
           a 4px slot on mobile for content to slide through). Restating
           either here is how the two drift apart. */
        className={cn(
          `sticky ${STICKY_UNDER_HEADER} z-30 border-b-2 border-foreground bg-background`,
          PAGE_BLEED,
          className,
        )}
      >
        <ol
          ref={listRef}
          className="flex h-12 items-center gap-4 overflow-x-auto px-4 sm:px-6 md:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {stations.map((s, i) => {
            const isActive = s.id === activeId;
            return (
              <li key={s.id} className="shrink-0">
                <a
                  href={`#${s.id}`}
                  data-station-id={s.id}
                  aria-current={isActive ? 'true' : undefined}
                  onClick={(e) => handleClick(e, s.id)}
                  className={cn(
                    'inline-flex items-center gap-2 whitespace-nowrap border-2 border-foreground px-2 py-1 text-13 font-bold no-underline transition-colors',
                    isActive
                      ? 'bg-foreground text-background'
                      : 'bg-background hover:bg-surface-container',
                    s.depth === 2 && 'text-2xs',
                  )}
                >
                  {numbers[i] !== null && (
                    <span className={cn('tabular-nums', !isActive && 'text-muted-foreground')}>
                      {numbers[i]}
                    </span>
                  )}
                  {s.title}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
    );
  }

  return (
    <nav aria-label={label} className={cn('relative', className)}>
      {/* The line itself, behind the stations. Inset top and bottom so it
          terminates at the first and last ring rather than running off the
          ends of the list — a line that overshoots reads as "more stops
          below", which is exactly what a table of contents must not imply. */}
      <span aria-hidden className="absolute bottom-3 left-0 top-3 flex w-4 justify-center">
        <span className={cn('h-full w-[3px]', lineColor)} />
      </span>

      <ol ref={listRef} className="relative flex flex-col gap-1">
        {stations.map((s, i) => {
          const isActive = s.id === activeId;
          const isPast = activeIndex > -1 && i < activeIndex;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                data-station-id={s.id}
                aria-current={isActive ? 'true' : undefined}
                onClick={(e) => handleClick(e, s.id)}
                className="group flex items-start gap-2 no-underline"
              >
                <span className="flex w-4 shrink-0 justify-center pt-1.5">
                  {(s.depth ?? 1) === 1 ? (
                    <StationRing
                      state={isActive ? 'typed' : isPast ? 'done' : 'open'}
                      track={track ?? 'pink'}
                      // Without a track the whole line is ink, so an active
                      // "typed" ring would be a pink dot on an ink line. Fill
                      // it with ink instead and let the plate carry the state.
                      className={cn(isActive && !track && 'bg-foreground')}
                    />
                  ) : (
                    // Sub-stations take a smaller marker so the eye reads the
                    // hierarchy before it reads the indent.
                    <span
                      aria-hidden
                      className={cn(
                        'mt-1 inline-block h-2.5 w-2.5 rounded-full border-2 border-foreground',
                        isActive || isPast ? 'bg-foreground' : 'bg-background',
                      )}
                    />
                  )}
                </span>
                <span
                  className={cn(
                    // NO transition on this pair. The active state swaps the
                    // label to paper-on-ink, and while that fade runs the two
                    // interpolate together: at ~17% they are #717170 on
                    // #d1d1cd, which is 3.19:1 and a serious axe
                    // color-contrast failure. `motion-reduce:transition-none`
                    // did not settle it — the nightly still caught the exact
                    // same pair, so the guard is not reliable here. A hard
                    // state has no mid-state to sample, and hard states are
                    // what the subway system does everywhere else anyway.
                    'min-w-0 flex-1 px-2 py-1 text-left text-13 leading-snug',
                    s.depth === 2 && 'ml-4 text-2xs',
                    isActive
                      ? 'bg-foreground font-bold text-background'
                      : 'text-muted-foreground group-hover:bg-surface-container group-hover:text-foreground',
                  )}
                >
                  {numbers[i] !== null && (
                    <span
                      className={cn(
                        'mr-2 tabular-nums',
                        isActive ? 'text-background/70' : 'text-muted-foreground',
                      )}
                    >
                      {numbers[i]}
                    </span>
                  )}
                  {s.title}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
