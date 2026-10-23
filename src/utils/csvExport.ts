import type { ExportColumnDef } from './excelExport';

function escapeCell(value: string | number | boolean | null | undefined): string {
  let text = String(value ?? '');
  // Quoting alone does not stop spreadsheet applications evaluating formulas.
  if (typeof value === 'string' && /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportToCsv<T>(data: T[], columns: ExportColumnDef<T>[], filename: string): void {
  const rows = [
    columns.map((column) => escapeCell(column.header)).join(','),
    ...data.map((row) => columns.map((column) => escapeCell(column.accessor(row))).join(',')),
  ];
  // A BOM lets Excel detect UTF-8, preserving accents and non-Latin tag names.
  const blob = new Blob(['\uFEFF', rows.join('\r\n'), '\r\n'], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
