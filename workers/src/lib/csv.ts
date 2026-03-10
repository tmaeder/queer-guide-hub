/**
 * Shared CSV parsing utility.
 * Uses Rust/Wasm implementation when available, falls back to TypeScript.
 */

import { parse_csv as wasmParseCsv } from '../../wasm/pkg/csv_parser/csv_parser';

/** Parse a CSV string into a 2D array of strings. Handles quoted fields and escaped quotes. */
export function parseCSV(csv: string): string[][] {
  try {
    return wasmParseCsv(csv);
  } catch {
    return parseCSVFallback(csv);
  }
}

/** TypeScript fallback implementation. */
function parseCSVFallback(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < csv.length) {
    const ch = csv[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < csv.length && csv[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        row.push(field.trim());
        field = '';
        i++;
      } else if (ch === '\n' || (ch === '\r' && i + 1 < csv.length && csv[i + 1] === '\n')) {
        row.push(field.trim());
        field = '';
        if (row.some((f) => f !== '')) rows.push(row);
        row = [];
        i += ch === '\r' ? 2 : 1;
      } else {
        field += ch;
        i++;
      }
    }
  }

  if (field || row.length) {
    row.push(field.trim());
    if (row.some((f) => f !== '')) rows.push(row);
  }

  return rows;
}
