import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AdminEmpty } from './AdminEmpty';
import { AdminTableRowSkeleton } from './AdminLoading';

/**
 * The dense admin table, once.
 *
 * 23 hand-rolled `<table>`s lived across 18 admin files — 11 of them in
 * `pipeline-builder/tabs/*` alone — and every one re-typed the same header cell:
 *
 *   text-left px-4 py-2 font-medium text-muted-foreground text-xs2 uppercase
 *   tracking-wider w-[130px]
 *
 * `OverviewTab` repeated that string nine times in one `<thead>`. Most of the
 * ~156 arbitrary `[NNpx]` sizing values in the admin tree were those per-column
 * widths, and several of the tables had no loading state and no empty state at
 * all because each author had to remember both by hand.
 *
 * **This is deliberately NOT `AdminEntityTable`.** That stack is the sanctioned
 * one and it cannot host these: `AdminTableConfig.tableName` is required and the
 * engine queries a PostgREST table, while 7 of these files read RPCs
 * (`scraper_reconcile_orphans`, `dlq_resolve`) or edge functions and 10 more
 * receive already-fetched rows as props. Measured, ~1 of the 23 was a drop-in
 * candidate. Teaching `useAdminTableQuery` a caller-supplied source is the
 * follow-up that would let the RPC-backed ones inherit filters, sorting,
 * pagination and export; until then this gives them the markup, the skeleton,
 * the empty state and an accessible name.
 *
 * **The caption is required, not optional.** Zero of the ~36 admin tables had an
 * accessible name — `TableCaption` was exported and never once imported — so
 * every one of them announced as an unlabelled table. Passing a name is now the
 * only way to render one.
 *
 * Visuals are byte-identical to the markup being replaced, on purpose: this
 * lands across 18 files at once, and a conversion that also restyles cannot be
 * reviewed as behaviour-preserving.
 */

/**
 * Column widths as tokens rather than `w-[130px]`.
 *
 * Tailwind's standard scale, so every value stays on the 8pt grid. `auto` (the
 * default) lets the column flex, which is what the unwidthed columns did.
 */
const COL_WIDTH = {
  auto: '',
  /** ~80px — a count, a boolean, an icon. */
  xs: 'w-20',
  /** ~112px — a short status or a number. */
  sm: 'w-28',
  /** ~128px — a timestamp or a cron expression. */
  md: 'w-32',
  /** ~160px — an action cluster or a sparkline. */
  lg: 'w-40',
  /** ~224px — a name column that should not collapse. */
  xl: 'w-56',
} as const;

export type AdminTableColWidth = keyof typeof COL_WIDTH;

const ALIGN = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const;

export interface AdminSimpleColumn<Row> {
  /** Stable key. Also the React key for the cell. */
  key: string;
  /** Header label. Pass `null` for an intentionally blank action column. */
  header: ReactNode;
  align?: keyof typeof ALIGN;
  width?: AdminTableColWidth;
  /** Extra classes for this column's body cells. */
  cellClassName?: string;
  render: (row: Row, index: number) => ReactNode;
}

export interface AdminSimpleTableProps<Row> {
  /**
   * The table's accessible name. Required — see the docblock. Rendered into a
   * `<caption>`, visually hidden unless `captionVisible`.
   */
  caption: string;
  captionVisible?: boolean;
  columns: readonly AdminSimpleColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row, index: number) => string;
  isLoading?: boolean;
  /** Lowercase plural noun for the empty state — "definitions", "sources". */
  emptyNoun: string;
  emptyDescription?: string;
  /** Switches the empty copy to "No X match these filters." */
  filtered?: boolean;
  onResetFilters?: () => void;
  rowClassName?: (row: Row, index: number) => string | undefined;
  skeletonRows?: number;
  /** Wrapper classes. The default supplies the container chrome. */
  className?: string;
}

export function AdminSimpleTable<Row>({
  caption,
  captionVisible = false,
  columns,
  rows,
  rowKey,
  isLoading = false,
  emptyNoun,
  emptyDescription,
  filtered,
  onResetFilters,
  rowClassName,
  skeletonRows = 3,
  className,
}: AdminSimpleTableProps<Row>) {
  return (
    // overflow-x-auto, not overflow-hidden: a dense table must be able to scroll
    // inside its own container rather than push the page sideways, which
    // e2e/page-layout.spec.ts asserts never happens.
    <div className={cn('rounded-element bg-muted overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <caption className={captionVisible ? 'p-4 text-left text-13' : 'sr-only'}>
          {caption}
        </caption>
        <thead className="bg-muted/40">
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  'px-4 py-2 font-medium text-muted-foreground text-xs2 uppercase tracking-wider',
                  ALIGN[col.align ?? 'left'],
                  COL_WIDTH[col.width ?? 'auto'],
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <AdminTableRowSkeleton columns={columns.length} rows={skeletonRows} />
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                {/* `block`, not `inline`. AdminEmpty's own docblock says block
                    "owns a whole list/table/panel body" and inline is for a hint
                    inside a dense form — and only block renders the Clear
                    filters button, so the `inline` variant the old table bodies
                    used silently discarded `onReset`. */}
                <AdminEmpty
                  noun={emptyNoun}
                  description={emptyDescription}
                  filtered={filtered}
                  onReset={onResetFilters}
                />
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                className={cn('border-b border-border last:border-0', rowClassName?.(row, i))}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn('px-4 py-2', ALIGN[col.align ?? 'left'], col.cellClassName)}
                  >
                    {col.render(row, i)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
