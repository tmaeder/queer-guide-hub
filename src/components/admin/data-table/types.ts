import type { ColumnDef } from '@tanstack/react-table';
import type { LucideIcon } from 'lucide-react';
import type { ExportColumnDef } from '@/utils/excelExport';

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

export interface AdminTableConfig<TData> {
  tableName: string;
  /**
   * Optional table to target for mutations (bulk edit/delete) when `tableName`
   * is a read-only view. Defaults to `tableName`.
   */
  mutationTable?: string;
  select?: string;
  columns: ColumnDef<TData, unknown>[];
  entityFilters?: EntityFilterConfig[];
  bulkEditFields?: BulkEditFieldConfig[];
  rowActions?: RowActionConfig<TData>[];
  toolbarActions?: React.ReactNode;
  defaultSort?: { column: string; direction: 'asc' | 'desc' };
  defaultPageSize?: number;
  enableSelection?: boolean;
  enableGrouping?: boolean;
  enableSearch?: boolean;
  searchColumns?: string[];
  baseFilters?: Record<string, unknown>;
  exportColumns?: ExportColumnDef<TData>[];
  contentTypeId?: string;
  /** Callback after bulk edit mutation succeeds */
  onBulkEditSuccess?: () => void;
  /** Callback after bulk delete mutation succeeds */
  onBulkDeleteSuccess?: () => void;
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
}
