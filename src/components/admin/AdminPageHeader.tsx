import * as React from 'react';
import { cn } from '@/lib/utils';
import { Eyebrow } from '@/components/ui/Eyebrow';

interface AdminPageHeaderProps {
  /** Short uppercase context, e.g. "CONTENT · VENUES". */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Static page header for the admin console — no motion imports
 * (admin tree forbids framer-motion / motion/react).
 *
 * Sits below the AdminShell breadcrumb bar and replaces ad-hoc <h1>
 * blocks across admin pages.
 */
export function AdminPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
  children,
}: AdminPageHeaderProps) {
  return (
    <header
      className={cn(
        'mb-6 flex flex-col gap-4 border-b border-hairline pb-6 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {eyebrow && <Eyebrow as="div" className="mb-2">{eyebrow}</Eyebrow>}
        <h1 className="text-headline md:text-headline-lg font-bold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 max-w-2xl text-13 text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
      {children && <div className="w-full">{children}</div>}
    </header>
  );
}
