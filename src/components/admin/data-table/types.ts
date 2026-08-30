import type { ColumnDef, RowData } from '@tanstack/react-table';
import type { LucideIcon } from 'lucide-react';
import type { AdminTableFeatures } from './features';
import type { ExportColumnDef } from '@/utils/excelExport';
import type { BackfillJob } from '@/config/backfillJobs';

// ── Column Metadata ─────────────────────────────────────────────

export interface AdminColumnMeta {
  serverSortable?: boolean;
  serverFilterable?: boolean;
  filterType?: 'select' | 'search' | 'range' | 'date' | 'boolean';
  filterOptions?: { value: string; label: string }[];
  dbColumn?: string;
  defaultVisible?: boolean;
  hideable?: boolean;
  groupable?: boolean;
}

// ── Entity Filter Config ────────────────────────────────────────

export interface EntityFilterConfig {
  key: string;
  label: string;
  type: 'select' | 'multiselect' | 'boolean' | 'date-range';
  column: string;
  options?: { value: string; label: string }[] | 'dynamic';
  dynamicSource?: { table: string; column: string; labelColumn?: string };
}

// ── Bulk Edit Field Config ──────────────────────────────────────

export interface BulkEditFieldConfig {
  key: string;
  label: string;
  type: 'select' | 'boolean' | 'text' | 'multiselect';
  column: string;
  options?: { value: string; label: string }[];
}

// ── Row Action Config ───────────────────────────────────────────

export interface RowActionConfig<TData> {
  key: string;
  label: string;
  icon?: LucideIcon;
  onClick: (row: TData) => void;
  visible?: (row: TData) => boolean;
  variant?: 'default' | 'destructive';
}

// ── Table Config (per-page) ─────────────────────────────────────

export interface AdminTableConfig<TData extends RowData> {
  tableName: string;
  /**
   * Optional table to target for mutations (bulk edit/delete) when `tableName`
   * is a read-only view. Defaults to `tableName`.
   */
  mutationTable?: string;
  /**
   * Plural noun for a row, lowercase — "venues", "news sources". Drives the
   * empty state ("No venues yet."). Defaults to `tableName` de-underscored,
   * which is already the right word for most tables.
   */
  emptyNoun?: string;
  select?: string;
  /**
   * `TValue` is `any`, not `unknown`, and that is load-bearing in v9.
   *
   * v9 marks `ColumnDef`'s type params `in out` (strictly invariant), so a
   * heterogeneous array — `accessor('name')` yields `TValue = string`,
   * `accessor('star_rating')` yields `number` — no longer widens into a single
   * `ColumnDef<…, unknown>`. TS reports it as "two different types with this
   * name exist, but they are unrelated". `any` is bivariant and absorbs every
   * column's value type, which is what `unknown` did for us under v8.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above: invariant TValue needs a bivariant slot to hold mixed columns.
  columns: ColumnDef<AdminTableFeatures, TData, any>[];
  entityFilters?: EntityFilterConfig[];
  bulkEditFields?: BulkEditFieldConfig[];
  /** Selection-scoped backfill jobs (from backfillJobs registry) shown in the
   *  bulk bar — e.g. events → "Re-check liveness" on the selected rows. */
  backfillJobs?: BackfillJob[];
  rowActions?: RowActionConfig<TData>[];
  toolbarActions?: React.ReactNode;
  defaultSort?: { column: string; direction: 'asc' | 'desc' };
  defaultPageSize?: number;
  defaultFilters?: Record<string, unknown>;
  enableSelection?: boolean;
  enableGrouping?: boolean;
  enableSearch?: boolean;
  searchColumns?: string[];
  baseFilters?: Record<string, unknown>;
  exportColumns?: ExportColumnDef<TData>[];
  contentTypeId?: string;
  onRowClick?: (row: TData) => void;
  /** Optional per-row className for visual emphasis (e.g. mark hidden entities). */
  rowClassName?: (row: TData) => string | undefined;
  /** Callback after bulk edit mutation succeeds */
  onBulkEditSuccess?: () => void;
  /** Callback after bulk delete mutation succeeds */
  onBulkDeleteSuccess?: () => void;
  /**
   * Show Delete in the bulk bar. Defaults to `true` — the historical behaviour
   * for every table using this shell.
   *
   * Set `false` where a raw `DELETE FROM <table> WHERE id IN (...)` is the
   * WRONG operation, not merely a dangerous one. `/admin/users` is the case
   * this exists for: `profiles` has NO-ACTION FK blockers that must be cleared
   * first, storage objects with no FK at all, and an `auth.users` row a table
   * delete never touches — which is exactly why `delete_my_account` runs thirty
   * statements in a fixed order. The bulk bar knew none of that and offered the
   * button anyway.
   */
  allowBulkDelete?: boolean;
}

// ── Table State ─────────────────────────────────────────────────

export interface AdminTableState {
  search: string;
  debouncedSearch: string;
  filters: Record<string, unknown>;
  sorting: { column: string; direction: 'asc' | 'desc' } | null;
  pagination: { page: number; pageSize: number };
  selectedIds: Set<string>;
  columnVisibility: Record<string, boolean>;
  grouping: string[];
}

// ── Filter Presets ──────────────────────────────────────────────

export interface FilterPreset {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  search: string;
  sorting: AdminTableState['sorting'];
  /** When true, this view is applied on page load (one default per table). */
  isDefault?: boolean;
}
