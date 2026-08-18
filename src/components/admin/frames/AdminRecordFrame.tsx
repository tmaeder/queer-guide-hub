import * as React from 'react';
import { cn } from '@/lib/utils';
import { AdminArchetypeHeader } from './AdminArchetypeHeader';

interface AdminRecordFrameProps {
  title: React.ReactNode;
  routeLine?: string | null;
  actions?: React.ReactNode;
  /** Column 1 — section tabs, vertical. */
  tabRail: React.ReactNode;
  /** Column 2 — the field form. */
  children: React.ReactNode;
  /**
   * Column 3 — quality panel, version history, next-best-action. Optional:
   * a read-mostly datasheet has nothing to put here.
   */
  rail?: React.ReactNode;
  className?: string;
}

/**
 * Archetype B — Record editor.
 *
 * *"Field form, left tab rail, quality panel docked right."* Mock layout:
 * `170px 1fr 330px`.
 *
 * **The tab rail is VERTICAL.** `CMSEditorLayout` renders its sections as a
 * horizontal `<Tabs>` today, which is why it is scheduled late in the
 * migration rather than early: it serves ~20 content types and carries the
 * field registry, workflow, AI assist and queue mode, so it is the highest
 * blast radius per line in the console.
 *
 * The rail is a sibling that reflows below `lg`, never `hidden lg:block` — the
 * same rule the public `SinglePage` spine follows. A quality panel that
 * silently disappears on a laptop is worse than one that scrolls.
 */
export function AdminRecordFrame({
  title,
  routeLine,
  actions,
  tabRail,
  children,
  rail,
  className,
}: AdminRecordFrameProps) {
  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <AdminArchetypeHeader title={title} routeLine={routeLine} actions={actions} />

      <div
        className={cn(
          'grid min-w-0 gap-6 px-6 pb-6',
          rail ? 'lg:grid-cols-[170px_minmax(0,1fr)_330px]' : 'lg:grid-cols-[170px_minmax(0,1fr)]',
        )}
      >
        <nav className="min-w-0" aria-label="Record sections">
          {tabRail}
        </nav>
        <div className="min-w-0">{children}</div>
        {rail && <aside className="min-w-0">{rail}</aside>}
      </div>
    </div>
  );
}
