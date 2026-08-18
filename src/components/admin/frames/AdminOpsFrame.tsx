import * as React from 'react';
import { cn } from '@/lib/utils';
import { AdminArchetypeHeader } from './AdminArchetypeHeader';

interface AdminOpsFrameProps {
  title: React.ReactNode;
  routeLine?: string | null;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  /** The stage line — an SVG run of the pipeline's steps. */
  stageLine?: React.ReactNode;
  /** The live log. Ink block, monospace. */
  log?: React.ReactNode;
  /** Anything between the stage line and the log. */
  children?: React.ReactNode;
  /** Right column — run history, key/value facts. */
  rail?: React.ReactNode;
  className?: string;
}

/**
 * Archetype D — Ops monitor.
 *
 * *"Stage line, run history, live log. Read-mostly."* Mock layout: `1fr 380px`.
 *
 * **"Read-mostly" is the load-bearing word.** These surfaces watch things that
 * are already running, so the frame gives the primary-action slot no
 * prominence: an ops screen whose loudest control is "Run now" invites a click
 * during an incident. `RunStatsBar`, `RunHistorySidebar` and `LogStreamDrawer`
 * are already exactly this frame's three parts, unassembled.
 *
 * The log is the caller's: it is an ink block with monospace type
 * (`background:#111`, 12.5px) and severity-tagged lines, and it is the one
 * place in admin where a dark surface is correct in both themes, because it is
 * a terminal rather than a panel.
 */
export function AdminOpsFrame({
  title,
  routeLine,
  filters,
  actions,
  stageLine,
  log,
  children,
  rail,
  className,
}: AdminOpsFrameProps) {
  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <AdminArchetypeHeader
        title={title}
        routeLine={routeLine}
        filters={filters}
        actions={actions}
      />
      <div
        className={cn(
          'grid min-w-0 gap-6 px-6 pb-6',
          rail ? 'lg:grid-cols-[minmax(0,1fr)_380px]' : 'lg:grid-cols-1',
        )}
      >
        <div className="flex min-w-0 flex-col gap-6">
          {stageLine}
          {children}
          {log}
        </div>
        {rail && <aside className="min-w-0">{rail}</aside>}
      </div>
    </div>
  );
}
