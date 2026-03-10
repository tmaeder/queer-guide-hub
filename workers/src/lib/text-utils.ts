/**
 * Shared text and data normalization utilities.
 */

/** Sanitize a string for use as a SQL identifier (table/column name). */
export function sanitizeIdentifier(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '');
}

/** Normalize a record's string fields: trim whitespace, lowercase emails, format dates. */
export function normalizeRecord(record: Record<string, unknown>): Record<string, unknown> {
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
