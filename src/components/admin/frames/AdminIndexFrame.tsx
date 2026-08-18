import * as React from 'react';
import { cn } from '@/lib/utils';
import { AdminArchetypeHeader } from './AdminArchetypeHeader';

interface AdminIndexFrameProps {
  title: React.ReactNode;
  routeLine?: string | null;
  /** Chips, search, saved-view switcher — anything that narrows the set. */
  filters?: React.ReactNode;
  /** Right-aligned cluster; primary action last. */
  actions?: React.ReactNode;
  /**
   * View switcher (table / gallery / board / timeline / calendar). Sits with
   * the body, not the header: it changes how the SAME set is drawn, whereas a
   * filter changes what the set IS.
   */
  viewSwitch?: React.ReactNode;
  /** The records, in whichever view is selected. */
  children: React.ReactNode;
  /**
   * `1–8 of 12,408 · bulk actions on selection`. Text, not a numbered pager —
   * see the note below about what that does NOT mean.
   */
  countLine?: React.ReactNode;
  /** Page controls. Kept separate from `countLine` deliberately — see below. */
  pagination?: React.ReactNode;
  /** Bulk action bar, shown when a selection exists. */
  bulkBar?: React.ReactNode;
  className?: string;
}

/**
 * Archetype A — Index.
 *
 * *"Filterable table of records with bulk actions and saved views."*
 *
 * **A is an index frame with a PLUGGABLE VIEW, not a table**, and that
 * distinction decides whether the eight-frame claim survives contact.
 * `ContentListPanel` — 24 of the 40 admin routes — already ships five view
 * modes (table, gallery, board, timeline, calendar). Define A as "a table" and
 * the archetype fails on the single highest-traffic route on day one, and the
 * Kanban boards become a spurious ninth archetype. So the frame owns the
 * chrome (header, filter row, view switch, count, bulk bar) and the caller
 * owns the body.
 *
 * **`countLine` and `pagination` are separate props on purpose.** The mock
 * shows only a text count and no numbered pager, and reading that as "delete
 * the pager" would reintroduce a bug this codebase has already shipped once:
 * `ListPagination`'s own docblock records that gallery/board/timeline/calendar
 * had no page controls, so on a 40k-row entity "you could see 25 records and
 * no more". Drop the numbered page LINKS to match the mock; keep prev/next and
 * page-size. The count line is a label, not a control.
 */
export function AdminIndexFrame({
  title,
  routeLine,
  filters,
  actions,
  viewSwitch,
  children,
  countLine,
  pagination,
  bulkBar,
  className,
}: AdminIndexFrameProps) {
  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <AdminArchetypeHeader
        title={title}
        routeLine={routeLine}
        filters={filters}
        actions={actions}
      />

      {viewSwitch && (
        <div className="flex flex-wrap items-center justify-end gap-2 pb-4">{viewSwitch}</div>
      )}

      {/* The records. `min-w-0` so a wide table scrolls inside the frame
        instead of widening the page — e2e/page-layout.spec.ts asserts zero
        horizontal overflow on the document. */}
      <div className="min-w-0 overflow-x-auto">{children}</div>

      {(countLine || pagination) && (
        <div className="flex flex-wrap items-center justify-between gap-4 py-4 text-13 font-bold text-muted-foreground">
          {countLine ? <span>{countLine}</span> : <span />}
          {pagination}
        </div>
      )}

      {bulkBar}
    </div>
  );
}
