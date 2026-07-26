import * as React from 'react';
import { ArrowRight } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { cn } from '@/lib/utils';

/**
 * THE section header. Replaces three drifted implementations (HomeSection's
 * inline header, marketplace/SectionHeader, ProfileSectionHeader) and the
 * hand-rolled "See all →" copies. Two sizes:
 *   - `band`    — page-level content band (home sections, marketplace bands)
 *   - `section` — sub-section inside a page (profile hub blocks)
 * One "see all" affordance: quiet text link with the sliding arrow.
 *   - `masthead` — zine issue-opener (PHOTOCOPY rebrand): 2px black rule,
 *     0.2em kicker, uppercase Space Grotesk title. Flagship surfaces only;
 *     never on /help, /safety, or crisis pages.
 */

export function SeeAllLink({
  to,
  label,
  className,
}: {
  to: string;
  label?: string;
  className?: string;
}) {
  return (
    <LocalizedLink
      to={to}
      className={cn(
        'group inline-flex items-center gap-1 text-13 font-medium text-muted-foreground transition-colors hover:text-foreground no-underline',
        className,
      )}
    >
      {label}
      <ArrowRight
        className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1"
        aria-hidden="true"
      />
    </LocalizedLink>
  );
}

interface SectionHeaderProps {
  /** id for the heading, referenced by the section's aria-labelledby. */
  id?: string;
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: string;
  size?: 'band' | 'section' | 'masthead';
  /** Quiet "see all" link, right-aligned (hidden on mobile for `band`). */
  seeAllHref?: string;
  seeAllLabel?: string;
  /** Custom right-aligned slot; takes precedence over seeAllHref. */
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({
  id,
  eyebrow,
  title,
  subtitle,
  size = 'band',
  seeAllHref,
  seeAllLabel,
  action,
  className,
}: SectionHeaderProps) {
  const right =
    action ??
    (seeAllHref ? (
      <SeeAllLink
        to={seeAllHref}
        label={seeAllLabel}
        className={size !== 'section' ? 'hidden sm:inline-flex' : undefined}
      />
    ) : null);

  return (
    <div
      className={cn(
        'flex justify-between gap-4',
        size === 'band' && 'items-end mb-6 md:mb-8',
        size === 'section' && 'items-baseline',
        size === 'masthead' && 'items-end mb-6 md:mb-8 rule-heavy pt-2',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <Eyebrow as="div" variant={size === 'masthead' ? 'kicker' : 'label'} className="mb-2">
            {eyebrow}
          </Eyebrow>
        )}
        <h2
          id={id}
          className={cn(
            size === 'band' && 'text-headline md:text-headline-lg font-bold tracking-tight',
            size === 'section' && 'text-title font-display font-semibold',
            size === 'masthead' &&
              'text-headline-lg md:text-display font-display font-bold uppercase tracking-[-0.01em] leading-none',
          )}
          style={size === 'band' ? { letterSpacing: '-0.02em' } : undefined}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="mt-2 text-sm md:text-base text-muted-foreground max-w-md">{subtitle}</p>
        )}
      </div>
      {right != null && <div className="shrink-0">{right}</div>}
    </div>
  );
}
