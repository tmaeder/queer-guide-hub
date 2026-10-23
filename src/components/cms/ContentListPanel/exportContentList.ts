/**
 * Export every record of a content type as Excel or CSV for the unified
 * content browser. Reuses src/utils/excelExport (lazy-loads exceljs)
 * so the bespoke per-entity export the legacy admin pages carried is now a
 * built-in capability of /admin/content/:type.
 *
 * Columns include configured fields and remaining database columns; values
 * are formatted by field type. List filters, search and pagination never
 * restrict this full-table export.
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

/** All records, independent of the current list view, with a total ordering. */
export async function fetchContentRows(config: ContentTypeConfig) {
  const rows = await fetchAllRows<Row>(
    config.tableName,
    '*',
    { column: config.titleField, ascending: true },
    1000,
    <Q>(query: Q): Q =>
      (query as unknown as { order: (column: string, options: object) => Q }).order(
        config.primaryKey,
        { ascending: true },
      ),
  );
  const ids = rows.map((row) => row[config.primaryKey]);
  if (ids.some((id) => id == null) || new Set(ids).size !== rows.length) {
    throw new Error(
      `The ${config.tableName} export contains missing or duplicate record IDs. Please retry.`,
    );
  }
  return rows;
}

export async function exportContentType(
  config: ContentTypeConfig,
  listColumns: FieldConfig[],
  format: ExportFormat = 'Excel',
): Promise<void> {
  const rows = await fetchContentRows(config);
  // List columns lead; every other field and column follows.
  const columns = exportColumnsFor(config, rows, listColumns);

  // Name the file after the table, not the config id: workspace lists reuse a
  // type under an id like `workspace_hotels`, which is no name for a file.
  const filename = generateFilename(config.tableName);
  if (format === 'CSV') {
    exportToCsv(rows, columns, filename.replace(/\.xlsx$/, '.csv'));
  } else {
    await exportToExcel(rows, columns, filename);
  }
}

/**
 * Export ONE record — every column, same formatting as the list export — for
 * the admin menu on a public detail page. Fetched fresh by primary key rather
 * than taken from the page's data, which is a joined, display-shaped object.
 * Throws when the row cannot be read, so the caller can say so instead of
 * downloading an empty file.
 */
export async function exportContentRecord(
  config: ContentTypeConfig,
  id: string,
  format: ExportFormat = 'Excel',
): Promise<void> {
  const rows = await fetchContentRows(config, {
    filters: [{ id: 'record', field: config.primaryKey, op: 'eq', value: id }],
  });
  if (rows.length === 0) throw new Error(`No ${config.tableName} row with id ${id}`);
  const columns = exportColumnsFor(config, rows);
  const filename = generateFilename(`${config.tableName}-${id}`);
  if (format === 'CSV') {
    exportToCsv(rows, columns, filename.replace(/\.xlsx$/, '.csv'));
  } else {
    await exportToExcel(rows, columns, filename);
  }
}

export type ExportFormat = 'Excel' | 'CSV';
