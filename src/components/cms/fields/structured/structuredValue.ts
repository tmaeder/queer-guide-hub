/**
 * Helpers for showing and editing jsonb column values in the CMS as
 * structured data — labelled rows, lists and inputs — instead of raw JSON
 * text. Editors never see braces, quotes or commas.
 */

export type StructuredKind = 'text' | 'number' | 'boolean' | 'list' | 'group';

export type PlainObject = Record<string, unknown>;

export function isPlainObject(v: unknown): v is PlainObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Legacy rows sometimes hold a JSON-encoded string in a jsonb column. Decode
 * it so it renders as structure; anything that is not an object/array stays
 * the plain string it is.
 */
export function normalizeStructured(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  if (!(t.startsWith('{') || t.startsWith('['))) return value;
  try {
    return JSON.parse(t);
  } catch {
    return value;
  }
}

/** `hate_crime_law` / `hateCrimeLaw` → `Hate crime law`. */
export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!spaced) return key;
  // Keep all-caps tokens (ISO, LGBTI, URL) as written.
  return spaced
    .split(' ')
    .map((w, i) => {
      if (w.length > 1 && w === w.toUpperCase()) return w;
      const lower = w.toLowerCase();
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(' ');
}

export function kindOf(v: unknown): StructuredKind {
  if (Array.isArray(v)) return 'list';
  if (isPlainObject(v)) return 'group';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  return 'text';
}

export function emptyOfKind(kind: StructuredKind): unknown {
  switch (kind) {
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'list':
      return [];
    case 'group':
      return {};
    default:
      return '';
  }
}

export const KIND_LABELS: Record<StructuredKind, string> = {
  text: 'Text',
  number: 'Number',
  boolean: 'Yes / No',
  list: 'List',
  group: 'Group of fields',
};

/** One-line human text for a scalar. */
export function formatScalar(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return v.toLocaleString();
  return String(v);
}

/**
 * Short single-line summary for table cells and collapsed previews,
 * e.g. `Open: 09:00 · Close: 17:00` or `3 items`.
 */
export function summarizeStructured(value: unknown, maxParts = 3): string {
  const v = normalizeStructured(value);
  if (Array.isArray(v)) {
    if (v.length === 0) return '—';
    if (v.every((x) => !isPlainObject(x) && !Array.isArray(x))) {
      const shown = v.slice(0, maxParts).map(formatScalar).join(', ');
      return v.length > maxParts ? `${shown} +${v.length - maxParts}` : shown;
    }
    return `${v.length} ${v.length === 1 ? 'item' : 'items'}`;
  }
  if (isPlainObject(v)) {
    const entries = Object.entries(v).filter(([, x]) => x !== null && x !== undefined && x !== '');
    if (entries.length === 0) return '—';
    const parts = entries.slice(0, maxParts).map(([k, x]) => {
      const shown =
        Array.isArray(x) || isPlainObject(x) ? summarizeStructured(x, 1) : formatScalar(x);
      return `${humanizeKey(k)}: ${shown}`;
    });
    const rest = entries.length - parts.length;
    return rest > 0 ? `${parts.join(' · ')} +${rest}` : parts.join(' · ');
  }
  return formatScalar(v);
}

/** First `base`, `base_2`, `base_3`… not already used as a key. */
export function uniqueKey(obj: PlainObject, base = 'new_field'): string {
  if (!(base in obj)) return base;
  let i = 2;
  while (`${base}_${i}` in obj) i += 1;
  return `${base}_${i}`;
}

/** Rename a key while preserving entry order. */
export function renameKey(obj: PlainObject, from: string, to: string): PlainObject {
  const out: PlainObject = {};
  for (const [k, v] of Object.entries(obj)) out[k === from ? to : k] = v;
  return out;
}

/** Lists longer than this are summarised instead of rendered row by row. */
export const MAX_LIST_ROWS = 50;
