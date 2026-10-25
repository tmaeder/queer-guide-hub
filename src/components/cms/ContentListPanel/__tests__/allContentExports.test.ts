import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contentTypeRegistry, internalContentTypeRegistry } from '@/config/contentTypes';
import {
  hotelListConfig,
  merchantListConfig,
  partnerListConfig,
} from '@/components/admin/business/organisationListConfigs';
import { exportContentType } from '../exportContentList';
import { supabase } from '@/integrations/supabase/client';
import { exportToExcel } from '@/utils/excelExport';
import { exportToCsv } from '@/utils/csvExport';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/utils/excelExport', async (original) => ({
  ...(await original<typeof import('@/utils/excelExport')>()),
  exportToExcel: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/utils/csvExport', () => ({ exportToCsv: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
const configs = [
  ...Object.values(contentTypeRegistry),
  ...Object.values(internalContentTypeRegistry),
  hotelListConfig,
  merchantListConfig,
  partnerListConfig,
];

describe.each(configs)('$id export contract', (config) => {
  it.each(['Excel', 'CSV'] as const)(
    'exports every record as %s through capped API pages with duplicate titles',
    async (format) => {
      const records = Array.from({ length: 1007 }, (_, i) => ({
        [config.titleField]: 'Same title',
        [config.primaryKey]: String(i).padStart(4, '0'),
      }));
      const orders: string[][] = [];
      const ranges: number[] = [];
      vi.mocked(supabase.from).mockImplementation((table) => {
        expect(table).toBe(config.tableName);
        let start = 0;
        const sort: string[] = [];
        const query = {
          select: vi.fn(() => query),
          range: vi.fn((from: number) => {
            start = from;
            ranges.push(from);
            return query;
          }),
          order: vi.fn((field: string) => {
            sort.push(field);
            return query;
          }),
          then: (resolve: (result: unknown) => unknown) => {
            orders.push(sort);
            return Promise.resolve({
              data: records.slice(start, start + 200),
              count: records.length,
              error: null,
            }).then(resolve);
          },
        };
        return query as never;
      });
      await exportContentType(
        config,
        config.fields.filter((f) => f.listColumn),
        format,
      );
      const call = vi.mocked(format === 'CSV' ? exportToCsv : exportToExcel).mock.lastCall!;
      expect(call[0]).toEqual(records);
      expect(
        new Set(call[0].map((row) => (row as Record<string, unknown>)[config.primaryKey])).size,
      ).toBe(1007);
      expect(ranges).toEqual([0, 200, 400, 600, 800, 1000]);
      expect(
        orders.every((order) => order.join() === [config.titleField, config.primaryKey].join()),
      ).toBe(true);
      expect(call[1].at(-1)?.accessor(call[0].at(-1)!)).toBe('1006');
    },
  );
});
