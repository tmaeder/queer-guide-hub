import * as React from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { PageContainer } from '@/components/layout/PageContainer';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { cn } from '@/lib/utils';

export interface BandProps {
  title: React.ReactNode;
  eyebrow?: string;
  description?: string;
  seeAllHref?: string;
  seeAllLabel?: string;
  /** Alternation across the page. `paper` is the default. */
  surface?: 'paper' | 'tint';
  /**
   * Right-hand slot in the head — e.g. the region chip on "Near you".
   * Rendered as a SIBLING of the see-all link, never nested inside it: an
   * interactive control inside an anchor is invalid HTML and trips axe
   * `nested-interactive` (see e2e/nested-interactive.spec.ts).
   */
  action?: React.ReactNode;
  /** Classes for the inner PageContainer. Never for the <section>, whose
   *  rule and tint are full-bleed by definition. */
  className?: string;
  /** Optional: a closing CTA band is head-only (title + description + actions)
   *  and has no content grid under it. */
  children?: React.ReactNode;
}

/**
 * The one homepage band shell.
 *
 * Replaces `HomeSection`, whose `tinted` prop was the ONLY thing that emitted
 * the 4px rule and the tint — and which no caller ever passed, so five of the
 * homepage's bands rendered neither. Its `rank` prop was dead for the same
 * reason, making the `masthead` size unreachable.
 *
 * Deliberately NOT built on `SectionHeader size="band"`: that renders a
 * different head (`items-end`, `text-headline md:text-display`, and a muted
 * `text-13` see-all that hides below `sm`). The grammar below is the one the
 * subway rebrand established in DeparturesBoard / CityCards / SupportBand, and
 * it is six lines — cheaper to state than to parameterize. `SectionHeader`
 * stays for the ~17 non-home surfaces that use it.
 */
export function Band({
  title,
  eyebrow,
  description,
  seeAllHref,
  seeAllLabel,
  surface = 'paper',
  action,
  className,
  children,
}: BandProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'border-b-4 border-foreground',
        surface === 'tint' && 'bg-surface-container',
      )}
    >
      <PageContainer className={className}>
        <div
          className={cn(
            'flex flex-wrap items-baseline justify-between gap-4',
            // A head-only band (the closing CTA) owns the band's whole height,
            // so the head must not reserve space for content that never comes.
            children != null && 'mb-6',
          )}
        >
          <div className="min-w-0">
            {eyebrow && (
              <Eyebrow as="div" className="mb-2">
                {eyebrow}
              </Eyebrow>
            )}
            <h2 id={headingId} className="font-display text-display">
              {title}
            </h2>
            {description && (
              <p className="mt-2 max-w-2xl text-15 text-muted-foreground">{description}</p>
            )}
          </div>
          {(action || seeAllHref) && (
            <div className="flex flex-wrap items-center gap-4">
              {action}
              {seeAllHref && (
                <LocalizedLink to={seeAllHref} className="text-15 font-bold no-underline">
                  {seeAllLabel} →
                </LocalizedLink>
              )}
            </div>
          )}
        </div>
        {children}
      </PageContainer>
    </section>
  );
}

export default Band;
