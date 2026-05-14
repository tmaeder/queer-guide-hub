// Compares Meilisearch settings JSON values and returns a structured diff.
// Supports per-key strategies because some Meili settings are order-sensitive
// (rankingRules) while others are semantically sets (filterableAttributes).

export type SettingsValue =
  | string
  | number
  | boolean
  | null
  | SettingsValue[]
  | { [k: string]: SettingsValue };

export type SettingsObject = Record<string, SettingsValue>;

export type DiffStrategy = 'ordered' | 'set' | 'object' | 'scalar';

/**
 * Strategy by Meilisearch settings key. Defaults to 'scalar' for unknown keys.
 * `rankingRules` is the only built-in array where order is semantically
 * significant. Synonyms is treated as an object (record of arrays).
 */
const STRATEGY: Record<string, DiffStrategy> = {
  searchableAttributes: 'set',
  filterableAttributes: 'set',
  sortableAttributes: 'set',
  displayedAttributes: 'set',
  stopWords: 'set',
  rankingRules: 'ordered',
  synonyms: 'object',
  distinctAttribute: 'scalar',
  typoTolerance: 'object',
  pagination: 'object',
  faceting: 'object',
  proximityPrecision: 'scalar',
  separatorTokens: 'set',
  nonSeparatorTokens: 'set',
  dictionary: 'set',
  embedders: 'object',
  searchCutoffMs: 'scalar',
  localizedAttributes: 'object',
};

export type AxisChange =
  | { kind: 'unchanged' }
  | { kind: 'added'; value: SettingsValue }
  | { kind: 'removed'; value: SettingsValue }
  | {
      kind: 'changed';
      before: SettingsValue;
      after: SettingsValue;
      // For sets: items added/removed; for ordered: same plus reordered flag
      added?: SettingsValue[];
      removed?: SettingsValue[];
      reordered?: boolean;
      // For object kind: nested key-level diff
      nested?: Record<string, AxisChange>;
    };

export interface SettingsDiff {
  changes: Record<string, AxisChange>;
  hasChanges: boolean;
  summary: string[];
}

function isPlainObject(v: unknown): v is Record<string, SettingsValue> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepEqual(a: SettingsValue, b: SettingsValue): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if (!deepEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}

function setDifference(left: SettingsValue[], right: SettingsValue[]): SettingsValue[] {
  return left.filter((l) => !right.some((r) => deepEqual(l, r)));
}

function diffArrayAsSet(
  before: SettingsValue,
  after: SettingsValue,
): AxisChange {
  if (!Array.isArray(before) || !Array.isArray(after)) {
    return diffScalar(before, after);
  }
  const added = setDifference(after, before);
  const removed = setDifference(before, after);
  if (added.length === 0 && removed.length === 0) return { kind: 'unchanged' };
  return { kind: 'changed', before, after, added, removed };
}

function diffArrayOrdered(
  before: SettingsValue,
  after: SettingsValue,
): AxisChange {
  if (!Array.isArray(before) || !Array.isArray(after)) {
    return diffScalar(before, after);
  }
  if (deepEqual(before, after)) return { kind: 'unchanged' };
  const added = setDifference(after, before);
  const removed = setDifference(before, after);
  // reordered if the set is the same but order differs
  const reordered = added.length === 0 && removed.length === 0;
  return { kind: 'changed', before, after, added, removed, reordered };
}

function diffObjectShallow(
  before: SettingsValue,
  after: SettingsValue,
): AxisChange {
  if (!isPlainObject(before) || !isPlainObject(after)) {
    return diffScalar(before, after);
  }
  if (deepEqual(before, after)) return { kind: 'unchanged' };
  const nested: Record<string, AxisChange> = {};
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of allKeys) {
    if (!(k in before)) {
      nested[k] = { kind: 'added', value: after[k] };
    } else if (!(k in after)) {
      nested[k] = { kind: 'removed', value: before[k] };
    } else if (!deepEqual(before[k], after[k])) {
      nested[k] = { kind: 'changed', before: before[k], after: after[k] };
    }
  }
  return { kind: 'changed', before, after, nested };
}

function diffScalar(before: SettingsValue, after: SettingsValue): AxisChange {
  if (deepEqual(before, after)) return { kind: 'unchanged' };
  return { kind: 'changed', before, after };
}

function diffByStrategy(
  before: SettingsValue,
  after: SettingsValue,
  strategy: DiffStrategy,
): AxisChange {
  switch (strategy) {
    case 'set':
      return diffArrayAsSet(before, after);
    case 'ordered':
      return diffArrayOrdered(before, after);
    case 'object':
      return diffObjectShallow(before, after);
    case 'scalar':
    default:
      return diffScalar(before, after);
  }
}

/**
 * Compute the diff between two Meilisearch settings objects.
 * `before` is typically the live (applied) state from Meili; `after` is the
 * desired state from search_settings_versions. The summary is a one-line
 * blurb per top-level key with at least one change.
 */
export function diffSettings(
  before: SettingsObject | null | undefined,
  after: SettingsObject | null | undefined,
): SettingsDiff {
  const left = before ?? {};
  const right = after ?? {};
  const allKeys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const changes: Record<string, AxisChange> = {};
  const summary: string[] = [];
  let hasChanges = false;

  for (const key of allKeys) {
    const inLeft = key in left;
    const inRight = key in right;
    let change: AxisChange;
    if (!inLeft && inRight) {
      change = { kind: 'added', value: right[key] };
    } else if (inLeft && !inRight) {
      change = { kind: 'removed', value: left[key] };
    } else {
      const strategy = STRATEGY[key] ?? 'scalar';
      change = diffByStrategy(left[key], right[key], strategy);
    }
    changes[key] = change;
    if (change.kind !== 'unchanged') {
      hasChanges = true;
      summary.push(formatChangeLine(key, change));
    }
  }

  return { changes, hasChanges, summary };
}

function formatChangeLine(key: string, change: AxisChange): string {
  switch (change.kind) {
    case 'added':
      return `${key}: added`;
    case 'removed':
      return `${key}: removed`;
    case 'changed': {
      if (change.reordered) return `${key}: reordered`;
      const adds = change.added?.length ?? 0;
      const rems = change.removed?.length ?? 0;
      if (adds || rems) {
        return `${key}: +${adds}, -${rems}`;
      }
      const nestedKeys = Object.keys(change.nested ?? {});
      if (nestedKeys.length > 0) {
        return `${key}: ${nestedKeys.length} nested key(s) changed`;
      }
      return `${key}: changed`;
    }
    default:
      return `${key}: unchanged`;
  }
}

/**
 * Filter a diff to keys actually relevant to admins. By default we drop
 * Meilisearch internal/empty keys that always appear in a fresh settings
 * fetch (e.g. unset embedders).
 */
export function filterRelevantChanges(
  diff: SettingsDiff,
  options: { ignoreKeys?: string[] } = {},
): SettingsDiff {
  const ignore = new Set(options.ignoreKeys ?? []);
  const filtered: Record<string, AxisChange> = {};
  const summary: string[] = [];
  let hasChanges = false;
  for (const [k, change] of Object.entries(diff.changes)) {
    if (ignore.has(k)) continue;
    filtered[k] = change;
    if (change.kind !== 'unchanged') {
      hasChanges = true;
      summary.push(formatChangeLine(k, change));
    }
  }
  return { changes: filtered, hasChanges, summary };
}
