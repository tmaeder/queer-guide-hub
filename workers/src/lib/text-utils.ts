/**
 * Shared text and data normalization utilities.
 * Uses Rust/Wasm for normalize_record_fields when available, falls back to TypeScript.
 */

import { normalize_record_fields as wasmNormalizeRecordFields } from '../../wasm/pkg/text_utils_wasm/text_utils_wasm';

/** Sanitize a string for use as a SQL identifier (table/column name). */
export function sanitizeIdentifier(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '');
}

/** Normalize a record's string fields: trim whitespace, lowercase emails, format dates. */
export function normalizeRecord(record: Record<string, unknown>): Record<string, unknown> {
  try {
    const result = wasmNormalizeRecordFields(JSON.stringify(record));
    return JSON.parse(result);
  } catch {
    return normalizeRecordFallback(record);
  }
}

function normalizeRecordFallback(record: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string') {
      let v = value.trim();
      if (key === 'email' || key.endsWith('_email')) {
        v = v.toLowerCase();
      }
      if (key.endsWith('_date') || key === 'start_date' || key === 'end_date' || key === 'date') {
        const parsed = new Date(v);
        if (!isNaN(parsed.getTime())) {
          v = parsed.toISOString();
        }
      }
      normalized[key] = v;
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}
