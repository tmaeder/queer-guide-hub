/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportToCsv } from '../csvExport';

afterEach(() => vi.restoreAllMocks());

describe('exportToCsv', () => {
  it('downloads UTF-8 CSV with escaped values, formula protection, and numeric values', async () => {
    let downloadedBlob: Blob | undefined;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        downloadedBlob = blob;
        return 'blob:csv';
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const values = [
      'Zürich, 日本語',
      'A "quoted"\r\ndescription',
      null,
      '=SUM(1,2)',
      ' @SUM(1)',
      -3,
      false,
    ];
    exportToCsv(values, [{ header: 'Value', accessor: (value) => value }], 'tags.csv');
    expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe('tags.csv');
    expect(downloadedBlob?.type).toBe('text/csv;charset=utf-8');
    const contents = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(downloadedBlob!);
    });
    expect(contents).toBe(
      '"Value"\r\n"Zürich, 日本語"\r\n"A ""quoted""\r\ndescription"\r\n""\r\n"\'=SUM(1,2)"\r\n"\' @SUM(1)"\r\n"-3"\r\n"false"\r\n',
    );
    expect(downloadedBlob?.size).toBe(new TextEncoder().encode('\uFEFF' + contents).length);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:csv');
    expect(document.querySelector('a')).toBeNull();
  });

  it('exports headers even when there are no tags', () => {
    const create = vi.spyOn(URL, 'createObjectURL');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    exportToCsv([], [{ header: 'Name', accessor: () => '' }], 'tags.csv');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ size: 11 }));
  });
});
