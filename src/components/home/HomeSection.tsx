import * as React from 'react';
import { SectionHeader, SeeAllLink } from '@/components/ui/SectionHeader';
import { cn } from '@/lib/utils';

interface HomeSectionProps {
  /** Small uppercase label above the title. */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Optional "see all" link rendered top-right (desktop) and below (mobile). */
  seeAllHref?: string;
  seeAllLabel?: string;
  /** Wrapper background tint, e.g. for the alternating "index" band. */
  tinted?: boolean;
  /**
   * Header rank. Defaults to `band`.
   *
   * This used to be hardcoded to `masthead` for every section, so the homepage
   * rendered six identical 44px uppercase headings each under its own
   * `.rule-heavy` — which turned a rationed signature into a repeating divider
   * and made the page read as six equal-rank slabs. Exactly one section should
   * be the masthead; the rest are bands.
   */
  rank?: 'masthead' | 'band';
  className?: string;
  children: React.ReactNode;
}

/**
 * Shared rhythm for every homepage section: consistent eyebrow → title →
 * "see all" header, 8pt-grid padding, and a max-width container. Keeps the page
 * reading as one surface instead of a stack of bespoke bands.
 */
export function HomeSection({
  eyebrow,
  title,
  description,
  seeAllHref,
  seeAllLabel,
  tinted,
  rank = 'band',
  className,
  children,
}: HomeSectionProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'px-4 sm:px-6 md:px-8 py-12 md:py-16',
        // The tint marks the band; the screen below gives it a printed edge.
        // A FLAT screen was tried here and removed 2026-08-07 — on a real
        // screenshot it read as a loud, mechanical dot pattern rather than
        // printed texture. It is back only because the falloff wrapper fixes
        // what was actually wrong with it (uniform coverage), not because the
        // verdict was wrong. See `.screen-fade-down` in src/index.css.
        tinted && 'relative isolate bg-muted/30',
        className,
      )}
    >
      {/* One texture layer per band, never per card — cost is O(1) in the
          number of rows the section renders. Nested because the fade masks the
          wrapper and the screen masks itself; a single element cannot carry
          both masks without duplicating the dot payload. */}
      {tinted ? (
        <div className="screen-fade-down absolute inset-0 -z-10 overflow-hidden" aria-hidden>
          <div className="halftone-pink absolute inset-0" />
        </div>
      ) : null}
      <div className="max-w-7xl mx-auto">
        <SectionHeader
          id={headingId}
          eyebrow={eyebrow}
          title={title}
          subtitle={description}
          size={rank}
          seeAllHref={seeAllHref}
          seeAllLabel={seeAllLabel}
        />

        {children}

        {seeAllHref && (
          <div className="mt-6 sm:hidden">
            <SeeAllLink to={seeAllHref} label={seeAllLabel} />
          </div>
        )}
      </div>
    </section>
  );
}
