import type { KeyboardEvent, ReactNode } from 'react';
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
 * `OverviewTab` repeated that string nine times in one `<thead>`. Several of the
 * tables also had no loading state and no empty state at all, because each author
 * had to remember both by hand.
 *
 * **It removes fewer arbitrary sizes than it looks like it should, and the real
 * number is 16.** The claim first written here was that most of admin's ~156
 * arbitrary `[NNpx]` values were per-column widths; measured after converting 19
 * tables, the count went 156 → 140. The rest are a different thing the `width`
 * token cannot touch: `max-w-[240px]` on truncating text INSIDE a cell,
 * `TooltipContent max-w-[400px]`, `max-h-[600px]` scroll containers, and
 * `w-[8px] h-[14px]` on OverviewTab's run-status strip. Governing those is a
 * separate decision about a sizing scale, not a table concern.
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
 * The chrome is taken verbatim from the `pipeline-builder/tabs/*` tables this was
 * modelled on, so for those 11 files the conversion is visually identical.
 *
 * **For the others it NORMALIZES, and that is worth knowing before you convert
 * one.** `AdminAutomation` and `AdminGeography` had their own header style, so
 * converting them moved header cells to `font-medium text-muted-foreground
 * text-xs2 uppercase tracking-wider`, body text from `text-13`/`text-15` to
 * `text-sm`, and row rules from `border-t`/`border-border/60` to
 * `border-b border-border last:border-0`. That convergence is the point of the
 * primitive — but it means a conversion diff is not behaviour-only, and a table
 * whose current styling is deliberate should keep it rather than be forced here.
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
  /**
   * Whole-row activation — opens a detail pane or drawer.
   *
   * Added because three tables genuinely needed it and stayed unconverted
   * without it (`AdminAutomation`'s registry, `MonitorTab`'s recent runs,
   * `ErrorsTab`'s recent errors), not to make anything fit. **All three were
   * `<tr onClick>` with no `tabIndex`, no `onKeyDown` and no role — mouse-only,
   * so a keyboard user could not open those panels at all (WCAG 2.1.1).**
   * Centralising the handler fixes that for every caller instead of asking three
   * authors to remember it.
   *
   * Not `role="button"`: that would strip the row's table semantics. A focusable
   * row activated by Enter/Space is the affordance here; the selected-row tint
   * belongs in `rowClassName`.
   */
  onRowClick?: (row: Row, index: number) => void;
  /**
   * Replaces the whole empty body, for a table whose empty state is a real
   * message rather than an absence.
   *
   * `AlertsTab` is why this exists: empty is GOOD NEWS there, and it renders a
   * CheckCircle plus "All clear". `AdminEmpty` would say "No alerts yet." with an
   * Inbox glyph — a copy regression, and its own named test caught it.
   */
  emptyContent?: ReactNode;
  /**
   * Keeps the header row visible while the body scrolls.
   *
   * Opt-in, and restoring it was a REGRESSION FIX: eight of the converted
   * pipeline-builder tables carried `<thead className="bg-muted/40 sticky top-0">`
   * and lost it in the conversion, which on a table that scrolls inside a
   * `max-h` container means the column headers scroll out of view — the exact
   * situation sticky exists for.
   *
   * Default false rather than true, because `AdminShell`'s `<main>` is itself the
   * scroll container (`data-scroll-container`), so a sticky header on a table
   * that is NOT in a bounded box would start floating during ordinary page
   * scroll. Faithfully restoring the eight is the goal; changing the other
   * eleven is not.
   */
  stickyHeader?: boolean;
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
  onRowClick,
  emptyContent,
  stickyHeader = false,
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
        <thead className={cn('bg-muted/40', stickyHeader && 'sticky top-0 z-10')}>
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
                {emptyContent ?? (
                  <AdminEmpty
                    noun={emptyNoun}
                    description={emptyDescription}
                    filtered={filtered}
                    onReset={onResetFilters}
                  />
                )}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                className={cn(
                  'border-b border-border last:border-0',
                  onRowClick && 'cursor-pointer',
                  rowClassName?.(row, i),
                )}
                {...(onRowClick
                  ? {
                      onClick: () => onRowClick(row, i),
                      tabIndex: 0,
                      onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        // Space scrolls the page by default, and the row is the
                        // activation target here, so consume it.
                        e.preventDefault();
                        onRowClick(row, i);
                      },
                    }
                  : {})}
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
