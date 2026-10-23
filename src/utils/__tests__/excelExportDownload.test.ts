/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportToExcel, exportWorkbook } from '../excelExport';
import { Workbook } from 'exceljs';

afterEach(() => vi.restoreAllMocks());

describe('actual Excel downloads', () => {
  it.each(['single sheet', 'workbook'])(
    'preserves all 1501 records in a %s XLSX file',
    async (mode) => {
      const data = Array.from({ length: 1501 }, (_, id) => ({
        id,
        name: `Zürich, 日本語 ${id}`,
        status: id % 2 ? 'archived' : 'active',
      }));
      const columns = [
        { header: 'ID', accessor: (row: (typeof data)[number]) => row.id },
        { header: 'Name', accessor: (row: (typeof data)[number]) => row.name },
        { header: 'Status', accessor: (row: (typeof data)[number]) => row.status },
      ];
      let blob: Blob | undefined;
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: vi.fn((value: Blob) => {
          blob = value;
          return 'blob:excel';
        }),
      });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      if (mode === 'single sheet') await exportToExcel(data, columns, 'all-records.xlsx');
      else
        await exportWorkbook(
          [{ name: 'Records', rows: data, columns: columns as never }],
          'all-records.xlsx',
        );
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob!);
      });
      const workbook = new Workbook();
      await workbook.xlsx.load(buffer as never);
      const sheet = workbook.worksheets[0];
      expect(sheet.rowCount).toBe(1502);
      expect(sheet.getRow(1).values).toEqual([undefined, 'ID', 'Name', 'Status']);
      for (const [i, row] of data.entries())
        expect(sheet.getRow(i + 2).values).toEqual([undefined, row.id, row.name, row.status]);
      expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe('all-records.xlsx');
    },
  );
});
