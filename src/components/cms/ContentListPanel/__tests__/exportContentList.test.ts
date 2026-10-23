import { describe, expect, it, vi } from 'vitest';
import type { ContentTypeConfig, FieldConfig } from '@/types/cms';
import { exportContentType } from '../exportContentList';
import { fetchAllRows, exportToExcel } from '@/utils/excelExport';
import { exportToCsv } from '@/utils/csvExport';
import { unifiedTagsContentType } from '@/config/contentTypes/tag';

vi.mock('@/utils/excelExport', () => ({
  fetchAllRows: vi.fn().mockResolvedValue([
    { name: 'Active', status: 'active' },
    { name: 'Deprecated', status: 'deprecated' },
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
} as ContentTypeConfig;
const fields = [{ name: 'status', label: 'Status', type: 'text' }] as FieldConfig[];

describe('tag content exports', () => {
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
          .filter((field) => field.name !== 'name')
          .map((field) => field.label),
      ]);
      expect(call[1].find((column) => column.header === 'Status')?.accessor(call[0][1])).toBe(
        'deprecated',
      );
    },
  );

  it.each(['Excel', 'CSV'] as const)(
    'fetches every tag for %s and keeps the same columns',
    async (format) => {
      vi.mocked(fetchAllRows).mockClear();
      await exportContentType(config, fields, format);
      expect(fetchAllRows).toHaveBeenCalledExactlyOnceWith('unified_tags', '*', {
        column: 'name',
        ascending: true,
      });
      const call = vi.mocked(format === 'CSV' ? exportToCsv : exportToExcel).mock.lastCall!;
      expect(call[0]).toEqual([
        { name: 'Active', status: 'active' },
        { name: 'Deprecated', status: 'deprecated' },
      ]);
      expect(call[1].map((column) => column.header)).toEqual(['Title', 'Status']);
      expect(call[2]).toMatch(format === 'CSV' ? /\.csv$/ : /\.xlsx$/);
    },
  );
});
