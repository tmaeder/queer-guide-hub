import type { ContentTypeConfig, FieldConfig } from '@/types/cms';
import { capabilitiesFor, type FilterOperator } from './fieldCapabilities';
import type { ContentView } from './types';

/**
 * The saved shape of a view: what to show, what to filter, how to sort, how to
 * group. Pure — no React, no supabase — so the rules below are unit-testable.
 */

export interface Filter {
  /** Stable identity. Two filters on the same field are legal, so the field
   *  name cannot be the React key or editing one would edit both. */
  id: string;
  field: string;
  op: FilterOperator;
  value?: unknown;
}

export interface SortSpec {
  field: string;
  dir: 'asc' | 'desc';
}

export interface ViewSpec {
  kind: ContentView;
  /** Ordered AND visible. This array IS the column order; there is no second
   *  ordering array to drift from it. */
  columns: string[];
  filters: Filter[];
  sorts: SortSpec[];
  groupBy: string | null;
  /** null means the record's updated_at. */
  dateField: string | null;
}

export const VIEW_KINDS: ContentView[] = ['table', 'gallery', 'board', 'timeline', 'calendar'];

/** Caps mirrored by the DB CHECK, so a spec that saves also loads. */
export const SPEC_LIMITS = { columns: 60, filters: 25, sorts: 5 } as const;

/**
 * A new view starts from the type's existing curation: the fields already
 * flagged `listColumn` are shown, its `defaultSort` applies. Those flags are
 * defaults for a FRESH view, never a limit on what the user may then add.
 */
export function buildDefaultSpec(config: ContentTypeConfig | null): ViewSpec {
  const fields = config?.fields ?? [];
  const columns = fields.filter((f) => f.listColumn).map((f) => f.name);
  const defaultSort = config?.defaultSort;
  return {
    kind: 'table',
    columns,
    filters: [],
    // The config key is `dir`, not `direction`. Reading the wrong one silently
    // forces every type to 'desc' and quietly breaks the ascending configs
    // (milestones sorts by date asc).
    sorts: defaultSort
      ? [{ field: defaultSort.field, dir: defaultSort.dir === 'asc' ? 'asc' : 'desc' }]
      : [{ field: 'updated_at', dir: 'desc' }],
    groupBy: null,
    dateField: null,
  };
}

/**
 * Resolve a spec against a type's real fields, dropping anything unknown.
 *
 * **This is the injection guard.** A spec is user-editable JSON that arrives
 * from the database, and every `field` in it is interpolated into a PostgREST
 * column position. Nothing may reach the query builder without passing through
 * here. It also keeps a spec honest across config changes — a renamed or
 * deleted field silently disappears instead of producing a broken query.
 */
export function normalizeSpec(
  input: Partial<ViewSpec> | null | undefined,
  config: ContentTypeConfig | null,
): ViewSpec {
  const base = buildDefaultSpec(config);
  if (!input || typeof input !== 'object') return base;

  const byName = new Map<string, FieldConfig>((config?.fields ?? []).map((f) => [f.name, f]));
  const known = (name: unknown): name is string => typeof name === 'string' && byName.has(name);

  const kind =
    typeof input.kind === 'string' && VIEW_KINDS.includes(input.kind as ContentView)
      ? (input.kind as ContentView)
      : base.kind;

  const columns = Array.isArray(input.columns)
    ? Array.from(new Set(input.columns.filter(known)))
        .filter((n) => capabilitiesFor(byName.get(n)!).displayable)
        .slice(0, SPEC_LIMITS.columns)
    : base.columns;

  const filters = Array.isArray(input.filters)
    ? input.filters
        .filter((f): f is Filter => !!f && typeof f === 'object' && known((f as Filter).field))
        .filter((f) => capabilitiesFor(byName.get(f.field)!).operators.includes(f.op))
        .slice(0, SPEC_LIMITS.filters)
        .map((f, i) => ({ ...f, id: typeof f.id === 'string' && f.id ? f.id : `f${i}` }))
    : [];

  const sorts = Array.isArray(input.sorts)
    ? input.sorts
        .filter((s): s is SortSpec => !!s && typeof s === 'object' && known((s as SortSpec).field))
        .filter((s) => capabilitiesFor(byName.get(s.field)!).sortable)
        .map((s) => ({
          field: s.field,
          dir: s.dir === 'asc' ? ('asc' as const) : ('desc' as const),
        }))
        .slice(0, SPEC_LIMITS.sorts)
    : base.sorts;

  const groupBy =
    known(input.groupBy) && capabilitiesFor(byName.get(input.groupBy)!).groupable
      ? input.groupBy
      : null;

  const dateField =
    known(input.dateField) && capabilitiesFor(byName.get(input.dateField)!).dateable
      ? input.dateField
      : null;

  return { kind, columns, filters, sorts, groupBy, dateField };
}

/**
 * Value equality for the dirty check.
 *
 * NOT `JSON.stringify`: filter ids are generated per session and key order is
 * not guaranteed, so stringify reports a view as dirty the moment it loads.
 */
export function specEquals(a: ViewSpec, b: ViewSpec): boolean {
  if (a.kind !== b.kind || a.groupBy !== b.groupBy || a.dateField !== b.dateField) return false;
  if (a.columns.length !== b.columns.length) return false;
  if (a.columns.some((c, i) => c !== b.columns[i])) return false;
  if (a.sorts.length !== b.sorts.length) return false;
  if (a.sorts.some((s, i) => s.field !== b.sorts[i].field || s.dir !== b.sorts[i].dir))
    return false;
  if (a.filters.length !== b.filters.length) return false;
  return a.filters.every((f, i) => {
    const g = b.filters[i];
    // Compare the VALUE, never the id.
    return f.field === g.field && f.op === g.op && sameValue(f.value, g.value);
  });
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
    return [...keys].every((k) => ao[k] === bo[k]);
  }
  return false;
}

/**
 * Only the parts of a spec that change what the server returns.
 *
 * `columns` and `kind` are presentational — refetching when someone toggles a
 * column would be a visible regression against today's behaviour.
 */
export function queryShapeOf(spec: ViewSpec): string {
  return JSON.stringify({
    filters: spec.filters.map((f) => [f.field, f.op, f.value ?? null]),
    sorts: spec.sorts.map((s) => [s.field, s.dir]),
    groupBy: spec.groupBy,
  });
}
