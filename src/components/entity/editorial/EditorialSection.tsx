import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EditorialSectionProps {
  id: string;
  label: ReactNode;
  kicker?: string;
  /** One-line deck under the heading. */
  description?: ReactNode;
  /** Header-right slot, e.g. a "see all" link. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function EditorialSection({
  id,
  label,
  kicker,
  description,
  action,
  children,
  className,
}: EditorialSectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className={cn('scroll-mt-32 py-16 first:pt-8', className)}
    >
      <header className="mb-8 flex items-end justify-between gap-4">
        <div className="min-w-0">
          {kicker ? (
            <p className="mb-2 text-2xs uppercase tracking-[0.18em] text-muted-foreground">
              {kicker}
            </p>
          ) : null}
          <h2 id={`${id}-heading`} className="text-display font-bold tracking-tight">
            {label}
          </h2>
          {description ? (
            <p className="mt-2 max-w-xl text-body-lg text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div>{children}</div>
    </section>
  );
}
