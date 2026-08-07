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
        // The tint alone marks the band — the rules it used to sit between were
        // the last hairlines on the homepage. A halftone-screen layer was tried
        // here too and removed 2026-08-07: on a real screenshot it read as a
        // loud, mechanical dot pattern rather than printed texture.
        tinted && 'bg-muted/30',
        className,
      )}
    >
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
