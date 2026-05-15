/**
 * PageHeader — Unified page header component.
 *
 * Renders a consistent H1 + optional subtitle + optional actions slot
 * on a solid surface. Used across all public pages.
 */

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

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
  const reduced = useReducedMotion();
  const base = reduced
    ? { initial: false as const, animate: { opacity: 1, y: 0 } }
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
      };

  return (
    <motion.div
      {...base}
      className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm p-6 sm:p-8 mb-6 shadow-[var(--shadow-aceternity-sm)]"
    >
      <div
        className={`flex flex-col gap-3 justify-between sm:flex-row sm:items-center ${
          center ? 'sm:flex-col text-center' : 'items-start'
        }`}
      >
        <div className="flex-1 min-w-0">
          <motion.h1
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className={`text-3xl sm:text-4xl font-bold tracking-tight ${subtitle ? 'mb-2' : ''}`}
          >
            {title}
          </motion.h1>
          {subtitle && (
            <motion.p
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="text-base text-muted-foreground max-w-2xl"
            >
              {subtitle}
            </motion.p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </motion.div>
  );
};
