import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

// ---------- Types ----------

export interface ExportColumnDef<T> {
  header: string;
  accessor: (row: T) => string | number | boolean | null | undefined;
}

// ---------- Core export function (lazy-loads exceljs) ----------

export async function exportToExcel<T>(
  data: T[],
  columns: ExportColumnDef<T>[],
  filename: string,
): Promise<void> {
  const { needsStreamingExcel, streamingExcelBlob } = await import('./streamingExcel');
  if (needsStreamingExcel(data, columns)) {
    downloadExcelBlob(await streamingExcelBlob([{ name: 'Data', rows: data, columns }]), filename);
    return;
  }
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Data');

  const headers = columns.map((col) => col.header);
  ws.addRow(headers);

  for (const row of data) {
    ws.addRow(
      columns.map((col) => {
        const val = col.accessor(row);
        if (val === null || val === undefined) return '';
        return val;
      }),
    );
  }

  // Auto-size columns (approximate based on content length)
  ws.columns.forEach((col, i) => {
    const sampleRows = data.slice(0, 200);
    const maxLen = Math.max(
      headers[i].length,
      ...sampleRows.map((r) => String(columns[i].accessor(r) ?? '').length),
    );
    col.width = Math.min(maxLen + 2, 60);
  });

  await downloadWorkbook(workbook, filename);
}

// ---------- Multi-sheet workbook ----------

export interface ExportSheet<T> {
  name: string;
  rows: T[];
  columns: ExportColumnDef<T>[];
}

/** Excel sheet names: max 31 chars, no []:*?/\, unique within a workbook. */
export function sheetName(raw: string, used: Set<string>): string {
  const base = (raw.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Sheet').slice(0, 31);
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) {
    const suffix = ` (${i})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

export async function exportWorkbook(
  sheets: ExportSheet<Record<string, unknown>>[],
  filename: string,
): Promise<void> {
  const { needsStreamingExcel, streamingExcelBlob } = await import('./streamingExcel');
  if (sheets.some((sheet) => needsStreamingExcel(sheet.rows, sheet.columns))) {
    const used = new Set<string>();
    const namedSheets = sheets.map((sheet) => ({ ...sheet, name: sheetName(sheet.name, used) }));
    downloadExcelBlob(await streamingExcelBlob(namedSheets), filename);
    return;
  }
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const used = new Set<string>();
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheetName(sheet.name, used));
    const headers = sheet.columns.map((col) => col.header);
    ws.addRow(headers);
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    for (const row of sheet.rows) {
      ws.addRow(sheet.columns.map((col) => col.accessor(row) ?? ''));
    }
    ws.columns.forEach((col, i) => {
      const maxLen = Math.max(
        headers[i].length,
        ...sheet.rows.slice(0, 200).map((r) => String(sheet.columns[i].accessor(r) ?? '').length),
      );
      col.width = Math.min(maxLen + 2, 60);
    });
  }
  await downloadWorkbook(workbook, filename);
}

async function downloadWorkbook(
  workbook: { xlsx: { writeBuffer: () => Promise<ArrayBuffer | Uint8Array> } },
  filename: string,
): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  downloadExcelBlob(blob, filename);
}

function downloadExcelBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Generic fetch-all helper (batched to bypass PostgREST row limits) ----------

export async function fetchAllRows<T>(
  table: string,
  select: string = '*',
  orderBy?: { column: string; ascending?: boolean },
  batchSize: number = 1000,
  /** Narrow the query (filters, tiebreak order) before each page is fetched. */
  refine?: <Q>(query: Q) => Q,
): Promise<T[]> {
  const allRows: T[] = [];
  let offset = 0;
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error('Export batch size must be a positive integer');
  }
  let expectedCount: number | null = null;

  while (true) {
    let query = supabase
      .from(table)
      .select(select, { count: 'exact' })
      .range(offset, offset + batchSize - 1);

    if (orderBy) {
      query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
    }
    if (refine) query = refine(query);

    const { data, error, count } = await query;

    if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);

    const rows = (data || []) as T[];
    allRows.push(...rows);

    if (typeof count === 'number') {
      if (expectedCount !== null && count !== expectedCount) {
        throw new Error(`The ${table} record count changed during export. Please retry.`);
      }
      expectedCount = count;
    }
    if (expectedCount !== null && allRows.length === expectedCount) return allRows;
    if (expectedCount !== null && allRows.length > expectedCount) {
      throw new Error(`Unexpected record count while exporting ${table}. Please retry.`);
    }
    if (rows.length === 0) {
      if (expectedCount !== null) {
        throw new Error(
          `Incomplete export of ${table}: fetched ${allRows.length} of ${expectedCount} records.`,
        );
      }
      return allRows;
    }
    // PostgREST can cap responses below the requested batch size. Advance by
    // the rows actually returned and continue until the count or an empty page.
    offset += rows.length;
  }
}

// ---------- Formatting helpers (excel-cell-specific; generic date
// formatters live in @/lib/format) ----------

export function formatArray(arr: string[] | null | undefined): string {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return '';
  return arr.join('; ');
}

export function formatBoolean(val: boolean | null | undefined): string {
  if (val === null || val === undefined) return '';
  return val ? 'Yes' : 'No';
}

export function generateFilename(contentType: string): string {
  const date = format(new Date(), 'yyyy-MM-dd');
  return `queerguide-${contentType}-${date}.xlsx`;
}
