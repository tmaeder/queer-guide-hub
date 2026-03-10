import { api } from '@/integrations/api/client';
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
  filename: string
): Promise<void> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Data');

  const headers = columns.map(col => col.header);
  ws.addRow(headers);

  for (const row of data) {
    ws.addRow(
      columns.map(col => {
        const val = col.accessor(row);
        if (val === null || val === undefined) return '';
        return val;
      })
    );
  }

  // Auto-size columns (approximate based on content length)
  ws.columns.forEach((col, i) => {
    const sampleRows = data.slice(0, 200);
    const maxLen = Math.max(
      headers[i].length,
      ...sampleRows.map(r => String(columns[i].accessor(r) ?? '').length)
    );
    col.width = Math.min(maxLen + 2, 60);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
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
  batchSize: number = 1000
): Promise<T[]> {
  const allRows: T[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = api
      .from(table)
      .select(select)
      .range(offset, offset + batchSize - 1);

    if (orderBy) {
      query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
    }

    const { data, error } = await query;

    if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);

    const rows = (data || []) as T[];
    allRows.push(...rows);

    if (rows.length < batchSize) {
      hasMore = false;
    } else {
      offset += batchSize;
    }
  }

  return allRows;
}

// ---------- Formatting helpers ----------

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return format(new Date(dateStr), 'yyyy-MM-dd');
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return format(new Date(dateStr), 'yyyy-MM-dd HH:mm');
  } catch {
    return dateStr;
  }
}

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
