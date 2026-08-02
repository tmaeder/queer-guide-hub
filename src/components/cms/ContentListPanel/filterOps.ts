import type { FilterOperator } from './fieldCapabilities';
import type { Filter, SortSpec } from './viewSpec';

/**
 * Translate a view spec's filters and sorts into PostgREST calls.
 *
 * Pure in the sense that matters: it only calls methods on the builder it is
 * handed, so it can be tested against a recording stub with no network. That
 * matters because this is the one place a filter can silently do nothing — the
 * previous implementation had five hard-coded type branches and quietly
 * skipped anything else, so `country_autocomplete` / `url` / `textarea` /
 * `unified_tag` filters rendered a control and never touched the query.
 *
 * Callers MUST pass filters that have already been through `normalizeSpec`;
 * field names reach PostgREST verbatim.
 */

/** The subset of the supabase-js builder used here. Lets tests pass a stub. */
export interface QueryBuilderLike<T = unknown> {
  eq(col: string, v: unknown): T;
  neq(col: string, v: unknown): T;
  gt(col: string, v: unknown): T;
  gte(col: string, v: unknown): T;
  lt(col: string, v: unknown): T;
  lte(col: string, v: unknown): T;
  ilike(col: string, v: string): T;
  not(col: string, op: string, v: unknown): T;
  is(col: string, v: null): T;
  in(col: string, v: readonly unknown[]): T;
  contains(col: string, v: readonly unknown[]): T;
  overlaps(col: string, v: readonly unknown[]): T;
  order(col: string, opts: { ascending: boolean }): T;
}

/** PostgREST treats `%` and `_` as wildcards; a user typing them means them literally. */
function escapeLike(raw: string): string {
  return raw.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.filter((v) => v !== null && v !== undefined && v !== '');
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/**
 * Apply one filter. Returns the builder unchanged when the filter has no usable
 * value, so a half-typed row never truncates the result set.
 */
export function applyFilter<T extends QueryBuilderLike<T>>(query: T, filter: Filter): T {
  const { field, op, value } = filter;

  switch (op) {
    // Presence checks carry no value by design.
    case 'is_empty':
      return query.is(field, null);
    case 'is_not_empty':
      return query.not(field, 'is', null);
    case 'is_true':
      return query.eq(field, true);
    case 'is_false':
      return query.eq(field, false);
    default:
      break;
  }

  if (op === 'between') {
    const range = (value ?? {}) as { from?: unknown; to?: unknown; min?: unknown; max?: unknown };
    const lo = range.from ?? range.min;
    const hi = range.to ?? range.max;
    let q = query;
    if (!isBlank(lo)) q = q.gte(field, lo);
    if (!isBlank(hi)) q = q.lte(field, hi);
    return q;
  }

  if (op === 'in' || op === 'not_in' || op === 'has_any' || op === 'has_all') {
    const list = asArray(value);
    // An empty set would otherwise mean "match nothing", which reads as a bug
    // to someone who just opened the picker and has not chosen yet.
    if (list.length === 0) return query;
    if (op === 'in') return query.in(field, list);
    if (op === 'not_in') return query.not(field, 'in', `(${list.join(',')})`);
    // Array columns: has_all is containment, has_any is overlap.
    return op === 'has_all' ? query.contains(field, list) : query.overlaps(field, list);
  }

  if (isBlank(value)) return query;

  switch (op) {
    case 'eq':
    case 'on':
      return query.eq(field, value);
    case 'neq':
      return query.neq(field, value);
    case 'gt':
      return query.gt(field, value);
    case 'gte':
    case 'after':
      return query.gte(field, value);
    case 'lt':
      return query.lt(field, value);
    case 'lte':
    case 'before':
      return query.lte(field, value);
    case 'contains':
      return query.ilike(field, `%${escapeLike(String(value))}%`);
    case 'not_contains':
      return query.not(field, 'ilike', `%${escapeLike(String(value))}%`);
    case 'starts_with':
      return query.ilike(field, `${escapeLike(String(value))}%`);
    default:
      // Unreachable for a normalized spec. Returning the query unchanged beats
      // throwing inside a data fetch.
      return query;
  }
}

export function applyFilters<T extends QueryBuilderLike<T>>(query: T, filters: Filter[]): T {
  return filters.reduce<T>((q, f) => applyFilter(q, f), query);
}

/**
 * Apply an ordered sort list. Array order IS precedence — PostgREST honours the
 * order in which `.order()` is called.
 */
export function applySorts<T extends QueryBuilderLike<T>>(
  query: T,
  sorts: SortSpec[],
  resolveField: (field: string) => string,
): T {
  return sorts.reduce<T>(
    (q, s) => q.order(resolveField(s.field), { ascending: s.dir === 'asc' }),
    query,
  );
}

/** Human label for an operator, used by the builder UI and by tests. */
export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: 'is',
  neq: 'is not',
  contains: 'contains',
  not_contains: 'does not contain',
  starts_with: 'starts with',
  gt: 'greater than',
  gte: 'at least',
  lt: 'less than',
  lte: 'at most',
  between: 'between',
  in: 'is any of',
  not_in: 'is none of',
  has_any: 'has any of',
  has_all: 'has all of',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
  is_true: 'is yes',
  is_false: 'is no',
  before: 'before',
  after: 'after',
  on: 'on',
};
