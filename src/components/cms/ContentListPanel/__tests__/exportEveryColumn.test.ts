/**
 * Guard: an export contains EVERY column a row carries — for every content
 * type and every taxonomy, not just the list's visible columns.
 *
 * The test is behavioural rather than a header-name check: for each column of
 * a row it builds two rows that differ ONLY in that column and asserts the
 * exported cells differ. A column the export drops (or reads from the wrong
 * key) produces identical files for both rows and fails. Header names alone
 * cannot show that a column's value actually reaches the file.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';
import { exportColumnsFor } from '../exportContentList';
import { contentTypeRegistry, internalContentTypeRegistry } from '@/config/contentTypes';
import { TAXONOMY_CATALOG } from '@/config/taxonomyCatalog';
import { exportToCsv } from '@/utils/csvExport';
import { fetchAllRows } from '@/utils/excelExport';
import { exportAllTaxonomies } from '@/lib/taxonomyExport';

vi.mock('@/utils/excelExport', async (orig) => ({
  ...(await orig<typeof import('@/utils/excelExport')>()),
  fetchAllRows: vi.fn(),
  exportWorkbook: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/utils/csvExport', () => ({ exportToCsv: vi.fn() }));

type Row = Record<string, unknown>;

/** A column the CMS config does not know about, as a real table can carry. */
const UNCONFIGURED = 'unconfigured_column';

/** Two distinguishable values a field of this type can hold. */
function valuesFor(field: FieldConfig | undefined): [unknown, unknown] {
  switch (field?.type) {
    case 'boolean':
      return [true, false];
    case 'number':
      return [1, 2];
    case 'date':
      return ['2026-01-01', '2026-02-02'];
    case 'datetime':
      return ['2026-01-01T10:00:00Z', '2026-02-02T11:00:00Z'];
    case 'tags':
    case 'images':
    case 'multiselect':
      return [['a'], ['b']];
    case 'json':
    case 'location':
    case 'social_links':
      return [{ k: 1 }, { k: 2 }];
    default:
      return ['value-a', 'value-b'];
  }
}

/** Every stored column a row of this type can carry, plus one unconfigured. */
function columnsOf(config: ContentTypeConfig): string[] {
  const names = new Set<string>([config.primaryKey, config.titleField]);
  for (const f of config.fields) if (!f.virtual) names.add(f.name);
  names.add(UNCONFIGURED);
  return [...names];
}

function baseRow(config: ContentTypeConfig): Row {
  const row: Row = {};
  for (const name of columnsOf(config)) {
    row[name] = valuesFor(config.fields.find((f) => f.name === name))[0];
  }
  return row;
}

const configs = Object.values({ ...contentTypeRegistry, ...internalContentTypeRegistry });

describe('exports include every column', () => {
  it('covers a non-trivial number of content types', () => {
    // Positive control: an empty registry would make every case below vacuous.
    expect(configs.length).toBeGreaterThan(10);
  });

  it.each(configs.map((c) => [c.id, c] as const))(
    '%s: changing any column changes the exported row',
    (_id, config) => {
      const listColumns = config.fields.filter((f) => f.listColumn);
      const missing: string[] = [];
      for (const name of columnsOf(config)) {
        const field = config.fields.find((f) => f.name === name);
        const a = baseRow(config);
        const b = { ...a, [name]: valuesFor(field)[1] };
        const columns = exportColumnsFor(config, [a, b], listColumns);
        const cells = (r: Row) => JSON.stringify(columns.map((c) => c.accessor(r)));
        if (cells(a) === cells(b)) missing.push(name);
      }
      expect(missing).toEqual([]);
    },
  );
});

describe('the flat all-taxonomies CSV includes every column', () => {
  it('changing any column of any vocabulary changes the CSV', async () => {
    const vocabularies = TAXONOMY_CATALOG.map((t) => [t.id, contentTypeRegistry[t.id]] as const);
    expect(vocabularies.every(([, c]) => c)).toBe(true);

    const exportCells = async (rowsByTable: Record<string, Row[]>) => {
      vi.mocked(fetchAllRows).mockImplementation(async (table: string) => rowsByTable[table] ?? []);
      await exportAllTaxonomies('CSV');
      const [rows, columns] = vi.mocked(exportToCsv).mock.lastCall!;
      return JSON.stringify(rows.map((r) => columns.map((c) => c.accessor(r))));
    };

    const base: Record<string, Row[]> = {};
    for (const [, config] of vocabularies) base[config.tableName] = [baseRow(config)];
    const baseline = await exportCells(base);

    const missing: string[] = [];
    for (const [id, config] of vocabularies) {
      for (const name of columnsOf(config)) {
        const field = config.fields.find((f) => f.name === name);
        const changed = {
          ...base,
          [config.tableName]: [{ ...base[config.tableName][0], [name]: valuesFor(field)[1] }],
        };
        if ((await exportCells(changed)) === baseline) missing.push(`${id}.${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
