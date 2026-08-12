import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { RouteStrip, type RouteStation } from '@/components/transit/RouteStrip';
import { LEGAL_LINE_ORDER, POLICY_LINES, policyTrack } from '@/components/transit/policyLines';

interface LegalPageLayoutProps {
  title: string;
  subtitle?: string;
  lastUpdated?: string;
  sections: RouteStation[];
  children: React.ReactNode;
  /** Policy slug — picks the line's bullet, letter and track colour. */
  slug?: string;
  eyebrow?: string;
  /** Extra blocks rendered after the prose, before the end-of-line card. */
  footer?: React.ReactNode;
}

/** How far down the viewport a heading has to be before it counts as "here".
 *  Clears the 64px sticky header plus the mobile route strip below it. */
const TRIGGER_Y = 140;

/**
 * A policy rendered as a subway line: the document is the line, each `<h2>` is
 * a station, and the sticky rail beside the prose is the route diagram.
 *
 * What changed from the version this replaces, and why:
 *
 * - **One masthead for every policy.** The old layout forked on whether an
 *   editorial hero image existed, so `/terms` had a photo hero while
 *   `/privacy`, `/cookies` and `/dmca` got a bare `<h1>`. Four pages in the
 *   same section looked like four different products.
 * - **Scroll-spy is rAF-gated.** The old one ran `getBoundingClientRect()`
 *   across every section on every scroll event, unthrottled.
 * - **The contact block lives here only.** It used to be hardcoded in this
 *   component *and* again in the legal hub, so the two could drift.
 *
 * The 1100px cap is the one sanctioned bespoke width in the layout tier: this
 * is prose with a 224px rail beside it, so the page cap (1600) would stretch
 * legal text past a readable measure and `reading` (768) would leave the prose
 * about 430px once the rail takes its share.
 */
export const LegalPageLayout = ({
  title,
  subtitle,
  lastUpdated,
  sections,
  children,
  slug,
  eyebrow = 'Legal',
  footer,
}: LegalPageLayoutProps) => {
  // Seeded from the fragment so an inbound deep link starts on the right
  // station instead of flashing station 1 and correcting itself.
  const [activeSection, setActiveSection] = useState<string>(() =>
    typeof window === 'undefined' ? '' : decodeURIComponent(window.location.hash.slice(1)),
  );
  const line = slug ? POLICY_LINES[slug] : undefined;
  const track = slug ? policyTrack(slug) : undefined;
  const didUserMove = useRef(false);
  // The station the reader ASKED for, via a deep link or a rail click. It
  // outranks the geometry until they scroll away themselves — see the spy.
  const pinned = useRef<string | null>(null);

  // Deep links. The browser's own fragment jump fires before the CMS body has
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
      setActiveSection(id);
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
    setActiveSection(id);
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
        setActiveSection(pinned.current);
        return;
      }
      let current = sections[0]?.id ?? '';
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= TRIGGER_Y) current = s.id;
      }
      setActiveSection((prev) => {
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
    if (!activeSection || !didUserMove.current) return;
    if (window.location.hash === `#${activeSection}`) return;
    window.history.replaceState(window.history.state, '', `#${activeSection}`);
  }, [activeSection]);

  const siblings = LEGAL_LINE_ORDER.filter((s) => s !== slug);

  return (
    <PageContainer className="max-w-[1100px]">
      <header className="border-b-4 border-foreground pb-6">
        <div className="flex items-center gap-4">
          {line && (
            <RouteBullet
              type={line.slug}
              letter={line.letter}
              track={line.track}
              label={`${line.label} line`}
              size={30}
            />
          )}
          <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
            {eyebrow}
          </p>
        </div>
        <h1 className="mt-4 font-display text-display leading-none tracking-tight md:text-hero">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-4 max-w-2xl text-body-lg text-muted-foreground">{subtitle}</p>
        )}
        {lastUpdated && (
          <p className="mt-6 text-13 text-muted-foreground">
            <span className="font-bold text-foreground">Last updated</span> {lastUpdated}
            {sections.length > 0 && (
              <>
                {' · '}
                <span className="tabular-nums">
                  {sections.filter((s) => (s.depth ?? 1) === 1).length}
                </span>{' '}
                sections
              </>
            )}
          </p>
        )}
      </header>

      {/* Mobile route strip — replaces the old disclosure TOC. Sticks under the
          header and bleeds to the viewport edge at every breakpoint. */}
      {sections.length > 0 && (
        <RouteStrip
          stations={sections}
          activeId={activeSection}
          track={track}
          orientation="horizontal"
          label="Sections of this policy"
          onNavigate={goToStation}
          className="mb-8 md:hidden"
        />
      )}

      <div className="mt-8 flex flex-col items-start md:flex-row md:gap-12">
        {sections.length > 0 && (
          <div className="sticky top-20 hidden w-56 flex-shrink-0 md:block">
            <p className="mb-2 text-2xs font-bold uppercase tracking-label text-muted-foreground">
              On this page
            </p>
            <RouteStrip
              stations={sections}
              activeId={activeSection}
              track={track}
              label="Sections of this policy"
              onNavigate={goToStation}
            />
          </div>
        )}

        <div className="min-w-0 flex-1">
          {children}

          {footer}

          <section
            className="mt-16 border-[3px] border-foreground bg-foreground p-6 text-background"
            aria-labelledby="end-of-line"
          >
            <p className="text-2xs font-bold uppercase tracking-label text-background/70">
              End of line
            </p>
            <h2 id="end-of-line" className="mt-1 font-display text-headline leading-tight">
              Questions?
            </h2>
            <p className="mt-2 text-13 leading-relaxed text-background/80">
              We're real humans at{' '}
              <a href="mailto:legal@queer.guide" className="font-bold text-background">
                legal@queer.guide
              </a>
              .
            </p>

            {siblings.length > 0 && (
              <>
                <p className="mt-6 text-2xs font-bold uppercase tracking-label text-background/70">
                  Change here for
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {siblings.map((s) => {
                    const sib = POLICY_LINES[s];
                    return (
                      <li key={s}>
                        <LocalizedLink
                          to={`/${s}`}
                          className={cn(
                            'inline-flex items-center gap-2 border-2 border-background px-2 py-1 text-13 font-bold text-background no-underline transition-colors',
                            'hover:bg-background hover:text-foreground',
                          )}
                        >
                          <RouteBullet
                            type={sib.slug}
                            letter={sib.letter}
                            track={sib.track}
                            label={`${sib.label} line`}
                            size={20}
                          />
                          {sib.label}
                        </LocalizedLink>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        </div>
      </div>
    </PageContainer>
  );
};
