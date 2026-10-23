import type { ContentTypeConfig } from '@/types/cms';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';
import { validateOrganisationLocations } from '@/lib/cms/organisationLocations';
import { invalidateManagedOptions } from '@/hooks/useManagedOptions';
import {
  buildImportPlan,
  equal,
  writableFields,
  type ImportOptions,
  type PlannedRow,
  type RecordData,
} from './plan';
import type { ImportSheet } from './files';

class ImportWriteError extends Error {
  constructor(
    message: string,
    readonly savedId: string,
  ) {
    super(message);
  }
}

export interface ImportPreview {
  actorId: string;
  options: ImportOptions;
  rows: PlannedRow[];
}
export interface ImportOutcome {
  row: number;
  identity: string;
  status: 'created' | 'updated' | 'failed' | 'cancelled' | 'skipped';
  id?: string;
  message: string;
}

async function actor(expected?: string): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || (expected && data.user.id !== expected))
    throw new Error('The signed-in account changed. Preview the import again.');
  return data.user.id;
}

/** Query exact identities across every page, independently of the list view. */
export async function loadImportMatches(
  config: ContentTypeConfig,
  field: string,
  values: string[],
): Promise<RecordData[]> {
  const unique = [...new Set(values.filter(Boolean))];
  const rows: RecordData[] = [];
  for (let chunk = 0; chunk < unique.length; chunk += 100) {
    let offset = 0,
      total: number | null = null;
    while (true) {
      const { data, count, error } = await untypedFrom(config.tableName)
        .select('*', { count: 'exact' })
        .in(field, unique.slice(chunk, chunk + 100))
        .order(config.primaryKey)
        .range(offset, offset + 249);
      if (error) throw new Error(`Could not match existing records: ${error.message}`);
      if (count == null || (total !== null && count !== total))
        throw new Error('The matching records changed while loading. Preview again.');
      total = count;
      const page = data ?? [];
      if (!page.length && offset < total)
        throw new Error('The matching query returned an incomplete page. Preview again.');
      rows.push(...page);
      offset += page.length;
      if (offset >= total) break;
    }
  }
  const ids = rows.map((r) => r[config.primaryKey]);
  if (ids.some((id) => id == null) || new Set(ids).size !== ids.length)
    throw new Error('Matching returned missing or duplicate record IDs. Preview again.');
  // Governed editors may expose additional validation fields outside the list projection.
  if (config.editorApi || config.editorRpc) {
    const loaded: RecordData[] = [];
    for (const row of rows) loaded.push(await loadRecord(config, String(row[config.primaryKey])));
    return loaded;
  }
  return rows;
}
async function loadRecord(config: ContentTypeConfig, id: string): Promise<RecordData> {
  if (config.editorApi) return config.editorApi.load(id);
  const response = config.editorRpc
    ? await untypedRpc<RecordData>(config.editorRpc.load, { p_id: id })
    : await untypedFrom(config.tableName).select('*').eq(config.primaryKey, id).single();
  if (response.error || !response.data)
    throw new Error(response.error?.message ?? 'The record no longer exists.');
  return response.data;
}
export async function previewImport(
  config: ContentTypeConfig,
  sheet: ImportSheet,
  options: ImportOptions,
): Promise<ImportPreview> {
  const actorId = await actor();
  // Validate mappings before issuing queries with field names.
  buildImportPlan(config, sheet, options, []);
  const col = options.mapping.indexOf(options.matchField);
  const existing = await loadImportMatches(
    config,
    options.matchField,
    sheet.rows.map((r) => r[col].trim()),
  );
  await actor(actorId);
  const rows = buildImportPlan(config, sheet, options, existing);
  for (const row of rows) {
    if (
      row.action === 'create' &&
      row.identity &&
      options.matchField === config.primaryKey &&
      (config.editorApi || config.editorRpc || config.createRpc)
    ) {
      row.action = 'error';
      row.issues.push(
        'This managed editor assigns new IDs. Use an existing record ID, or leave ID empty for a new record.',
      );
    }
  }
  if (config.createRpc?.fn === 'city_resolve_or_create')
    for (const row of rows) {
      if (row.action === 'create' && !row.patch.country_id) {
        row.action = 'error';
        row.issues.push('Map country_id to an existing country before creating a city.');
      }
      if (
        row.action === 'create' &&
        !(row.patch.latitude != null && row.patch.longitude != null) &&
        !row.patch.wikidata_qid
      ) {
        row.action = 'error';
        row.issues.push('New cities need coordinates or a Wikidata ID for identity matching.');
      }
    }
  if (config.editorRpc)
    for (const row of rows) {
      if (row.action !== 'create' && !Object.prototype.hasOwnProperty.call(row.patch, '_locations'))
        continue;
      const error = validateOrganisationLocations(
        row.patch._locations ?? [],
        row.before?._locations,
      );
      if (error) {
        row.action = 'error';
        row.issues.push(error);
      }
    }
  return { actorId, options: structuredClone(options), rows };
}

function prepared(config: ContentTypeConfig, row: PlannedRow): RecordData {
  const allowed = new Set(writableFields(config).map((f) => f.name));
  const data = Object.fromEntries(
    Object.entries({ ...(!row.before ? config.defaults : {}), ...row.patch }).filter(([k]) =>
      allowed.has(k),
    ),
  );
  return config.editorApi?.prepareSave ? config.editorApi.prepareSave(data) : data;
}

async function saveRow(
  config: ContentTypeConfig,
  row: PlannedRow,
  actorId: string,
  matchField: string,
): Promise<RecordData> {
  const id = row.before ? String(row.before[config.primaryKey]) : null;
  // Revalidate the full snapshot: validation and matching were reviewed against it.
  if (id) {
    const current = await loadRecord(config, id);
    if (!Object.keys(row.before!).every((k) => equal(current[k], row.before![k])))
      throw new Error('This record changed after preview. Preview again.');
  }
  if (!id && row.identity) {
    const appeared = await loadImportMatches(config, matchField, [row.identity]);
    if (appeared.length)
      throw new Error('A matching record appeared after preview. Preview again.');
  }
  await actor(actorId);
  let data = prepared(config, row);
  if (config.editorApi)
    return config.editorApi.save(
      id,
      data,
      typeof row.before?.updated_at === 'string' ? row.before.updated_at : null,
    );
  if (config.editorRpc) {
    const { _locations, ...identityData } = data;
    const { data: saved, error } = await untypedRpc<RecordData>(config.editorRpc.save, {
      p_id: id,
      p_data: identityData,
      p_locations: Object.prototype.hasOwnProperty.call(row.patch, '_locations')
        ? _locations
        : id
          ? null
          : [],
      p_expected_updated_at: row.before?.updated_at ?? null,
    });
    if (error || !saved) throw new Error(error?.message ?? 'The save returned no record.');
    return saved;
  }
  if (!id && config.createRpc) {
    const args = config.createRpc.args(data);
    // Bulk uploads must not use the interactive city's evidence waiver.
    if (config.createRpc.fn === 'city_resolve_or_create') {
      args.p_actor = 'table-import';
      args.p_source_slug = 'admin-table-import';
    }
    const { data: saved, error } = await untypedRpc(config.createRpc.fn, args);
    if (error) throw new Error(error.message);
    const resolved = (Array.isArray(saved) ? saved[0] : saved) as {
      id?: string;
      city_id?: string;
      action?: string;
      reason?: string;
    } | null;
    if (!resolved || resolved.action === 'refused')
      throw new Error(`Creation refused: ${resolved?.reason ?? 'no record returned'}.`);
    if (resolved.action === 'matched' || resolved.action === 'raced')
      throw new Error(
        'The resolver found an existing record. No correction was applied; preview again using its ID.',
      );
    const newId = resolved.id ?? resolved.city_id;
    if (!newId) throw new Error('Creation returned no record ID.');
    const created = await loadRecord(config, newId);
    const remaining = Object.fromEntries(
      Object.entries(row.patch).filter(([key, value]) => !equal(created[key], value)),
    );
    if (!Object.keys(remaining).length) return created;
    try {
      return await saveRow(
        config,
        { ...row, before: created, patch: remaining },
        actorId,
        matchField,
      );
    } catch (error) {
      throw new ImportWriteError(
        `Created record ${newId}, but some uploaded values were not saved: ${error instanceof Error ? error.message : 'Correction failed'}. Review this record before retrying.`,
        newId,
      );
    }
  }
  if (!id) {
    if (matchField === config.primaryKey && row.identity) data[config.primaryKey] = row.identity;
    if (config.writeCreatedBy !== false) data = { ...data, created_by: actorId };
    const { data: saved, error } = await untypedFrom(config.tableName)
      .insert(data)
      .select('*')
      .single();
    if (error || !saved) throw new Error(error?.message ?? 'Creation returned no record.');
    return saved;
  }
  if ('updated_at' in row.before!) data.updated_at = new Date().toISOString();
  let query = untypedFrom(config.tableName).update(data).eq(config.primaryKey, id);
  // CAS every changed column as well as updated_at. This also protects tables
  // without an updated_at column and preserves blank-only enrichment on races.
  for (const key of new Set([
    ...Object.keys(data),
    ...('updated_at' in row.before! ? ['updated_at'] : []),
  ])) {
    const value = row.before![key];
    if (value == null) query = query.is(key, null);
    else if (Array.isArray(value)) {
      const field = config.fields.find((f) => f.name === key);
      const json = field && ['json', 'social_links', 'link_list'].includes(field.type);
      query = query.filter(
        key,
        'eq',
        json ? JSON.stringify(value) : `{${value.map((v) => JSON.stringify(String(v))).join(',')}}`,
      );
    } else if (typeof value === 'object') query = query.filter(key, 'eq', JSON.stringify(value));
    else query = query.eq(key, value);
  }
  const { data: saved, error } = await query.select('*').single();
  if (error || !saved)
    throw new Error(
      error?.message ?? 'The record changed or permission was denied. Preview again.',
    );
  return saved;
}

const consumedPreviews = new WeakSet<ImportPreview>();

export async function applyImport(
  config: ContentTypeConfig,
  preview: ImportPreview,
  excluded: Set<number>,
  signal: AbortSignal,
  progress: (outcomes: ImportOutcome[]) => void,
): Promise<ImportOutcome[]> {
  await actor(preview.actorId);
  if (consumedPreviews.has(preview))
    throw new Error('This preview was already applied. Prepare a fresh preview.');
  const outcomes: ImportOutcome[] = [];
  const selected = preview.rows.filter((r) => !excluded.has(r.row));
  if (selected.some((r) => r.action === 'error'))
    throw new Error('Exclude or correct invalid rows before applying.');
  consumedPreviews.add(preview);
  for (const [index, row] of selected.entries()) {
    if (signal.aborted) {
      outcomes.push(
        ...selected
          .slice(index)
          .map((pending) => ({
            row: pending.row,
            identity: pending.identity,
            status: 'cancelled' as const,
            message: 'Not attempted.',
          })),
      );
      break;
    } else if (row.action === 'skip') {
      outcomes.push({
        row: row.row,
        identity: row.identity,
        status: 'skipped',
        message: row.issues.join(' ') || 'No changes.',
      });
    } else {
      try {
        const saved = await saveRow(config, row, preview.actorId, preview.options.matchField);
        if (!saved[config.primaryKey])
          throw new Error('The server returned no record ID. Check the record before retrying.');
        const dropped = Object.entries(row.patch).filter(
          ([key, value]) =>
            value != null && value !== '' && (saved[key] == null || saved[key] === ''),
        );
        if (dropped.length)
          throw new ImportWriteError(
            `The row was saved but the server rejected these values: ${dropped.map(([k]) => k).join(', ')}. Review before retrying.`,
            String(saved[config.primaryKey]),
          );
        outcomes.push({
          row: row.row,
          identity: row.identity,
          status: idStatus(row),
          id: String(saved[config.primaryKey]),
          message: 'Saved.',
        });
      } catch (error) {
        outcomes.push({
          row: row.row,
          identity: row.identity,
          status: 'failed',
          ...(error instanceof ImportWriteError ? { id: error.savedId } : {}),
          message: error instanceof Error ? error.message : 'Save failed. Review before retrying.',
        });
        // Stop after a failure: a network error may mean a committed write with
        // a lost receipt. A fresh preview is required, never an automatic retry.
        signal = AbortSignal.abort();
      }
    }
    if (row.action !== 'skip') progress([...outcomes]);
  }
  progress([...outcomes]);
  invalidateManagedOptions();
  return outcomes;
}
function idStatus(row: PlannedRow): 'created' | 'updated' {
  return row.before ? 'updated' : 'created';
}
