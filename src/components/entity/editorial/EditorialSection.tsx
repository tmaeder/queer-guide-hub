import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EditorialSectionProps {
  id: string;
  label: ReactNode;
  /** Accepted for call-site compatibility but NOT rendered: the owner removed
   *  every section eyebrow (2026-11-18) as redundant with the heading. */
  kicker?: string;
  /** One-line deck under the heading. */
  description?: ReactNode;
  /** Header-right slot, e.g. a "see all" link. */
  action?: ReactNode;
  /** Heading for screen readers only; see SectionDef.hideHeading. */
  hideHeading?: boolean;
  children: ReactNode;
  className?: string;
}

export function EditorialSection({
  id,
  label,
  description,
  action,
  hideHeading,
  children,
  className,
}: EditorialSectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className={cn(
        'scroll-mt-32 py-16 first:pt-8',
        // The top padding spaces the heading; with none drawn, the nav above is enough.
        hideHeading && 'pt-0 first:pt-0',
        className,
      )}
    >
      {hideHeading ? (
        <h2 id={`${id}-heading`} className="sr-only">
          {label}
        </h2>
      ) : (
        <header className="mb-8 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 id={`${id}-heading`} className="text-display font-bold tracking-tight">
              {label}
            </h2>
            {description ? (
              <p className="mt-2 max-w-xl text-body-lg text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      )}
      <div>{children}</div>
    </section>
  );
}
