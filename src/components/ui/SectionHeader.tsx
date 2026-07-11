import * as React from 'react';
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
      <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">
        →
      </span>
    </LocalizedLink>
  );
}

interface SectionHeaderProps {
  /** id for the heading, referenced by the section's aria-labelledby. */
  id?: string;
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: string;
  size?: 'band' | 'section';
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
        className={size === 'band' ? 'hidden sm:inline-flex' : undefined}
      />
    ) : null);

  return (
    <div
      className={cn(
        'flex justify-between gap-4',
        size === 'band' ? 'items-end mb-6 md:mb-8' : 'items-baseline',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <Eyebrow as="div" className="mb-2">
            {eyebrow}
          </Eyebrow>
        )}
        <h2
          id={id}
          className={
            size === 'band'
              ? 'text-headline md:text-headline-lg font-bold tracking-tight'
              : 'text-title font-display font-semibold'
          }
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
