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
  className,
  children,
}: HomeSectionProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'px-4 sm:px-6 md:px-8 py-12 md:py-16',
        tinted && 'bg-muted/30 border-y border-border',
        className,
      )}
    >
      <div className="max-w-7xl mx-auto">
        <SectionHeader
          id={headingId}
          eyebrow={eyebrow}
          title={title}
          subtitle={description}
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
