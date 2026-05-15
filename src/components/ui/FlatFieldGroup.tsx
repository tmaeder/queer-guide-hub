import * as React from 'react';
import { cn } from '@/lib/utils';

interface FlatFieldGroupProps {
  title?: string;
  description?: string;
  /** Renders the section without the top border separator. Use for first section. */
  noTopBorder?: boolean;
  /** Removes inner spacing — for tightly packed pictogram grids. */
  dense?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Card-less form section for sensitive areas (Intimate, Privacy).
 * Hierarchy via thin border + typography only. No background fill, no shadow.
 */
export function FlatFieldGroup({
  title,
  description,
  noTopBorder = false,
  dense = false,
  children,
  className,
}: FlatFieldGroupProps) {
  return (
    <section
      className={cn(
        'py-6',
        !noTopBorder && 'border-t border-border',
        className,
      )}
    >
      {(title || description) && (
        <header className="mb-5">
          {title && (
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              {description}
            </p>
          )}
        </header>
      )}
      <div className={cn(dense ? 'space-y-2' : 'space-y-6')}>{children}</div>
    </section>
  );
}

interface FlatFieldProps {
  label?: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}

/** A single labelled field row inside a FlatFieldGroup. */
export function FlatField({
  label,
  hint,
  htmlFor,
  children,
  className,
}: FlatFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="block text-sm text-muted-foreground"
        >
          {label}
        </label>
      )}
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
