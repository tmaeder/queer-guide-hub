import * as React from 'react';
import { cn } from '@/lib/utils';
import { Eyebrow } from './Eyebrow';

interface SectionHeaderProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  actions?: React.ReactNode;
  /** Render a hairline divider + top padding above the header. */
  borderTop?: boolean;
  /** Heading level for the title. Defaults to h2. */
  as?: 'h2' | 'h3';
  className?: string;
  id?: string;
  children?: React.ReactNode;
}

export function SectionHeader({
  eyebrow,
  title,
  lede,
  actions,
  borderTop = false,
  as: Tag = 'h2',
  className,
  id,
  children,
}: SectionHeaderProps) {
  return (
    <div
      id={id}
      className={cn(
        borderTop && 'border-t border-hairline pt-8',
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          {eyebrow && <Eyebrow className="mb-2">{eyebrow}</Eyebrow>}
          <Tag className="text-headline font-bold tracking-tight text-foreground">
            {title}
          </Tag>
          {lede && (
            <p className="mt-2 max-w-2xl text-15 text-muted-foreground">
              {lede}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
