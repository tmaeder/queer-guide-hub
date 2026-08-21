import React from 'react';
import { cn } from '@/lib/utils';
import { PageContainer, STICKY_RAIL_UNDER_HEADER } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { RouteStrip, type RouteStation } from '@/components/transit/RouteStrip';
import { LEGAL_LINE_ORDER, POLICY_LINES, policyTrack } from '@/components/transit/policyLines';
import { useActiveStation } from '@/hooks/useActiveStation';

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
  // Scroll-spy, deep-link settling and address-bar sync all live in the hook
  // so the tag wiki indexes its bands the same way. See useActiveStation for
  // why this is position-polling behind a rAF gate and not an
  // IntersectionObserver.
  const { activeId: activeSection, goToStation } = useActiveStation(sections);
  const line = slug ? POLICY_LINES[slug] : undefined;
  const track = slug ? policyTrack(slug) : undefined;

  const siblings = LEGAL_LINE_ORDER.filter((s) => s !== slug);

  return (
    <PageContainer className="max-w-[1100px]">
      <header className="border-b border-border-hairline pb-6">
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
          <div
            className={cn('sticky hidden w-56 flex-shrink-0 md:block', STICKY_RAIL_UNDER_HEADER)}
          >
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
            className="mt-16 bg-foreground p-6 text-background"
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
                            'border inline-flex items-center gap-2 border-background px-2 py-1 text-13 font-bold text-background no-underline transition-colors',
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
