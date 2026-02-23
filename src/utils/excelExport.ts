import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

// ---------- Types ----------

export interface ExportColumnDef<T> {
  header: string;
  accessor: (row: T) => string | number | boolean | null | undefined;
}

// ---------- Core export function (lazy-loads xlsx) ----------

export async function exportToExcel<T>(
  data: T[],
  columns: ExportColumnDef<T>[],
  filename: string
): Promise<void> {
  const XLSX = await import('xlsx');

  const headers = columns.map(col => col.header);

  const rows = data.map(row =>
    columns.map(col => {
      const val = col.accessor(row);
      if (val === null || val === undefined) return '';
      return val;
    })
  );

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Auto-size columns (approximate based on content length)
  ws['!cols'] = columns.map((_col, i) => {
    const maxLen = Math.max(
      headers[i].length,
      ...rows.slice(0, 200).map(r => String(r[i] ?? '').length)
    );
    return { wch: Math.min(maxLen + 2, 60) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, filename);
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
    let query = supabase
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
