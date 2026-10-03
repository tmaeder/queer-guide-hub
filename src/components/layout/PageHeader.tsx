/**
 * PageHeader — Unified page header component.
 *
 * Renders a consistent H1 + optional subtitle + optional actions slot
 * on a solid surface. Used across all public pages.
 *
 * CSS-only entrance (`.content-enter` + staggered delays): this renders in
 * the shell on most public routes, so a framer-motion import here would
 * chain ~97 KB onto the entry chunk. Reduced motion is handled in index.css.
 */

import React from 'react';

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Center-align title and subtitle (for hero-style headers) */
  center?: boolean;
  children?: React.ReactNode;
}

export const PageHeader = ({
  title,
  subtitle,
  actions,
  center = false,
  children,
}: PageHeaderProps) => {
  return (
    // Shared subway page grammar: the route context is already carried by the
    // shell's family line, so this block gives the title one uninterrupted
    // focal plane. Filters and actions follow it instead of competing through
    // a second heavy rule or another framed container.
    <header className="content-enter page-masthead mb-8">
      <div
        className={`flex flex-col justify-between gap-4 sm:flex-row sm:items-end ${
          center ? 'sm:flex-col text-center' : 'items-start'
        }`}
      >
        <div className="min-w-0 flex-1">
          <h1
            className={`content-enter max-w-5xl text-balance font-display text-display leading-[0.95] tracking-tight md:text-hero ${subtitle ? 'mb-4' : ''}`}
            style={{ animationDelay: 'var(--motion-header-line-delay)' }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className="content-enter max-w-reading text-pretty text-body-lg text-muted-foreground"
              style={{ animationDelay: 'var(--motion-header-copy-delay)' }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-6">{children}</div>}
    </header>
  );
};
