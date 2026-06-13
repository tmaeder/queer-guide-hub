import * as React from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Eyebrow } from '@/components/ui/Eyebrow';
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
  const seeAll = (extraClass: string) =>
    seeAllHref ? (
      <LocalizedLink
        to={seeAllHref}
        className={cn(
          'group items-center gap-1 text-13 font-medium text-muted-foreground transition-colors hover:text-foreground no-underline',
          extraClass,
        )}
      >
        {seeAllLabel}
        <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">
          →
        </span>
      </LocalizedLink>
    ) : null;

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
        <div className="flex items-end justify-between gap-4 mb-6 md:mb-8">
          <div className="min-w-0">
            {eyebrow && (
              <Eyebrow as="div" className="mb-2">
                {eyebrow}
              </Eyebrow>
            )}
            <h2
              id={headingId}
              className="text-headline md:text-headline-lg font-bold tracking-tight"
              style={{ letterSpacing: '-0.02em' }}
            >
              {title}
            </h2>
            {description && (
              <p className="mt-2 text-sm md:text-base text-muted-foreground max-w-md">
                {description}
              </p>
            )}
          </div>
          {seeAll('hidden sm:inline-flex shrink-0')}
        </div>

        {children}

        {seeAllHref && <div className="mt-6 sm:hidden">{seeAll('inline-flex')}</div>}
      </div>
    </section>
  );
}
