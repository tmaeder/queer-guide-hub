import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EditorialSectionProps {
  id: string;
  label: ReactNode;
  kicker?: string;
  children: ReactNode;
  className?: string;
}

export function EditorialSection({ id, label, kicker, children, className }: EditorialSectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className={cn('scroll-mt-32 py-16 first:pt-8', className)}
    >
      <header className="mb-8">
        {kicker ? (
          <p className="mb-2 text-2xs uppercase tracking-[0.18em] text-muted-foreground">{kicker}</p>
        ) : null}
        <h2 id={`${id}-heading`} className="text-display font-bold tracking-tight">
          {label}
        </h2>
      </header>
      <div>{children}</div>
    </section>
  );
}
