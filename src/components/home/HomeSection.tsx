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
        // The band's tint and rule are full-bleed — they span the viewport, so
        // the section itself carries no gutter. Spacing and the content cap
        // live on the PageContainer inside it, which is what puts a home rail's
        // first card on the same vertical as the nav tab above it.
        //
        // The tint alone marks the band. The halftone screen that briefly sat
        // here was band-level design-system texture; the subway-map rebrand
        // replaces that with the 4px ink rules between bands, so the screen
        // (and its .screen-fade-down wrapper) went with the rest of the print
        // layer. Per-entity image treatments are unaffected — see Image.tsx.
        tinted && 'border-b-4 border-foreground bg-surface-container',
        className,
      )}
    >
      <PageContainer>
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
      </PageContainer>
    </section>
  );
}
