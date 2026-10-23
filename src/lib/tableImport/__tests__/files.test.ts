import { describe, expect, it } from 'vitest';
import { Workbook } from 'exceljs';
import { readImportFile } from '../files';
async function file(workbook: Workbook) {
  const bytes = await workbook.xlsx.writeBuffer();
  return { name: 'upload.xlsx', size: bytes.byteLength, arrayBuffer: async () => bytes } as File;
}
describe('Excel uploads', () => {
  it('reads multiple visible sheets, Unicode, booleans, dates, and rich text', async () => {
    const book = new Workbook();
    const first = book.addWorksheet('First');
    first.addRow(['Name', 'Active', 'Date', 'Details']);
    first.addRow([
      'Zürich 🏳️‍🌈',
      false,
      new Date('2026-10-23T00:00:00Z'),
      { richText: [{ text: 'A' }, { text: 'B' }] },
    ]);
    book.addWorksheet('Second').addRows([
      ['ID', 'Name'],
      ['00042', 'Other'],
    ]);
    book.addWorksheet('Hidden', { state: 'hidden' }).addRows([['Name'], ['Hidden']]);
    const result = await readImportFile(await file(book));
    expect(result).toHaveLength(2);
    expect(result[0].rows).toEqual([['Zürich 🏳️‍🌈', 'false', '2026-10-23T00:00:00.000Z', 'AB']]);
    expect(result[1].rows[0][0]).toBe('00042');
  });
  it('rejects formulas even when a cached value exists', async () => {
    const book = new Workbook();
    book.addWorksheet('Data').addRows([['Name'], [{ formula: '1+1', result: 2 }]]);
    await expect(readImportFile(await file(book))).rejects.toThrow(/replace formulas/);
  });
  it('rejects unsupported files and large uploads', async () => {
    await expect(readImportFile({ name: 'old.xls', size: 20 } as File)).rejects.toThrow(/xlsx/);
    await expect(
      readImportFile({ name: 'huge.xlsx', size: 11 * 1024 * 1024 } as File),
    ).rejects.toThrow(/10 MB/);
  });
  it('rejects numeric IDs beyond safe integer precision instead of importing rounded values', async () => {
    const book = new Workbook();
    book.addWorksheet('Data').addRows([['ID'], [1e20]]);
    await expect(readImportFile(await file(book))).rejects.toThrow(/precision/);
  });
});
