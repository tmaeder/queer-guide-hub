/**
 * PageHeader — Unified page header component.
 *
 * Renders a consistent eyebrow + H1 + subtitle + optional actions slot
 * on a softened editorial surface. Used across all public pages.
 *
 * Content is always visible. Decorative motion lives on hover/scroll
 * elsewhere; the page-title block paints immediately so users on slow
 * connections, with motion disabled, or in headless previews see the
 * heading without delay.
 */

import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  /** Center-align title and subtitle (for hero-style headers) */
  center?: boolean;
  children?: React.ReactNode;
}

export const PageHeader = ({
  title,
  subtitle,
  eyebrow,
  actions,
  center = false,
  children,
}: PageHeaderProps) => {
  return (
    <section
      className={`relative mb-8 overflow-hidden rounded-2xl border border-border bg-card px-5 py-8 sm:px-8 sm:py-10 ${center ? 'text-center' : ''}`}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-mesh opacity-60" />
      <div aria-hidden="true" className="pointer-events-none absolute -inset-x-8 -top-32 h-64 bg-spotlight" />
      <div className={`relative flex flex-col gap-4 ${center ? 'items-center' : 'sm:flex-row sm:items-end sm:justify-between'}`}>
        <div className={`flex-1 min-w-0 ${center ? 'max-w-2xl mx-auto' : ''}`}>
          {eyebrow && (
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/60 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-foreground" />
              {eyebrow}
            </div>
          )}
          <h1 className="text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
            {title}
          </h1>
          {subtitle && (
            <p className={`mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg ${center ? 'mx-auto' : ''}`}>
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="relative mt-6">{children}</div>}
    </section>
  );
};
