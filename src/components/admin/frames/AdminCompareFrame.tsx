import * as React from 'react';
import { cn } from '@/lib/utils';
import { AdminArchetypeHeader } from './AdminArchetypeHeader';

export interface CompareRow {
  /** Field name, rendered in the centre gutter. */
  field: string;
  left: React.ReactNode;
  right: React.ReactNode;
  /** The two sides disagree. Marked structurally, not by colour alone. */
  conflict?: boolean;
}

interface AdminCompareFrameProps {
  title: React.ReactNode;
  routeLine?: string | null;
  actions?: React.ReactNode;
  /** Identity header for the record being kept. */
  leftHeader: React.ReactNode;
  /** Identity header for the record being merged away. */
  rightHeader: React.ReactNode;
  rows: CompareRow[];
  /** The ONE merge action. Singular by design — see below. */
  mergeAction?: React.ReactNode;
  className?: string;
}

/**
 * Archetype C — Compare.
 *
 * *"Two records side by side, conflicts marked, one merge action."* Mock
 * layout: `1fr 150px 1fr`, with the field name in the centre column.
 *
 * **This frame has the largest dedup return in the whole programme.** There is
 * exactly one C *route* (`/admin/duplicates`), but seven more hand-rolled diff
 * layouts are embedded elsewhere: `SideBySideComparison`, `DuplicatePairCard`,
 * `MergeDialog`, `FieldDiffView`, `VocabMerge`, `PublishDiffDialog`, and
 * `PipelineDiffDialog` + `RunCompareDialog`. Eight implementations of "show me
 * two things and let me pick".
 *
 * **A conflict is marked by a WRITTEN label plus emphasis, never by fill
 * alone** (WCAG 1.4.1). The centre gutter carries the field name and the
 * conflict marker together, so the row reads as "these two disagree about
 * *name*" rather than "this row is a colour".
 *
 * `mergeAction` is singular because the archetype is: a compare screen that
 * offers three merge buttons is a screen where nobody is sure what merging
 * does. Direction (which record survives) belongs in the headers.
 */
export function AdminCompareFrame({
  title,
  routeLine,
  actions,
  leftHeader,
  rightHeader,
  rows,
  mergeAction,
  className,
}: AdminCompareFrameProps) {
  const cols = 'sm:grid-cols-[minmax(0,1fr)_150px_minmax(0,1fr)]';
  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <AdminArchetypeHeader title={title} routeLine={routeLine} actions={actions} />

      <div className="min-w-0 px-6 pb-6">
        <div className={cn('grid grid-cols-1 gap-4 pb-4', cols)}>
          <div className="min-w-0">{leftHeader}</div>
          <div aria-hidden className="hidden sm:block" />
          <div className="min-w-0">{rightHeader}</div>
        </div>

        {rows.map((row) => (
          <div
            key={row.field}
            className={cn(
              'grid grid-cols-1 items-start gap-4 border-t border-border-hairline py-4',
              cols,
            )}
          >
            <div className="min-w-0 text-15">{row.left}</div>
            <div className="min-w-0 text-center">
              <div className="text-xs2 font-bold uppercase tracking-label text-muted-foreground">
                {row.field}
              </div>
              {row.conflict && (
                // Written, not just styled: a reader who cannot distinguish
                // the emphasis still learns that this row is the problem.
                <div className="mt-1 text-xs2 font-bold uppercase tracking-label text-destructive">
                  Conflict
                </div>
              )}
            </div>
            <div className={cn('min-w-0 text-15', row.conflict && 'font-bold')}>{row.right}</div>
          </div>
        ))}

        {mergeAction && (
          <div className="flex justify-end border-t border-border-hairline pt-4">{mergeAction}</div>
        )}
      </div>
    </div>
  );
}
