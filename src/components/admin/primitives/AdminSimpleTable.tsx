import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AdminEmpty } from './AdminEmpty';
import { AdminTableRowSkeleton } from './AdminLoading';

/**
 * Shared admin table for already-fetched rows, RPCs, and edge-function data.
 * Uses the admin list typography, tonal rows, and accessible loading/empty states.
 * A required caption names the table for assistive technology. Native table
 * markup preserves the caller's bounded scroll container for sticky headers.
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
    <div className={cn('rounded-container bg-card overflow-x-auto', className)}>
      <table className="w-full text-13" style={{ borderCollapse: 'collapse' }}>
        <caption className={captionVisible ? 'p-4 text-left text-13' : 'sr-only'}>
          {caption}
        </caption>
        <thead className={cn('bg-card', stickyHeader && 'sticky top-0 z-10')}>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  'h-12 px-4 py-2 font-semibold text-muted-foreground text-13',
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
                  'odd:bg-muted/30 hover:bg-muted/60 focus-within:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  onRowClick && 'cursor-pointer',
                  rowClassName?.(row, i),
                )}
                {...(onRowClick
                  ? {
                      onClick: (event: MouseEvent<HTMLTableRowElement>) => {
                        if (
                          (event.target as Element).closest(
                            'button,a,label,input,select,textarea,[role=button],[role=checkbox],[role=switch],[role=combobox]',
                          )
                        )
                          return;
                        onRowClick(row, i);
                      },
                      tabIndex: 0,
                      onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        // Space scrolls the page by default, and the row is the
                        // activation target here, so consume it.
                        e.preventDefault();
                        e.stopPropagation();
                        onRowClick(row, i);
                      },
                    }
                  : {})}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-4 tabular-nums',
                      ALIGN[col.align ?? 'left'],
                      col.cellClassName,
                    )}
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
