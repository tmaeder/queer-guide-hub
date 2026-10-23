import { describe, expect, it, vi } from 'vitest';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';
import { exportContentType } from '../exportContentList';
import { fetchAllRows, exportToExcel } from '@/utils/excelExport';
import { exportToCsv } from '@/utils/csvExport';
import { unifiedTagsContentType } from '@/config/contentTypes/tag';

vi.mock('@/utils/excelExport', () => ({
  fetchAllRows: vi.fn().mockResolvedValue([
    { id: 't1', name: 'Active', status: 'active' },
    { id: 't2', name: 'Deprecated', status: 'deprecated' },
  ]),
  exportToExcel: vi.fn().mockResolvedValue(undefined),
  generateFilename: () => 'queerguide-unified_tags-2026-10-22.xlsx',
  formatArray: vi.fn(),
  formatBoolean: vi.fn(),
}));
vi.mock('@/utils/csvExport', () => ({ exportToCsv: vi.fn() }));

const config = {
  id: 'unified_tags',
  tableName: 'unified_tags',
  titleField: 'name',
  primaryKey: 'id',
  fields: [],
  lifecycle: { archive: { column: 'status', value: 'deprecated' } },
  merge: { column: 'merged_into_id' },
} as unknown as ContentTypeConfig;
const fields = [{ name: 'status', label: 'Status', type: 'text' }] as FieldConfig[];

/** Records the PostgREST builder calls the export's refiner makes. */
function recorder() {
  const calls: unknown[][] = [];
  const q: Record<string, unknown> = {};
  for (const m of ['eq', 'neq', 'or', 'is', 'not', 'ilike', 'order', 'in', 'gte', 'lte']) {
    q[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return q;
    };
  }
  return { q, calls };
}

describe('content exports', () => {
  it.each(['Excel', 'CSV'] as const)(
    'exports configured tag fields as %s when no list columns are declared',
    async (format) => {
      const listColumns = unifiedTagsContentType.fields.filter((field) => field.listColumn);
      expect(listColumns).toEqual([]);
      await exportContentType(unifiedTagsContentType, listColumns, format);
      const call = vi.mocked(format === 'CSV' ? exportToCsv : exportToExcel).mock.lastCall!;
      expect(call[1].map((column) => column.header)).toEqual([
        'Title',
        ...unifiedTagsContentType.fields
          .filter((field) => field.name !== 'name' && field.name !== 'id' && !field.virtual)
          .map((field) => field.label),
        'ID',
      ]);
      expect(call[1].find((column) => column.header === 'Status')?.accessor(call[0][1])).toBe(
        'deprecated',
      );
    },
  );

  it.each(['Excel', 'CSV'] as const)(
    'fetches every row for %s with an id column',
    async (format) => {
      vi.mocked(fetchAllRows).mockClear();
      await exportContentType(config, fields, format);
      expect(fetchAllRows).toHaveBeenCalledExactlyOnceWith(
        'unified_tags',
        '*',
        { column: 'name', ascending: true },
        1000,
        expect.any(Function),
      );
      const call = vi.mocked(format === 'CSV' ? exportToCsv : exportToExcel).mock.lastCall!;
      expect(call[0]).toHaveLength(2);
      // List column, then every other column the rows carry, then ID.
      expect(call[1].map((column) => column.header)).toEqual(['Title', 'Status', 'ID']);
      expect(call[1][2].accessor(call[0][0])).toBe('t1');
      expect(call[2]).toMatch(format === 'CSV' ? /\.csv$/ : /\.xlsx$/);
    },
  );

  it('exports every field, not just the list columns', async () => {
    vi.mocked(fetchAllRows).mockResolvedValueOnce([
      { id: 'v1', name: 'Bar', status: 'active', phone: '+41', extra_json: { a: 1 } },
    ]);
    const withFields = {
      ...config,
      fields: [
        ...fields,
        { name: 'phone', label: 'Phone', type: 'text' },
        { name: 'computed', label: 'Computed', type: 'text', virtual: true },
      ],
    } as unknown as ContentTypeConfig;
    await exportContentType(withFields, fields, 'CSV');
    const [rows, columns] = vi.mocked(exportToCsv).mock.lastCall!;
    expect(columns.map((c) => c.header)).toEqual(['Title', 'Status', 'Phone', 'extra_json', 'ID']);
    expect(columns.map((c) => c.accessor(rows[0]))).toEqual([
      'Bar',
      'active',
      '+41',
      '{"a":1}',
      'v1',
    ]);
  });

  it('with no scope, only adds the primary-key tiebreak', async () => {
    vi.mocked(fetchAllRows).mockClear();
    await exportContentType(config, fields, 'CSV');
    const refine = vi.mocked(fetchAllRows).mock.lastCall![4]!;
    const { q, calls } = recorder();
    refine(q);
    expect(calls).toEqual([['order', 'id', { ascending: true }]]);
  });

  it('applies the list scope: filters, archived and merged slice', async () => {
    vi.mocked(fetchAllRows).mockClear();
    await exportContentType(config, fields, 'Excel', {
      filters: [{ id: 'f', field: 'status', op: 'eq', value: 'active' }],
      archivedView: 'live',
      mergedView: 'unmerged',
    });
    const refine = vi.mocked(fetchAllRows).mock.lastCall![4]!;
    const { q, calls } = recorder();
    refine(q);
    expect(calls).toContainEqual(['eq', 'status', 'active']);
    expect(calls).toContainEqual(['or', 'status.is.null,status.neq.deprecated']);
    expect(calls).toContainEqual(['is', 'merged_into_id', null]);
    expect(calls.at(-1)).toEqual(['order', 'id', { ascending: true }]);
  });
});
