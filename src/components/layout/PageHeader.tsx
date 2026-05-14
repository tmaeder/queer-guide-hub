/**
 * PageHeader — Unified page header component.
 *
 * Renders a consistent H1 + optional subtitle + optional actions slot
 * on a solid surface. Used across all public pages.
 */

import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
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
    <div className="border border-border bg-card p-5 sm:p-6 mb-6">
      <div
        className={`flex flex-col gap-3 justify-between sm:flex-row sm:items-center ${
          center ? 'sm:flex-col text-center' : 'items-start'
        }`}
      >
        <div className="flex-1 min-w-0">
          <h1 className={`text-3xl font-bold ${subtitle ? 'mb-1' : ''}`}>{title}</h1>
          {subtitle && <p className="text-base text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
};
