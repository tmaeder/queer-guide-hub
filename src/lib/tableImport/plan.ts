import type { ContentTypeConfig, FieldConfig } from '@/types/cms';
import { validateAgainstRegistry } from '@/lib/cms/zodFromFields';
import type { ImportSheet } from './files';
export type ImportMode = 'create' | 'update' | 'upsert' | 'enrich';
export type RecordData = Record<string, unknown>;
export interface ImportOptions {
  mode: ImportMode;
  matchField: string;
  clearBlanks: boolean;
  mapping: string[];
}
export interface PlannedRow {
  row: number;
  identity: string;
  action: 'create' | 'update' | 'skip' | 'error';
  before: RecordData | null;
  patch: RecordData;
  issues: string[];
}
const system = new Set([
  'id',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
  '_cms_metadata',
]);
export const empty = (value: unknown) =>
  value == null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && !value.length);
export const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function writableFields(config: ContentTypeConfig): FieldConfig[] {
  // Real FK columns populated by editable pickers are writable even when the
  // editor hides their raw controls. Arbitrary hidden/system columns stay out.
  const related = new Map<string, string>();
  for (const field of config.fields) {
    if (field.readOnly || field.hidden) continue;
    for (const [source, target] of Object.entries(field.relatedFields ?? {}))
      related.set(target, source);
  }
  const fields = config.fields.filter(
    (f) =>
      !f.readOnly &&
      (!f.hidden || related.has(f.name)) &&
      (!f.virtual ||
        (config.editorRpc && f.name === '_locations' && f.type === 'organisation_locations')) &&
      !system.has(f.name) &&
      f.name !== config.primaryKey,
  );
  for (const [name, source] of related) {
    if (
      config.fields.some((f) => f.name === name) ||
      system.has(name) ||
      name === config.primaryKey
    )
      continue;
    fields.push({
      name,
      label: name,
      group: 'location',
      type:
        source === 'latitude' || source === 'longitude'
          ? 'number'
          : source === 'tag_ids'
            ? 'tags'
            : 'text',
    });
  }
  return fields;
}
export function matchFields(config: ContentTypeConfig): FieldConfig[] {
  return [
    { name: config.primaryKey, label: 'Record ID', type: 'text', group: 'basic' } as FieldConfig,
    ...config.fields.filter(
      (f) =>
        !f.virtual &&
        !f.hidden &&
        !f.readOnly &&
        ['text', 'email', 'url'].includes(f.type) &&
        f.name !== config.primaryKey,
    ),
  ];
}
const normalizeHeader = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export function suggestMapping(config: ContentTypeConfig, headers: string[]): string[] {
  const fields = [{ name: config.primaryKey, label: 'ID' }, ...writableFields(config)];
  return headers.map((h) => {
    const n = normalizeHeader(h);
    const byName = fields.filter((f) => normalizeHeader(f.name) === n);
    if (byName.length === 1) return byName[0].name;
    const byLabel = fields.filter((f) => normalizeHeader(f.label) === n);
    if (byLabel.length === 1) return byLabel[0].name;
    if (n === 'title')
      return writableFields(config).find((f) => f.name === config.titleField)?.name ?? '';
    return '';
  });
}
export function convertCell(raw: string, field: FieldConfig): unknown {
  if (raw.trim() === '') return null;
  const value = raw.trim();
  switch (field.type) {
    case 'number': {
      if (
        !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value) ||
        !Number.isFinite(Number(value))
      )
        throw new Error('Enter a finite number without thousands separators.');
      if (Number.isInteger(Number(value)) && !Number.isSafeInteger(Number(value)))
        throw new Error(
          'This integer exceeds spreadsheet precision. Use a text identifier instead.',
        );
      return Number(value);
    }
    case 'boolean':
      if (['true', 'yes', '1'].includes(value.toLowerCase())) return true;
      if (['false', 'no', '0'].includes(value.toLowerCase())) return false;
      throw new Error('Use true/false, yes/no or 1/0.');
    case 'date':
    case 'datetime': {
      if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) || Number.isNaN(Date.parse(value)))
        throw new Error('Use an ISO date (YYYY-MM-DD) or timestamp.');
      const date = new Date(value);
      if (new Date(value.slice(0, 10)).toISOString().slice(0, 10) !== value.slice(0, 10))
        throw new Error('Invalid calendar date.');
      return field.type === 'date' ? value.slice(0, 10) : date.toISOString();
    }
    case 'tags':
    case 'images':
    case 'multiselect':
    case 'roles_autocomplete':
    case 'unified_tag': {
      if (!value.startsWith('[') && value.includes(',') && !value.includes('|'))
        throw new Error(
          'Use JSON or | between array values; comma-separated exports are ambiguous.',
        );
      const list: unknown = value.startsWith('[')
        ? JSON.parse(value)
        : value.split('|').map((v) => v.trim());
      if (!Array.isArray(list) || !list.every((v) => typeof v === 'string' && v !== ''))
        throw new Error('Use a JSON string array or values separated with |.');
      return [...new Set(list)];
    }
    case 'json':
    case 'social_links':
    case 'link_list':
    case 'organisation_locations':
    case 'organisation_relationships':
      return JSON.parse(value);
    case 'location':
      return raw;
    case 'select': {
      const option = field.options?.find(
        (o) => o.value === value || o.label.toLowerCase() === value.toLowerCase(),
      );
      if (field.options?.length && !field.dynamicOptions && !option)
        throw new Error('Choose a configured option.');
      return option?.value ?? value;
    }
    default:
      return raw;
  }
}

export function buildImportPlan(
  config: ContentTypeConfig,
  sheet: ImportSheet,
  options: ImportOptions,
  existing: RecordData[],
): PlannedRow[] {
  if (!['create', 'update', 'upsert', 'enrich'].includes(options.mode))
    throw new Error('Choose an available import mode.');
  if (options.mapping.length !== sheet.headers.length)
    throw new Error('Map every source column or mark it skipped.');
  const mapped = options.mapping.filter(Boolean);
  if (!mapped.length) throw new Error('Map at least one column.');
  if (new Set(mapped).size !== mapped.length)
    throw new Error('Map each destination field only once.');
  const writable = new Map(writableFields(config).map((f) => [f.name, f]));
  for (const name of mapped)
    if (name !== config.primaryKey && !writable.has(name))
      throw new Error(`The field ${name} cannot be imported.`);
  const matchIndex = options.mapping.indexOf(options.matchField);
  if (matchIndex < 0) throw new Error('Map the matching field to a source column.');
  if (!matchFields(config).some((f) => f.name === options.matchField))
    throw new Error('Choose an available matching field.');
  const byIdentity = new Map<string, RecordData[]>();
  for (const row of existing) {
    if (row[options.matchField] == null) continue;
    const identity = String(row[options.matchField]);
    byIdentity.set(identity, [...(byIdentity.get(identity) ?? []), row]);
  }
  const counts = new Map<string, number>();
  sheet.rows.forEach((cells) => {
    const id = cells[matchIndex].trim();
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  return sheet.rows.map((cells, index) => {
    const identity = cells[matchIndex].trim();
    const matches = identity ? (byIdentity.get(identity) ?? []) : [];
    const before = matches.length === 1 ? matches[0] : null;
    const result: PlannedRow = {
      row: sheet.rowNumbers?.[index] ?? index + 2,
      identity,
      action: before ? 'update' : 'create',
      before,
      patch: {},
      issues: [],
    };
    if (counts.get(identity)! > 1) result.issues.push('Duplicate matching value in this file.');
    if (matches.length > 1)
      result.issues.push('More than one stored record matches. Use Record ID.');
    if (!identity && options.matchField !== config.primaryKey)
      result.issues.push('The matching value is empty.');
    if (!before && ['update', 'enrich'].includes(options.mode))
      result.issues.push('No existing record matches.');
    if (before && options.mode === 'create')
      return {
        ...result,
        action: 'skip' as const,
        issues: ['Already exists; create-only mode leaves it unchanged.'],
      };
    for (let col = 0; col < options.mapping.length; col++) {
      const name = options.mapping[col],
        field = writable.get(name);
      if (!field) continue;
      if (!cells[col].trim() && (!options.clearBlanks || options.mode === 'enrich')) continue;
      if (before && options.mode === 'enrich' && !empty(before[name])) continue;
      try {
        const value = convertCell(
          name === options.matchField ? cells[col].trim() : cells[col],
          field,
        );
        if (before && field.immutable && !equal(before[name], value))
          throw new Error('This identifier cannot change after creation.');
        if (!before || !equal(before[name], value)) result.patch[name] = value;
      } catch (error) {
        result.issues.push(
          `${field.label}: ${error instanceof Error ? error.message : 'Invalid value.'}`,
        );
      }
    }
    const next = { ...(before ?? config.defaults), ...result.patch };
    const checked = validateAgainstRegistry(config, next);
    if (!checked.ok) result.issues.push(...checked.issues.map((i) => `${i.field}: ${i.message}`));
    if (config.validate) {
      const custom = config.validate(next);
      if (!custom.isValid)
        result.issues.push(...custom.errors.map((i) => `${i.field}: ${i.message}`));
    }
    for (const field of writable.values()) {
      if (
        field.required &&
        (!field.visibleWhen || field.visibleWhen(next)) &&
        empty(next[field.name])
      )
        result.issues.push(`${field.label} is required.`);
    }
    if (result.issues.length) result.action = 'error';
    else if (before && !Object.keys(result.patch).length) result.action = 'skip';
    return result;
  });
}
