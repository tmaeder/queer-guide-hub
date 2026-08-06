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
    // PASTE-UP masthead. The outlined card is gone: a page title does not live
    // in a box, it sits under a heavy rule like the head of a printed section.
    // `.rule-heavy` is the existing rationed 2px black signature.
    <div className="content-enter rule-heavy pt-6 pb-6 sm:pb-8 mb-6">
      <div
        className={`flex flex-col gap-4 justify-between sm:flex-row sm:items-center ${
          center ? 'sm:flex-col text-center' : 'items-start'
        }`}
      >
        <div className="flex-1 min-w-0">
          <h1
            className={`content-enter font-display text-display font-bold tracking-tight ${subtitle ? 'mb-2' : ''}`}
            style={{ animationDelay: '50ms' }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className="content-enter text-base text-muted-foreground max-w-2xl"
              style={{ animationDelay: '120ms' }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
};
