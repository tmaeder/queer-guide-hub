import * as React from 'react';
import { cn } from '@/lib/utils';
import { AdminArchetypeHeader } from './AdminArchetypeHeader';

interface AdminInboxFrameProps {
  title: React.ReactNode;
  routeLine?: string | null;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  /** Column 1 — the queue. */
  list: React.ReactNode;
  /** Column 2 — the selected item. */
  thread: React.ReactNode;
  /**
   * Column 3 — the decision. Optional, but an F surface without one is worth a
   * second look: *"Every item ends in a decision."*
   */
  actionRail?: React.ReactNode;
  className?: string;
}

/**
 * Archetype F — Inbox.
 *
 * *"List, thread, action rail. Every item ends in a decision."* Mock layout:
 * `340px 1fr 300px`.
 *
 * **The action rail is a SIBLING column, not a section inside the thread**,
 * and that is a behavioural change disguised as a layout one. In `TriageView`
 * today the actions live inside `TriageDetailPanel`; promoting them to their
 * own column changes DOM order, which changes tab order, which is what
 * `useTriageKeyboard` navigates. Migrating an F route means moving its
 * keyboard spec in the same commit, not afterwards — `/admin/inbox` is
 * therefore the LAST F route to migrate, not the first.
 *
 * The three columns collapse to one below `lg`. They do not become tabs: a
 * queue you cannot see while reading an item is a different product, and the
 * mobile admin case is triage-on-a-phone, which needs the list one scroll
 * away rather than one tap and a lost position.
 */
export function AdminInboxFrame({
  title,
  routeLine,
  filters,
  actions,
  list,
  thread,
  actionRail,
  className,
}: AdminInboxFrameProps) {
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
          'grid min-w-0 gap-6 pb-6',
          actionRail
            ? 'lg:grid-cols-[340px_minmax(0,1fr)_300px]'
            : 'lg:grid-cols-[340px_minmax(0,1fr)]',
        )}
      >
        {/* `minmax(0,1fr)` on the thread, never a bare `1fr`: a long unbroken
          subject line in a grid child with an implicit `min-width:auto` blows
          the column out and takes the page's horizontal scroll with it. */}
        <div className="min-w-0">{list}</div>
        <div className="min-w-0">{thread}</div>
        {actionRail && <div className="min-w-0">{actionRail}</div>}
      </div>
    </div>
  );
}
