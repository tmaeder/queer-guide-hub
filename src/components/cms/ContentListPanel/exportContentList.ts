/**
 * exportContentList — generic "export current content type to Excel" for the
 * unified content browser. Reuses src/utils/excelExport (lazy-loads exceljs)
 * so the bespoke per-entity export the legacy admin pages carried is now a
 * built-in capability of /admin/content/:type.
 *
 * Columns mirror the type's configured list columns (plus the title); values
 * are formatted by field type. Exports the full table (matching the legacy
 * pages' "export all rows" behaviour), not just the current page.
 */

import type { ContentTypeConfig, FieldConfig } from '@/types/cms';
import {
  exportToExcel,
  fetchAllRows,
  formatArray,
  formatBoolean,
  generateFilename,
  type ExportColumnDef,
} from '@/utils/excelExport';
import { exportToCsv } from '@/utils/csvExport';
import {
  applyArchivedView,
  applyContentSearch,
  applyFilters,
  applyMergedView,
  type ArchivedView,
  type MergedView,
} from './filterOps';
import type { Filter } from './viewSpec';
import { formatDate, formatDateTime } from '@/lib/format';

type Row = Record<string, unknown>;

function accessorFor(
  field: FieldConfig,
): (row: Row) => string | number | boolean | null | undefined {
  return (row) => {
    const v = row[field.name];
    if (v === null || v === undefined) return '';
    switch (field.type) {
      case 'boolean':
        return formatBoolean(v as boolean);
      case 'date':
        return formatDate(v as string);
      case 'datetime':
        return formatDateTime(v as string);
      case 'tags':
      case 'images':
      case 'multiselect':
        return Array.isArray(v) ? formatArray(v as string[]) : String(v);
      case 'number':
        return typeof v === 'number' ? v : Number(v) || 0;
      case 'json':
      case 'location':
      case 'social_links':
        return typeof v === 'object' ? JSON.stringify(v) : String(v);
      default:
        if (Array.isArray(v)) return formatArray(v as string[]);
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
    }
  };
}

/**
 * The slice of the list the export should match. Omitted = every row in the
 * table, which is what the taxonomy-wide export wants.
 */
export interface ExportScope {
  filters?: Filter[];
  search?: string;
  archivedView?: ArchivedView;
  mergedView?: MergedView;
}

/** Every column present on at least one row, in first-seen order. */
export function rowColumnNames(rows: Row[]): string[] {
  const names = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) names.add(key);
  return [...names];
}

/**
 * Title first, then the preferred fields (the list's columns), then every other
 * configured field, then every remaining column the rows actually carry, then
 * the id — so an export contains all fields, not just the ones on screen.
 * Configured fields keep their label and type formatting; unconfigured columns
 * use the raw column name.
 */
export function exportColumnsFor(
  config: ContentTypeConfig,
  rows: Row[],
  preferred: FieldConfig[] = [],
): ExportColumnDef<Row>[] {
  const seen = new Set<string>([config.titleField, config.primaryKey]);
  const fields: FieldConfig[] = [];
  for (const f of [...preferred, ...config.fields]) {
    if (f.virtual || seen.has(f.name)) continue;
    seen.add(f.name);
    fields.push(f);
  }
  for (const name of rowColumnNames(rows)) {
    if (seen.has(name)) continue;
    seen.add(name);
    fields.push({ name, label: name, type: 'text' } as FieldConfig);
  }
  return [
    { header: 'Title', accessor: (r) => (r[config.titleField] as string) ?? '' },
    ...fields.map((f) => ({ header: f.label, accessor: accessorFor(f) })),
    { header: 'ID', accessor: (r) => String(r[config.primaryKey] ?? '') },
  ];
}

/** Narrow a fetch to what the list currently shows, with a stable tiebreak. */
function scopeRefiner(config: ContentTypeConfig, scope?: ExportScope) {
  return <Q>(query: Q): Q => {
    let q = query as never;
    if (scope?.search) q = applyContentSearch(q, config, scope.search) as never;
    if (scope?.filters?.length) q = applyFilters(q, scope.filters) as never;
    if (scope?.archivedView)
      q = applyArchivedView(q, config.lifecycle?.archive, scope.archivedView) as never;
    if (scope?.mergedView) q = applyMergedView(q, config.merge, scope.mergedView) as never;
    // Offset pagination over a non-unique order can skip or repeat rows
    // between pages; the primary key makes the order total.
    return (q as unknown as { order: (c: string, o: object) => Q }).order(config.primaryKey, {
      ascending: true,
    });
  };
}

export function fetchContentRows(config: ContentTypeConfig, scope?: ExportScope) {
  return fetchAllRows<Row>(
    config.tableName,
    '*',
    { column: config.titleField, ascending: true },
    1000,
    scopeRefiner(config, scope),
  );
}

export async function exportContentType(
  config: ContentTypeConfig,
  listColumns: FieldConfig[],
  format: ExportFormat = 'Excel',
  scope?: ExportScope,
): Promise<void> {
  const rows = await fetchContentRows(config, scope);
  // List columns lead; every other field and column follows.
  const columns = exportColumnsFor(config, rows, listColumns);

  if (format === 'CSV') {
    exportToCsv(rows, columns, generateFilename(config.id).replace(/\.xlsx$/, '.csv'));
  } else {
    await exportToExcel(rows, columns, generateFilename(config.id));
  }
}

export type ExportFormat = 'Excel' | 'CSV';
