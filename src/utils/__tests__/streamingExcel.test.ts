/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { Workbook } from 'exceljs';
import { strFromU8, unzipSync } from 'fflate';
import { needsStreamingExcel, streamingExcelBlob, textParts } from '../streamingExcel';

async function buffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function load(blob: Blob) {
  const workbook = new Workbook();
  await workbook.xlsx.load((await buffer(blob)) as never);
  return workbook;
}

describe('bounded-memory Excel export', () => {
  it('round trips all 1501 identities, types, Unicode, XML and formula-looking text', async () => {
    const rows = Array.from({ length: 1501 }, (_, id) => ({
      id,
      label: `=SUM(A1:A2) & <日本語> "Zürich" ${id}`,
      enabled: id % 2 === 0,
    }));
    const columns = [
      { header: 'ID', accessor: (row: (typeof rows)[number]) => row.id },
      { header: 'Label', accessor: (row: (typeof rows)[number]) => row.label },
      { header: 'Enabled', accessor: (row: (typeof rows)[number]) => row.enabled },
    ];
    const blob = await streamingExcelBlob([{ name: 'Data', rows, columns }]);
    const book = await load(blob);
    expect(book.worksheets).toHaveLength(1);
    expect(book.worksheets[0].rowCount).toBe(1502);
    for (let i = 0; i < rows.length; i++) {
      expect(book.worksheets[0].getRow(i + 2).values).toEqual([
        undefined,
        rows[i].id,
        rows[i].label,
        rows[i].enabled,
      ]);
    }
    const zip = unzipSync(new Uint8Array(await buffer(blob)));
    expect(zip['xl/sharedStrings.xml']).toBeUndefined();
    expect(strFromU8(zip['xl/worksheets/sheet1.xml'])).not.toContain('<f>');
  });

  it('preserves oversized text in documented continuation cells without breaking emoji', async () => {
    const text = 'a'.repeat(32766) + '🌈' + 'b'.repeat(65000);
    const rows = [
      { id: 'one', text },
      { id: 'two', text: 'short' },
    ];
    const blob = await streamingExcelBlob([
      {
        name: 'Data',
        rows,
        columns: [
          { header: 'Text', accessor: (row) => row.text },
          { header: 'ID', accessor: (row) => row.id },
        ],
      },
    ]);
    const book = await load(blob);
    const parts = [...textParts(text)];
    expect(parts.join('')).toBe(text);
    expect(parts.every((part) => part.length <= 32767)).toBe(true);
    expect(parts[0]).toHaveLength(32766);
    const sheet = book.worksheets[0];
    expect(sheet.rowCount).toBe(3);
    expect(
      Array.from({ length: parts.length }, (_, i) => sheet.getRow(2).getCell(i + 1).value).join(''),
    ).toBe(text);
    expect(sheet.getRow(2).getCell(parts.length + 1).value).toBe('one');
    expect(book.getWorksheet('Export columns')!.getRow(2).values).toEqual([
      undefined,
      'Data',
      1,
      'Text',
      parts.length,
    ]);
  });

  it('escapes literal OOXML patterns and controls losslessly on disk', async () => {
    const blob = await streamingExcelBlob([
      {
        name: 'Data',
        rows: [{ text: '_x0041_\u0001\r\n&<>' }],
        columns: [{ header: 'Value', accessor: (row) => row.text }],
      },
    ]);
    const files = unzipSync(new Uint8Array(await buffer(blob)));
    const xml = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(xml).toContain('_x005F_x0041__x0001__x000D_\n&amp;&lt;&gt;');
    expect(xml).not.toContain('\u0001');
  });

  it('chooses bounded generation for large tables and oversized cells', () => {
    const columns = [{ header: 'Value', accessor: (row: string) => row }];
    expect(needsStreamingExcel(['normal'], columns)).toBe(false);
    expect(needsStreamingExcel(['a'.repeat(32768)], columns)).toBe(true);
    expect(needsStreamingExcel(Array(100000).fill('normal'), columns)).toBe(true);
  });

  it('rejects worksheet size overflow instead of dropping records or columns', async () => {
    await expect(
      streamingExcelBlob([{ name: 'Data', rows: new Array(1048576), columns: [] }]),
    ).rejects.toThrow('row limit');
    await expect(
      streamingExcelBlob([
        {
          name: 'Data',
          rows: [],
          columns: Array.from({ length: 16385 }, () => ({ header: 'Value', accessor: () => '' })),
        },
      ]),
    ).rejects.toThrow('column limit');
  });

  it('writes multiple source sheets and avoids a continuation-metadata name collision', async () => {
    const columns = [{ header: 'Value', accessor: (row: string) => row }];
    const book = await load(
      await streamingExcelBlob([
        { name: 'Export columns', rows: ['a'.repeat(40000)], columns },
        { name: 'Empty', rows: [], columns },
      ]),
    );
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual([
      'Export columns',
      'Empty',
      'Export columns (2)',
    ]);
    expect(book.getWorksheet('Empty')!.rowCount).toBe(1);
  });
});
