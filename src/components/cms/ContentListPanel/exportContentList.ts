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
import { formatDate, formatDateTime } from '@/lib/format';

type Row = Record<string, unknown>;

function accessorFor(field: FieldConfig): (row: Row) => string | number | boolean | null | undefined {
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

export async function exportContentType(
  config: ContentTypeConfig,
  listColumns: FieldConfig[],
): Promise<void> {
  // Title first, then the configured list columns (deduped by column name).
  const columns: ExportColumnDef<Row>[] = [
    { header: 'Title', accessor: (r) => (r[config.titleField] as string) ?? '' },
    ...listColumns
      .filter((f) => f.name !== config.titleField)
      .map((f) => ({ header: f.label, accessor: accessorFor(f) })),
  ];

  const rows = await fetchAllRows<Row>(config.tableName, '*', {
    column: config.titleField,
    ascending: true,
  });

  await exportToExcel(rows, columns, generateFilename(config.id));
}
